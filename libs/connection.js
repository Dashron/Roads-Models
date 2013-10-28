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
 * [ description]
 * @param  {[type]} key [description]
 * @return {[type]}     [description]
 */
module.exports.getConnectionType = function (type) {
	if (!connection_types[type]) {
		connection_types[type] = require('./connections/' + type + '.js');
	}

	return connection_types[type];
};

/**
 *
 * Returns the actual library object for the connection (eg. the redis client, not the roads-models redis connection object)
 *
 */
module.exports.getConnection = function (type, label) {
	if (!connections[type][label]) {
		throw new Error('You have not made a ' + type + ' connection called "' + label + '"');
	}

	return connections[type][label];
};

/**
 *
 *
 * @param config array of type=>label=>construction parameters
 */
module.exports.connect = function (config)
{
	return (new module.exports.ConnectionRequest(config)).connect();
};

/**
 * [ description]
 * @return {[type]} [description]
 */
module.exports.disconnect = function ()
{
	var type = null;
	var label = null;
	var connection_type = null;

	for (type in connections) {
		connection_type = connections[type];

		for (label in connection_type) {
			connection_type[label].disconnect();
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
	if (!Object.keys(this._in_progress).length) {
		return this._final_ready();
	}
	return this;
};

ConnectionRequest.prototype._error = function (err) {
	this.error = function (fn) {
		fn(err);
	};
};

ConnectionRequest.prototype.ready = function (fn) {
	this._final_ready = fn;
	return this;
};

ConnectionRequest.prototype._final_ready = function (data) {
	this.ready = function (fn) {
		fn(data);
	}
};

ConnectionRequest.prototype.error = function (fn) {
	this._error = fn;
	return this;
};

ConnectionRequest.prototype._in_progress = null;
ConnectionRequest.prototype._config = null;

ConnectionRequest.prototype.connect = function () {
	var type = null;
	var label = null;

	for (type in this._config) {
		if (!connections[type]) {
			connections[type] = {};
		}

		for (label in this._config[type]) {
			// populate an empty object so we don't have type errors
			if (!this._in_progress[type]) {
				this._in_progress[type] = {};
			}

			// don't allow the same connection to be made multiple times simultaniously
			if (this._in_progress[type][label]) {
				continue;
			}

			connections[type][label] = this._connect(type, label);
		}
	}

	return this;
};

ConnectionRequest.prototype._connect = function (type, label) {
	var _self = this;

	// mark a connection as in progress
	_self._in_progress[type][label] = true;

	return this._connection(type, this._config[type][label])
		.connect(function () {
			console.info('Connection complete for : ' + type + ' : ' + label);
			delete _self._in_progress[type][label];

			// once all of one type have been loaded, clear it out
			if (!Object.keys(_self._in_progress[type]).length) {
				delete _self._in_progress[type];
			}

			_self._ready();
		}).error(function (err) {
			console.error('Connection error for : ' + type + ' : ' + label);
			console.error(err);
			this._error(err);
		});
}

ConnectionRequest.prototype._connection = function (type, config) {
	var ConnectionType = module.exports.getConnectionType(type);
	console.log(ConnectionType.toString());
	return new ConnectionType(config);
}