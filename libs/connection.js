/*
* Roads.js Framework - connection.js
* Copyright(c) 2012 Aaron Hedges <aaron@dashron.com>
* MIT Licensed
*/
"use strict";
var connection_types = {};
var connections = {};

/**
 *
 * @param Constructor should look like function (config, callback), where config is an object, and callback looks like function (err, connection_object)
 */
module.exports.addType = function (key, constructor) {
	connection_types[key] = constructor;
};

/**
 *
 *
 *
 */
module.exports.getConnection = function (type, key) {
	return connections[type][key];
};

/**
 *
 *
 * @param config array of type=>label=>construction parameters
 */
module.exports.connect = function (config)
{
	var promise = new module.exports.ConnectionPromise(config);
	var type = null;
	var key = null;

	for (type in config) {
		connections[type] = {};

		for (key in config[type]) {
			if (!connection_types[type]) {
				throw new Error('Unsupported connection type : ' + type);
			}

			promise.connect(type, key);
		}
	}

	return promise;
};

var ConnectionPromise = module.exports.ConnectionPromise = function (config) {
	var _self = this;
	_self._config = config;
	_self._in_progress = {};
};

ConnectionPromise.prototype._ready = function (data) {
	this.ready = function (fn) {
		fn(data);
	};
};

ConnectionPromise.prototype._error = function (err) {
	this.error = function (fn) {
		fn(err);
	};
};

ConnectionPromise.prototype.ready = function (fn) {
	this._ready = fn;
	return this;
};

ConnectionPromise.prototype.error = function (fn) {
	this._error = fn;
	return this;
};

ConnectionPromise.prototype._in_progress = null;
ConnectionPromise.prototype._config = null;

ConnectionPromise.prototype.connect = function (type, key) {
	var _self = this;

	if (!_self._in_progress[type]) {
		_self._in_progress[type] = {};
	}

	_self._in_progress[type][key] = true;

	console.log("Adding connection for : " + type + ' : ' + key);
	connection_types[type](_self._config[type][key], function (err, connection) {
		console.log('Connection complete for : ' + type + ' : ' + key);
		if (err) {
			return _self._error(err);
		}

		connections[type][key] = connection;
		delete _self._in_progress[type][key];

		// once all of one type have been loaded, clear it out
		if (!Object.keys(_self._in_progress[type]).length) {
			delete _self._in_progress[type];
		}

		// once all have been loaded, mark as ready
		if (!Object.keys(_self._in_progress).length) {
			_self._ready();
		}
	});
};

var redis_module = null;

/**
 * Returns the connection for the provided label.
 * If no connection has been created, this attempts to create the connection using the provided config.
 * 
 * @param  {String} label
 * @param  {Object} config {port: , host: , options: }
 * @return {Connection}
 */
var redis_connector = module.exports.Redis = function (config, fn) {
	if (!redis_module) {
		redis_module = require('redis');
	}
	
	var client = redis_module.createClient(config.port, config.host, config.options);

	if (config.password) {
		client.auth(config.password, function () {});
	}

	// todo handle reconnection and authentication
	client.on('connect', function () {
		// we only track pre-connection errors in this system
		fn(null, client);
	});

	client.on('error', function (err) {
		fn(err);
	});
};

var mysql_module = null;

var mysql_connector = module.exports.Mysql = function (config, fn) {
	if (!mysql_module) {
		mysql_module = require('mysql');
	}

	var connection = mysql_module.createConnection(config);
	
	//todo handle reconnection
	connection.on('error', function (err) {
		fn(err);
	});

	connection.connect(function (err) {
		if (err) {
			fn(err);
		} else {
			fn(null, connection);
		}
	});
};

module.exports.addType("mysql", mysql_connector);
module.exports.addType("redis", redis_connector);