import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { stringifyChunked } from '@discoveryjs/json-ext';
import { JSONParser, TokenizerError, TokenParserError } from '@streamparser/json';

/** Ordinary JSON bytes, incrementally encoded/decoded; legacy files need no migration. */
export async function readJsonFile<T>(path: string): Promise<T> {
  return parseJsonFile<T>(path, '$');
}

/** Validate the complete document while retaining only a selected root property. */
export async function readJsonProperty<T>(path: string, property: string): Promise<T | undefined> {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(property)) throw Error('Invalid JSON property selector');
  return parseJsonFile<T | undefined>(path, `$.${property}`);
}

async function parseJsonFile<T>(path: string, selector: string): Promise<T> {
  let value: T | undefined;
  const parser = new JSONParser({ paths: [selector], keepStack: selector === '$' });
  let complete = false;
  let hasInput = false;
  parser.onValue = result => { value = result.value as T; };
  parser.onEnd = () => { complete = true; };
  parser.onError = error => {
    // Cache inspection distinguishes invalid JSON from I/O/infrastructure errors.
    // Keep that contract without including artifact contents in the public message.
    // 0.0.26 reports a truncated container as plain Error, unlike invalid tokens.
    const incompleteContainer = error.constructor === Error && error.message.startsWith('Parser ended in mid-parsing (state:');
    if (error instanceof TokenizerError || error instanceof TokenParserError || incompleteContainer) {
      throw new SyntaxError('Invalid JSON document', { cause: error });
    }
    throw error;
  };
  for await (const chunk of createReadStream(path)) {
    if (!hasInput) hasInput = (chunk as Buffer).some(byte => ![9, 10, 13, 32].includes(byte));
    parser.write(chunk);
  }
  if (!parser.isEnded) parser.end();
  if (!complete || !hasInput) throw new SyntaxError('Incomplete JSON document');
  return value as T;
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await pipeline(stringifyChunked(value), createWriteStream(path, { flags: 'wx' }));
}
