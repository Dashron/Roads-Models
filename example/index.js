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
	},
	"redis" : {
		"default" : {
			"host" : "localhost",
			"port" : 6379
		}
	}
}).error(error_handler)
.ready(function () {
	var status = {
		preload : false,
		user : false,
		preload_single : false
	};

	function is_complete (key) {
		status[key] = true;
		
		for (var key in status) {
			if (status[key] === false) {
				return false;
			}
		}

		return true;
	}

	// demonstrate how easy it is to load a single resource
	require('./models/user').load(1).ready(function (user) {
		console.log('individual load:');
		console.log(user);

		if (is_complete('user')) {
			return end(connection);
		}
	}).error(error_handler);

	// demonstrate how easy it is to load a collectoin, and any additional model resources
	require('./models/preload').getAll().preload('user_id').ready(function (preloads) {
		console.log('preloads:');
		console.log(preloads);

		// demonstrate that you can preload even with a single model
		require('./models/preload')
			.load(preloads[0].id)
			.preload('user_id')
			.ready(function (preload) {
				console.log('single preload:');
				console.log(preload);

				if (is_complete('preload_single')) {
					return end(connection);
				}
			})
			.error(error_handler)

		if (is_complete('preload')) {
			return end(connection);
		}
	}).error(error_handler);
});