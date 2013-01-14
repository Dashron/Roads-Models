/*
* Roads.js Framework - cachedmodel.js
* Copyright(c) 2012 Aaron Hedges <aaron@dashron.com>
* MIT Licensed
*/
"use strict";

var util_module = require('util');

var model_component = require('./model');
var ModelRequest = model_component.ModelRequest;
var ModelModule = model_component.ModelModule;
var Model = model_component.Model;

var CachedModelRequest = module.exports.CachedModelRequest = function CachedModelRequest (target, key) {
	ModelRequest.call(this, target);
	this._cache_key = key;
};

util_module.inherits(CachedModelRequest, ModelRequest);

CachedModelRequest._cache_key = null;

CachedModelRequest.prototype.preload = function (field) {
	var _self = this;

	if (typeof this._definition.fields[field] !== "object") {
		throw new Error('The field ' + field + ' is not part of the model definition');
	}

	var field_definition = this._definition.fields[field];

	if (typeof field_definition.assign_to !== "string") {
		throw new Error('Any preloaded objects must have an assign_to field in their definition');
	}

	var assign_to = field_definition.assign_to;

	if (typeof field_definition.model_module !== "object") {
		throw new Error('Any preloaded objects must have a model field in their definition');
	}

	var model_module = field_definition.model_module;
	var original_promise = this;

	this.addModifier(function (data) {
		var ids = new Array(data.length);
		var i = 0;
		var model_associations = {};
		var model_promise = null;

		// find all of the ids from the data array
		for (i = 0; i < data.length; i++) {
			ids[i] = data[i][field];
		}

		model_promise = new ModelRequest(model_module);

		model_promise.ready(function (models) {
			// build a list of id => model to ensure a record exists
			for (i = 0; i < models.length; i++) {
				model_associations[models[i].id] = models[i];
			}

			for (i = 0; i < data.length; i++) {
				if (typeof model_associations[data[i][field]] !== "undefined" && typeof model_associations[data[i][field]] !== null) {
					data[i][assign_to] = model_associations[data[i][field]];
				}
			}

			original_promise._ready(data);

		}).error(original_promise._error.bind(original_promise));

		model_module._locateModels(ids, model_promise);
	});

	return this;
};

var CachedModelModule = module.exports.CachedModelModule = function CachedModelModule () {
	ModelModule.call(this);
};

util_module.inherits(CachedModelModule, ModelModule);

CachedModelModule.prototype.redis = null;

/**
 * [buildCacheKey description]
 * @param  {[type]}   options  can be string, will become { key : { value : options } }
 * @param  {[type]}   params   optional, if left out the other parameters shift down
 * @param  {Function} callback [description]
 * @param  {[type]}   error    [description]
 * @return {[type]}            [description]
 */
CachedModelModule.prototype.buildCacheKey = function (options, params, callback, error) {
	var _self = this;

	if (typeof options === "string") {
		options = { key : { value : options } };
	}

	if (!Array.isArray(params)) {
		error = callback;
		callback = params;
		params = [];
	}

	if (typeof options.key.timer === "string") {
		this.getTime(options.key.timer, function (val) {
			options.key.time = val;
			callback(_self._buildCacheKey(options, params), options.ttl);
		}, error);
	} else {
		callback(_self._buildCacheKey(options, params), options.ttl);
	}
};


/**
 * [cachedCollection description]
 * @param  {[type]} sql     [description]
 * @param  {[type]} params  Optional, if not an array, this value will be used in place of "options"
 * @param  {[type]} options can be string, will become { key : { value : options } }
 * @return {[type]}         [description]
 */
CachedModelModule.prototype.cachedCollection = function (sql, params, options) {
	var cached_promise = new CachedModelRequest(this);

	if (!Array.isArray(params)) {
		options = params;
		params = [];
	}

	var _self = this;

	this.buildCacheKey(options, params, function (key, ttl) {
		_self.redis.smembers(key, function (err, ids) {
			// todo: if (options.key.time) expire key
			if (err) {
				return cached_promise._error(err);
			}

			// If no ID's were found, run an SQL query
			if (!ids || !ids.length) {
				var db_promise = _self.collection(sql, params);

				db_promise.error(cached_promise._error.bind(cached_promise));

				db_promise.ready(function (collection) {
					// Generate a list of all the ID's' of the items we need to find
					var ids = [];
					for (var i = 0; i < collection.length; i ++) {
						ids.push(collection[i].id);
					}

					if (ids.length) {
						// Cache all of the ID's so we don't have to do a database lookup in the future
						if (ttl) {
							_self.redis.sadd(key, ids, function (err, rows) {
								_self.redis.expire(key, ttl);
							});
						} else {
							_self.redis.sadd(key, ids);
						}

						// Turn the ID's into models
						return _self._locateModels(ids, cached_promise);
					}

					cached_promise._ready([]);
				});
			} else {
				// Turn the string list of ID's found from redis into models
				_self._locateModels(ids, cached_promise);
			}
		});
	}, cached_promise);

	return cached_promise;
};

