'use strict';

import { createServer } from 'http';
import { Redbird } from '../index.mjs';
import cluster from 'cluster';

async function sample1() {
  const proxy = new Redbird({
    port: 8080,
    bunyan: false,
    cluster: 4,
  });

  proxy.register({
    src: 'http://localhost',
    target: 'localhost:3000/test',
    onRequest: (req, res, target) => {
      req.headers.foo = 'bar';
      delete req.headers.blah;
    },
  });
}

sample1();

if (!cluster.isPrimary) {
  createServer(function (req, res) {
    res.writeHead(200);
    res.write('hello world');
    res.end();
  }).listen(3000);
}
