// tests/redbird.spec.ts

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http, { Server } from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';

import { certificate, key } from './fixtures';

const ONE_DAY = 24 * 60 * 60 * 1000;

const MOCK_CERT_DATA = 'MOCK_CHAIN_DATA';

// Note: as we are mocking safe-timers we cannot use intervals larger than 2^31 - 1 ms.

vi.mock('../lib/letsencrypt.js', () => ({
  getCertificates: vi.fn().mockImplementation(async () => {
    return {
      privkey: key,
      cert: certificate,
      chain: MOCK_CERT_DATA,
      expiresAt: Date.now() + 22 * ONE_DAY,
    };
  }),
  init: vi.fn(),
}));

const getCertificatesMock = vi.mocked((await import('../lib/letsencrypt.js')).getCertificates);

// Mock 'safe-timers' module
vi.mock('safe-timers', () => {
  return {
    default: {
      setTimeout: (callback, delay, ...args) => {
        return setTimeout(callback, delay, ...args);
      },
      clearTimeout: (timerId) => {
        clearTimeout(timerId);
      },
      // Include other methods if needed
    },
  };
});

import { Redbird } from '../lib';

const TEST_PORT = 54679;

// Helper functions to make HTTP and HTTPS requests
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

describe('Redbird Lets Encrypt SSL Certificate Generation', () => {
  let proxy: Redbird;
  let targetServer: Server;
  let targetPort: number = TEST_PORT;

  beforeAll(async () => {
    // Start a simple HTTP server to act as the backend target
    targetServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Hello from target server');
    });

    await new Promise((resolve) => {
      targetServer.listen(TEST_PORT, () => {
        resolve(null);
      });
    });

    // Create a new instance of Redbird with SSL options
    proxy = new Redbird({
      port: 8080,
      ssl: {
        port: 8443,
      },
      letsencrypt: {
        path: path.join(__dirname, 'letsencrypt'), // Path to store Let's Encrypt certificates
        port: 9999, // Port for Let's Encrypt challenge responses
        renewWithin: 1 * ONE_DAY, // Renew certificates when they are within 1 day of expiration
      },
    });

    // Mocking the certificate files
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => true);
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, encoding) => 'MOCK_CERT_DATA');
  });

  afterAll(async () => {
    // Close the proxy and target server
    await proxy.close();
    await new Promise((resolve) => targetServer.close(() => resolve(null)));
    vi.restoreAllMocks();
  });

  it('should generate SSL certificates for new subdomains', async () => {
    const subdomain = 'secure.example.com';

    // Register a route for example.com with SSL generation
    await proxy.register(subdomain, `http://localhost:${targetPort}`, {
      ssl: {
        letsencrypt: {
          email: 'admin@example.com',
          production: false, // Set to false for testing
        },
      },
    });

    // Make an HTTPS request to the new subdomain
    // First HTTPS request to trigger certificate generation
    const options = {
      hostname: 'localhost',
      port: 8443,
      path: '/',
      method: 'GET',
      headers: {
        Host: subdomain,
      },
      rejectUnauthorized: false, // Accept self-signed certificates
    };

    const response = await makeHttpsRequest(options);
    expect(response.status).toBe(200);
    expect(response.data).toBe('Hello from target server');
  });

  it('should renew SSL certificates that are halfway to expire', async () => {
    getCertificatesMock.mockClear();

    const subdomain = 'renew.example.com';

    // Mock getCertificates to return the initial and renewed certificates
    getCertificatesMock
      .mockResolvedValueOnce({
        privkey: key,
        cert: certificate,
        chain: MOCK_CERT_DATA,
        expiresAt: Date.now() + 10 * ONE_DAY, // Expires in 10 days
      })
      .mockResolvedValueOnce({
        privkey: key,
        cert: certificate,
        chain: MOCK_CERT_DATA,
        expiresAt: Date.now() + 15 * ONE_DAY, // Renewed, expires in 90 days
      });

    expect(getCertificatesMock).toHaveBeenCalledTimes(0);

    // Use fake timers to simulate time passage
    vi.useFakeTimers();

    // Register the domain
    await proxy.register(subdomain, `http://localhost:${targetPort}`, {
      ssl: {
        letsencrypt: {
          email: 'admin@example.com',
          production: false,
        },
      },
    });

    expect(getCertificatesMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(8 * ONE_DAY);

    expect(getCertificatesMock).toHaveBeenCalledTimes(1);

    // Initial HTTPS request to trigger certificate generation
    const options = {
      hostname: 'localhost',
      port: 8443,
      path: '/',
      method: 'GET',
      headers: {
        Host: subdomain,
      },
      rejectUnauthorized: false,
    };

    const response = await makeHttpsRequest(options);
    expect(response.status).toBe(200);
    expect(response.data).toBe('Hello from target server');

    // Advance all timers to execute pending callbacks
    vi.advanceTimersByTime(1 * ONE_DAY);

    expect(getCertificatesMock).toHaveBeenCalledTimes(2);

    // Second HTTPS request
    const response2 = await makeHttpsRequest(options);
    expect(response2.status).toBe(200);
    expect(response2.data).toBe('Hello from target server');

    // Verify getCertificates was called twice
    expect(getCertificatesMock).toHaveBeenCalledTimes(2);

    // Restore real timers
    vi.useRealTimers();
  });
});
