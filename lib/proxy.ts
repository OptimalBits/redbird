/*eslint-env node */
'use strict';

// Built-in NodeJS modules.
import path from 'path';
import { URL, parse as parseUrl } from 'url';
import cluster from 'cluster';
import http, { Agent, ClientRequest, IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import tls from 'tls';

// Third party modules.
import validUrl from 'valid-url';
import httpProxy, { ServerOptions, ProxyTargetUrl } from 'http-proxy';
import lodash from 'lodash';
import { pino, Logger } from 'pino';
import hash from 'object-hash';
import safe from 'safe-timers';
import { LRUCache } from 'lru-cache';

// Custom modules.
import * as letsencrypt from './letsencrypt.js';
import { ProxyOptions, ResolverFn } from './interfaces/proxy-options.js';
import { Socket } from 'net';
import { ProxyRoute } from './interfaces/proxy-route.js';

const { isFunction, isObject, sortBy, uniq, remove, isString } = lodash;

const routeCache = new LRUCache({ max: 5000 });
const defaultLetsencryptPort = 3000;
const ONE_DAY = 60 * 60 * 24 * 1000;
const ONE_MONTH = ONE_DAY * 30;

export class Redbird {
  log?: Logger;
  routing: any;
  resolvers: ResolverFn[];
  certs: any;

  private _defaultResolver: any;
  private proxy: httpProxy;
  private agent: Agent;
  private server: any;

  private httpsServer: any;

  private letsencryptHost: string;

  get defaultResolver() {
    return this._defaultResolver;
  }

  constructor(private opts: ProxyOptions = {}) {
    if (this.opts.httpProxy == undefined) {
      this.opts.httpProxy = {};
    }

    if (opts.log) {
      this.log = pino(
        opts.log || {
          name: 'redbird',
        }
      );
    }

    this._defaultResolver = (host: string, url: string) => {
      // Given a src resolve it to a target route if any available.
      if (!host) {
        return;
      }

      url = url || '/';

      const routes = this.routing[host];
      let i = 0;

      if (routes) {
        const len = routes.length;

        //
        // Find path that matches the start of req.url
        //
        for (i = 0; i < len; i++) {
          const route = routes[i];

          if (route.path === '/' || startsWith(url, route.path)) {
            return route;
          }
        }
      }
    };

    this._defaultResolver.priority = 0;

    if ((opts.cluster && typeof opts.cluster !== 'number') || opts.cluster > 32) {
      throw Error('cluster setting must be an integer less than 32');
    }

    if (opts.cluster && cluster.isPrimary) {
      for (let i = 0; i < opts.cluster; i++) {
        cluster.fork();
      }

      cluster.on('exit', (worker, code, signal) => {
        // Fork if a worker dies.
        this.log?.error(
          {
            code: code,
            signal: signal,
          },
          'worker died un-expectedly... restarting it.'
        );
        cluster.fork();
      });
    } else {
      this.resolvers = [this._defaultResolver];

      opts.port = opts.port || 8080;

      if (opts.letsencrypt) {
        this.setupLetsencrypt(opts);
      }

      if (opts.resolvers) {
        this.addResolver(opts.resolvers);
      }

      const websocketsUpgrade = async (req: any, socket: Socket, head: Buffer) => {
        socket.on('error', (err) => {
          this.log?.error(err, 'WebSockets error');
        });
        const src = this.getSource(req);
        const target = await this.getTarget(src, req);

        this.log?.info({ headers: req.headers, target: target }, 'upgrade to websockets');

        if (target) {
          if (target.useTargetHostHeader === true) {
            req.headers.host = target.host;
          }
          proxy.ws(req, socket, head, { target });
        } else {
          respondNotFound(req, socket);
        }
      };

      //
      // Routing table.
      //
      this.routing = {};

      //
      // Create a proxy server with custom application logic
      //
      let agent;

      if (opts.keepAlive) {
        agent = this.agent = new Agent({
          keepAlive: true,
        });
      }

      const proxy = (this.proxy = httpProxy.createProxyServer({
        xfwd: opts.xfwd != false,
        prependPath: false,
        secure: opts.secure !== false,
        timeout: opts.timeout,
        proxyTimeout: opts.proxyTimeout,
        agent,
      }));

      proxy.on(
        'proxyReq',
        (
          proxyReq: ClientRequest,
          req: IncomingMessage,
          res: ServerResponse,
          options: ServerOptions
        ) => {
          // According to typescript this is the correct way to access the host header
          // const host = req.headers.host;
          const host = (<any>req)['host'] as string;
          if (host != null) {
            proxyReq.setHeader('host', host);
          }
        }
      );

      //
      // Support NTLM auth
      //
      if (opts.ntlm) {
        proxy.on(
          'proxyRes',
          (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) => {
            const key = 'www-authenticate';
            (<any>proxyRes).headers[key] =
              proxyRes.headers[key] && proxyRes.headers[key].split(',');
          }
        );
      }

      //
      // Optionally create an https proxy server.
      //
      if (opts.ssl) {
        if (Array.isArray(opts.ssl)) {
          opts.ssl.forEach((sslOpts) => {
            this.setupHttpsProxy(proxy, websocketsUpgrade, sslOpts);
          });
        } else {
          this.setupHttpsProxy(proxy, websocketsUpgrade, opts.ssl);
        }
      }

      //
      // Plain HTTP Proxy
      //
      const server = (this.server = this.setupHttpProxy(proxy, websocketsUpgrade, this.log, opts));
      server.listen(opts.port, opts.host);

      const handleProxyError = (
        err: NodeJS.ErrnoException,
        req: IncomingMessage,
        resOrSocket: ServerResponse | Socket,
        target?: ProxyTargetUrl
      ) => {
        const res = resOrSocket instanceof ServerResponse ? resOrSocket : null;

        //
        // Send a 500 http status if headers have been sent
        //
        if (err.code === 'ECONNREFUSED') {
          res.writeHead && res.writeHead(502);
        } else if (!res.headersSent) {
          res.writeHead && res.writeHead(500, err.message, { 'content-type': 'text/plain' });
        }

        //
        // Do not log this common error
        //
        if (err.message !== 'socket hang up') {
          this.log?.error(err, 'Proxy Error');
        }

        //
        // TODO: if err.code=ECONNREFUSED and there are more servers
        // for this route, try another one.
        //
        res.end(err.code);
      };

      if (opts.errorHandler && isFunction(opts.errorHandler)) {
        proxy.on('error', opts.errorHandler);
      } else {
        proxy.on('error', handleProxyError);
      }

      this.log?.info('Started a Redbird reverse proxy server on port %s', opts.port);
    }
  }

  setupHttpProxy(proxy: httpProxy, websocketsUpgrade: any, log: pino.Logger, opts: ProxyOptions) {
    const httpServerModule = opts.serverModule || http;
    const server = httpServerModule.createServer((req, res) => {
      const src = this.getSource(req);
      this.getTarget(src, req, res).then((target) => {
        if (target) {
          if (this.shouldRedirectToHttps(this.certs, src, target)) {
            redirectToHttps(req, res, opts.ssl, log);
          } else {
            proxy.web(req, res, {
              target: target,
              secure: !!opts.secure,
            });
          }
        } else {
          respondNotFound(req, res);
        }
      });
    });

    //
    // Listen to the `upgrade` event and proxy the
    // WebSocket requests as well.
    //
    server.on('upgrade', websocketsUpgrade);

    server.on('error', function (err) {
      log && log.error(err, 'Server Error');
    });

    return server;
  }

  setupLetsencrypt(opts: ProxyOptions) {
    if (!opts.letsencrypt.path) {
      throw Error('Missing certificate path for Lets Encrypt');
    }
    const letsencryptPort = opts.letsencrypt.port || defaultLetsencryptPort;
    letsencrypt.init(opts.letsencrypt.path, letsencryptPort, this.log);

    opts.resolvers = opts.resolvers || [];
    this.letsencryptHost = '127.0.0.1:' + letsencryptPort;
    const targetHost = 'http://' + this.letsencryptHost;
    const challengeResolver = (host: string, url: string) => {
      if (/^\/.well-known\/acme-challenge/.test(url)) {
        return targetHost + '/' + host;
      }
    };
    challengeResolver.priority = 9999;
    this.addResolver(challengeResolver);
  }

  setupHttpsProxy(proxy: httpProxy, websocketsUpgrade: any, sslOpts: any) {
    let https;
    this.certs = this.certs || {};
    const certs = this.certs;

    let ssl: {
      SNICallback: (hostname: string, cb: (err: any, ctx: any) => void) => void;
      key: any;
      cert: any;
      secureOptions?: number;
      ca?: any;
      opts?: any;
    } = {
      SNICallback: function (hostname: string, cb: (err: any, ctx: any) => void) {
        if (cb) {
          cb(null, certs[hostname]);
        } else {
          return certs[hostname];
        }
      },
      //
      // Default certs for clients that do not support SNI.
      //
      key: getCertData(sslOpts.key),
      cert: getCertData(sslOpts.cert),
    };

    // Allows the option to disable older SSL/TLS versions
    if (sslOpts.secureOptions) {
      ssl.secureOptions = sslOpts.secureOptions;
    }

    if (sslOpts.ca) {
      ssl.ca = getCertData(sslOpts.ca, true);
    }

    if (sslOpts.opts) {
      ssl = { ...sslOpts.opts, ...ssl };
    }

    if (sslOpts.http2) {
      https = sslOpts.serverModule || require('spdy');
      if (isObject(sslOpts.http2)) {
        sslOpts.spdy = sslOpts.http2;
      }
    } else {
      https = sslOpts.serverModule || require('https');
    }

    const httpsServer = (this.httpsServer = https.createServer(
      ssl,
      async (req: IncomingMessage, res: ServerResponse) => {
        const src = this.getSource(req);
        const httpProxyOpts = Object.assign({}, this.opts.httpProxy);

        const target = await this.getTarget(src, req, res);
        if (target) {
          httpProxyOpts.target = target;
          proxy.web(req, res, httpProxyOpts);
        } else {
          respondNotFound(req, res);
        }
      }
    ));

    httpsServer.on('upgrade', websocketsUpgrade);

    httpsServer.on('error', (err: NodeJS.ErrnoException) => {
      this.log?.error(err, 'HTTPS Server Error');
    });

    httpsServer.on('clientError', (err: NodeJS.ErrnoException) => {
      this.log?.error(err, 'HTTPS Client  Error');
    });

    this.log?.info('Listening to HTTPS requests on port %s', sslOpts.port);
    httpsServer.listen(sslOpts.port, sslOpts.ip);
  }

  addResolver(resolver: ResolverFn | ResolverFn[]) {
    if (this.opts.cluster && cluster.isPrimary) {
      return this;
    }

    const resolverArray = Array.isArray(resolver) ? resolver : [resolver];

    resolverArray.forEach((resolveObj) => {
      if (!isFunction(resolveObj)) {
        throw new Error('Resolver must be an invokable function.');
      }

      if (!resolveObj.hasOwnProperty('priority')) {
        (<any>resolveObj).priority = 0;
      }

      this.resolvers.push(resolveObj);
    });

    this.resolvers = sortBy(uniq(this.resolvers), ['priority']).reverse();
  }

  removeResolver(resolver: ResolverFn) {
    if (this.opts.cluster && cluster.isPrimary) {
      return this;
    }

    // since unique resolvers are not checked for performance,
    // just remove every existence.
    this.resolvers = this.resolvers.filter(function (resolverFn) {
      return resolverFn !== resolver;
    });
  }

  /**
 Register a new route.

 @src {String|URL} A string or a url parsed by node url module.
 Note that port is ignored, since the proxy just listens to one port.

 @target {String|URL} A string or a url parsed by node url module.
 @opts {Object} Route options.
 */
  register(opts: { src: string | URL; target: string | URL; ssl: any }): Redbird;
  register(src: string, opts: any): Redbird;
  register(src: string | URL, target: string | URL, opts: any): Redbird;
  register(src: any, target?: any, opts?: any): Redbird {
    if (this.opts.cluster && cluster.isPrimary) {
      return this;
    }

    // allow registering with src or target as an object to pass in
    // options specific to each one.
    if (src && src.src) {
      target = src.target;
      opts = src;
      src = src.src;
    } else if (target && target.target) {
      opts = target;
      target = target.target;
    }

    if (!src || !target) {
      throw Error('Cannot register a new route with unspecified src or target');
    }

    const routing = this.routing;

    src = prepareUrl(src);

    if (opts) {
      const ssl = opts.ssl;
      if (ssl) {
        if (!this.httpsServer) {
          throw Error('Cannot register https routes without defining a ssl port');
        }

        if (!this.certs[src.hostname]) {
          if (ssl.key || ssl.cert || ssl.ca) {
            this.certs[src.hostname] = createCredentialContext(ssl.key, ssl.cert, ssl.ca);
          } else if (ssl.letsencrypt) {
            if (!this.opts.letsencrypt || !this.opts.letsencrypt.path) {
              console.error('Missing certificate path for Lets Encrypt');
              return;
            }
            this.log?.info('Getting Lets Encrypt certificates for %s', src.hostname);
            this.updateCertificates(
              src.hostname,
              ssl.letsencrypt.email,
              ssl.letsencrypt.production,
              this.opts.letsencrypt.renewWithin || ONE_MONTH
            );
          } else {
            // Trigger the use of the default certificates.
            this.certs[src.hostname] = void 0;
          }
        }
      }
    }
    target = buildTarget(target, opts);

    const host = (routing[src.hostname] = routing[src.hostname] || []);
    const pathname = src.pathname || '/';
    let route = host.find((route: { path: string }) => route.path === pathname);

    if (!route) {
      route = { path: pathname, rr: 0, urls: [], opts: Object.assign({}, opts) };
      host.push(route);

      //
      // Sort routes
      //
      routing[src.hostname] = sortBy(host, function (_route) {
        return -_route.path.length;
      });
    }

    route.urls.push(target);

    this.log?.info({ from: src, to: target }, 'Registered a new route');
    return this;
  }

  async updateCertificates(
    domain: string,
    email: string,
    production: boolean,
    renewWithin: number,
    renew?: boolean
  ) {
    try {
      const certs = await letsencrypt.getCertificates(domain, email, production, renew, this.log);
      if (certs) {
        const opts = {
          key: certs.privkey,
          cert: certs.cert + certs.chain,
        };
        this.certs[domain] = tls.createSecureContext(opts).context;

        //
        // TODO: cluster friendly
        //
        let renewTime = certs.expiresAt - Date.now() - renewWithin;
        renewTime =
          renewTime > 0 ? renewTime : this.opts.letsencrypt.minRenewTime || 60 * 60 * 1000;

        this.log?.info('Renewal of %s in %s days', domain, Math.floor(renewTime / ONE_DAY));

        const renewCertificate = () => {
          this.log?.info('Renewing letscrypt certificates for %s', domain);
          this.updateCertificates(domain, email, production, renewWithin, true);
        };

        this.certs[domain].renewalTimeout = safe.setTimeout(renewCertificate, renewTime);
      } else {
        //
        // TODO: Try again, but we need an exponential backof to avoid getting banned.
        //
        this.log?.info('Could not get any certs for %s', domain);
      }
    } catch (err) {
      console.error('Error getting LetsEncrypt certificates', err);
    }
  }

  unregister(src: string | URL, target?: string | URL): Redbird {
    if (this.opts.cluster && cluster.isPrimary) {
      return this;
    }

    if (!src) {
      return this;
    }

    const srcURL = prepareUrl(src);
    const routes = this.routing[srcURL.hostname] || [];
    const pathname = srcURL.pathname || '/';
    let i;

    for (i = 0; i < routes.length; i++) {
      if (routes[i].path === pathname) {
        break;
      }
    }

    if (i < routes.length) {
      const route = routes[i];

      if (target) {
        const targetURL = prepareUrl(target);
        remove(route.urls, (url: URL) => {
          return url.href === targetURL.href;
        });
      } else {
        route.urls = [];
      }

      if (route.urls.length === 0) {
        routes.splice(i, 1);
        const certs = this.certs;
        if (certs) {
          if (certs[srcURL.hostname] && certs[srcURL.hostname].renewalTimeout) {
            safe.clearTimeout(certs[srcURL.hostname].renewalTimeout);
          }
          delete certs[srcURL.hostname];
        }
      }

      this.log?.info({ from: src, to: target }, 'Unregistered a route');
    }
    return this;
  }

  /**
   * Resolves to route
   * @param host
   * @param url
   * @returns {*}
   */
  async resolve(
    host: string,
    url?: string,
    req?: IncomingMessage
  ): Promise<ProxyRoute | undefined> {
    const promiseArray = [];

    host = host && host.toLowerCase();
    for (let i = 0; i < this.resolvers.length; i++) {
      promiseArray.push(this.resolvers[i].call(this, host, url, req));
    }

    try {
      const resolverResults = await Promise.all(promiseArray);

      for (let i = 0; i < resolverResults.length; i++) {
        const route = resolverResults[i];
        const builtRoute = route && buildRoute(route);

        if (builtRoute) {
          // ensure resolved route has path that prefixes URL
          // no need to check for native routes.
          if (
            !builtRoute.isResolved ||
            builtRoute.path === '/' ||
            startsWith(url, builtRoute.path)
          ) {
            return builtRoute;
          }
        }
      }
    } catch (err) {
      console.error('Resolvers error:', err);
    }
  }

  getTarget(src: string, req: IncomingMessage, res?: ServerResponse) {
    const url = req.url;

    return this.resolve(src, url, req).then((route) => {
      if (!route) {
        this.log?.warn({ src: src, url: url }, 'no valid route found for given source');
        return;
      }

      const pathname = route.path;
      if (pathname.length > 1) {
        //
        // remove prefix from src
        //
        (<any>req)._url = url; // save original url (hacky but works quite well)
        req.url = url.substr(pathname.length) || '';
      }

      //
      // Perform Round-Robin on the available targets
      // TODO: if target errors with EHOSTUNREACH we should skip this
      // target and try with another.
      //
      const urls = route.urls;
      const j = route.rr;
      route.rr = (j + 1) % urls.length; // get and update Round-robin index.
      const target = route.urls[j];

      //
      // Fix request url if targetname specified.
      //
      if (target.pathname) {
        if (req.url) {
          req.url = path.posix.join(target.pathname, req.url);
        } else {
          req.url = target.pathname;
        }
      }

      //
      // Host headers are passed through from the source by default
      // Often we want to use the host header of the target instead
      //
      if (target.useTargetHostHeader === true) {
        (<any>req).host = target.host;
      }

      if (route.opts.onRequest) {
        const resultFromRequestHandler = route.opts.onRequest(req, res, target);
        if (resultFromRequestHandler !== undefined) {
          this.log?.info(
            'Proxying %s received result from onRequest handler, returning.',
            src + url
          );
          return resultFromRequestHandler;
        }
      }

      this.log?.info('Proxying %s to %s', src + url, path.posix.join(target.host, req.url));

      return target;
    });
  }

  getSource(req: IncomingMessage) {
    if (this.opts.preferForwardedHost && req.headers['x-forwarded-host']) {
      return (<string>req.headers['x-forwarded-host']).split(':')[0];
    }
    if (req.headers.host) {
      return req.headers.host.split(':')[0];
    }
  }

  close() {
    this.proxy.close();
    this.agent && this.agent.destroy();

    return Promise.all(
      [this.server, this.httpsServer]
        .filter((s) => s)
        .map((server) => new Promise((resolve) => server.close(resolve)))
    );
  }

  //
  // Helpers
  //
  /**
  Routing table structure. An object with hostname as key, and an array as value.
  The array has one element per path associated to the given hostname.
  Every path has a Round-Robin value (rr) and urls array, with all the urls available
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

  notFound(callback: any) {
    if (typeof callback == 'function') {
      respondNotFound = callback;
    } else {
      throw Error('notFound callback is not a function');
    }
  }

  shouldRedirectToHttps(certs: any, src: string, target: any) {
    return certs && src in certs && target.sslRedirect && target.host != this.letsencryptHost;
  }
}

//
// Redirect to the HTTPS proxy
//
function redirectToHttps(req: IncomingMessage, res: ServerResponse, ssl: any, log: pino.Logger) {
  req.url = (<any>req)._url || req.url; // Get the original url since we are going to redirect.

  const targetPort = ssl.redirectPort || ssl.port;
  const hostname = req.headers.host.split(':')[0] + (targetPort ? ':' + targetPort : '');
  const url = 'https://' + path.posix.join(hostname, req.url);
  log && log.info('Redirecting %s to %s', path.posix.join(req.headers.host, req.url), url);
  //
  // We can use 301 for permanent redirect, but its bad for debugging, we may have it as
  // a configurable option.
  //
  res.writeHead(302, { Location: url });
  res.end();
}

function startsWith(input: string, str: string) {
  return (
    input.slice(0, str.length) === str && (input.length === str.length || input[str.length] === '/')
  );
}

function prepareUrl(url: string | URL) {
  if (isString(url)) {
    url = setHttp(url);

    if (!validUrl.isHttpUri(url) && !validUrl.isHttpsUri(url)) {
      throw Error(`uri is not a valid http uri ${url}`);
    }

    return parseUrl(url);
  }
  return url;
}

/*
function getCertData(source: any, unbundle?: boolean): any {
  const fs = require('fs');
  let data;
  // TODO: Support async source.

  if (source) {
    if (isArray(source)) {
      const sources = source;
      return flatten(
        map(sources, (_source: any) => {
          return getCertData(_source, unbundle);
        })
      );
    } else if (Buffer.isBuffer(source)) {
      data = source.toString('utf8');
    } else if (fs.existsSync(source)) {
      data = fs.readFileSync(source, 'utf8');
    }
  }

  if (data) {
    return unbundle ? unbundleCert(data) : data;
  }
}
*/

function getCertData(source: string | Buffer | string[] | Buffer[], unbundle?: boolean): any {
  let data: string | undefined;

  // Handle different source types
  if (source) {
    if (Array.isArray(source)) {
      // Recursively process each item in the array and flatten the result
      const sources = source;
      return sources.map((src) => getCertData(src, unbundle)).flat();
    } else if (Buffer.isBuffer(source)) {
      // If source is a buffer, convert to string
      data = source.toString('utf8');
    } else if (fs.existsSync(source)) {
      // If source is a file path, read the file content
      data = fs.readFileSync(source, 'utf8');
    }
  }

  // Return unbundled certificate data if required, or raw data
  if (data) {
    return unbundle ? unbundleCert(data) : data;
  }

  return null; // Return null if no valid data is found
}

/**
 Unbundles a file composed of several certificates.
 http://www.benjiegillam.com/2012/06/node-dot-js-ssl-certificate-chain/
 */
function unbundleCert(bundle: string) {
  const chain = bundle.trim().split('\n');

  const ca = [];
  const cert = [];

  for (let i = 0, len = chain.length; i < len; i++) {
    const line = chain[i].trim();
    if (!(line.length !== 0)) {
      continue;
    }
    cert.push(line);
    if (line.match(/-END CERTIFICATE-/)) {
      const joined = cert.join('\n');
      ca.push(joined);
      //cert = [];
      cert.length = 0;
    }
  }
  return ca;
}

function createCredentialContext(key: string, cert: string, ca: string) {
  const opts: {
    key?: string;
    cert?: string;
    ca?: string;
  } = {};

  opts.key = getCertData(key);
  opts.cert = getCertData(cert);
  if (ca) {
    opts.ca = getCertData(ca, true);
  }

  const credentials = tls.createSecureContext(opts);

  return credentials.context;
}

//
// https://stackoverflow.com/questions/18052919/javascript-regular-expression-to-add-protocol-to-url-string/18053700#18053700
// Adds http protocol if non specified.
function setHttp(link: string) {
  if (link.search(/^http[s]?\:\/\//) === -1) {
    link = 'http://' + link;
  }
  return link;
}

let respondNotFound = function (req: IncomingMessage, res: Socket | ServerResponse) {
  if (res instanceof ServerResponse) {
    res.statusCode = 404;
  }
  res.write('Not Found');
  res.end();
};

export const buildRoute = function (route: string | ProxyRoute): ProxyRoute | null {
  if (!isString(route) && !isObject(route)) {
    return null;
  }

  if (isObject(route) && route.hasOwnProperty('urls') && route.hasOwnProperty('path')) {
    // default route type matched.
    return route;
  }

  const cacheKey = isString(route) ? route : hash(route);
  const entry = routeCache.get(cacheKey) as ProxyRoute;
  if (entry) {
    return entry;
  }

  const routeObject: {
    urls?: any[];
    path?: string;
    rr: number;
    isResolved: boolean;
  } = { rr: 0, isResolved: true };

  if (isString(route)) {
    routeObject.urls = [buildTarget(route)];
    routeObject.path = '/';
  } else {
    if (!route.hasOwnProperty('url')) {
      return null;
    }

    routeObject.urls = (
      Array.isArray((<any>route).url) ? (<any>route).url : [(<any>route).url]
    ).map(function (url: string) {
      return buildTarget(url, (<any>route).opts || {});
    });

    routeObject.path = (<any>route).path || '/';
  }
  routeCache.set(cacheKey, routeObject);
  return routeObject;
};

export const buildTarget = function (
  target: string | URL,
  opts?: { ssl?: any; useTargetHostHeader?: boolean }
) {
  opts = opts || {};
  const targetURL = prepareUrl(target);

  return {
    ...targetURL,
    sslRedirect: opts.ssl && opts.ssl.redirect !== false,
    useTargetHostHeader: opts.useTargetHostHeader === true,
  };
};