/**
 * [getTime description]
 * @param  {[type]}   key      [description]
 * @param  {Function} callback [description]
 * @param  {[type]}   error    [description]
 * @return {[type]}            [description]
 */
CachedModelModule.prototype.getTime = function (key, callback, error) {
	var _self = this;

	this.redis.get('cache:times:' + key, function redis_get_times(err, val) {
		if (err) {
			if (typeof error === "function") {
				return error(err);
			} else {
				return error._error(err);
			}
		}

		if (val) {
			return callback(val);
		}
		
		_self.setTime(key, callback, error);
	});
};

/**
 * [setTime description]
 * @param {[type]}   key      [description]
 * @param {Function} callback [description]
 * @param {[type]}   error    [description]
 */
CachedModelModule.prototype.setTime = function (key, callback, error) {

	// if its not found, set it
	var now = Date.now() / 1000;
	this.redis.set('cache:times:' + key, now, function redis_set_time(err) {
		if (err && error) {
			if (typeof error === "function") {
				return error(err);
			} else {
				return error._error(err);
			}
		}

		if (callback) {
			callback(now);
		}
	});
};

/**
 *
 * This is not called cached load because we do not need a cache key.
 * Fuck consistency with the cachedcollection module, I wish cached collection would just work too
 */
CachedModelModule.prototype.load = function (value, field) {
	var _self = this;
	var cached_promise = new CachedModelRequest(this);

	if (typeof value === "undefined") {
		throw new Error('You can not load an object with an undefined value');
	}

	// load from an alternative field
	if (typeof field === "undefined" || field === 'id') {
		
		this._getFromCache(_self._buildCacheKey({}, [value]), function (data) {
			if (data) {
				cached_promise._ready(new _self.Model(data));
			} else {
				var promise = _self.loadFromDB(value, field);
				promise.error(cached_promise._error.bind(cached_promise));
				promise.ready(cached_promise._ready.bind(cached_promise));
			}
		}, cached_promise);

	} else {
		this._getFromCache(_self._buildCacheKey({key : field}, [value]), function (id) {
			// if the id can not be found, load the model and set the id
			if (id) {
				_self._getFromCache(_self._buildCacheKey({}, [id]), function (data) {
					if (data) {
						return cached_promise._ready(new _self.Model(data));
					} else {
						var promise = _self.loadFromDB(value, field);
						promise.error(cached_promise._error.bind(cached_promise));
						promise.ready(cached_promise._ready.bind(cached_promise));
					}
				}, cached_promise);

			} else {
				var load_promise = _self.loadFromDB(value, field);

				load_promise.error(cached_promise._error.bind(cached_promise));

				load_promise.ready(function (model) {
					if (model) {
						_self.redis.set(_self._buildCacheKey({key : field}, [value]), model.id);
						_self.redis.set(_self._buildCacheKey({}, [model.id]), model.toString());
					} else {
						_self.redis.del(_self._buildCacheKey({key : field}, [value]));
					}

					cached_promise._ready(model);
				});
			}
		}, cached_promise);
	}

	return cached_promise;
};

/**
 * [loadFromDB description]
 * @param  {[type]} value [description]
 * @param  {[type]} field [description]
 * @return {[type]}       [description]
 */
CachedModelModule.prototype.loadFromDB = function (value, field) {
	var _self = this;

	var promise = CachedModelModule.super_.prototype.load.call(_self, value, field);

	promise.addModifier(function (model) {
		if (model) {
			_self.redis.set(_self._buildCacheKey({}, [model.id]), model.toString());
		}
		
		this._ready(model);
	});

	return promise;
};

/**
 * [setModel description]
 * @param {[type]} definition [description]
 */
CachedModelModule.prototype.setModel = function (definition) {
	CachedModelModule.super_.prototype.setModel.call(this, definition, CachedModel);
	this.Model.prototype.redis = this.redis;
	this._cache_prefix = 'models:' + this._definition.table;
};

