'use strict';

const es = require('electrode-server');
const redbird = require('..');

async function sample1() {
  const server = await es();

  const proxy = redbird({
    port: 8080
  });

  server.route({
    method: 'get',
    path: '/test/',
    handler: (req, h) => {
      return 'hello world';
    }
  });

  proxy.register({
    src: '/x',
    target: 'localhost:8080/test',
    onRequest: (req, res, target) => {}
  });
}

sample1();
