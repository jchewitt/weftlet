import { persistedJsonDigest, sha256 } from '@weftlet/core';

/** Bounded, aggregate-only fingerprints. Equality covers complete values, not just entity IDs. */
export class RepetitionCounter {
  private readonly values = new Map<string, number>();
  private total = 0;
  private bytes = 0;
  private repeats = 0;
  private repeatedBytes = 0;
  private untracked = 0;
  constructor(private readonly maxDistinct: number) {}
  add(value: unknown, string = false) {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) return;
    const bytes = Buffer.byteLength(encoded), key = string ? sha256(encoded) : persistedJsonDigest(value);
    this.total++; this.bytes += bytes;
    if (this.values.has(key)) { this.repeats++; this.repeatedBytes += bytes; }
    else if (this.values.size < this.maxDistinct) this.values.set(key, bytes);
    else this.untracked++;
  }
  report() {
    return { occurrences: this.total, compactValueBytes: this.bytes, trackedDistinctValues: this.values.size,
      repeatedOccurrences: this.repeats, repeatedValueBytes: this.repeatedBytes,
      untrackedOccurrences: this.untracked, complete: this.untracked === 0,
      maxDistinct: this.maxDistinct };
  }
}
export function countStrings(value: unknown, counter: RepetitionCounter): void {
  if (typeof value === 'string') counter.add(value, true);
  else if (Array.isArray(value)) for (const item of value) countStrings(item, counter);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) countStrings(item, counter);
}
