/*
* Roads.js Framework - user.js
* Copyright(c) 2012 Aaron Hedges <aaron@dashron.com>
* MIT Licensed
*/
"use strict";
var ModelModule = require('../../index').Model;
var connections = require('../../index').Connection;

var crypto_module = require('crypto');

var UserModule = module.exports = new ModelModule();
UserModule.connection = connections.getConnection('mysql', 'default');
//UserModule.redis = connections.getConnection('redis', 'default');
UserModule.setModel({
	table : 'user',
	fields : {
		id : {
			type : 'id'
		},
		email : {
			type : 'email'
		},
		name : {
			type : 'string',
			length : 128
		},
		password : {
			type : 'string',
			length : 64,
			set : function (password) {
				this._password = crypto_module.createHash('sha256').update(password).digest('hex');
			}
		},
		role : {
			type : 'string',
			length : 32
		}
	},
	methods : {
		checkPassword : function checkPassword(password) {
			return this._password === crypto_module.createHash('sha256').update(password).digest('hex');
		}
	},
	sorts : {
		'alphabetical' : {
			field : 'name',
			direction : 'asc'
		}
	}
});

UserModule.getAll = function (sort) {
	return this.collection('select * from user', {
		sort : sort
	});
};