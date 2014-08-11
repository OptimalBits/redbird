"use strict";

var 
  http = require('http'),
  httpProxy = require('http-proxy'),
  validUrl = require('valid-url'),
  url = require('url'),
  _ = require('lodash'),
  redisBackend = require('./redis-backend'),
  bunyan = require('bunyan');

var log = bunyan.createLogger({
    name: 'redbird',
});

function ReverseProxy(backend, opts){
  backend = backend || redisBackend();
  opts = opts || {};

  opts.port = opts.port || 8080;

  if(!(this instanceof ReverseProxy)){
    return new ReverseProxy(backend, opts);
  }

  //
  // Create a proxy server with custom application logic
  //
  var proxy = httpProxy.createProxyServer();

  //
  // Routing table.
  //
  var routing = this.routing = {};

  var server = require('http').createServer(function(req, res) {
    var target = getTarget(routing, req);
    if(target){
      proxy.web(req, res, { target: target });
    }else {
      notFound(res);
    }
  });

  //
  // Listen to the `upgrade` event and proxy the 
  // WebSocket requests as well.
  //
  server.on('upgrade', function (req, socket, head) {
    var target = getTarget(req);
    log.info({socket: socket, head: head}, "upgrade to websockets");
    if(target){
      proxy.ws(req, socket, head, {target: target});
    }else{
      notFound(socket);
    }
  });

  server.on('error', function(err){
    log.info(err, "Server Error");
  })

  proxy.on('error', function(err){
    log.error(err, "Proxy Error");
  })

  server.listen(opts.port);

  log.info(opts.port, "Started a Redbird reverse proxy server");
}

ReverseProxy.prototype.register = function(src, target){
  register(this.routing, src, target);
}

ReverseProxy.prototype.unregister = function(src, target){
  unregister(this.routing, src, target);
}


//
// We could easily add round-robin to this function.
//
function getTarget(routing, req){
  if(req.headers.host){
    var src = req.headers.host.split(':')[0]
    var host = routing[src];
    
    if(host){
      log.info(host, "get target")
      var keys = _.keys(host);
      log.info(keys, "keys");

      if(keys.length > 1){
        //
        // We would like to optimize this so that we do
        // not have to sort per request.
        //
        keys = _.sortBy(keys, function(key){
          return -key.length;
        });

        var key = _.find(keys, function(key){
          // remove prefix
          return startsWith(req.url, key);
        });
        
        if(key){
          if(key.length > 1){
            req.url = req.url.substr(key.length);
            req.url = req.url || '/'
          }
          log.info(host[key] + req.url, "Proxing to")
          return host[key];
        }
        
      }else{
        return host[keys[0]];
      }
    }
  }
}

function notFound(res){
  res.write("Not Found");
  res.statusCode = 404;
  res.end();
}

function startsWith(input, str){
  return input.indexOf(str) === 0
}

function register(routing, src, target){
  if(!src || !target) return;

  if(validUrl.isUri(target)){
    var parsedUrl = url.parse(target);
    target = parsedUrl.hostname + ':' + parsedUrl.port;
  }

  target = setHttp(target);

  src = setHttp(src);
  src = url.parse(src);

  var host = routing[src.hostname] = routing[src.hostname] || {};
  host[src.pathname || '/'] = target;

  log.info({src: src, target: target}, "Registered a new route");
}

//
// TODO: Implement unregister.
//
function unregister(routing, src, target){

}

//
// https://stackoverflow.com/questions/18052919/javascript-regular-expression-to-add-protocol-to-url-string/18053700#18053700
// Adds http protocol if non specified.
function setHttp(link) {
  if (link.search(/^http[s]?\:\/\//) == -1) {
    link = 'http://' + link;
  }
  return link;
}


module.exports = ReverseProxy;
