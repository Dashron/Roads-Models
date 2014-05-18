/*
* Roads.js Framework - model.js
* Copyright(c) 2012 Aaron Hedges <aaron@dashron.com>
* MIT Licensed
*/
"use strict";

var util_module = require('util');
var ValidationHandler = require('./validationhandler').ValidationHandler;
var ModelRequest = require('./modelrequest').ModelRequest;

function fix_data_type (definition, value) {
	if (definition.type == 'id' || definition.type == 'number') {
		value = Number(value);
	}

	// Standardize around null values instead of emptystring
	if (definition.nullable && typeof value === "undefined") {
		value = null;
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

	// creating new records will have no data
	if (data) {
		for (var key in this._definition.fields) {
			if (!this._definition.fields.hasOwnProperty(key)) {
				continue;
			}

			this['_' + key] = fix_data_type(this._definition.fields[key], data[key]);
		}
	}

	// we have to set this a second time to wipe out any updated field markers from setting the initial data
	this._updated_fields = {};
};

Model.prototype._definition = null;

/**
 * Associated model module
 * @type {[type]}
 */
Model.prototype._module = null;

/**
 * A list of all fields that have been changed since the model was created
 * @type {[type]}
 */
Model.prototype._updated_fields = null;

/**
 * default save handler
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
Model.prototype._onSave = function (request) {
	request._ready(this);
};

/**
 * default delete handler
 * 
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
Model.prototype._onDelete = function (request) {
	request._ready(null);
};

/**
 * [ description]
 * @return {[type]} [description]
 * @todo don't allow save to be called on a deleted object
 */
Model.prototype.save = function () {
	var _self = this;
	var request = new ModelRequest(this);

	var keys = Object.keys(this._updated_fields);
	var values = [];
	var i = 0;

	// check if we should actually perform any updates. keys is list of updated fields
	if (keys.length > 0 || typeof _self.id == "undefined") {
		// Validation is handled through the ValidationHandler. I'm no longer sure why, probably worth a refactor
		var validator = new ValidationHandler(this);
		validator.ready(function (invalid_fields) {
			if (invalid_fields) {
				if (request._validationError) {
					// if the values are invalid and the user assigned a validation handler, use that
					return request._validationError(invalid_fields);
				} else {
					// otherwise send the invalid fields through the error
					return request._error(invalid_fields);
				}
			}

			if (typeof _self.id === "undefined" || _self.id === null) {
				// perfom the insert
				_self._module.connection.insert(_self._definition.table, _self._updated_fields, function (error, result) {
					request.result = result;

					if (error) {
						return request._error(error);
					}

					// so I'm not totally happy with this, but there is a chance the db has defaults and decisions that our model system doesn't. 
					// So this is a safer bet than duplicating a bunch of logic into the model system (which is likely not consistent between db versions or systems)
					// todo: investigate optimization techniques or alternatives. Luckilly the intended use case is not very save heavy
					_self._module._loadModel(result.insertId, 'id')
						.error(request._error)
						.ready(function (model) {
							// update the model object to reflect the insert
							_self.id = model.id;
							var fields = model.dataObject();

							for (var key in fields) {
								_self['_' + key] = fields[key];
							}

							_self._updated_fields = [];
							_self._onSave(request);
						});
				});
			} else {
				// perform the update
				_self._module.connection.update(_self._definition.table, _self.id, _self._updated_fields, function (error, result) {
					request.result = result;
					
					if (error) {
						return request._error(error);
					}

					// update the model to reflect the update
					_self._updated_fields = [];
					_self._onSave(request);
				});
			}
		}).validateFields();

	} else {
		// no values have been updated so return immediately
		process.nextTick(function () {
			_self._onSave(request);
		});
	}

	return request;
};

/**
 *
 *
 * @todo  should this be marked as delete somehow? should parameters be cleared? or should ->delete(); ->save(); back to back work?
 */
Model.prototype['delete'] = function () {
	var delete_request = new ModelRequest(this);
	var _self = this;

	// go right to the db for the delete, since it's an easy query no preparation is necessary
	this._module.connection.delete(this._definition.table, this.id, function (error, result) {
		// include the result in the response for the delete event
		delete_request.result = result;

		if (error) {
			return delete_request._error(error);
		}

		// clear out the model so that it reflects the delete
		var old_id = _self.id;
		_self.id = null;
		_self._onDelete(delete_request, old_id);
	});

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
Model.prototype.dataObject = function (filter) {
	var data = {};

	for (var field in this._definition.fields) {
		if (field === 'definition') {
			throw new Error('Invalid model definition provided. "definition" is a reserved word');
		}
		if (filter) {
			data[field] = filter(this[field]);
		} else {
			data[field] = this[field];
		}
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
 *  	},
 *  	events : {
 *  		onSave : function (request) {
 *  		},
 *  		onDelete : function (request, old_id) {
 *  		}
 *  	}
 *  });
 *
 * user_module.do_stuff();
 *  
 */
var ModelModule = module.exports.ModelModule = function ModelModule () {
};

ModelModule.prototype.connection = null;
ModelModule.prototype._definition = null;

ModelModule.prototype._query = function (sql, params, callback) {
	this.connection.getConnection().query(sql, params, callback);
};

/**
 * Assign a model definition to this modelmodule
 *
 * @todo  explain how a model definition needs to be defined
 * @param  Object definition  
 * @param  String model_class optional, defaults to Model
 */
ModelModule.prototype.setModel = function (definition, model_class) {
	var model_module = this;
	this._definition = definition;
	
	if (!model_class) {
		model_class = Model;
	}

	// Create the model class
	var NewModel = function(data) {
		model_class.call(this, data);
	};
	util_module.inherits(NewModel, model_class);

	// Fill it with the model information
	NewModel.prototype._definition = definition;
	applyModelMethods(NewModel, definition);
	applyModelFields(NewModel, definition);
	
	if (definition.events) {
		if (definition.events.onSave) {
			NewModel.prototype._onSave = definition.events.onSave;
		}

		if (definition.events.onDelete) {
			NewModel.prototype._onDelete = definition.events.onDelete;
		}
	}

	NewModel.prototype._module = this;

	this.Model = NewModel;
};

/**
 * Load one or many models.
 * 
 * @param  Mixed value A primitive to find for a single model, or an array of primitives to find an array of models
 * @param  String field optional, default is 'id'
 * @return ModelRequest
 */
ModelModule.prototype.load = function (value, field) {
	var _self = this;

	if (typeof value === "undefined" || value === null) {
		throw new Error('You can not load a model with an undefined or null value');
	}

	if (typeof field !== "string") {
		field = "id";
	}

	if (Array.isArray(value)) {
		return this._loadArray(value);
	} else {
		return this._loadModel(value, field);
	}
};

/**
 * Load an array of every model of which the db value of the field 'field' is contained in the array parameter 'values'
 * 
 * @param  Array values An array of values which can help find a list of models
 * @param  String field  optional, defaults to 'id'
 * @return ModelRequest
 */
ModelModule.prototype._loadArray = function (ids) {
	return this.connection.selectByIds(this._definition.table, ids, this.collection.bind(this));
};

/**
 * Load a single model of which the db value of the field 'field' is equal to the parameter 'value'
 * 
 * @param  Mixed value A primitive value which can help uniquely find a model
 * @param  {[type]} field 
 * @return {[type]}       
 */
ModelModule.prototype._loadModel = function (value, field) {
	return this.connection.selectByField(this._definition.table, field, value, this.collection.bind(this))
	.addModifier(function (data) {
		if (data.length) {
			this._ready(data[0]);
		} else {
			this._ready(null);
		}
	});
};

/**
 * Returns an array of all the models found by the provided sql
 * @param  {String} sql   
 * @param  Array params list of parameters if the sql contains placeholders. You can leave this out. If an object is provided in place, it's assumed to be the options parameter
 * @param  Object options Sort and pagination options
 * @return {Array}        Array of models
 */
ModelModule.prototype.collection = function (sql, params, options) {
	var request = new ModelRequest(this);
	var _self = this;

	if (!Array.isArray(params)) {
		options = params;
		params = [];
	}

	// sql sort and pagination is easy, it gets applied right on the sql statement
	sql = this._apply_sort(sql, options);
	sql = this._apply_pagination(sql, options);

	// run the query
	this._query(sql, params, function (err, rows, columns) {
		if (err) {
			return request._error(err);
		}

		var models = new Array(rows.length);

		// build the models
		for (var i = 0; i < rows.length; i++) {
			models[i] = new _self.Model(rows[i]);
		}

		request._ready(models);
	});

	return request;
};

/**
 * the options should be
 *
 * options.sort.field
 * options.sort.direction
 *
 * sort can be a string. if used as such it looks for that key in the definition's sorts object. if found it uses that sort, otherwise it errors
 * direction is optional, default desc
 * 
 * @param  {[type]} sql     [description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
ModelModule.prototype._apply_sort = function (sql, options) {
	if (typeof options != "object" || typeof options.sort === "undefined" || options.sort === null) {
		return sql;
	}

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

	return sql + ' ORDER BY `' + options.sort.field + '` ' + options.sort.direction;
}

/**
 * the options should be
 *
 * options.pagination.page
 * options.pagination.per_page
 *
 * page is optional, default 1
 * per_page is optional, default 25
 * 
 * @param  {[type]} sql     [description]
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */
ModelModule.prototype._apply_pagination = function (sql, options) {
	if (typeof options != "object" || typeof options.pagination === "undefined" || options.pagination == null) {
		return sql;
	}

	if (!options.pagination.page) {
		options.pagination.page = 1;
	}

	if (!options.pagination.per_page) {
		options.pagination.per_page = 25;
	}

	var start = options.pagination.page * options.pagination.per_page;
	return sql + ' Limit ' + start + ',' + start + options.pagination.per_page;
}

/**
 * Used in setModel
 * 
 * @param  {[type]} model      [description]
 * @param  {[type]} definition [description]
 * @return {[type]}            [description]
 */
function applyModelMethods (model, definition) {
	for (var i in definition.methods) {
		if (i === 'definition') {
			throw new Error('Invalid model definition provided. "definition" is a reserved word');
		}

		model.prototype[i] = definition.methods[i];
	}
}

/**
 * Used in SetModel
 * 
 * @param {[type]} model            [description]
 * @param {[type]} key              [description]
 * @param {[type]} field_definition [description]
 */
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
			field_definition.set.call(this, value);
			this._updated_fields[key] = this['_' + key];
		};
	}			

	Object.defineProperty(model.prototype, key, property);
}

/**
 * Used in SetModel
 * 
 * @param  {[type]} model      [description]
 * @param  {[type]} definition [description]
 * @return {[type]}            [description]
 */
function applyModelFields (model, definition) {
	for (var field in definition.fields) {
		if (field === 'definition') {
			throw new Error('Invalid model definition provided. "definition" is a reserved word');
		}
		addProperty(model, field, definition.fields[field]);
	}
}
