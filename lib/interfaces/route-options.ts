import { ProxyTargetUrl } from './proxy-target-url.js';

export interface RouteOptions {
  useTargetHostHeader?: boolean;
  ssl?: {
    key?: string;
    cert?: string;
    ca?: string;
    letsencrypt?: { email: string; production: boolean; lazy?: boolean };
  };
  onRequest?: (req: any, res: any, target: ProxyTargetUrl) => void;
}
