/*
* Roads.js Framework - model.js
* Copyright(c) 2012 Aaron Hedges <aaron@dashron.com>
* MIT Licensed
*/
"use strict";

var util_module = require('util');

/**
 * [ModelRequest description]
 *
 *
 *
 * 
 */
var ModelRequest = exports.ModelRequest = function (target) {
	if (target._definition) {
		this._definition = target._definition;
	} else {
		this._definition = target.definition;
	}

	this._modifiers = [];
};

ModelRequest.prototype.result = null;
ModelRequest.prototype._final_ready = null;
ModelRequest.prototype._modifiers = null;
ModelRequest.prototype._definition = null;

ModelRequest.prototype._validationError = null;

ModelRequest.prototype._error = function (err) {
	this.error = function (fn) {
		fn(err);
	};
};

ModelRequest.prototype._ready = function (data) {
	var _self = this;
	if (this._modifiers.length) {
		_self._modifiers.shift().call(_self, data);
	} else {
		if (typeof _self._final_ready != "function") {
			console.log('No _final_ready function was found on this model request. Have you created one without assigning any variables?');
		} else {
			_self._final_ready(data);
		}
	}
};

ModelRequest.prototype.error = function (fn) {
	// allow you to pass model requests directly into the error
	if (typeof fn === "object" && typeof fn._error === "function") {
		this._error = function (err) {
			fn._error(err);
		};
	} else {
		this._error = fn;
	}

	return this;
};

ModelRequest.prototype.validationError = function (fn) {
	this._validationError = fn;
	return this;
};

ModelRequest.prototype.ready = function (fn) {
	this._final_ready = fn;
	return this;
};

ModelRequest.prototype.addModifier = function (fn) {
	this._modifiers.push(fn);
	return this;
};

/**
 * This performs sql joins from within node, instead of mysql.
 * 
 * Each model provided to the final ready function will have the associated model for 
 * any preloaded fields added to the model.
 * 
 * A model definition needs two fields for preload to work, assign_to and model_module.
 * assign_to is the property on the model which will contain the associated object.
 * model_module is the model module that will handle all db and model information.
 * 
 * so if you call preload('user_id') on a model who has a defintion of
 * 
 * user_id : {
 * 	type : id,
 * 	assign_to : "user", 
 * 	model_module : require('../../user/models/user.model')
 * }
 * 
 * each model passed to your return callback will have a "user" property containing the associated model.
 * 
 * @param  {String} field
 */
ModelRequest.prototype.preload = function (field) {
	if (typeof this._definition.fields[field] !== "object") {
		throw new Error('The field ' + field + ' is not part of the model definition');
	}

	var field_definition = this._definition.fields[field];

	if (typeof field_definition.assign_to !== "string") {
		throw new Error('Any preloaded objects must have an assign_to field in their definition');
	}

	var assign_to = field_definition.assign_to;

	if (typeof field_definition.model_module !== "object") {
		throw new Error('Any preloaded objects must have a model field in their definition');
	}

	var model_module = field_definition.model_module;
	var original_promise = this;

	this.addModifier(function (data) {
		var ids = new Array(data.length);
		var i = 0;
		var model_associations = {};
		var model_promise = null;
		var unravel = false;
		
		// if we loaded a single object, make the sql work as is but then return a single object at the end
		if (!Array.isArray(data)) {
			if (typeof data === "object") {
				data = [data];
				unravel = true;
			} else {
				return this._error(new Error('Invalid data provided to the preload addModifier callback'));
			}
		}

		// find all of the ids from the data array
		for (i = 0; i < data.length; i++) {
			ids[i] = data[i][field];
		}

		model_promise = new ModelRequest(model_module);

		model_promise.ready(function (models) {
			// build a list of id => model to ensure a record exists
			for (i = 0; i < models.length; i++) {
				model_associations[models[i].id] = models[i];
			}

			for (i = 0; i < data.length; i++) {
				if (typeof model_associations[data[i][field]] !== "undefined" && typeof model_associations[data[i][field]] !== null) {
					data[i][assign_to] = model_associations[data[i][field]];
				}
			}

			if (unravel) {
				original_promise._ready(data[0]);
			} else {
				original_promise._ready(data);
			}
		}).error(original_promise._error.bind(original_promise));

		model_module._locateModels(ids, model_promise);
	});

	return this;
};

