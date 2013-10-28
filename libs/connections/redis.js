var ConnectionType = require('./connectiontype');
var redis_module = require('redis');
var util_module = require('util');

/**
 * Returns the connection for the provided label.
 * If no connection has been created, this attempts to create the connection using the provided config.
 * 
 * @param  {String} label
 * @param  {Object} config {port: , host: , options: }
 * @return {Connection}
 */
var RedisConnection = module.exports = function (config) {
	ConnectionType.call(this, config);
};

util_module.inherits(RedisConnection, ConnectionType);

RedisConnection.prototype.connect = function (callback) {
	var _self = this;
	var connection = redis_module.createClient(this.config.port, this.config.host, this.config.options);

	if (this.config.password) {
		connection.auth(this.config.password, function () {});
	}

	// todo handle reconnection and authentication
	connection.on('connect', function () {
		// we only track pre-connection errors in this system
		callback();
	});

	connection.on('error', function (err) {
		_self._error(err);
	});

	this._connection = connection;
	return this;
}

RedisConnection.prototype.disconnect = function () {
	this._connection.quit();
	return this;
};