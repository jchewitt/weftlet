import { decode as readValue, Normalizer } from '@public/math';

export function analyze(raw: string): number {
  const parsed = readValue(raw);
  const normalizer = new Normalizer();
  return normalizer.run(parsed);
}

export function numeric(value: number): number {
  return readValue(value);
}
