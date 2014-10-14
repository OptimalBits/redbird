"use strict";

var Redbird = require('../');
var Promise = require('bluebird');
var http = require('http');
var expect = require('chai').expect;

var TEST_PORT = 54674
var PROXY_PORT = 53433

var opts = {
  port: PROXY_PORT,
	bunyan: false
}

describe("Target with a hostname", function(){

	it("Should have the host header passed to the target", function(done){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('127.0.0.1', '127.0.0.1.xip.io:'+TEST_PORT);

		expect(redbird.routing).to.have.property("127.0.0.1");

    testServer().then(function(req){
      expect(req.headers['host']).to.be.eql('127.0.0.1.xip.io:'+TEST_PORT)
    })

    http.get('http://127.0.0.1:'+PROXY_PORT, function(res) {
      redbird.close();
      done();
    });
    
	})
	
	it("should resolve a custom route", function(done){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		var testFunc = function(req, res, proxy) {
			proxy.web(req, res, {target: 'http://127.0.0.1:'+TEST_PORT});
		};
		redbird.register('127.0.0.1', testFunc);

		expect(redbird.routing).to.have.property("127.0.0.1");

		var passed = false;
    testServer().then(function(req){
      passed = true;
    });

    http.get('http://127.0.0.1:'+PROXY_PORT, function(res) {
      redbird.close();
      expect(passed).to.be.eql(true);
      done();
    });
	})
})


function testServer(){
	return new Promise(function(resolve, reject){
		var server = http.createServer(function(req, res){
      res.write("");
      res.end();
			resolve(req);
      server.close();
		});
		server.listen(TEST_PORT);
	})
}
