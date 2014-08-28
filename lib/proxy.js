"use strict";

var 
  http = require('http'),
  httpProxy = require('http-proxy'),
  validUrl = require('valid-url'),
  parse_url = require('url').parse,
  path = require('path'),
  _ = require('lodash'),
  bunyan = require('bunyan');

var log = bunyan.createLogger({
    name: 'redbird',
});

function ReverseProxy(opts){
  opts = opts || {};

  opts.port = opts.port || 8080;

  if(!(this instanceof ReverseProxy)){
    return new ReverseProxy(opts);
  }

  //
  // Routing table.
  //
  var routing = this.routing = {};

  //
  // Create a proxy server with custom application logic
  //
  var proxy = this.proxy = httpProxy.createProxyServer();

  // 
  // Standard HTTP Proxy Server.
  //
  var server = this.server = require('http').createServer(function(req, res) {
    var src = getSource(req);
    var target = getTarget(src, routing, req);
    if(target){
      //
      // Automatically redirect to the HTTPS proxy if there are
      // certificates for this hostname.
      //
      if(certs && src in certs){
        redirectToHttps(req, res, target, opts.ssl);
      }else{
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
    log.error(err, "Server Error");
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
      var target = getTarget(src, routing, req);
      if(target){
        proxy.web(req, res, {target: target});
      }else {
        notFound(res);
      }
    });

    httpsServer.on('upgrade', websocketsUpgrade);

    httpsServer.on('error', function(err){
      log.error(err, "HTTPS Server Error");
    });

    httpsServer.listen(opts.ssl.port);
  }

  function websocketsUpgrade(req, socket, head){
    var src = getSource(req);
    var target = getTarget(src, routing, req);
    log.info({headers: req.headers, target: target}, "upgrade to websockets");
    if(target){
      proxy.ws(req, socket, head, {target: target});
    }else{
      notFound(socket);
    }
  }

  proxy.on('error', function(err){
    log.error(err, "Proxy Error");
  })

  server.listen(opts.port);

  log.info(opts.port, "Started a Redbird reverse proxy server");
}

/**
  Register a new route.
  
  @src {String|URL} A string or a url parsed by node url module.
  Note that port is ignored, since the proxy just listens to one port.

  @target {String|URL} A string or a url parsed by node url module.
  @opts {Object} Route options.
*/
ReverseProxy.prototype.register = function(src, target, opts){
  if(!src || !target){
    throw Error("Cannot register a new route with unspecified src or target");
  }

  var routing = this.routing;

  src = prepareUrl(src);
  target = prepareUrl(target);

  if(opts && opts.ssl){
    if(!this.httpsServer){
      throw Error("Cannot register https routes without defining a ssl port");
    }

    if(_.isObject(opts.ssl)){
      var cert = createCredentialContext(opts.ssl.key, opts.ssl.cert, opts.ssl.ca);
      this.certs[src.hostname] = cert;
    }else{
      // Trigger the use of the default certificates.
      this.certs[src.hostname] = undefined; 
    }
  }
  
  var host = routing[src.hostname] = routing[src.hostname] || {};
  host[src.pathname || '/'] = target;

  log.info({from: src, to: target}, "Registered a new route");
}

ReverseProxy.prototype.unregister = function(src){
  if(!src) return;

  var routing = this.routing;

  src = prepareUrl(src);
  

  var host = routing[src.hostname];

  delete host[src.pathname || '/'];
  if(_.keys(host).length == 0){
    delete routing[src.hostname];
  }
}

ReverseProxy.prototype.close = function(){
  this.server.close();
  this.httpsServer && this.httpsServer.close();
  this.proxy.close();
}

//
// Helpers
//
function getSource(req){
  if(req.headers.host){
    return req.headers.host.split(':')[0]
  }
}

//
// TODO: add round-robin to this function.
//
function getTarget(src, routing, req){
    if(!src) return;

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
     log.warn(src, 'no valid target found for given source') 
    }
}

function notFound(res){
  res.write("Not Found");
  res.statusCode = 404;
  res.end();
}

//
// Redirect to the HTTPS proxy
//
function redirectToHttps(req, res, target, ssl){
  var hostname = req.headers.host.split(':')[0] + ':' + (ssl.redirectPort || ssl.port);
  var url = 'https://'+path.join(hostname, req.url);
  log.info("Redirecting %s to %s", path.join(req.headers.host, req.url), url);
  //
  // We can use 301 for permanent redirect, but its bad for debugging, we may have it as 
  // a configurable option.
  //
  res.writeHead(302, {Location: url});
  res.end();
}

function startsWith(input, str){
  return input.indexOf(str) === 0
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

  // Support input as Buffer, Stream or Pathname.
  if(pathname && fs.existsSync(pathname)){
    return fs.readFileSync(pathname, 'utf8')
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

