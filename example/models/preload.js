/*
* Roads.js Framework - user.js
* Copyright(c) 2012 Aaron Hedges <aaron@dashron.com>
* MIT Licensed
*/
"use strict";
var ModelModule = require('../../index').Model;
var connections = require('../../index').Connection;

var UserModel = require('./user');

var PreloadModule = module.exports = new ModelModule();
PreloadModule.connection = connections.getConnection('mysql', 'default');
PreloadModule.setModel({
	table : 'preload',
	fields : {
		id : {
			type : 'id'
		},
		user_id : {
			type : 'id',
			assign_to : 'user',
			model_module : UserModel
		}
	}
});

PreloadModule.getAll = function (sort) {
	return this.collection('select * from preload', {
		sort : sort
	});
};