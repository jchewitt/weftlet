import { Eligibility } from '../src/eligibility.js';
export function check() { return new Eligibility().allow(18); }
