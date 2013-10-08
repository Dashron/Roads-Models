/*
* Roads.js Framework - cachedmodel.js
* Copyright(c) 2012 Aaron Hedges <aaron@dashron.com>
* MIT Licensed
*/
"use strict";

var util_module = require('util');

var model_component = require('./model');
var ModelModule = model_component.ModelModule;
var ModelRequest = require('./modelrequest').ModelRequest;
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
 * @return {[type]}            [description]
 */
CachedModelModule.prototype.buildCacheKey = function (options, params, callback) {
	var _self = this;

	if (typeof options === "string") {
		options = { key : { value : options } };
	}

	if (!Array.isArray(params)) {
		callback = params;
		params = [];
	}

	if (typeof options.key.timer === "string") {
		this.getTime(options.key.timer, function (err, val) {
			if (err) {
				return callback(err);
			} else {
				options.key.time = val;
				callback(null, _self._buildCacheKey(options, params, options.ignore_sort), options.ttl);
			}
		});
	} else {
		callback(null, _self._buildCacheKey(options, params, options.ignore_sort), options.ttl);
	}
};

/**
 * Synchronous cache key builder. Does not look up cache times or anything complicated.
 * It simply turns the two parameters into a consistent string value
 *
 * options are 
 *
 * key : {
 * 	value : ,
 * 	time : 
 * },
 * params : ,
 * options.sort : {
 * 	field : ,
 * 	direction :
 * }
 * 
 *
 * 
 * @param  {[type]} key     [description]
 * @param  {[type]} params  [description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
CachedModelModule.prototype._buildCacheKey = function (options, params, ignore_sort) {
	// allow the options parameter to be ignored
	if (typeof params === "undefined") {
		params = options;
		options = {};
	}

	if (typeof options.key === "string") {
		options.key = {
			value : options.key
		};
	}

	if (typeof ignore_sort === "undefined" || ignore_sort == null) {
		ignore_sort = false;
	}

	var cache_key = this._cache_prefix;

	if (options.key && options.key.value) {
		cache_key += ':' + options.key.value; 
	}

	if (params && params.length) {
		cache_key += ':' + params.join(':');
	}

	if (options.sort && !ignore_sort) {
		cache_key += ':sort:' + options.sort.field.toLowerCase() + ':' + options.sort.direction.toLowerCase();
	}

	if (options.key && options.key.time) {
		cache_key += ':time:' + options.key.time;
	}

	return cache_key;
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

	if (typeof key_options === "string") {
		key_options = {
			key : key_options
		};
	}

	this.buildCacheKey(key_options, params, function (err, key, ttl) {
		if (err) {
			return request._error(err);
		} else {
			// fire, handle sorts, then forget
			_self.redis.sadd(key, val, function (err, response) {
				if (err) {
					return request._error(err);
				}

				if (_self._definition.sorts) {
					var sorts = Object.keys(_self._definition.sorts);

					for (var i = 0; i < sorts.length; i++) {
						key_options.sort = _self._definition.sorts[sorts[i]];
						_self._rebuildSort(key_options, params, val, request);
					}
				}
			});
		}
	});
};

/**
 * [ description]
 * @param  {[type]} options [description]
 * @param  {[type]} params  [description]
 * @param  {[type]} val     [description]
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
CachedModelModule.prototype._rebuildSort = function (options, params, val, request) {
	var _self = this;
	var sorted_key = _self._buildCacheKey(options, params);
	var cache_pattern = _self._buildCacheKey(['*']);

	// make sure the sort already exists before we update the sort. No need to update something that's never used
	_self.redis.exists(sorted_key, function (err, response) {
		if (err) {
			return request._error(err);
		}

		if (response == 1) {
			return _self.redis.sort(_self._buildCacheKey(options, params, true), options.sort.direction, 'ALPHA',
				'by', cache_pattern + '->' + options.sort.field, 
				'get', cache_pattern + '->id',  
				'store', sorted_key, 
				function (err, response) {
					if (err) {
						return request._error(err);
					}
				});
		}
	});
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

	if (typeof key_options === "string") {
		key_options = {
			key : key_options
		};
	}
	
	this.buildCacheKey(key_options, params, function (err, key, ttl) {
		if (err) {
			return request._error(err);
		} else {
			// fire and forget
			_self.redis.srem(key, val, function (err, response) {
				if (err) {
					return request._error(err);
				}

				if (_self._definition.sorts) {
					var sorts = Object.keys(_self._definition.sorts);

					for (var i = 0; i < sorts.length; i++) {
						key_options.sort = _self._definition.sorts[sorts[i]];
						_self._rebuildSort(key_options, params, val, request);
					}
				}
			});
		}
	});
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

	// unsorted collections have a bunch of extra logic, so we handle it separately
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

	if (typeof options.sort === "string") {
		if (typeof this._definition.sorts[options.sort] !== "object") {
			throw new Error('Invalid pre-defined sort: ' + options.sort);
		}

		options.sort = this._definition.sorts[options.sort];
	}

	if (typeof options.sort.field === "undefined" || options.sort.field === null) {
		options.sort.field = 'id';
	}

	if (!options.sort.direction) {
		options.sort.direction = 'DESC';
	}

	options.ignore_sort = false

	var cache_request = new ModelRequest(this);
	var sorted_key = _self._buildCacheKey(options, params);

	this.redis.lrange(sorted_key, 0, -1, function (err, response) {
		if (err) {
			return cache_request._error(err);
		}

		if (response && response.length) {
			// if we find a list of ids, load them and ship em out
			return _self.load(response)
				.bindRequest(cache_request);
		} else {
			// if we didn't find a list of ids, sort in redis and then retry the previous query
			var cache_pattern = _self._buildCacheKey(['*']);

			return _self.redis.sort(_self._buildCacheKey(options, params, true), options.sort.direction, 'ALPHA',
				'by', cache_pattern + '->' + options.sort.field, 
				'get', cache_pattern + '->id',  
				'store', sorted_key
				, function (err, response) {
					if (err) {
						return cache_request._error(err);
					}

					// if the sort didn't set anything, try to find the collection
					if (response === 0) {
						_self._unsortedCachedCollection(sql, params, options)
							.addModifier(function (response) {
								// if the collection found something, it should now be cached so we can retry the sorted collection
								if (response && response.length) {
									_self._sortedCachedCollection(sql, params, options)
										.bindRequest(this);
								} else {
									// the collection did not find something so return an empty array
									cache_request._ready([]);
								}
							})
							.bindRequest(cache_request);
					} else {
						// the sort set a list, so lets retry the sorted collection
						_self._sortedCachedCollection(sql, params, options)
							.bindRequest(cache_request);
					}
				}); 
		}
	});

	return cache_request;
};

/**
 * [ description]
 *
 * @todo  are we sure that we should use smembers here? do we want a unique list or not. maybe we can use the definition to identify if the field should be unique, then handle list or members appropriately
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

	options.ignore_sort = true;

	var cache_request = new ModelRequest(this);

	// cache keys sometimes require cache lookups, so build that first
	this.buildCacheKey(options, params, function (err, key, ttl) {
		if (err) {
			return cache_request._error(err);
		}

		// using the built key, find the collection
		_self.redis.smembers(key, function (err, ids) {
			// todo: if (options.key.time) expire key
			if (err) {
				return cache_request._error(err);
			}

			// If we found ids, load them right from cache
			if (ids && ids.length) {
				// Turn the string list of ID's found from redis into models
				_self.load(ids)
					.bindRequest(cache_request);
			} else {
				// if we did not find ids, run the sql and then find them from the cache
				_self.collection(sql, params)
					.error(cache_request)
					.ready(function (collection) {
						// Generate a list of all the ID's' of the items we need to find
						var ids = [];

						for (var i = 0; i < collection.length; i ++) {
							ids.push(collection[i].id);
						}

						// if there are no ids, return immediately
						if (!ids.length) {
							cache_request._ready([]);
						} else {
							// Cache all of the ID's so we don't have to do a database lookup in the future
							if (ttl) {
								_self.redis.sadd(key, ids, function (err, rows) {
									if (err) {
										// todo: do more here
										console.log(err);
									}
									_self.redis.expire(key, ttl);
								});
							} else {
								_self.redis.sadd(key, ids);
							}

							// Turn the ID's into models
							return _self.load(ids)
								.bindRequest(cache_request);
						}
					});
			}
		});
	});

	return cache_request;
};

/**
 * [getTime description]
 * @param  {[type]}   key      [description]
 * @param  {Function} callback [description]
 * @param  {[type]}   error    [description]
 * @return {[type]}            [description]
 */
