import { sha256, stableJson } from './util.js';

/** Identity of persisted JSON, excluding undefined optional fields that JSON cannot retain. */
export const jsonDigest = (value: unknown): string => sha256(stableJson(JSON.parse(JSON.stringify(value))));
