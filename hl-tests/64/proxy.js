'use strict';


// If URL has/.well-known/, send request to upstream API service
var customResolver1 = function (host, url) {
  if (/^\/.well-known\//.test(url)) {
    return 'http://localhost:3000';
  }
};

// assign high priority
customResolver1.priority = 100;

var proxy = new require('../../index.js')({
  port: 8080,
  resolvers: [
    customResolver1
  ],
  secure: true,
  ssl: { port: 443 },
})

proxy.register("www", "http://www.planetex.press:3000", {/*
  ssl: {
    key: "/home/planetex/ssl.key",
    cert: "/home/planetex/ssl.cert",
  }
*/});
proxy.register("api", "http://api.planetex.press:3002", {/*
  ssl: {
    key: "/home/planetex/domains/api.planetex.press/ssl.key",
    cert: "/home/planetex/domains/api.planetex.press/ssl.cert",
  }
*/});
proxy.register("dash", "http://dash.planetex.press:3001", {/*
  ssl: {
    key: "/home/planetex/domains/dash.planetex.press/ssl.key",
    cert: "/home/planetex/domains/dash.planetex.press/ssl.cert",
  }
*/});

var http = require('http');

http.createServer(function(req, res){

  res.writeHead(200);
  res.write(req.url);
  res.end();

  console.log(req.host);

}).listen(3000);
