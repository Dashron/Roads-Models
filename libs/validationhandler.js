/**
 * [ description]
 * @param  {[type]} model [description]
 * @return {[type]}       [description]
 */
var ValidationHandler = module.exports.ValidationHandler = function (model) {
	this._data = {};

	for (var key in model._updated_fields) {
		if (!model._updated_fields.hasOwnProperty(key)) {
			continue;
		}

		this._data[key] = model["_" + key];
	}

	this._definition = model._definition;
	this._invalid_fields = {};
};

ValidationHandler.prototype._data = null;
ValidationHandler.prototype._invalid_fields = null;

ValidationHandler.prototype._ready = function (err, field) {
	// allow null fields for empty inserts
	if (field) {
		delete this._data[field];
	}

	if (err) {
		this._invalid_fields[field] = err;
	}

	// this is a very lazy check. == {} might be faster
	if (!Object.keys(this._data).length) {
		if (typeof this._final_ready != "function") {
			console.log('No _final_ready function was found on this model request. Have you created one without assigning any variables?');
		} else {
			this._final_ready(Object.keys(this._invalid_fields).length > 0 ? this._invalid_fields : null);
		}
	}
};

ValidationHandler.prototype.ready = function (fn) {
	this._final_ready = fn;
	return this;
};

ValidationHandler.prototype.validateFields = function () {
	var _self = this;

	// if we are inserting a new object with no values
	if (Object.keys(this._data).length === 0) {
		_self._ready(null, null);
	}

	// handle this later so that all error handlers happen 
	process.nextTick(function () {
		for (var key in _self._data) {
			if (!_self._data.hasOwnProperty(key)) {
				continue;
			}

			_self.validateField(key);
		}
	});

	return this;
};

ValidationHandler.prototype.validateField = function (field) {
	exports.validateField(field, this);
};


exports.validateField = function (field, handler) {
	var data = handler._data[field];
	var definition = handler._definition.fields[field];
	var type = definition.type;
	var length = null;
	var valid = true;
	var message = '';
	
	switch (type) {
		case "email":
			type = "string";
			length = 256;
			break;
		case "id":
			type = "number";
			length = 10;
			break;
		case "ip":
			type = "string";
			length = 15;
			break;
	}

	
	if (definition.nullable) {
		// if we allow nulls
		if (typeof data === "undefined") {
			// override undefined with  null
			data = null;
			// NOTE: ONCE YOU SAVE ALL UNDEFINEDS WILL BECOME NULL. THIS WILL CHANGE THE VALUE IN THE MODEL
			handler._data[field] = null;
		}
	} else {
		// if we don't allow null values
		if (data === null || typeof data === "undefined") {
			// and the data is null or undefined, error
			message = "can not be null";
			valid = false;
			data = null;
		}
	}

	if (valid) {
		switch (type) {
			case "string":
				data = '' + data;

				if (length && data.length > length) {
					message = "invalid length";
					valid = false;
				}
				break;

			case "number":
				// thanks stack overflow!
				if (isNaN(parseFloat(data)) || !isFinite(data)) {
					message = "invalid number";
					valid = false;
				} else if (length && data.toString().length > length) {
					message = "invalid length";
					valid = false;
				}
				break;

			case "date":
				if (!util_module.isDate(data)) {
					message = "invalid date";
					valid = false;
				}
				break;

			default:
				throw new Error('invalid validation type');
		}
	}

	if (valid) {
		if (definition.custom) {
			definition.custom(data, handler._ready.bind(handler));
		} else {
			handler._ready(null, field);
		}
	} else {
		handler._ready(message, field);
	}
};
