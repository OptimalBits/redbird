'use strict';

import { describe, it, expect } from 'vitest';
import { Redbird } from '../index.mjs'; // Adjust the import path if necessary
import { expect } from 'chai';
import { createServer } from 'http';
import fetch from 'node-fetch';

const TEST_PORT = 54674;
const PROXY_PORT = 53433;

const opts = {
  port: PROXY_PORT,
  bunyan: false,
};

describe('Target with a hostname', function () {
  it('Should have the host header passed to the target', async function () {
    const redbird = new Redbird(opts);

    expect(redbird.routing).to.be.an('object');

    const target = `127.0.0.1.nip.io:${TEST_PORT}`;

    redbird.register('127.0.0.1', target, {
      useTargetHostHeader: true,
    });

    expect(redbird.routing).to.have.property('127.0.0.1');

    const promiseServer = testServer().then(function (req) {
      expect(req.headers['host']).to.be.eql(target);
    });

    const res = await fetch(`http://127.0.0.1:${PROXY_PORT}`);
    expect(res.status).to.be.eql(200);
    await redbird.close();

    return promiseServer;
  });

  it('Should not have the host header passed to the target', async function () {
    const redbird = new Redbird(opts);

    expect(redbird.routing).to.be.an('object');

    const target = `127.0.0.1.nip.io:${TEST_PORT}`;

    redbird.register('127.0.0.1', target);

    expect(redbird.routing).to.have.property('127.0.0.1');

    const source = `127.0.0.1:${PROXY_PORT}`;

    const promiseServer = testServer().then(function (req) {
      expect(req.headers['host']).to.be.eql(source);
    });

    const res = await fetch(`http://${source}`);
    expect(res.status).to.be.eql(200);
    await redbird.close();

    return promiseServer;
  });

  it('Should return 404 after route is unregister', async function () {
    const redbird = new Redbird(opts);

    expect(redbird.routing).to.be.an('object');

    const target = `127.0.0.1.nip.io:${TEST_PORT}`;

    redbird.register('127.0.0.1', target);
    redbird.unregister('127.0.0.1', target);

    expect(redbird.routing).to.have.property('127.0.0.1');

    const source = `127.0.0.1:${PROXY_PORT}`;

    const res = await fetch(`http://${source}`);
    expect(res.status).to.be.eql(404);
    await redbird.close();
  });

  it('Should return 502 after route with no backend', async function () {
    const redbird = new Redbird(opts);

    expect(redbird.routing).to.be.an('object');

    redbird.register('127.0.0.1', '127.0.0.1.nip.io:502');

    expect(redbird.routing).to.have.property('127.0.0.1');

    const source = `127.0.0.1:${PROXY_PORT}`;

    try {
      const res = await fetch(`http://${source}`);

      expect(res.status).to.be.eql(502);
    } catch (e) {
      expect(e.code).to.be.eql('ECONNRESET');
    } finally {
      await redbird.close();
    }
  });
});

describe('Request with forwarded host header', function () {
  it('should prefer forwarded hostname if desired', function () {
    const redbird = new Redbird({
      bunyan: false,
      preferForwardedHost: true,
    });

    expect(redbird.routing).to.be.an('object');
    const req = { headers: { host: '127.0.0.1', 'x-forwarded-host': 'subdomain.example.com' } };

    const source = redbird._getSource(req);
    expect(source).to.be.eql('subdomain.example.com');

    redbird.close();
  });

  it('should use original host if not further specified', function () {
    const redbird = new Redbird(opts);

    expect(redbird.routing).to.be.an('object');
    const req = { headers: { host: '127.0.0.1', 'x-forwarded-host': 'subdomain.example.com' } };

    const source = redbird._getSource(req);
    expect(source).to.be.eql('127.0.0.1');

    redbird.close();
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
