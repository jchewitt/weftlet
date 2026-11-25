import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export interface HostedAccess {
  readonly origin: string;
  readonly authorized: (request: IncomingMessage) => boolean;
}

/** The proxy terminates TLS. Backend access is pinned to one origin, credential and snapshot. */
export function createHostedAccess(publicOrigin: string, token: string | undefined): HostedAccess {
  const url = new URL(publicOrigin);
  if (url.protocol !== 'https:' || (publicOrigin !== url.origin && publicOrigin !== url.origin + '/')) {
    throw Error('--public-origin requires an exact HTTPS origin');
  }
  if (!token || !/^[\x21-\x7e]{32,256}$/.test(token)) {
    throw Error('Set WEFTLET_VIEWER_TOKEN to a 32–256 character printable ASCII secret for this deployment');
  }
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const basic = digest('Basic ' + Buffer.from('weftlet:' + token).toString('base64'));
  const bearer = digest('Bearer ' + token);
  return {
    origin: url.origin,
    authorized(request) {
      const supplied = digest(request.headers.authorization ?? '');
      return timingSafeEqual(supplied, basic) || timingSafeEqual(supplied, bearer);
    },
  };
}

export function acceptsExplorerOrigin(request: IncomingMessage, port: number, hosted?: HostedAccess): boolean {
  const host = request.headers.host, origin = request.headers.origin;
  if (hosted) return host === new URL(hosted.origin).host && (origin === undefined || origin === hosted.origin);
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  return hosts.includes(host ?? '') && (origin === undefined || hosts.some(value => origin === 'http://' + value));
}
