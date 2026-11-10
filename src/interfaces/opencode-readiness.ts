import type { ContextGraphConfig } from '../configuration/config.js';
import { inspectOpenCodeInstallation, openCodeApiCredential } from '../extraction/opencode-auth.js';
import { openCodeEnvironment } from '../extraction/opencode-profile.js';
import { withOpenCodeWorkspace } from '../extraction/opencode-request.js';

/** Readiness is local only: key presence is not provider authentication. */
export async function diagnoseOpenCode(config: ContextGraphConfig['semantic']) {
  if (config.provider !== 'opencode-cli') return {};
  return withOpenCodeWorkspace(async root => {
    const installation = await inspectOpenCodeInstallation(openCodeEnvironment(root, process.env), root);
    let credentialPresent = false;
    try { await openCodeApiCredential(config, process.env); credentialPresent = true; }
    catch { /* Never return credential-file contents or a provider's diagnostic text. */ }
    return {
      opencodeAvailable: installation.available, opencodeSupported: installation.supported,
      opencodeVersion: installation.version, opencodeAuthMode: config.auth?.mode ?? 'opencode-auth',
      opencodeAuthStatus: credentialPresent ? 'api-key-present-unverified' : 'missing-or-unsupported-api-credential',
      opencodeOAuthSupported: false,
    };
  });
}
