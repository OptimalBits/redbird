import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http, { Server } from 'http';
import https from 'https';
import { Redbird } from '../lib/index.js';
import { certificate, key } from './fixtures/index.js';

const proxyPort = 8085;
const sslPort = 8445;
const testPort = 54681;

function makeHttpRequest(options) {
  return new Promise<{ status: number; headers: any; data: string }>((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode!, headers: res.headers, data });
      });
    });
    req.on('error', (err) => {
      console.error('ERROR', err);
      reject(err);
    });
    req.end();
  });
}

function makeHttpsRequest(options) {
  return new Promise<{ status: number; headers: any; data: string }>((resolve, reject) => {
    options.rejectUnauthorized = false; // For self-signed certificates
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode!, headers: res.headers, data });
      });
    });
    req.on('error', (err) => {
      reject(err);
    });
    req.end();
  });
}

const responseMessage = 'Hello from target server';

describe("HTTPS with custom certificates", () => {
  let proxy: Redbird;
  let targetServer: Server;

  beforeAll(async () => {
    targetServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(responseMessage);
    });

    await new Promise((resolve) => {
      targetServer.listen(testPort, () => {
        resolve(null);
      });
    });

    proxy = new Redbird({
      port: proxyPort,
      ssl: {
        port: sslPort,
        key: key,
        cert: certificate,
      },
    });
    
    await proxy.register({
        src: 'example.com',
        target: `http://localhost:${testPort}`,
    });
  });

  afterAll(async () => {
    await proxy.close();
    await new Promise((resolve) => targetServer.close(() => resolve(null)));
  });

  it('should proxy HTTPS requests to the correct target', async () => {
    const options = {
      hostname: 'localhost',
      port: sslPort,
      path: '/',
      method: 'GET',
      headers: {
        Host: 'example.com',
      },
    };

    const response = await makeHttpsRequest(options);
    expect(response.status).toBe(200);
    expect(response.data).toBe(responseMessage);
  });
  
  it('should fail for HTTPS requests to a non-configured host', async () => {
    const options = {
      hostname: 'localhost',
      port: sslPort,
      path: '/',
      method: 'GET',
      headers: {
        Host: 'not-configured.example.com',
      },
    };

    const response = await makeHttpsRequest(options);
    expect(response.status).toBe(404);
  });
  
  it('should proxy HTTP requests to the correct target', async () => {
    const options = {
        hostname: 'localhost',
        port: proxyPort,
        path: '/',
        method: 'GET',
        headers: {
          Host: 'example.com',
        },
      };
  
      const response = await makeHttpRequest(options);
      expect(response.status).toBe(200);
      expect(response.data).toBe(responseMessage);
  })
});
