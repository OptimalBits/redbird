'use strict';

/*
Original code License:

acme-http-01-webroot.js | MPL-2.0 | Terms of Use | Privacy Policy
Copyright 2019 AJ ONeal Copyright 2019 The Root Group LLC

https://git.rootprojects.org/root/acme-http-01-webroot.js.git
*/

import fs from 'fs';
import { IncomingMessage } from 'http';
import path from 'path';
import os from 'os';
import http from 'http';
import { mkdirp } from 'mkdirp';

const myDefaults = {
  //webrootPath: [ '~', 'letsencrypt', 'const', 'lib' ].join(path.sep)
  webrootPath: path.join(os.tmpdir(), 'acme-challenge'),
  loopbackTimeout: 5 * 1000,
  debug: false,
};

const Challenge = {
  create: function (options: any) {
    const results: any = {};

    Object.keys(Challenge).forEach(function (key: string) {
      results[key] = (<any>Challenge)[key];
    });
    results.create = undefined;

    Object.keys(myDefaults).forEach(function (key) {
      if ('undefined' === typeof options[key]) {
        options[key] = (<any>myDefaults)[key];
      }
    });
    results._options = options;

    results.getOptions = function () {
      return results._options;
    };

    return results;
  },

  //
  // NOTE: the "args" here in `set()` are NOT accessible to `get()` and `remove()`
  // They are provided so that you can store them in an implementation-specific way
  // if you need access to them.
  set: function (
    args: any,
    domain: string,
    challengePath: string,
    keyAuthorization: any,
    done: (err?: NodeJS.ErrnoException) => void
  ) {
    keyAuthorization = String(keyAuthorization);

    mkdirp(args.webrootPath)
      .then(function (): void {
        fs.writeFile(
          path.join(args.webrootPath, challengePath),
          keyAuthorization,
          'utf8',
          function (err: NodeJS.ErrnoException) {
            done(err);
          }
        );
      })
      .catch((err) => {
        if (err) {
          done(err);
          return;
        }
      });
  },

  //
  // NOTE: the "defaults" here are still merged and templated, just like "args" would be,
  // but if you specifically need "args" you must retrieve them from some storage mechanism
  // based on domain and key
  //
  get: function (defaults: any, domain: string, key: string, done: () => void) {
    fs.readFile(path.join(defaults.webrootPath, key), 'utf8', done);
  },

  remove: function (defaults: any, domain: string, key: string, done: () => void) {
    fs.unlink(path.join(defaults.webrootPath, key), done);
  },

  loopback: function (
    defaults: any,
    domain: string,
    key: string,
    done: (err?: NodeJS.ErrnoException, value?: any) => void
  ) {
    const hostname = domain + (defaults.loopbackPort ? ':' + defaults.loopbackPort : '');
    const urlstr = 'http://' + hostname + '/.well-known/acme-challenge/' + key;

    http
      .get(urlstr, function (res: IncomingMessage) {
        if (200 !== res.statusCode) {
          done(new Error('local loopback failed with statusCode ' + res.statusCode));
          return;
        }
        const chunks: any[] = [];
        res.on('data', function (chunk) {
          chunks.push(chunk);
        });
        res.on('end', function () {
          const str = Buffer.concat(chunks).toString('utf8').trim();
          done(null, str);
        });
      })
      .setTimeout(defaults.loopbackTimeout, function () {
        done(new Error('loopback timeout, could not reach server'));
      })
      .on('error', function (err: NodeJS.ErrnoException) {
        done(err);
      });
  },

  /*
  test: function (
    args: any,
    domain: string,
    challenge: any,
    keyAuthorization: any,
    done: (err?: NodeJS.ErrnoException) => void
  ) {
    const me = this;
    const key = keyAuthorization || challenge;

    me.set(args, domain, challenge, key, function (err) {
      if (err) {
        done(err);
        return;
      }

      myDefaults.loopbackPort = args.loopbackPort;
      myDefaults.webrootPath = args.webrootPath;
      me.loopback(args, domain, challenge, function (err, _key) {
        if (err) {
          done(err);
          return;
        }

        if (key !== _key) {
          err = new Error(
            "keyAuthorization [original] '" + key + "'" + " did not match [result] '" + _key + "'"
          );
          return;
        }

        me.remove(myDefaults, domain, challenge, function (_err) {
          if (_err) {
            done(_err);
            return;
          }

          done(err);
        });
      });
    });
  },
  */
};

export default Challenge;
