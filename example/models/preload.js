/*
* Roads.js Framework - user.js
* Copyright(c) 2012 Aaron Hedges <aaron@dashron.com>
* MIT Licensed
*/
"use strict";
var CachedModelModule = require('../../index').CachedModel;
var connections = require('../../index').Connection;

var UserModel = require('./user');

var PreloadModule = module.exports = new CachedModelModule();
PreloadModule.connection = connections.getConnection('mysql', 'default');
PreloadModule.redis = connections.getConnection('redis', 'default');
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

PreloadModule.getAll = function () {
	return this.cachedCollection('select id from preload', 'all');
};