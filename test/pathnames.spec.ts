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
  it.each([
    ['', '', '/?url=https://google.com/', '/?url=https://google.com/'],
    [
      '/path',
      '/foo/bar/qux',
      '/path/a/b/c?url=https://google.com/a/../b//c&encoded=https%3A%2F%2Fexample.com',
      '/foo/bar/qux/a/b/c?url=https://google.com/a/../b//c&encoded=https%3A%2F%2Fexample.com',
    ],
    [
      '/path',
      '/foo/bar/qux',
      '/path/?url=//example.com/./a&next=?url=https://example.com',
      '/foo/bar/qux/?url=//example.com/./a&next=?url=https://example.com',
    ],
  ])(
    'should preserve query strings when proxying %s to %s: %s',
    async (source, target, url, expected) => {
      const server = createServer((req, res) => res.end(req.url));
      await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
      const redbird = new Redbird(opts);

      try {
        await redbird.register(`127.0.0.1${source}`, `127.0.0.1:${TEST_PORT}${target}`);
        const result = await new Promise<string>((resolve, reject) => {
          get({ hostname: '127.0.0.1', port: PROXY_PORT, path: url }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () => resolve(body));
            res.on('error', reject);
          }).on('error', reject);
        });

        expect(result).toBe(expected);
      } finally {
        await redbird.close();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  );

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
