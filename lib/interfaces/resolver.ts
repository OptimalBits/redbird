import { IncomingMessage } from 'http';
import { RouteOptions } from './route-options.js';

export type ResolverFnResult =
  | string
  | { path?: string; url: string; opts?: RouteOptions }
  | null
  | undefined;

export type ResolverFn = (
  host: string,
  url: string,
  req?: IncomingMessage
) => ResolverFnResult | Promise<ResolverFnResult>;

export interface Resolver {
  fn: ResolverFn;
  priority: number;
}
