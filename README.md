NOTE
=====

This library is not currently under active development. In the future (likely months away from this commit) this will become a redis caching layer that can float on top of any DB layer. Personally I have moved to sequelize for my ORM, and that will be the first library that this supports!

Roads-Models
============

A Node.js model system for mysql and redis

The documentation is a work in progress as I continue to add features and test this in production environments. Check out the example for more information.

Your first step is to create the ModelModule. Base this off the example. Each module will have a handful of properties.

## Module

### load 
This function takes two parameters, the first is a value to load a single record off of. the second is the field to search in. the second parameter defaults to id.

### Model
This is the constuctor for an individual model. To create new records, do new ModelModule.Model();

### collection
this function takes sql, and parameters, and returns a ModelPromise
ModelPromise.ready will be sent an array of models


## Model

### save
This function returns a ModelPromise. When called it saves a model to the db, and if new assigns the ID to the model.

### delete
This function returns a ModelPromise. When called it will delete the record from the db


## ModelPromise
ModelPromises work in two ways:
In any of the ways, you want to use the ready function to assign an on ready handler (passed one or many models), and the error function to assign an on error handler (passed one error object)

###Saving
When saving a model, you will also have a validationError function, which will be called if validation fails on any of the model fields. The first parameter is an object representing the invalid fields.

###Loading
When loading a collection, you will have a preload function. Preloading allows you to perform mysql joins in node instead of mysql (and works better with caching).

The preload method takes a single parameter, the field name which should be preloaded. This field in the model definition should define which model to load, and what key to assign the model to.



## ConnectionType

To create new ConnectionTypes, you must follow these steps

1. Extend the require('Roads-Models').Connection.ConnectionType object.
2. Create the connection in the constructor. The constructor takes your config object, and assigns the connection to `this.connection`
3. In the case of an error, you should call this._ready(err);
4. On success you should call this._ready(null, this.connection);
5. You must also implement the `disconnect` method, so all connections can be closed when necessary

## Examples:

Create the database using the following:

	create database roadsmodelstest;
	create user roadsmodelstest identified by 'roads';
	grant all on roadsmodelstest.* to roadsmodelstest;
	use roadsmodelstest;

	CREATE TABLE `user` (
	  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
	  `email` varchar(128) NOT NULL,
	  `password` varchar(64) NOT NULL,
	  `name` varchar(128) NOT NULL,
	  `role` varchar(32) NOT NULL DEFAULT 'user',
	  PRIMARY KEY (`id`)
	);

	CREATE TABLE `preload` (
	  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
	  `user_id` int(10) unsigned NOT NULL,
	  PRIMARY KEY (`id`)
	);

	insert into user (email, password, name, role) values ('aaron@dashron.com', '1234', 'aaron', 'user');
	insert into user (email, password, name, role) values ('zena@dashron.com', '1234', 'zena', 'user');

	insert into preload (user_id) values ((select id from user where name = 'aaron'));
	insert into preload (user_id) values ((select id from user where name = 'zena'));
	insert into preload (user_id) values ((select id from user where name = 'aaron'));
	insert into preload (user_id) values ((select id from user where name = 'zena'));
	insert into preload (user_id) values ((select id from user where name = 'zena'));
	insert into preload (user_id) values ((select id from user where name = 'aaron'));

Now from within the project directory, run ```node example/index.js```


#TODO

Connection pools
