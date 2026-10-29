import { parse as realParse } from '../packages/math/src/parse.js';
function parse(value: string): number { return 7; }
export const mocked = parse('5');
export const actual = realParse('5');
// parse('not a call') is documentation only.
export const example = "parse('not a call')";
