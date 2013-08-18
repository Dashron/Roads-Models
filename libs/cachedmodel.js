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

	if (typeof options.key === "string") {
		options.key = { value : options.key };
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
 * Push an item onto a collection cache
 * 
 * @param {[type]} key_options [description]
 * @param {[type]} params      [description]
 * @param {[type]} val         [description]
 */
CachedModelModule.prototype.addToCachedCollection = function (key_options, params, val, request) {
	var _self = this;

	this.buildCacheKey(key_options, params, function (key) {
		_self.redis.sadd(key, val);
	}, request);
};

/**
 * Remove an item from a collection cache
 * 
 * @param  {[type]} key_options [description]
 * @param  {[type]} params      [description]
 * @param  {[type]} val         [description]
 * @return {[type]}             [description]
 */
CachedModelModule.prototype.removeFromCachedCollection = function (key_options, params, val, request) {
	var _self = this;

	this.buildCacheKey(key_options, params, function (key) {
		_self.redis.srem(key, val);
	}, request);
};

/**
 * [cachedCollection description]
 * @param  {[type]} sql     [description]
 * @param  {[type]} params  Optional, if not an array, this value will be used in place of "options"
 * @param  {[type]} options can be string, directly sent to buildCacheKey
 * @return {[type]}         [description]
 */
CachedModelModule.prototype.cachedCollection = function (sql, params, options) {
	if (!Array.isArray(params)) {
		options = params;
		params = [];
	}

	if (options.sort) {
		return this._sortedCachedCollection(sql, params, options);
	} else {
		return this._unsortedCachedCollection(sql, params, options);
	}
}

/**
 * First we check for the final sorted set of key values, as set by the last parameter of the sort command.
 * -hit 
 *  locateModels with the returned ids
 *  
 * -miss
 *  attempt to find stored hash for this sql statement
 *  -hit
 *   run redis sort on hash, and set the value into a key
 *   locateModels with the returned ids
 *   
 *  -miss
 *   run sql, and store the resulting rows into a redis hash
 *   run redis sort on hash and set the value into a key
 *   locateModels with the returned ids
 *
 *
 * On update
 *  - set value into hash
 *  - run sort query again
 *
 * On delete
 *  - delete value from hash
 *  - run sort query again
 *
 *
 * WHY? What's the benefit of doing all this bullshit using redis's built in stuff.
 * We know all the collections, maybe we update hashed collections in place, and have duplicate data everywhere? 
 *  -No, if one fails everything will be out of sync
 * Maybe we just store in standard sets, using sorted keys. The problem here is we rely on new mysql calls to update any sort data.
 * If we are storing, we might as well store in a hash so we have all the data to sort in the future. Redis might be better than mysql for sorting? investigate both
 *
 * 
 * @param  {[type]} sql     [description]
 * @param  {[type]} params  [description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
CachedModelModule.prototype._sortedCachedCollection = function (sql, params, options) {
	var _self = this;

	if (options.sort) {
		if (!options.sort.field) {
			options.sort.field = 'id';
		}
		
		if (!options.sort.direction) {
			options.sort.direction = 'DESC';
		}
	}

};

/**
 * [ description]
 * @param  {[type]} sql     [description]
 * @param  {[type]} params  [description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
CachedModelModule.prototype._unsortedCachedCollection = function (sql, params, options) {
	var _self = this;

	if (!Array.isArray(params)) {
		options = params;
		params = [];
	}

	var cached_promise = new ModelRequest(this);

	this.buildCacheKey(options, params, function (key, ttl) {
		_self.redis.smembers(key, function (err, ids) {
			// todo: if (options.key.time) expire key
			if (err) {
				return cached_promise._error(err);
			}

			// If no ID's were found, run an SQL query
			if (!ids || !ids.length) {
				_self.collection(sql, params)
					.error(cached_promise._error.bind(cached_promise))
					.ready(function (collection) {
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
 */
CachedModelModule.prototype.load = function (value, field) {
	var _self = this;
	var cache_request = new ModelRequest(this);

	if (typeof value === "undefined") {
		throw new Error('You can not load an object with an undefined value');
	}

	if (typeof field === "undefined") {
		field = "id";
	}

	if (field === 'id') {
		// if they want an id field, it's easy to find, we have the key
		this._locateModels(value, cache_request);
	} else {
		// if they want an alternate field, we have a key to id mapping
		this.redis.get(_self._buildCacheKey({key : field}, [value]), function (err, id) {
			if (err) {
				return cache_request._error(err);
			}

			if (id) {
				// if we find the key to id mapping, try to find the proper db objet
				_self._locateModels(id, cache_request);

			} else {
				// if we don't find the key to id mapping, find the db object and update the mappings
				CachedModelModule.super_.prototype.load.call(_self, value, field)
					.ready(function (model) {
						if (model) {
							// if we find the db value, update the mapping
							_self.redis.set(_self._buildCacheKey({key : field}, [value]), model.id);
							// and update the model
							_self.redis.hmset('models:' + _self._definition.table + ':' + _self.id, model.dataObject());
						} else {
							// if we can't find the db value, make sure to delete everything just in case
							// one of these might not be necessary. todo: a thorough investigation as to why they were here
							_self.redis.del(_self._buildCacheKey({key : field}, [value]));
							_self.redis.hmdel('models:' + _self._definition.table + ':' + _self.id, model.dataObject());
						}

						cache_request._ready(model);
					})
					.error(cache_request);
			}
		});
	}

	return cache_request;
};

/**
 * Assign the model definition to the model module
 * 
 * @param {[type]} definition [description]
 */
CachedModelModule.prototype.setModel = function (definition) {
	CachedModelModule.super_.prototype.setModel.call(this, definition, CachedModel);
	// todo: I don't like this, find another way to access the redis object
	this.Model.prototype.redis = this.redis;
	this._cache_prefix = 'models:' + this._definition.table;
};

/**
 * Synchronous cache key builder. Does not look up cache times or anything complicated.
 * It simply turns the two parameters into a consistent string value
 * 
 * @param  {[type]} key     [description]
 * @param  {[type]} params  [description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
CachedModelModule.prototype._buildCacheKey = function (options, params) {
	// allow the options parameter to be ignored
	if (typeof params === "undefined") {
		params = options;
		options = {};
	}

	var cache_key = this._cache_prefix;

	if (options.key && options.key.value) {
		cache_key += ':' + options.key.value; 
	}

	if (params && params.length) {
		cache_key += ':' + params.join(':');
	}

	if (options.sort) {
		cache_key += ':' + options.sort.field + ':' + options.sort.direction;
	}

	if (options.key && options.key.time) {
		cache_key += ':' + options.key.time;
	}

	return cache_key;
};

/**
 * Turn a list of id's into models
 * 
 * @param  {[type]} ids     [description]
 * @param  {[type]} promise [description]
 * @return {[type]}         [description]
 */
CachedModelModule.prototype._locateModels = function (ids, model_request) {
	var keys = [];
	var _self = this;
	var single = false;

	// allow an optional model request parameter
	if (typeof model_request === "undefined") {
		model_request = new ModelRequest(this);
	}

	if (typeof ids == "undefined" || ids == null) {
		throw new Error('you must provide one or more ids to the method _locateModels');
	}

	// allow single values to be passed for the ids
	if (!Array.isArray(ids)) {
		ids = [ids];
		single = true;
	}

	// if we don't have any ids, we should just return immediately
	if (!ids.length) {
		if (single) {
			model_request._ready(null);
		} else {
			model_request._ready([]);
		}
	}

	// Build an array of cache keys based on the ID's we need turned into models
	ids.forEach(function (id) {
		keys.push(_self._buildCacheKey([id]));
	});

	// Try to get all of the cache keys with a single redis request
	_self.redis.mget(keys, function (err, values) {
		var sql_ids = [];

		if (err) {
			return model_request._error(err);
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

			_self.connection.query('select * from `' + _self._definition.table + '` where `id` in (' + id_list + ') ORDER BY FIELD (`id`,' + id_list + ')', function (err, rows, cols) {
				if (err) {
					return model_request._error(err);
				}

				var i = 0;
				var model = null;
				var hmset = [];
				var multi = _self.redis.multi();

				// Merge the items from the database back into the original array of models, and build an array to HMSET them back into redis
				for (i = 0; i < values.length; i++) {
					if (values[i] === null) {
						model =  new _self.Model(rows.shift());
						values[i] = model;
						multi.hmset(_self._buildCacheKey([model.id]), model.dataObject());
					}
				}

				multi.exec(function (err, replies) {
					// ignore for now. should have logging in the future
				});

				if (single) {
					model_request._ready(values[0]);
				} else {
					model_request._ready(values);
				}
			});
		} else {
			if (single) {
				model_request._ready(values[0]);
			} else {
				model_request._ready(values);
			}
		}
	});

	return model_request;
};


/**
 * Extension of the model object
 * 
 * @param  {[type]} data [description]
 * @return {[type]}      [description]
 */
var CachedModel = module.exports.CachedModel = function (data) {
	Model.call(this, data);
};

util_module.inherits(CachedModel, Model);

/**
 * todo: pull this out of the model, and have save and delete work in another way, maybe reference the cached model by the db name or something.
 * @type {[type]}
 */
CachedModel.prototype.redis = null;

/**
 * Update the model in the database, and in the cache
 * 
 * @return ModelRequest
 */
CachedModel.prototype.save = function () {
	var _self = this;

	return CachedModel.super_.prototype.save.call(this)
		.addModifier(function (model) {
			_self.redis.hmset('models:' + _self._definition.table + ':' + _self.id, _self.dataObject());
			this._ready(model);
		});
};

/**
 * Delete a model from the cache
 * 
 * @return ModelRequest
 */
CachedModel.prototype['delete'] = function () {
	var _self = this;
	var old_id = _self.id;

	return CachedModel.super_.prototype['delete'].call(this)
		.addModifier(function (model) {
			_self.redis.hdel('models:' + _self._definition.table + ':' + old_id);
			this._ready(model);
		});
};