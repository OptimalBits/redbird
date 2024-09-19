import http, { IncomingMessage, ServerResponse } from 'http';
import httpProxy, { ProxyTargetUrl } from 'http-proxy';
import { Socket } from 'net';
import pino from 'pino';
import { Resolver } from './resolver.js';

export interface SSLConfig {
  port?: number;
  ip?: string;
  key?: string;
  cert?: string;
  ca?: string;
}

export interface ProxyOptions {
  // The port to listen on
  port?: number;

  // The host to listen on
  host?: string;

  // Keep the connections alive
  keepAlive?: boolean;

  preferForwardedHost?: boolean;

  httpProxy?: httpProxy.ServerOptions;

  // Enable Logging
  logger?: pino.Logger;

  // Enable Cluster Mode
  cluster?: number;

  // Enable LetsEncrypt
  letsencrypt?: {
    path: string;
    port: number;
    renewWithin?: number;
    minRenewTime?: number;
  };

  resolvers?: Resolver[];

  // NTLM Auth
  ntlm?: boolean;

  // HttpProxy Opts
  xfwd?: boolean;
  secure?: boolean;
  timeout?: number;
  proxyTimeout?: number;

  // SSL
  ssl?: SSLConfig | SSLConfig[];

  // Error handler
  errorHandler?: (
    err: NodeJS.ErrnoException,
    req: IncomingMessage,
    res: ServerResponse | Socket,
    target?: ProxyTargetUrl
  ) => void;

  serverModule?: typeof http;
}
