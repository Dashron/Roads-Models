"use strict";

var connection = require('../index').Connection;

function error_handler (err) {
	throw err;
}

function end(connection) {
	connection.disconnect();
}

connection.connect({
	"mysql" : {
		"default" : {
			"host": "localhost",
			"user" : "roadsmodelstest",
			"password" : 'roads',
			"database" : "roadsmodelstest"
		}
	}
}).error(error_handler)
.ready(function () {
	var status = {
		user_id : false,
		user_email : false,
		user_all : false,
		preload_single : false,
		preload_all : false,
		custom_sort : false,
		predefined_sort : false
	};

	var user_model = require('./models/user');
	var preload_model = require('./models/preload');

	function is_complete (key) {
		status[key] = true;
		
		for (var key in status) {
			if (status[key] === false) {
				return false;
			}
		}

		return true;
	}

	// load a single model from it's id
	user_model.load(1)
		.ready(function (user) {
			console.log('individual load, id:');
			console.log(user);

			if (is_complete('user_id')) {
				return end(connection);
			}
		}).error(error_handler);//*/

	// load a single model with a non-id field
	user_model.load('aaron@dashron.com', 'email')
		.ready(function (user) {
			console.log('individual load, non-id:');
			console.log(user);

			if (is_complete('user_email')) {
				return end(connection);
			}
		}).error(error_handler);//*/

	// load a single model and preload it with the appropriate user object
	preload_model.load(1)
		.preload('user_id')
		.ready(function (preload) {
			console.log('single preload:');
			console.log(preload);

			if (is_complete('preload_single')) {
				return end(connection);
			}
		})
		.error(error_handler)//*/

	// load a collection
	user_model.getAll()
		.ready(function (users) {
			console.log('get all');
			console.log(users);

			if (is_complete('user_all')) {
				return end(connection);
			}
		})
		.error(error_handler);//*/

	// load a sorted collection
	user_model.getAll('alphabetical')
		.ready(function (users) {
			console.log('sorted users');
			console.log(users);


			if (is_complete('predefined_sort')) {
				return end(connection);
			}
		})
		.error(error_handler);//*/

	// load a custom sorted collection
	user_model.getAll({field : 'name', order : 'desc'})
		.ready(function (users) {
			console.log('reverse sorted users');
			console.log(users);


			if (is_complete('custom_sort')) {
				return end(connection);
			}
		})
		.error(error_handler);//*/	

	// load a collection and preload the models with the appropriate user objects
	preload_model.getAll()
		.preload('user_id')
		.ready(function (preloads) {
			console.log('preloads:');
			console.log(preloads);

			if (is_complete('preload_all')) {
				return end(connection);
			}
		}).error(error_handler);//*/
});
