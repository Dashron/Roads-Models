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

MysqlConnection.prototype.insert = function (table, object, callback) {
	var keys = Object.keys(object);
	var placeholders = [];
	var values = [];

	// build the parameter values for the sql query
	for (i = 0; i < keys.length; i++) {
		values.push(object[keys[i]]);
		placeholders.push('?');
	}

	var sql = 'insert into `' + table + '` (`' + keys.join('`, `') + '`) VALUES (' + placeholders.join(', ') + ')';

	return this.getConnection().query(sql, values, callback);
};

MysqlConnection.prototype.update = function (table, id, object, callback) {
	var keys = Object.keys(object);
	var placeholders = [];
	var values = [];

	// build the parameter values for the sql query
	for (i = 0; i < keys.length; i++) {
		values.push(object[keys[i]]);
		placeholders.push('?');
	}

	// record the id
	values.push(id);

	var sql = 'update `' + table + '` set `' + keys.join('` = ?, `') + '` = ? where `id` = ?';

	return this.getConnection().query(sql, values, callback);
}

MysqlConnection.prototype.delete = function (table, id) {
	var sql = 'delete from `' + this._definition.table + '` where `id` = ?';

	return this.getConnection().query(sql, [id], callback);
}

MysqlConnection.prototype.selectByIds = function (table, ids, collection) {
	var sql = 'select * from `' + table + '` where `id` in (' + Array(ids.length).join('?,') + '?)  ORDER BY FIELD (`id`,' + ids.join(',') + ')'
	
	return collection(sql, ids);
};

MysqlConnection.prototype.selectByField = function (table, field, value, collection) {
	var sql = 'select * from `' + table + '` where `' + field + '` = ?';

	return collection(sql, [value], {
		per_page : 1
	});
}
