"use strict";

var Redbird = require('../');
var Promise = require('bluebird');
var http = require('http');
var expect = require('chai').expect;

var TEST_PORT = 54673
var PROXY_PORT = 53432

var opts = {
  port: PROXY_PORT,
	bunyan: false /* {
		name: 'test',
		streams: [{
        	path: '/dev/null',
    	}]
	} */
}

describe("Target with pathnames", function(){

	it("Should be proxyed to target with pathname and source pathname concatenated", function(done){
		var redbird = Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('127.0.0.1', '127.0.0.1:'+TEST_PORT+'/foo/bar/qux');

		expect(redbird.routing).to.have.property("127.0.0.1");

    testServer().then(function(req){
      expect(req.url).to.be.eql('/foo/bar/qux/a/b/c')
    })

    http.get('http://127.0.0.1:'+PROXY_PORT+'/a/b/c', function(res) {
      redbird.close();
      done();
    });
    
	})

	it("Should be proxyed to target with pathname and source pathname concatenated case 2", function(done){
		var redbird = new Redbird(opts);

		expect(redbird.routing).to.be.an("object");

		redbird.register('127.0.0.1/path', '127.0.0.1:'+TEST_PORT+'/foo/bar/qux');

		expect(redbird.routing).to.have.property("127.0.0.1");

    testServer().then(function(req){
      expect(req.url).to.be.eql('/foo/bar/qux/a/b/c')
    })

    http.get('http://127.0.0.1:'+PROXY_PORT+'/path/a/b/c', function(err, res) {
      redbird.close();
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
