'use strict';

const redbird = require('..');
const { asyncVerify, runFinally } = require('run-verify');
const electrodeServer = require('electrode-server');
const needle = require('needle');
const { expect } = require('chai');

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
        proxy = redbird({ bunyan: false, port: 18999 });
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
        return needle('get', 'http://localhost:18999/x', {
          headers: {
            blah: 'xyz',
          },
        }).then((r) => {
          expect(r.statusCode).to.equal(200);
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
