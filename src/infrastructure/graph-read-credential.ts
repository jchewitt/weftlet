/** Shared by the self-hosted listener and its stdio client. Diagnostics never include credential bytes. */
export function graphReadCredential(token: string | undefined): string {
  if (!token || !/^[\x21-\x7e]{32,256}$/.test(token)) {
    throw Error('Set WEFTLET_VIEWER_TOKEN to a 32–256 character printable ASCII secret for this deployment');
  }
  return token;
}