CachedModelModule.prototype.getTime = function (key, callback) {
	var _self = this;

	this.redis.get('cache:times:' + key, function redis_get_times(err, val) {
		if (err) {
			if (typeof callback === "function") {
				return callback(err);
			} else {
				return callback._error(err);
			}
		}

		if (val) {
			return callback(null, val);
		} else {
			_self.setTime(key, callback);
		}
	});
};

/**
 * [setTime description]
 * @param {[type]}   key      [description]
 * @param {Function} callback [description]
 * @param {[type]}   error    [description]
 */
CachedModelModule.prototype.setTime = function (key, callback) {

	// if its not found, set it
	var now = Date.now() / 1000;
	this.redis.set('cache:times:' + key, now, function redis_set_time(err) {
		if (err) {
			if (typeof callback === "function") {
				return callback(err);
			} else {
				return callback._error(err);
			}
		}

		if (callback) {
			callback(null, now);
		}
	});
};

/**
 * [ description]
 * @param  {[type]} values [description]
 * @param  {[type]} field  [description]
 * @return {[type]}        [description]
 */
CachedModelModule.prototype._loadArray = function (ids) {
	var _self = this;

	if (typeof ids == "undefined" || ids == null) {
		throw new Error('you must provide one or more ids to the method _loadArray');
	}

	// if we don't have any ids, we should just return immediately
	if (!ids.length) {
		process.nextTick(function () {
			model_request._ready([]);
		});
	}

	// allow an optional model request parameter
	var model_request = new ModelRequest(this);
	var multi_get = _self.redis.multi();

	// build the multi redis call, with a chain of hgetall commands
	ids.forEach(function (id) {
		multi_get.hgetall(_self._buildCacheKey([id]));
	});

	// run the multi redis call
	multi_get.exec(function (err, cached_models) {
		if (err) {
			return model_request._error(err);
		}

		var sql_ids = [];

		// Instantiate a list of all found models
		for (var i = 0; i < cached_models.length; i++) {
			if (cached_models[i] === null) {
				sql_ids.push(ids[i]);
			} else {
				cached_models[i] = new _self.Model(cached_models[i]);
			}
		}

		// If there were any items not found in cache, find them in the database
		if (sql_ids.length) {
			var id_list = sql_ids.join(',');

			// run the query, and sort it by the exact order we have our id's in
			_self.connection.query('select * from `' + _self._definition.table + 
					'` where `id` in (' + id_list + ') ORDER BY FIELD (`id`,' + id_list + ')', function (err, rows) {
				if (err) {
					return model_request._error(err);
				}

				// fill the empty holes in the cached_model list with the result from the query
				cached_models = _self._fillMissingCacheValues(cached_models, rows, ids);
				model_request._ready(cached_models);
			});
		} else {
			model_request._ready(cached_models);
		}
	});

	return model_request;
};

