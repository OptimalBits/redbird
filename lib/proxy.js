"use strict";

var 
  http = require('http'),
  httpProxy = require('http-proxy'),
  validUrl = require('valid-url'),
  parse_url = require('url').parse,
  path = require('path'),
  _ = require('lodash'),
  redisBackend = require('./redis-backend'),
  bunyan = require('bunyan');

var log = bunyan.createLogger({
    name: 'redbird',
});

function ReverseProxy(backend, opts){
  backend = backend || redisBackend(); 
  // TODO: If no backend is specified just instantiate a static proxy.
  
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
    var target = getTarget(routing, req);
    log.info({headers: req.headers, target: target}, "upgrade to websockets");
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

/**
  Register a new route.
  
  @src {String|URL} A string a url parsed by node url module.
  Note that port is ignored, since the proxy just listens to one port.

  @target {String|URL} A string a url parsed by node url module.
*/
ReverseProxy.prototype.register = function(src, target){
  register(this.routing, src, target);
}

ReverseProxy.prototype.unregister = function(src, target){
  unregister(this.routing, src, target);
}

//
// TODO: add round-robin to this function.
//
function getTarget(routing, req){
  if(req.headers.host){
    var src = req.headers.host.split(':')[0]
    var host = routing[src];
    var target;
    
    if(host){
      var keys = _.keys(host);

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
          target = host[key];
        }
      }else{
        target = host[keys[0]];
      }

      if(target.pathname){
        req.url = path.join(target.pathname, req.url);
      }

      log.info("Proxing %s to %s", src, target.host + req.url)
      return target;
    }else{
     log.warn('no valid target found for request %s', src) 
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

  src = prepareUrl(src);
  target = prepareUrl(target);

  var host = routing[src.hostname] = routing[src.hostname] || {};
  host[src.pathname || '/'] = target;

  log.info({src: src, target: target}, "Registered a new route");
}

function prepareUrl(url){
  if(_.isString(url)){
    url = setHttp(url);

    if(!validUrl.isHttpUri(url)){
      throw Error('uri is not a valid http uri ' + url);
    }

    url = parse_url(url);
  }
  return url;
}

//
// TODO: Implement unregister.
//
function unregister(routing, src, target){
  if(!src) return;

  src = prepareUrl(src);
  target = target ? prepareUrl(target) : null;

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

