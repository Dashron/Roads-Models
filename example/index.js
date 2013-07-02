"use strict";

var connection = require('../index').Connection;

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
}).error(function (err) {
	throw err;

}).ready(function () {
	var status = {};

	require('./models/user').load(1).ready(function (user) {
		console.log('individual load:');
		console.log(user);
		status.user = true;

		if (status.preload) {
			end();
		}
	}).error(function (err) {
		throw err;
	});

	require('./models/preload').getAll().preload('user_id').ready(function (preloads) {
		console.log('preloads:');
		console.log(preloads);
		status.preload = true;

		if (status.user) {
			end();
		}
	}).error(function (err) {
		throw err;
	});

	function end()
	{
		connection.disconnect();
	}
});