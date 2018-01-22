/**
 * Letsecript module for Redbird (c) Optimalbits 2016
 *
 *
 *
 */
var letsencrypt = require('letsencrypt');

/**
 *  LetsEncrypt certificates are stored like the following:
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

  logger && logger.info('Initializing letsencrypt, path %s, port: %s', certPath, port);

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
  };

  const WELL_KNOWN_URI_FRAGMENT = '/.well-known/acme-challenge/';
  const WELL_KNOWN_PATH_FRAGMENT = path.normalize(WELL_KNOWN_URI_FRAGMENT);

  // There are 2 ways to make the challenge files accessible for the LetsEncrypt CA:
  //  (a) by adding a Redbird route, e.g.
  //      proxy.register('example.com/.well-known', 'http://127.0.0.1/3000/example.com/.well-known');
  /// (b) by enabling port-forwarding in the (hardware/software) router, e.g.
  //      WAN port 80 -> {redbird-IP}:3000
  http.createServer(function (req, res){
    var uri = url.parse(req.url).pathname;
    // split requested path into domain name and challenge-filename; (using split-limit 2 here suffices to to detect fishy urls)
    var domainAndFilename = uri.split(WELL_KNOWN_URI_FRAGMENT, 2);
    var isForbidden = (domainAndFilename.length !== 2);
    var responseFileName = !isForbidden && domainAndFilename[1];
    // when using port-forwarding instead of Redbird route,
    // domainAndFilename[0] will be '' while the HTTP `host` header contains the actual domain being validated
    var domainName = isForbidden ? null : (domainAndFilename[0] || String(req.headers.host).split(':', 1)[0]);
    var responseFilePath = responseFileName && domainName &&
                           path.join(certPath, domainName, WELL_KNOWN_PATH_FRAGMENT, responseFileName);

    isForbidden = isForbidden || !responseFilePath ||
                  responseFilePath.indexOf(certPath) !== 0 ||
                  responseFilePath.indexOf(WELL_KNOWN_PATH_FRAGMENT) < certPath.length;

    if (isForbidden) {
      logger && logger.info('Forbidden request on LetsEncrypt port %s: %s', port, uri);
      res.writeHead(403);
      res.end();
      return;
    }

    logger && logger.info('LetsEncrypt CA trying to validate challenge %s', responseFilePath);

    fs.stat(responseFilePath, function(err, stats) {
      if (err || !stats.isFile()) {
        res.writeHead(404, {"Content-Type": "text/plain"});
        res.write("404 Not Found\n");
        res.end();
        return;
      }

      res.writeHead(200);
      fs.createReadStream(responseFilePath, "binary").pipe(res);
    });

  }).listen(port);
}

/**
 *  Gets the certificates for the given domain.
 *  Handles all the LetsEncrypt protocol. Uses
 *  existing certificates if any, or negotiates a new one.
 *  Returns a promise that resolves to an object with the certificates.
 *  TODO: We should use something like https://github.com/PaquitoSoft/memored/blob/master/index.js
 *  to avoid
 */
function getCertificates(domain, email, production, renew, logger){
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
    server: production ?  LE.productionServerUrl : LE.stagingServerUrl,
    store: leStore,                                          // handles saving of config, accounts, and certificates
    challenges: { 'http-01': leChallenge },                  // handles /.well-known/acme-challege keys and tokens
    challengeType: 'http-01',                                // default to this challenge type
    debug: false,
    log: function (debug) {
      logger && logger.info(arguments, 'Lets encrypt debugger');
    }
  });

  // Check in-memory cache of certificates for the named domain
  return le.check({ domains: [domain] }).then(function (cert){
    var opts = {
      domains: [domain],
      email: email,
      agreeTos: true,
      rsaKeySize: 2048,                                       // 2048 or higher
      challengeType: 'http-01'
    }

    if (cert){
      if (renew){
        logger && logger.info('renewing cert for ' + domain);
        opts.duplicate = true;
        return le.renew(opts, cert).catch(function(err){
          logger && logger.error(err, 'Error renewing certificates for ', domain);
        });
      } else {
        logger && logger.info('Using cached cert for ' + domain);
        return cert;
      }
    } else {
      // Register Certificate manually
      logger && logger.info('Manually registering certificate for %s', domain);
      return le.register(opts).catch(function (err) {
        logger && logger.error(err, 'Error registering LetsEncrypt certificates');
      });
    }
  });
}

module.exports.init = init;
module.exports.getCertificates = getCertificates;
