import { SemanticProviderError } from './semantic-process.js';

function invalid(): never { throw new SemanticProviderError('invalid-output', 'OpenCode did not return one complete successful structured response'); }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const partTypes = new Map([['step_start', 'step-start'], ['text', 'text'], ['step_finish', 'step-finish']]);

function parseEvent(line: string) {
  let event: unknown;
  try { event = JSON.parse(line); } catch { invalid(); }
  if (!record(event) || typeof event.sessionID !== 'string' || !event.sessionID || !record(event.part)) invalid();
  const part = event.part;
  if (typeof part.messageID !== 'string' || !part.messageID || part.sessionID !== event.sessionID ||
      typeof part.id !== 'string' || !part.id) invalid();
  if (typeof event.type !== 'string' || !partTypes.has(event.type) || partTypes.get(event.type) !== part.type) invalid();
  return { type: event.type, sessionID: event.sessionID, part };
}

function addText(texts: Map<string, string>, part: Record<string, unknown>) {
  if (typeof part.text !== 'string' || !record(part.time) || typeof part.time.end !== 'number' || !Number.isFinite(part.time.end)) invalid();
  const id = part.id as string;
  if (texts.has(id) && texts.get(id) !== part.text) invalid();
  texts.set(id, part.text);
}

/** Consume the pinned run --format json protocol, not arbitrary stdout or tool output. */
export function parseOpenCodeOutput(raw: string): unknown {
  const lines = raw.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0 || lines.length > 4096) invalid();
  let session: string | undefined, message: unknown;
  let started = false, finished = false;
  const texts = new Map<string, string>();
  for (const line of lines) {
    const event = parseEvent(line), part = event.part;
    session ??= event.sessionID; message ??= part.messageID;
    if (event.sessionID !== session || part.messageID !== message || finished) invalid();
    if (event.type === 'step_start' && !started) { started = true; continue; }
    if (!started) invalid();
    if (event.type === 'text') {
      addText(texts, part); continue;
    }
    if (event.type === 'step_finish' && part.reason === 'stop') { finished = true; continue; }
    // Errors, tool use, reasoning dumps, extra steps and unknown protocol events fail closed.
    invalid();
  }
  if (!finished || texts.size === 0) invalid();
  try { return JSON.parse([...texts.values()].join('')); } catch { invalid(); }
}
