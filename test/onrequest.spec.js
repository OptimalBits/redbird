'use strict';

import { describe, it, expect } from 'vitest';
import { Redbird } from '../index.mjs'; // Adjust the import path if necessary
import { expect } from 'chai';
import fetch from 'node-fetch';
import { createServer } from 'http';

const TEST_PORT = 3000;

describe('onRequest hook', function () {
  it('should be able to modify headers for a route', async () => {
    let proxy;
    let proxyReq;
    let saveProxyHeaders;

    const promiseServer = testServer();

    let target;
    proxy = new Redbird({ bunyan: false, port: 18999 });
    proxy.register({
      src: 'localhost/x',
      target: `http://localhost:${TEST_PORT}/test`,
      onRequest: (req, res, tgt) => {
        proxyReq = req;
        saveProxyHeaders = Object.assign({}, req.headers);
        req.headers.foo = 'bar';
        delete req.headers.blah;
        target = tgt;
      },
    });

    const res = await fetch('http://localhost:18999/x', {
      headers: {
        blah: 'xyz',
      },
    });
    expect(res.status).to.equal(200);
    expect(target).to.exist;
    expect(saveProxyHeaders).to.exist;
    expect(saveProxyHeaders.blah).to.equal('xyz');

    const req = await promiseServer;
    expect(req).to.exist;
    expect(req.headers.foo).to.equal('bar');
    expect(req.headers.blah).to.equal(undefined);

    await proxy.close();
  });
});

function testServer() {
  return new Promise(function (resolve, reject) {
    const server = createServer(function (req, res) {
      res.write('');
      res.end();
      server.close((err) => {
        if (err) {
          return reject(err);
        }
        resolve(req);
      });
    });

    server.listen(TEST_PORT);
  });
}
