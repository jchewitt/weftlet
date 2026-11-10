// Environment allowlist adapted from the extracted semantic.ts; see docs/extraction-manifest.json.
// Provider-neutral process environment. Credential forwarding is explicit in each adapter.
export type SemanticCommandEnvironment = Record<string, string | undefined>;

const semanticEnvironmentAllowlist = [
  'APPDATA',
  'CODEX_HOME',
  'COMSPEC',
  'HOME',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'LANG',
  'LC_ALL',
  'LOCALAPPDATA',
  'NODE_EXTRA_CA_CERTS',
  'NO_PROXY',
  'PATH',
  'PATHEXT',
  'SSL_CERT_FILE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR',
] as const;

export function semanticCommandEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): SemanticCommandEnvironment {
  const result: SemanticCommandEnvironment = {};
  for (const allowed of semanticEnvironmentAllowlist) {
    const match = Object.keys(source).find((key) => key.toUpperCase() === allowed);
    if (match && source[match] !== undefined) result[allowed] = source[match];
  }
  return result;
}
