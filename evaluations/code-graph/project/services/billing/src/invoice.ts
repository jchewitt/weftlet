import { parse } from './parse.js';
export function invoice(value: string): string {
  return parse(value);
}
