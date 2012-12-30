"use strict";

var connection = require('../index').Connection;

connection.connect({
	"mysql" : {
		"default" : {
			"host": "localhost",
			"user" : "test",
			"database" : "test"
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
	require('./models/user').load(1).ready(function (user) {
		console.log('individual load:');
		console.log(user);
	}).error(function (err) {
		throw err;
	});

	require('./models/preload').getAll().preload('user_id').ready(function (preloads) {
		console.log('preloads:');
		console.log(preloads);
	}).error(function (err) {
		throw err;
	});

});