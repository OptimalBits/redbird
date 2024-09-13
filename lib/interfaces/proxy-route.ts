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
  opts?: {
    onRequest?: (req: any, res: any, target: ProxyTargetUrl) => void;
  };
}

export interface ProxyTargetUrl {
  host: string;
  hostname: string;
  port: number;
  pathname: string;
  useTargetHostHeader: boolean;
  href: string;
}
