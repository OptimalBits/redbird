'use strict';

import { createServer, get, IncomingMessage, ServerResponse } from 'http';
import { describe, it, expect } from 'vitest';
import { Redbird } from '../lib/index.js'; // Adjust the import path if necessary

const TEST_PORT = 54673;
const PROXY_PORT = 53432;

const opts = {
  port: PROXY_PORT,
};

describe('Target with pathnames', function () {
  it('Should be proxyed to target with pathname and source pathname concatenated', function () {
    const redbird = new Redbird(opts);

    expect(redbird.routing).to.be.an('object');

    redbird.register('127.0.0.1', `127.0.0.1:${TEST_PORT}/foo/bar/qux`);

    expect(redbird.routing).to.have.property('127.0.0.1');

    const promiseServer = testServer().then(function (req) {
      expect(req.url).to.be.eql('/foo/bar/qux/a/b/c');
    });

    return new Promise<void>(function (resolve, reject) {
      get('http://127.0.0.1:' + PROXY_PORT + '/a/b/c', async function (res) {
        try {
          await redbird.close();
          await promiseServer;
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  it('Should be proxyed to target with pathname and source pathname concatenated case 2', function () {
    const redbird = new Redbird(opts);

    expect(redbird.routing).to.be.an('object');

    redbird.register('127.0.0.1/path', '127.0.0.1:' + TEST_PORT + '/foo/bar/qux');

    expect(redbird.routing).to.have.property('127.0.0.1');

    const promiseServer = testServer().then((req: IncomingMessage) => {
      expect(req.url).to.be.eql('/foo/bar/qux/a/b/c');
    });

    return new Promise<void>(function (resolve, reject) {
      get(`http://127.0.0.1:${PROXY_PORT}/path/a/b/c`, async (res: IncomingMessage) => {
        try {
          await redbird.close();
          await promiseServer;
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });
});

function testServer() {
  return new Promise<IncomingMessage>(function (resolve, reject) {
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
