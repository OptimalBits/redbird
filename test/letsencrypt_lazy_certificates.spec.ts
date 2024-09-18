import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http, { createServer } from 'http';
import { Redbird } from '../lib/proxy'; // Adjust the path as necessary
import https from 'https';
import { certificate, key } from './fixtures';

const TEST_PORT = 3030;
// Mock the letsencrypt module
vi.mock('../lib/letsencrypt', () => ({
  getCertificates: vi.fn().mockImplementation(async () => ({
    privkey: key,
    cert: certificate,
    chain: 'chain',
    expiresAt: Date.now() + 90 * 24 * 3600 * 1000, // Certificate valid for 90 days
  })),
  init: vi.fn(),
}));

// Import the mocked getCertificates function
import { getCertificates } from '../lib/letsencrypt'; // Path should match the module being mocked
const mockedGetCertificates = vi.mocked(getCertificates);

// Setup and teardown the proxy and HTTP server
describe('Lazy SSL Certificate Handling', () => {
  let server: http.Server;
  let proxy: Redbird;

  beforeAll(async () => {
    // Create an HTTP server that the proxy will use
    server = createServer((req, res) => {
      res.writeHead(200);
      res.end('Hello, world!');
    });
    await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));

    // Setup Redbird proxy
    proxy = new Redbird({
      port: 8080,
      ssl: {
        port: 8443, // This is the SSL port the proxy will use for HTTPS
      },
      letsencrypt: {
        path: '/path/to/certs', // Ensure this is configured as expected
        port: 9999, // ACME challenges port
      },
    });
  });

  afterAll(async () => {
    await proxy.close();
    console.log('Closing server');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log('Server closed');
    vi.restoreAllMocks();
  });

  it('should not request certificates immediately for lazy loaded domains', async () => {
    // Reset mocks
    mockedGetCertificates.mockClear();

    // Simulate registering a domain with lazy loading enabled
    await proxy.register('https://lazy.example.com', `http://localhost:${TEST_PORT}`, {
      ssl: {
        letsencrypt: {
          email: 'email@example.com',
          production: false,
          lazy: true,
        },
      },
    });

    // Check that certificates were not requested during registration
    expect(mockedGetCertificates).not.toHaveBeenCalled();
  });

  it('should request and cache certificates on first HTTPS request', async () => {
    // Reset mocks
    mockedGetCertificates.mockClear();

    // Make an HTTPS request to trigger lazy loading of certificates
    const options = {
      hostname: 'localhost',
      port: 8443,
      path: '/',
      method: 'GET',
      headers: { Host: 'lazy.example.com' }, // Required for virtual hosts
      rejectUnauthorized: false, // Accept self-signed certificates
    };

    const response = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, data });
        });
      });
      req.on('error', reject);
      req.end();
    });

    expect(response.statusCode).toBe(200);
    expect(response.data).toBe('Hello, world!');

    // Ensure that certificates are now loaded
    expect(mockedGetCertificates).toHaveBeenCalled();
  });
});
