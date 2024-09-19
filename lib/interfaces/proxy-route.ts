import { ProxyTargetUrl } from './proxy-target-url.js';
import { RouteOptions } from './route-options.js';

/**
 * ProxyRoute interface
 * @description
 * Interface for ProxyRoute
 */
export interface ProxyRoute {
  urls?: ProxyTargetUrl[];
  path?: string;
  rr?: number;
  isResolved?: boolean;
  opts?: RouteOptions;
}
