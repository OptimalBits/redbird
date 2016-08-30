/**
 * Letsecript module for Redbird (c) Optimalbits 2016
 *
 *
 *
 */
var letsencrypt = require('letsencrypt');

/**
 *  Letsencript certificates are stored like the following:
 *
 *  /example.com
 *    /
 *
 *
 *
 */
var leStoreConfig = {};
var webrootPath = ':configDir/:hostname/.well-known/acme-challenge';

function init(certPath, port, logger){
  var http = require('http');
  var path = require('path');
  var url = require('url');
  var fs = require('fs');

  logger && logger.info('Initializing letsscript, path %s, port: %s', certPath, port);

  leStoreConfig = {
    configDir: certPath,
    privkeyPath: ':configDir/:hostname/privkey.pem',
    fullchainPath: ':configDir/:hostname/fullchain.pem',
    certPath: ':configDir/:hostname/cert.pem',
    chainPath: ':configDir/:hostname/chain.pem',

    workDir: ':configDir/letsencrypt/var/lib',
    logsDir: ':configDir/letsencrypt/var/log',

    webrootPath: webrootPath,
    debug: false
  }

  // we need to proxy for example: 'example.com/.well-known/acme-challenge' -> 'localhost:port/example.com/'
  http.createServer(function (req, res){
    var uri = url.parse(req.url).pathname;
    var filename = path.join(certPath, uri);

    logger && logger.info('LetsEncrypt CA trying to validate challenge %s', filename);

    fs.exists(filename, function(exists) {
      if (!exists){
        res.writeHead(404, {"Content-Type": "text/plain"});
        res.write("404 Not Found\n");
        res.end();
        return;
      }

      res.writeHead(200);
      fs.createReadStream(filename, "binary").pipe(res);
    });
  }).listen(port);
}

/**
 *  Gets the certificates for the given domain.
 *  Handles all the letsencrypt protocol. Uses
 *  existing certificates if any, or negotiates a new one.
 *  Returns a promise that resolves to an object with the paths to
 *  the certificates:
 *
 * {
		  key: "../certs/example.key",
		  cert: "../certs/example.crt",
		  ca: "../certs/example.ca"
	  }
 * }
 */
function getCertificates(domain, email, logger){
  var LE = require('letsencrypt');
  var le;

  // Storage Backend
  var leStore = require('le-store-certbot').create(leStoreConfig);

  // ACME Challenge Handlers
  var leChallenge = require('le-challenge-fs').create({
    webrootPath: webrootPath,
    debug: false
  });

  le = LE.create({
    server: LE.stagingServerUrl,                             // or LE.productionServerUrl
    store: leStore,                                          // handles saving of config, accounts, and certificates
    challenges: { 'http-01': leChallenge },                  // handles /.well-known/acme-challege keys and tokens
    challengeType: 'http-01',                                // default to this challenge type
    debug: false,
    log: function (debug) {
      console.log.apply(console, arguments);
    }
  });

  // If using express you should use the middleware
  // app.use('/', le.middleware());
  //
  // Otherwise you should see the test file for usage of this:
  // le.challenges['http-01'].get(opts.domain, key, val, done)

  // Check in-memory cache of certificates for the named domain
  return le.check({ domains: [domain] }).then(function (results) {
    if (results) {
      return results;
    }

    // Register Certificate manually
    return le.register({
      domains: [domain],
      email: email,
      agreeTos: true,
      rsaKeySize: 2048,                                       // 2048 or higher
      challengeType: 'http-01'                                // http-01, tls-sni-01, or dns-01
    }).catch(function (err) {
      // Note: you must either use le.middleware() with express,
      // manually use le.challenges['http-01'].get(opts, domain, key, val, done)
      // or have a webserver running and responding
      // to /.well-known/acme-challenge at `webrootPath`
      logger.error(err, 'Error registering letsencrypt certificates');
    });
  });
}

module.exports.init = init;
module.exports.getCertificates = getCertificates;
