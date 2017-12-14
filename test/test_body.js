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

describe("Target with a modified body", function(){

	it("Should have the host body modified passed to the target", function(done){
		opts.bodyChange = function (body) {
			return new Promise(function(resolve, reject) {
				body.insert = true;
				resolve(body);
			});
    };
    var redbird = Redbird(opts);

    expect(redbird.routing).to.be.an("object");

    redbird.register('127.0.0.1', '127.0.0.1.xip.io:'+TEST_PORT, {
      useTargetHostHeader: true
    });

    expect(redbird.routing).to.have.property("127.0.0.1");

    testServer().then(function(req){
      expect(req.headers['host']).to.be.eql('127.0.0.1.xip.io:'+TEST_PORT)
      expect(req.body.insert).to.be.true;
    })

    http.get('http://127.0.0.1:'+PROXY_PORT, function(res) {
      redbird.close();
      done();
    });

	})
});


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
