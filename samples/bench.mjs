/**
 * Simple benchmark for Redbird proxy
 * We assume that there is a Redbird proxy running on localhost:8080
 * and a simple http server running on localhost:3000.
 *
 * This benchmark will create 1000 parallel requests to the proxy
 * and measure the time it takes to complete all requests.
 *
 * The proxy is running in a separate process, in this file we just create
 * the requests.
 */

import fetch from 'node-fetch';
const PROXY_PORT = 8080;

async function benchmark(numRequests = 10000, batchSize = 50, numIterations = 10) {
  const numBatches = numRequests / batchSize;

  const results = [];

  for (let k = 0; k < numIterations; k++) {
    const start = Date.now();
    const promises = [];

    for (let j = 0; j < numBatches; j++) {
      for (let i = 0; i < batchSize; i++) {
        promises.push(fetch(`http://localhost:${PROXY_PORT}` /*, { verbose: true }*/));
      }
      await Promise.all(promises);
    }

    const totalTime = Date.now() - start;
    const reqsPerSecond = (numRequests * 1000) / totalTime;
    console.log(`Iter: ${k} -> Time taken: ${totalTime}ms, Request per second: ${reqsPerSecond}`);

    results.push(reqsPerSecond);
  }

  // Average Requests per second
  const avg = results.reduce((acc, val) => acc + val, 0) / results.length;
  console.log(`Average Requests per second for ${numIterations} iterations:`, avg);
}

benchmark();
