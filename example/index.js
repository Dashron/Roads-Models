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
	var UserModel = require('./models/user');

	UserModel.load(1).ready(function (user) {
		console.log(user);
	}).error(function (err) {
		throw err;
	});

});