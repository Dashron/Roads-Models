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

/**
 * 
 * @todo : improve this and rename it. don't use bind
 * @param  {[type]} request [description]
 * @return {[type]}         [description]
 */
ModelRequest.prototype.bindRequest = function (request) {
	this.error(request._error.bind(request));
	this.ready(request._ready.bind(request));
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
		var ids = null;
		var i = 0;
		var model_associations = {};
		var model_promise = null;
		
		
		if (data === null) {
			// If no item is found, return nothing (this code path is reached if you request a single item and it doesn't exist)
			return process.nextTick(function () {
				original_promise._ready(null);
			});
		} else if (!Array.isArray(data)) {
			// locate objects works with a single id, so this allows preload to work off of a single model (from load)
			if (typeof data === "object") {
				ids = data[field];
			} else {
				return this._error(new Error('Invalid data provided to the preload addModifier callback'));
			}
		} else {
			ids = new Array(data.length);
			// find all of the ids from the data array
			for (i = 0; i < data.length; i++) {
				ids[i] = data[i][field];
			}
		}

		model_module.load(ids)
			.ready(function (models) {
				if (!Array.isArray(models)) {
					// if we only get a single object, we assign the preload directly
					data[assign_to] = models;
				} else {
					// build a list of id => model to ensure a record exists
					for (i = 0; i < models.length; i++) {
						// there's a chance that the model id is referenced, but doesn't actually exist (data integrity issues)
						if (models[i]) {
							model_associations[models[i].id] = models[i];
						}
					}

					for (i = 0; i < data.length; i++) {
						if (typeof model_associations[data[i][field]] !== "undefined" && typeof model_associations[data[i][field]] !== null) {
							data[i][assign_to] = model_associations[data[i][field]];
						} else {
							data[i][assign_to] = null;
						}
					}
				}

				original_promise._ready(data);
			}).error(original_promise);
	});

	return this;
};
