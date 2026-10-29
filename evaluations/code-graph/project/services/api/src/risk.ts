import { assess } from 'vendor-risk';
export function risk(value: number): boolean {
  return assess(value);
}
