import { persistedJsonDigest } from './util.js';

/** Identity of persisted JSON, excluding undefined optional fields that JSON cannot retain. */
export const jsonDigest = persistedJsonDigest;
