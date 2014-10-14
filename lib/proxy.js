"use strict";

var 
  http = require('http'),
  httpProxy = require('http-proxy'),
  validUrl = require('valid-url'),
  parse_url = require('url').parse,
  path = require('path'),
  _ = require('lodash'),
  bunyan = require('bunyan');

function ReverseProxy(opts){
  if(!(this instanceof ReverseProxy)){
    return new ReverseProxy(opts);
  }

  opts = opts || {};
  opts.port = opts.port || 8080;

  var log;
  if(opts.bunyan != false){
    log = this.log = bunyan.createLogger(opts.bunyan || {
      name: 'redbird'
    });
  }

  var _this = this;

  //
  // Routing table.
  //
  var routing = this.routing = {};

  //
  // Create a proxy server with custom application logic
  //
  var proxy = this.proxy = httpProxy.createProxyServer({
    xfwd: true,
    prependPath: false
  });
  
  proxy.on('proxyReq', function(p, req, res, options) {
    if (req.host != null) {
      p.setHeader('host', req.host);
    }
  });

  // 
  // Standard HTTP Proxy Server.
  //
  var server = this.server = require('http').createServer(function(req, res) {
    var src = getSource(req);
    var target = _this._getTarget(src, req);
    if(target){
      //
      // Automatically redirect to the HTTPS proxy if there are
      // certificates for this hostname.
      // 
      if(certs && src in certs && target.sslRedirect){
        req.url = req._url || req.url; // Get the original url since we are going to redirect.
        redirectToHttps(req, res, target, opts.ssl, log);
      }else if (typeof(target) == 'function') {
        target(req, res, proxy);
      }
      else {
        proxy.web(req, res, {target: target});
      }
    }else {
      notFound(res);
    }
  });

  //
  // Listen to the `upgrade` event and proxy the 
  // WebSocket requests as well.
  //
  server.on('upgrade', websocketsUpgrade);

  server.on('error', function(err){
    log && log.error(err, "Server Error");
  })

  // 
  // Optionally create an https proxy server.
  // 
  if(opts.ssl){
    var https = require('https');
    var certs = this.certs = {};

    var ssl = {
      SNICallback: function(hostname){
        return certs[hostname];
      },
      //secureProtocol: 'SSLv3_method',
      //
      // Default certs for clients that do not support SNI.
      // 
      key: getCertData(opts.ssl.key), 
      cert: getCertData(opts.ssl.cert)
    }

    if(opts.ssl.ca){
      ssl.ca = [getCertData(opts.ssl.ca)]
    }

    var httpsServer = this.httpsServer = https.createServer(ssl, function(req, res){
      var src = getSource(req);
      var target = _this._getTarget(src, req);
      if(target){
        if (typeof(target) == 'function') {
          target(req, res, proxy);
        }
        else {
          proxy.web(req, res, {target: target});
        }
      }else {
        notFound(res);
      }
    });

    httpsServer.on('upgrade', websocketsUpgrade);

    httpsServer.on('error', function(err){
      log && log.error(err, "HTTPS Server Error");
    });

    httpsServer.listen(opts.ssl.port);
  }

  function websocketsUpgrade(req, socket, head){
    var src = getSource(req);
    var target = _this._getTarget(src, req);
    log && log.info({headers: req.headers, target: target}, "upgrade to websockets");
    if(target){
      if (typeof(target) == 'function') {
        target(req, socket, head, proxy);
      }
      else {
        proxy.ws(req, socket, head, {target: target});
      }
    }else{
      notFound(socket);
    }
  }

  proxy.on('error', function(err){
    log && log.error(err, "Proxy Error");
  })

  server.listen(opts.port);

  log && log.info(opts.port, "Started a Redbird reverse proxy server");
}

/**
  Register a new route.
  
  @src {String|URL} A string or a url parsed by node url module.
  Note that port is ignored, since the proxy just listens to one port.

  @target {String|URL|Function} A string, function or url parsed by node url module.
  @opts {Object} Route options.
*/
ReverseProxy.prototype.register = function(src, target, opts){
  if(!src || !target){
    throw Error("Cannot register a new route with unspecified src or target");
  }

  var routing = this.routing;

  src = prepareUrl(src);
  target = prepareUrl(target);
  
  target.sslRedirect = true;

  if(opts){
    if(opts.ssl){
      if(!this.httpsServer){
        throw Error("Cannot register https routes without defining a ssl port");
      }

      target.sslRedirect = opts.ssl.redirect === false ? false : true;  

      if(_.isObject(opts.ssl)){
        var cert = createCredentialContext(opts.ssl.key, opts.ssl.cert, opts.ssl.ca);
        this.certs[src.hostname] = cert;
      }else{
        // Trigger the use of the default certificates.
        this.certs[src.hostname] = undefined; 
      }
    }
  }
  
  var host = routing[src.hostname] = routing[src.hostname] || [];
  var pathname = src.pathname || '/';
  var route = _.find(host, {path: pathname});

  if(!route){
    route = {path: pathname, rr: 0, urls: []};
    host.push(route);

    //
    // Sort routes
    //
    routing[src.hostname] = _.sortBy(host, function(route){
      return -route.path.length;
    });
  }

  route.urls.push(target);
  
  this.log && this.log.info({from: src, to: target}, "Registered a new route");
}

