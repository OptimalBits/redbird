'use strict';

import { createServer } from 'http';
import { Redbird } from '../dist/index.js';
import { isPrimary } from 'cluster';

const ONE_DAY = 24 * 60 * 60 * 1000;

const wildcard_target = {
  url: `http://localhost:3000/`,
  opts: {
    ssl: {
      letsencrypt: {
        email: 'admin@optimalbits.com',
        production: false,
      },
    },
  },
};

async function sample1() {
  const proxy = new Redbird({
    port: 8080,
    cluster: 4,
    keepAlive: true,
    log: {
      name: 'Redbird',
    },
    ssl: {
      port: 8443,
    },
    letsencrypt: {
      path: './.letsencrypt', // Path to store Let's Encrypt certificates
      port: 9999, // Port for Let's Encrypt challenge responses
      renewWithin: 30 * ONE_DAY, // Renew certificates when they are within 1 day of expiration
    },
    resolvers: [
      {
        fn: (hostname) => {
          return wildcard_target;
        },
        // A negative priority will put this resolver at the end of the list
        priority: -1,
      },
    ],
  });
}

sample1();

if (!isPrimary) {
  createServer(function (req, res) {
    res.writeHead(200);
    res.write('hello world');
    res.end();
  }).listen(3000);
}
