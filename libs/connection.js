/*
* Roads.js Framework - connection.js
* Copyright(c) 2012 Aaron Hedges <aaron@dashron.com>
* MIT Licensed
*/
"use strict";
var connection_types = {};
var connections = {};
var util_module = require('util');

/**
 *
 * @param Constructor should look like function (config, callback), where config is an object, and callback looks like function (err, connection_object)
 */
module.exports.addConnectionType = function (key, connection_type) {
	connection_types[key] = connection_type;
};

/**
 *
 * Returns the actual library object for the connection (eg. the redis client, not the roads-models redis connection object)
 *
 */
module.exports.getConnection = function (type, connection_type) {
	return connections[type][connection_type].connection;
};

/**
 *
 *
 * @param config array of type=>label=>construction parameters
 */
module.exports.connect = function (config)
{
	var promise = new module.exports.ConnectionRequest(config);
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

/**
 * [ description]
 * @return {[type]} [description]
 */
module.exports.disconnect = function ()
{
	var type = null;
	var key = null;
	var connection_type = null;

	for (type in connections) {
		connection_type = connections[type];

		for (key in connection_type) {
			connection_type[key].disconnect();
		}
	}
};

/**
 * Simply used to provide an object for module.exports.connect
 * This concept really needs to be put into it's own module
 * @param  {[type]} config [description]
 * @return {[type]}        [description]
 */
var ConnectionRequest = module.exports.ConnectionRequest = function (config) {
	var _self = this;
	_self._config = config;
	_self._in_progress = {};
};

ConnectionRequest.prototype._ready = function (data) {
	this.ready = function (fn) {
		fn(data);
	};
};

ConnectionRequest.prototype._error = function (err) {
	this.error = function (fn) {
		fn(err);
	};
};

ConnectionRequest.prototype.ready = function (fn) {
	this._ready = fn;
	return this;
};

ConnectionRequest.prototype.error = function (fn) {
	this._error = fn;
	return this;
};

ConnectionRequest.prototype._in_progress = null;
ConnectionRequest.prototype._config = null;

ConnectionRequest.prototype.connect = function (type, key) {
	var _self = this;

	if (!_self._in_progress[type]) {
		_self._in_progress[type] = {};
	}

	_self._in_progress[type][key] = true;

	console.log("Adding connection for : " + type + ' : ' + key);
	var ConnectionType = connection_types[type];

	if (!ConnectionType) {
		throw new Error('Could not location connection type [' + type + ']');
	}

	var connection = new ConnectionType(_self._config[type][key]);
	
	connection.ready(function (err, connection) {
		console.log('Connection complete for : ' + type + ' : ' + key);
		if (err) {
			return _self._error(err);
		}

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

	connections[type][key] = connection;
};



/**
 * [ description]
 * @param  {[type]} config [description]
 * @return {[type]}        [description]
 */
var ConnectionType = module.exports.ConnectionType = function (config) {
	this.config = config;
};

ConnectionType.prototype.connection = null;
ConnectionType.prototype.config = null;

ConnectionType.prototype._ready = function (data) {
	this.ready = function (fn) {
		fn(data);
	};
};

ConnectionType.prototype.ready = function (fn) {
	this._ready = fn;
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
var RedisConnection = module.exports.Redis = function (config) {
	var _self = this;
	ConnectionType.call(this, config);

	if (!redis_module) {
		redis_module = require('redis');
	}
	
	this.connection = redis_module.createClient(config.port, config.host, config.options);

	if (config.password) {
		this.connection.auth(config.password, function () {});
	}

	// todo handle reconnection and authentication
	this.connection.on('connect', function () {
		// we only track pre-connection errors in this system
		_self._ready(null, _self.connection);
	});

	this.connection.on('error', function (err) {
		_self._ready(err);
	});
};

util_module.inherits(RedisConnection, ConnectionType);

RedisConnection.prototype.disconnect = function () {
	this.connection.quit();
};


var mysql_module = null;

/**
 * [ description]
 * @param  {[type]} config [description]
 * @return {[type]}        [description]
 */
var MysqlConnection = module.exports.Mysql = function (config) {
	var _self = this;
	ConnectionType.call(this, config);
	
	if (!mysql_module) {
		mysql_module = require('mysql');
	}

	this.connection = mysql_module.createConnection(config);
	
	//todo handle reconnection
	this.connection.on('error', function (err) {
		_self._ready(err);
	});

	this.connection.connect(function (err) {
		if (err) {
			_self._ready(err);
		} else {
			_self._ready(null, _self.connection);
		}
	});
};

util_module.inherits(MysqlConnection, ConnectionType);

MysqlConnection.prototype.disconnect = function () {
	this.connection.end();
};

// todo move this into the config
module.exports.addConnectionType("mysql", MysqlConnection);
module.exports.addConnectionType("redis", RedisConnection);