/**
 * [_buildCacheKey description]
 * @param  {[type]} key     [description]
 * @param  {[type]} params  [description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
CachedModelModule.prototype._buildCacheKey = function (options, params) {
	var cache_key = this._cache_prefix;

	if (options.key && options.key.value) {
		cache_key += ':' + options.key.value; 
	}

	if (params && params.length) {
		cache_key += ':' + params.join(':');
	}

	if (options.key && options.key.time) {
		cache_key += ':' + options.key.time;
	}

	return cache_key;
};

/**
 * [_getFromCache description]
 * @param  {[type]}   key      [description]
 * @param  {Function} callback [description]
 * @param  {[type]}   error    [description]
 * @return {[type]}            [description]
 */
CachedModelModule.prototype._getFromCache = function (key, callback, error) {
	if (Array.isArray(key)) {
		key = key.join(':');
	}

	this.redis.get(key, function (err, data) {
		if (err) {
			if (typeof error === "function") {
				error(err);
			} else {
				error._error(err);
			}
		}

		callback(data);
	});
};

/**
 * [_locateModels description]
 * @param  {[type]} ids     [description]
 * @param  {[type]} promise [description]
 * @return {[type]}         [description]
 */
CachedModelModule.prototype._locateModels = function (ids, promise) {
	var keys = [];
	var _self = this;
	var i = 0;

	if (!ids.length) {
		return promise._ready([]);
	}

	// Build an array of cache keys based on the ID's we need turned into models
	ids.forEach(function (id) {
		keys.push(_self._buildCacheKey({}, [id]));
	});

	// Try to get all of the cache keys with a single redis request
	_self.redis.mget(keys, function (err, values) {
		var sql_ids = [];

		if (err) {
			return promise._error(err);
		}

		// Turn all the results into models, and track any object ID's that we couldn't find in cache
		// todo: optimize this? can we make this unique only, to simplify db stuff?
		for (var i = 0; i < values.length; i++) {
			if (values[i] === null) {
				sql_ids.push(ids[i]);
			} else {
				values[i] = new _self.Model(values[i]);
			}
		}

		// If there were any items not found in cache, find them in the database
		if (sql_ids.length) {
			var id_list = sql_ids.join(',');
			_self.connection.query('select * from ' + _self._definition.table + ' where id in (' + id_list + ') ORDER BY FIELD(id,' + id_list + ')', function (err, rows, cols) {
				if (err) {
					return promise._error(err);
				}

				var i = 0;
				var model = null;
				var mset = [];

				// Merge the items from the database back into the original array of models, and build an array to MSET them back into redis
				for (i = 0; i < values.length; i++) {
					if (values[i] === null) {
						model =  new _self.Model(rows.shift());
						
						mset.push(_self._buildCacheKey({}, [model.id]));
						// todo: use redis objects?
						mset.push(model.toString());

						values[i] = model;
					}
				}

				_self.redis.mset(mset, function (err, response) {
					// this is required, but we ignore it. todo add logging, we don't need to wait for it
				});

				promise._ready(values);
			});
		} else {
			promise._ready(values);
		}
	});
};






var CachedModel = module.exports.CachedModel = function (data) {
	Model.call(this, data);
};

util_module.inherits(CachedModel, Model);

CachedModel.prototype.redis = null;


/**
 *
 * @todo turn this into one promise
 */
CachedModel.prototype.save = function () {
	var _self = this;
	var cached_promise = new CachedModelRequest(this);
	var save_promise = CachedModel.super_.prototype.save.call(this);

	if (cached_promise._validationError) {
		save_promise.validationError(cached_promise._validationError.bind(cached_promise));
	}
	
	save_promise.error(function (err) {
		cached_promise._error(err);
	});

	save_promise.ready(function (model) {
		// todo: merge this with _buildCacheKey
		_self.redis.set('models:' + _self._definition.table + ':' + _self.id, _self.toString());
		cached_promise._ready(model);
	});

	return cached_promise;
};

/**
 *
 * @todo turn this into one promise
 */
CachedModel.prototype['delete'] = function () {
	var _self = this;
	var cached_promise = new ModelRequest(this);
	var delete_promise = CachedModel.super_.prototype['delete'].call(this);

	delete_promise.validationError(cached_promise._validationError);
	delete_promise.error(cached_promise._error);
	delete_promise.ready(function (model) {
		_self.redis.del('models:' + _self._definition.table + ':' + _self.id);
		cached_promise._ready(null);
	});

	return cached_promise;	
};
