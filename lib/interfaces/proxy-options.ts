import http, { IncomingMessage, ServerResponse } from 'http';
import httpProxy, { ProxyTargetUrl } from 'http-proxy';
import { Socket } from 'net';
import pino from 'pino';

type ResolverFnResult = string | { path: string; url: string } | null | undefined;

export type ResolverFn = (
  host: string,
  url: string,
  req?: IncomingMessage
) => ResolverFnResult | Promise<ResolverFnResult>;

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
  log?: pino.LoggerOptions;

  // Enable Cluster Mode
  cluster?: number;

  // Enable LetsEncrypt
  letsencrypt?: {
    path: string;
    port: number;
    renewWithin: number;
    minRenewTime: number;
  };

  resolvers?: ResolverFn | ResolverFn[];

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