function fix_data_type (definition, value) {
	if (definition.type == 'id' || definition.type == 'int') {
		value = Number(value);
	}

	return value;
}

/**
 *
 *
 *
 *
 */
var Model = module.exports.Model = function Model (data) {
	if (typeof data === "string") {
		data = JSON.parse(data);
	}

	// todo: maybe don't double initalize?
	// we have to set this here because the prototype has to be null otherwise all objects share the field list
	this._updated_fields = {};

	for (var key in data) {
		// make sure the datatype in the object is accurate
		this['_' + key] = fix_data_type(this._definition.fields[key], data[key]);
	}

	// we have to set this a second time to wipe out any updated field markers from setting the initial data
	this._updated_fields = {};
};
// todo: flywheel this off of the table name
Model.prototype._definition = null;
Model.prototype._updated_fields = null;
Model.prototype._onSave = function (request) {
	request._ready(this);
};

Model.prototype._onDelete = function (request) {
	request._ready(null);
};

Model.prototype._connection = null;

Model.prototype.save = function () {
	var _self = this;
	var request = new ModelRequest(this);

	var keys = Object.keys(this._updated_fields);
	var values = [];
	var i = 0;

	//todo don't allow save to be called on a deleted object
	if (keys.length > 0) {
		var validator = new ValidationHandler(this);
		validator.ready(function (invalid_fields) {
			if (invalid_fields) {
				if (request._validationError) {
					return request._validationError(invalid_fields);
				} else {
					return request._error(invalid_fields);
				}
			}

			if (typeof _self.id === "undefined" || _self.id === null) {
				var placeholders = [];

				for (i = 0; i < keys.length; i++) {
					values.push(_self['_' + keys[i]]);
					placeholders.push('?');
				}

				_self._connection.query(
					'insert into `' + _self._definition.table + '` (`' + keys.join('`, `') + '`) VALUES (' + placeholders.join(', ') + ')', 
					values,
					function(error, result) {
						request.result = result;

						if (error) {
							request._error(error);
							return;
						}

						_self.id = result.insertId;
						_self._updated_fields = [];
						_self._onSave(request);
					}
				);
			} else {
				for (i = 0; i < keys.length; i++) {
					values.push(_self['_' + keys[i]]);
				}
				
				values.push(_self.id);

				_self._connection.query(
					'update `' + _self._definition.table + '` set `' + keys.join('` = ?, `') + '` = ? where `id` = ?', 
					values, 
					function (error, result) {

						request.result = result;
						if (error) {
							request._error(error);
							return;
						}
						_self._updated_fields = [];
						_self._onSave(request);
					}
				);
			}
		}).validateFields();

	} else {
		process.nextTick(function () {
			_self._onSave(request);
		});
	}

	return request;
};

/**
 *
 *
 *
 */
Model.prototype['delete'] = function () {
	var delete_request = new ModelRequest(this);
	var _self = this;

	this._connection.query('delete from `' + this._definition.table + '` where `id` = ?', 
		[this.id], 
		function (error, result) {
			delete_request.result = result;

			if (error) {
				delete_request._error(error);
				return;
			}

			var old_id = _self.id;
			_self.id = null;
			_self._onDelete(delete_request, old_id);
		}
	);

	return delete_request;
};

/**
 * [ description]
 * @return {[type]} [description]
 */
Model.prototype.toString = function () {
	return JSON.stringify(this.dataObject());
};

/**
 * [ description]
 * @return {[type]} [description]
 */
Model.prototype.dataObject = function () {
	var data = {};

	for (var field in this._definition.fields) {
		if (field === 'definition') {
			throw new Error('Invalid model definition provided. "definition" is a reserved word');
		}
		data[field] = this[field];
	}

	return data;
};

/**
 * How to use:
 *  var user_module = new model_module.ModelModule();
 *  user_module.connection = new Database('default');
 *  user_module.setModel({
 *  	table : '',
 *  	fields : {
 *  		name : {
 *  			type : '',
 *  			set : function (){},
 *  			get : function (){}
 *  		}
 *  	},
 *  	methods : {
 *  		name : function (){}
 *  	}
 *  });
 *
 * user_module.do_stuff();
 *  
 */