/**
 * [ description]
 * @param  {[type]} cached_models [description]
 * @param  {[type]} rows   [description]
 * @return {[type]}        [description]
 */
CachedModelModule.prototype._fillMissingCacheValues = function (cached_models, rows, ids) {
	var db_values = {};
	var i = 0;
	var model = null;
	var multi_set = this.redis.multi();

	// build a list of id => model. This is necessary because the db won't return duplicate records if an id is used more than once
	// We have to map the returned rows to their id, then match up the empty cached list
	while (rows.length) {
		model = new this.Model(rows.shift());
		db_values[model.id] = model;
	}

	// Merge the records from the id => model pairing back into the empty redis cached_models
	for (i = 0; i < cached_models.length; i++) {
		if (cached_models[i] === null) {
			model =  db_values[ids[i]];

			if (model) {
				cached_models[i] = model;
				// set this item, which was not originally found in redis, back into redis
				multi_set.hmset(this._buildCacheKey([model.id]), model.dataObject());
			} else {
				// if the model is not found, use null. this is likely data integrity issues
				cached_models[i] = null;
			}
		}
	}

	multi_set.exec(function (err, replies) {
		if (err) {
			// todo: do more here
			console.log(err);
		}
		// ignore for now. should have logging in the future
	});

	return cached_models;
}

