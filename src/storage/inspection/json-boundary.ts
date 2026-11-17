import { TokenType } from '@streamparser/json';
import { InspectionError } from './errors.js';

export const arraySections = new Set(['facts', 'invariants', 'runtimeEvidence', 'unresolved', 'diagnostics']);
/** Token boundary accounting is separate from selected-value retention by the JSON parser. */
export class JsonBoundary {
  readonly sections = new Map<string, string>();
  private depth = 0;
  private rootKey = '';
  private expectKey = true;
  private valuePending = false;
  private recordDepth = 0;
  private recordStart: number | undefined;
  private lastToken = 0;
  constructor(private readonly maxRecord: number) {}

  token(token: TokenType, value: unknown, offset: number, complete: boolean) {
    this.lastToken = offset;
    this.checkLength(offset);
    if (typeof value === 'string' && Buffer.byteLength(value) > this.maxRecord) throw new InspectionError('limit', 'JSON record/token limit exceeded');
    if (this.depth === 0 && token !== TokenType.LEFT_BRACE && !complete) throw new InspectionError('invalid-json', 'Expected a JSON object');
    this.rootProperty(token, value);
    this.startRecord(token, offset);
    this.updateDepth(token);
  }
  checkLength(offset: number) {
    if (offset - (this.recordStart ?? this.lastToken) > this.maxRecord) throw new InspectionError('limit', 'JSON record/token limit exceeded');
  }
  private rootProperty(token: TokenType, value: unknown) {
    if (this.depth !== 1) return;
    if (this.expectKey && token === TokenType.STRING) {
      this.rootKey = String(value); this.expectKey = false; this.valuePending = true;
      if (this.sections.has(this.rootKey)) throw new InspectionError('invalid-json', 'Duplicate root property');
      if (this.sections.size >= 128) throw new InspectionError('limit', 'Too many root properties');
    } else if (token !== TokenType.COLON && this.valuePending) {
      this.sections.set(this.rootKey, token === TokenType.LEFT_BRACKET ? 'array' : token === TokenType.LEFT_BRACE ? 'object' : 'scalar');
      this.valuePending = false;
    }
  }
  private startRecord(token: TokenType, offset: number) {
    if (this.recordStart !== undefined || ![TokenType.LEFT_BRACE, TokenType.LEFT_BRACKET].includes(token)) return;
    if (this.rootKey === 'manifest' && this.depth === 1 || arraySections.has(this.rootKey) && this.depth === 2) {
      this.recordStart = offset; this.recordDepth = this.depth + 1;
    }
  }
  private updateDepth(token: TokenType) {
    if (token === TokenType.LEFT_BRACE || token === TokenType.LEFT_BRACKET) this.depth++;
    if (this.depth > 128) throw new InspectionError('limit', 'JSON nesting limit exceeded');
    if (token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET) {
      if (this.depth === this.recordDepth) this.recordStart = undefined;
      this.depth--;
    }
    if (this.depth === 1 && token === TokenType.COMMA) this.expectKey = true;
  }
}
