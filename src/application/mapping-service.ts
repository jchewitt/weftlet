import { createContextGraphApplication } from './application.js';

/** Public configured service; provider construction stays lazy until an explicitly allowed run. */
export async function createMappingProposalService(configPath: string) {
  return (await createContextGraphApplication(configPath)).mappingProposalService;
}
