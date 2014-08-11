"use strict";

var redis = require('redis');
var Promise = require('bluebird');
var _ = require('lodash');

Promise.promisifyAll(redis);

/**
	Instantiates a Redis Redbird backend.

	opts: {
		prefix: '',
		port: 6739,
		host: 'localhost',
		opts: {}
	}
*/
function RedisBackend(port, hostname, opts)
{
	if(!(this instanceof RedisBackend)){
		return new RedisBackend(port, hostname, opts);
	}

	opts = opts || {};
	port = port || 6379;
	hostname = hostname || 'localhost';

	this.redis = redis.createClient(port, hostname, opts);
	this.publish = redis.createClient(port, hostname, opts);

	this.prefix = opts.prefix + '';

	this.baseKey = baseKey(this.prefix);
}

/**
	Returns a Promise that resolves to an array with all the 
	registered services and removes the expired ones.
*/
RedisBackend.prototype.getServices = function(){
	var _this = this;
	var redis = this.redis;
	var baseKey = this.baseKey;

	//
	// Get all members in the service set.
	//
	return redis.smembersAsync(baseKey + 'ids').then(function(serviceIds){
		return Promise.all(_.map(serviceIds, function(id){
			return _this.getService(id);
		}));
	}).then(function(services){
		// Clean expired services
		return _.compact(services);
	});
}

RedisBackend.prototype.getService = function(id){
	var redis = this.redis;
	//
	// Get service hash
	//
	return redis.hgetallAsync(this.baseKey + id).then(function(service){
		if(service){
			return service;
		}else{
			//
			// Service has expired, we must delete it from the service set.
			//
			return redis.sremAsync(id);
		}
	});
}

RedisBackend.prototype.register = function(service){
	var redis = this.redis;
	var publish = this.publish;
	var baseKey = this.baseKey;

	//
	// Get unique service ID.
	//
	return redis.incrAsync(baseKey + 'counter').then(function(id){
		// Store it
		redis.hset(baseKey + id, service).then(function(){
			return id;
		})
	}).then(function(id){
		//
		// // Publish a meesage so that the proxy can react faster to a new registration.
		//
		return publish.publishAsync(baseKey + 'registered', id).then(function(){
			return id;
		})
	});
}

RedisBackend.prototype.ping = function(id){
	return this.redis.pexpireAsync(id, 5000);
}

function baseKey(prefix){
	return 'redbird-' + prefix + '-services-';
}

module.exports = RedisBackend;