ReverseProxy.prototype.unregister = function(src, target){
  if(!src) return;

  src = prepareUrl(src);
  var routes = this.routing[src.hostname];
  var pathname = src.pathname || '/';
  var i;

  for(i=0; i<routes.length; i++){
    if(routes[i].path == pathname){
      break;
    }
  }

  if(i < routes.length){
    var route = routes[i];

    if(target){
      target = prepareUrl(target);  
      _.remove(route.urls, function(url){
        return url.href == target.href || url === target;
      });
    }else{
      route.urls = []
    }
    
    if(route.urls.length == 0){
      routes.splice(i, 1);  
    }
   
    this.log && this.log.info({from: src, to: target}, "Unregistered a route"); 
  }
}

ReverseProxy.prototype.resolve = function(host, url){
  // Given a src resolve it to a target route if any available.
  if(!host) return;

  url = url || '/';

  var routes = this.routing[host];
  var i = 0, path;
    
  if(routes){
    var len = routes.length;
    
    //
    // Find path that matches the start of req.url
    //
    for(i=0; i<len; i++){
      var route = routes[i];          
      if(startsWith(url, route.path)){
        return route;
      }
    }
  }
}

ReverseProxy.prototype._getTarget = function(src, req){
  var url = req.url;
  var route = this.resolve(src, url);

  if(!route) {
    this.log && this.log.warn(src, 'no valid route found for given source')
    return;
  }

  var pathname = route.path;
  if(pathname.length > 1){
    //
    // remove prefix from src
    //
    req._url = url; // save original url
    req.url = url.substr(pathname.length) || '/'
  }

  //
  // Perform Round Robin on the available targets
  //
  var urls = route.urls;
  var j = route.rr;
  route.rr = (j + 1) % urls.length; // get and update Round robin index.
  var target = route.urls[j];
  
  //
  // Fix request url if targetname specified.
  //
  if(target.pathname){
    req.url = path.join(target.pathname, req.url);
  }
  
  
  // pass the target host to the proxy so we can provide a host header
  req.host = target.host;

  this.log && this.log.info("Proxying %s to %s", src + url, target.host + req.url)

  return target;
}

ReverseProxy.prototype.close = function(){
  try{
    this.server.close();
    this.httpsServer && this.httpsServer.close();  
  }catch(err){
    // Ignore for now...
  }
}

//
// Helpers
//
function getSource(req){
  if(req.headers.host){
    return req.headers.host.split(':')[0]
  }
}

/**
  Routing table structure. An object with hostname as key, and an array as value.
  The array has one element per path associated to the given hostname.
  Every path has a RoundRobin value (rr) and urls array, with all the urls available
  for this target route. 

  {
    hostA :
      [
        {
          path: '/',
          rr: 3,
          urls: []
        }
      ]
  }
*/

function notFound(res){
  res.write("Not Found");
  res.statusCode = 404;
  res.end();
}

//
// Redirect to the HTTPS proxy
//
function redirectToHttps(req, res, target, ssl, log){
  var hostname = req.headers.host.split(':')[0] + ':' + (ssl.redirectPort || ssl.port);
  var url = 'https://'+path.join(hostname, req.url);
  log && log.info("Redirecting %s to %s", path.join(req.headers.host, req.url), url);
  //
  // We can use 301 for permanent redirect, but its bad for debugging, we may have it as 
  // a configurable option.
  //
  res.writeHead(302, {Location: url});
  res.end();
}

function startsWith(input, str){
  return input.slice(0, str.length) == str;
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

function getCertData(pathname){
  var fs = require('fs');

  // TODO: Support input as Buffer, Stream or Pathname.

  if(pathname){
    if(_.isArray(pathname)){
      return _.map(pathname, getCertData);
    }else if(fs.existsSync(pathname)){
      return fs.readFileSync(pathname, 'utf8')
    }
  }
}

function createCredentialContext(key, cert, ca) {
  var crypto = require('crypto');

  var details = {};

  details.key = getCertData(key);
  details.cert = getCertData(cert);
  details.ca = getCertData(ca);

  var credentials = crypto.createCredentials(details);

  return credentials.context;
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

