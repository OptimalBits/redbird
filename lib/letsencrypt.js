/**
 * Letsecript module for Redbird (c) Optimalbits 2016
 *
 *
 *
 */

/**
 *  LetsEncrypt certificates are stored like the following:
 *
 *  /example.com
 *    /
 *
 *
 *
 */
let leStoreConfig = {};
let webrootPath = '';

function init(certPath, port, logger) {
  const http = require('http');
  const path = require('path');
  const url = require('url');
  const fs = require('fs');

  logger && logger.info('Initializing letsencrypt, path %s, port: %s', certPath, port);

  webrootPath = `${certPath}/{domain}/.well-known/acme-challenge`;

  // Storage Backend
  leStoreConfig = {
    basePath: certPath,
    module: require.resolve('greenlock-store-fs'),
    privkeyPath: ':basePath/:subject/privkey.pem',
    fullchainPath: ':basePath/:subject/fullchain.pem',
    certPath: ':basePath/:subject/cert.pem',
    chainPath: ':basePath/:subject/chain.pem',

    webrootPath,
  };

  // we need to proxy for example: 'example.com/.well-known/acme-challenge' -> 'localhost:port/example.com/'
  http
    .createServer((req, res) => {
      const uri = url.parse(req.url).pathname;
      const filename = path.join(certPath, uri);
      const isForbiddenPath = uri.length < 3 || filename.indexOf(certPath) !== 0;

      if (isForbiddenPath) {
        logger && logger.info('Forbidden request on LetsEncrypt port %s: %s', port, filename);
        res.writeHead(403);
        res.end();
        return;
      }

      logger && logger.info('LetsEncrypt CA trying to validate challenge %s', filename);

      fs.stat(filename, function (err, stats) {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.write('404 Not Found\n');
          res.end();
          return;
        }

        res.writeHead(200);
        fs.createReadStream(filename, 'binary').pipe(res);
      });
    })
    .listen(port);
}

/**
 *  Gets the certificates for the given domain.
 *  Handles all the LetsEncrypt protocol. Uses
 *  existing certificates if any, or negotiates a new one.
 *  Returns a promise that resolves to an object with the certificates.
 *  TODO: We should use something like https://github.com/PaquitoSoft/memored/blob/master/index.js
 *  to avoid
 */
function getCertificates(domain, email, production, renew, logger) {
  const path = require('path');
  const packageRoot = path.dirname(require.resolve('redbird'));
  const LE = require('greenlock');
  const pkg = require(packageRoot + '/package.json');

  if (renew) {
    logger.warn('renew parameter is depricated and is automatically detected.')
  }

  // ACME Challenge Handlers
  const leChallenge = {
    module: require.resolve('acme-http-01-webroot'),
    webroot: webrootPath,
    debug: !production
  }

  const le = LE.create({
    packageAgent: pkg.name + '/' + pkg.version,
    staging: !production,
    maintainerEmail: email,
    packageRoot,
    configDir: './greenlock.d',
    manager: '@greenlock/manager',
    notify: (event, details) => {
      if ('error' === event) {
        // `details` is an error object in this case
        logger.error(details);
      } else {
        // FOr possible events see https://git.rootprojects.org/root/acme.js#events
        logger.debug({event, details}, 'notify');
      }
    },
  });

  le.manager.defaults({
    agreeToTerms: true,
    subscriberEmail: email,
    challenges: {
      // handles /.well-known/acme-challege keys and tokens
      'http-01': leChallenge,
    },
    store: leStoreConfig, // handles saving of config, accounts, and certificates
  })

  try {
    le.add({
      subject: domain,
      altnames: [domain],
    }).then( (event) => {
      logger.debug(event, 'After add');
      return event;
    })
  } catch (error) {
    logger.error(error, 'Error registering LetsEncrypt certificates for ' + domain);
  }

  return le.get({ servername: domain }).then((site) => {
    if (!site) {
      logger.error(domain + ' was not found in any site config');
      return;
    }
    logger.debug(site, 'Get LetsEncrypt certificates for ' + domain)
    logger.info('Get LetsEncrypt certificates for ' + domain);
    // site.pems.fullchain = site.pems.cert + '\n' + site.pems.chain + '\n';
    return site;
  });
}

module.exports.init = init;
module.exports.getCertificates = getCertificates;
