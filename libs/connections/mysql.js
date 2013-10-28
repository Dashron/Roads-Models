var ConnectionType = require('./connectiontype');
var mysql_module = require('mysql');
var util_module = require('util');

/**
 * [ description]
 * @param  {[type]} config [description]
 * @return {[type]}        [description]
 */
var MysqlConnection = module.exports = function (config) {
	ConnectionType.call(this, config);
};

util_module.inherits(MysqlConnection, ConnectionType);

MysqlConnection.prototype.connect = function (callback) {
	var _self = this;
	var connection = mysql_module.createConnection(this.config);
	
	//todo handle reconnection
	connection.on('error', function (err) {
		_self._error(err);
	});

	connection.connect(function (err) {
		if (err) {
			_self._error(err);
		} else {
			callback();
		}
	});

	this._connection = connection;
	return this;
}

MysqlConnection.prototype.disconnect = function () {
	this._connection.end();
	return this;
};