/**
 * [ description]
 * @param  {[type]} value [description]
 * @param  {[type]} field [description]
 * @return {[type]}       [description]
 */
CachedModelModule.prototype._loadModel = function (value, field) {
	var _self = this;

	if (typeof field === "undefined") {
		field = "id";
	}

	if (field === "id") {
		// Find the model by it's id
		return this._loadById(value);
	} else {
		// Find the id by the different field/value pair, and then try to load that model
		return this._findId(value, field)
			.addModifier(function (id) {
				var find_id_request = this;

				if (id) {
					// we found the id, so load directly from that id
					_self._loadById(id)
						.ready(function (model) {
							if (model) {
								// if we found a model, update the field/value mapping to the id
								_self.redis.set(_self._buildCacheKey({key : field}, [value]), model.id);
							} else {
								// if we did not find the model, 
								_self.redis.del(_self._buildCacheKey({key : field}, [value]));
							}

							find_id_request._ready(model);
						})
						.error(find_id_request);
				} else {
					// could not find the id, so find the model directly and set back the id, and field => value cache items
					CachedModelModule.super_.prototype._loadModel.call(_self, value, field)
						.ready(function (model) {
							if (model) {
								_self.redis.set(_self._buildCacheKey({key : field}, [value]), model.id);
								_self.redis.hmset(_self._buildCacheKey([model.id]), model.dataObject());
							}

							find_id_request._ready(model);
						})
						.error(find_id_request);
				}
			});
	}
};

/**
 * [ description]
 * @param  {[type]} value [description]
 * @param  {[type]} field [description]
 * @return {[type]}       [description]
 */
CachedModelModule.prototype._findId = function (value, field) {
	var cache_request = new ModelRequest(this);

	this.redis.get(this._buildCacheKey({key : field}, [value]), function (err, id) {
		if (err) {
			return cache_request._error(err);
		}

		return cache_request._ready(id);
	});

	return cache_request;
};

/**
 * @todo merge this with the cache miss in loadModel
 * @param  {[type]} id [description]
 * @return {[type]}    [description]
 */
CachedModelModule.prototype._loadById = function (id) {
	var _self = this;
	var cache_request = new ModelRequest(this);

	// get a whole redis hash
	this.redis.hgetall(_self._buildCacheKey([id]), function (err, data) {
		if (err) {
			return cache_request._error(err);
		}

		if (data) {
			return cache_request._ready(new _self.Model(data));
		}

		// if we don't find the model hash from the id, find the data in the db and update the cache
		CachedModelModule.super_.prototype._loadModel.call(_self, id, 'id')
			.ready(function (model) {
				if (model) {
					// if we find the db value, update the mapping
					_self.redis.hmset(_self._buildCacheKey([model.id]), model.dataObject());
				}

				cache_request._ready(model);
			})
			.error(cache_request);
	});

	return cache_request;
}

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
			_self.redis.hmset('models:' + _self._definition.table + ':' + _self.id, _self.dataObject(), function (err) {
				if (err) {
					// todo: do more here
					console.log(err);
				}
				// unused but required for lib?
			});
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
			_self.redis.del('models:' + _self._definition.table + ':' + old_id, function (err, response) {
				if (err) {
					// todo: do more here
					console.log(err);
				}
			});
			this._ready(model);
		});
};