var ModelModule = module.exports.ModelModule = function ModelModule () {
};

ModelModule.prototype.connection = null;
ModelModule.prototype.definition = null;

function applyModelMethods (model, definition) {
	for (var i in definition.methods) {
		if (i === 'definition') {
			throw new Error('Invalid model definition provided. "definition" is a reserved word');
		}

		model.prototype[i] = definition.methods[i];
	}
}

function addProperty (model, key, field_definition) {
	var property = {
		get : function() {
			return this['_' + key];
		},
		set : function(value) {
			this._updated_fields[key] = value;
			// should we track old values here and revert them on save error?
			this['_' + key] = value;
		}
	};

	if (field_definition.get) {
		property.get = field_definition.get;
	}

	if (field_definition.set) {
		property.set = function (value) {
			this._updated_fields[key] = true;
			field_definition.set.call(this, value);
		};
	}			

	Object.defineProperty(model.prototype, key, property);
}

function applyModelFields (model, definition) {
	for (var field in definition.fields) {
		if (field === 'definition') {
			throw new Error('Invalid model definition provided. "definition" is a reserved word');
		}
		addProperty(model, field, definition.fields[field]);
	}
}

ModelModule.prototype.setModel = function (definition, model_class) {
	var model_module = this;
	this._definition = definition;
	
	if (!model_class) {
		model_class = Model;
	}

	var NewModel = function(data) {
		model_class.call(this, data);
	};
	util_module.inherits(NewModel, model_class);

	NewModel.prototype._definition = definition;
	applyModelMethods(NewModel, definition);
	applyModelFields(NewModel, definition);

	NewModel.prototype._connection = model_module.connection;
	
	if (definition.events) {
		if (definition.events.onSave) {
			NewModel.prototype._onSave = definition.events.onSave;
		}

		if (definition.events.onDelete) {
			NewModel.prototype._onDelete = definition.events.onDelete;
		}
	}

	this.Model = NewModel;
};

ModelModule.prototype.load = function (value, field) {
	var _self = this;
	var request = new ModelRequest(this);

	if (typeof field !== "string") {
		field = "id";
	}

	this.connection.query(
		'select * from `' + this._definition.table + '` where `' + field + '` = ? limit 1', 
		[value], 
		function (err, rows, columns) {
			if (err) {
				request._error(err);
				return;
			}

			if (rows.length === 0) {
				// todo: should I use ready, error and empty? or just pass null to ready?
				request._ready(null);
				return;
			}

			request._ready(new _self.Model(rows[0]));
		}
	);

	return request;
};

/**
 * Returns an array of all the models found by the provided sql
 * @param  {String} sql   
 * @param  {Object} params key value map
 * @return {Array}        Array of models
 */
ModelModule.prototype.collection = function (sql, params) {
	var request = new ModelRequest(this);
	var _self = this;
	this.connection.query(sql, params, function (err, rows, columns) {
		if (err) {
			request._error(err);
			return;
		}

		var models = new Array(rows.length);

		for (var i = 0; i < rows.length; i++) {
			models[i] = new _self.Model(rows[i]);
		}

		request._ready(models);
	});

	return request;
};

/**
 * [ description]
 * @param  {[type]} ids     [description]
 * @param  {[type]} promise [description]
 * @return {[type]}         [description]
 */
ModelModule.prototype._locateModels = function (ids, promise) {
	return promise.collection('select * from ' + this._definition.table + ' where id in (' + ids.join(',') + ')');
};

var ValidationHandler = function (model) {
	this._data = {};

	for (var key in model._updated_fields) {
		this._data[key] = model["_" + key];
	}

	this._definition = model._definition;
	this._invalid_fields = {};
};

ValidationHandler.prototype._data = null;
ValidationHandler.prototype._invalid_fields = null;

ValidationHandler.prototype._ready = function (err, field) {
	delete this._data[field];

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
	for (var key in this._data) {
		this.validateField(key);
	}
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

	if (typeof definition.length != "undefined") {
		length = definition.length;
	}

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

	if (definition.nullable && !valid) {
		message = null;
		valid = true;
		data = null;
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
