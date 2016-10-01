'use strict';
var path = require('path');

var proxy = new require('../../index.js')({
  /*
  letsencrypt: {
    path: __dirname + '/certs',
    port: 9999
  },
  */
 // bunyan: true,
  port: 8080,
  secure: true,
  // http2: true,
  // cluster: 8
  ssl: { port: 4443 },
})

/*
proxy.register("caturra.exactbytes.com", "127.0.0.1:3000", {
  ssl: {
    key: path.join(__dirname, "certs/dev-key.pem"),
		cert: path.join(__dirname, "certs/dev-cert.pem"),
  }
});
*/
proxy.register("localhost", "127.0.0.1:3000", {
  ssl: {
    key: path.join(__dirname, "certs/dev-key.pem"),
		cert: path.join(__dirname, "certs/dev-cert.pem"),
  }
});


// proxy.register("localhost", "127.0.0.1:3000");

var http = require('http');
var keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 1000 });
// http.globalAgent = keepAliveAgent;

/*
var httpProxy = require('http-proxy');
httpProxy.createProxyServer({target:'http://localhost:3000', agent: keepAliveAgent}).listen(8090);
// httpProxy.createProxyServer({target:'http://localhost:3000'}).listen(8080);

// var reqFast = require('req-fast');
// var request = require('request');
var needle = require('needle');

http.createServer(function(req, res){
  // request.get('http://127.0.0.1:3000').pipe(res);
  // reqFast('http://127.0.0.1:3000').pipe(res);
  // needle.request('get', 'http://127.0.0.1:3000', null, {agent: keepAliveAgent, connection: 'keep-alive'}).pipe(res);
  http.get({
    hostname: 'localhost',
    port: 3000,
    path: '/',
    agent: keepAliveAgent
  }, function(upstreamRes) {
    upstreamRes.pipe(res);
  });
}).listen(8080);
*/

var size = 32;
console.log("SIZE:", size);
var randomstring = require("randomstring");
var msg = randomstring.generate(size);
http.createServer(function(req, res){
  res.writeHead(200);
  res.write(msg);
  res.end();
}).listen(3000);
