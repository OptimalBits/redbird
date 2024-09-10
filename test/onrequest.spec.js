'use strict';

import { describe, it, expect } from 'vitest';
import { Redbird } from '../'; // Adjust the import path if necessary
import { expect } from 'chai';
import fetch from 'node-fetch';

const { asyncVerify, runFinally } = require('run-verify');
const electrodeServer = require('electrode-server');

describe('onRequest hook', function () {
  function setupTestRoute(handler) {
    return electrodeServer().then((server) => {
      server.route({
        method: 'get',
        path: '/test',
        handler,
      });
      return server;
    });
  }

  it('should be able to modify headers for a route', () => {
    let server;
    let proxy;
    let serverReq;
    let proxyReq;
    let saveProxyHeaders;

    return asyncVerify(
      () => {
        return setupTestRoute((req) => {
          serverReq = req;
          return 'hello test';
        });
      },
      (s) => {
        server = s;
        let target;
        proxy = Redbird({ bunyan: false, port: 18999 });
        proxy.register({
          src: 'localhost/x',
          target: 'http://localhost:3000/test',
          onRequest: (req, res, tgt) => {
            proxyReq = req;
            saveProxyHeaders = Object.assign({}, req.headers);
            req.headers.foo = 'bar';
            delete req.headers.blah;
            target = tgt;
          },
        });

        return fetch('http://localhost:18999/x', {
          headers: {
            blah: 'xyz',
          },
        }).then((res) => {
          expect(res.status).to.equal(200);
          expect(target).to.exist;
          expect(saveProxyHeaders).to.exist;
          expect(saveProxyHeaders.blah).to.equal('xyz');
          expect(serverReq).to.exist;
          expect(serverReq.headers.foo).to.equal('bar');
          expect(serverReq.headers.blah).to.equal(undefined);
          return target;
        });
      },
      runFinally(() => proxy && proxy.close()),
      runFinally(() => server && server.stop())
    );
  });
});
