Roads-Models
============

A Node.js model system for mysql and redis

The documentation is a work in progress as I continue to add features and test this in production environments. Check out the example for more information.

Your first step is to create the ModelModule. Base this off the example. Each module will have a handful of properties.

load 
This function takes two parameters, the first is a value to load a single record off of. the second is the field to search in. the second parameter defaults to id.

Model
This is the constuctor for an individual model.

collection
this function takes sql, and parameters, and returns a ModelPromise
ModelPromise.ready will be sent an array of models


Each model will have a handful of functions too.

save
This function returns a ModelPromise. When called it saves a model to the db, and assigns the ID to the model.

delete
This function returns a ModelPromise. When called it will delete the record from the db



ModelPromises work in two ways:
In any of the ways, you want to use the ready function to assign an on ready handler (passed one or many models), and the error function to assign an on error handler (passed one error object)

When saving a model, you will also have a validationError function, which will be called if validation fails on any of the model fields. The first parameter is an object representing the invalid fields.

When loading a collection, you will have a preload function. This takes a single parameter, the field name which should be "preloaded".
Preloading allows you to perform mysql joins in node instead of mysql (and works better with caching).
