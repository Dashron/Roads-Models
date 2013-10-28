/**
 * [ description]
 * @param  {[type]} config [description]
 * @return {[type]}        [description]
 */
var ConnectionType = module.exports = function (config) {
	this.config = config;
};

ConnectionType.prototype._connection = null;
ConnectionType.prototype.config = null;

ConnectionType.prototype._connect = function (data) {
	this.connect = function (fn) {
		fn(data);
	};
};

ConnectionType.prototype.connect = function (fn) {
	throw new Error('You must define this method in your own code');
	this._connect = fn;
	return this;
};

ConnectionType.prototype._error = function (data) {
	this.error = function (fn) {
		fn(data);
	};
};

ConnectionType.prototype.error = function (fn) {
	this._error = fn;
	return this;
};

ConnectionType.prototype.getConnection = function () {
	return this._connection;
}