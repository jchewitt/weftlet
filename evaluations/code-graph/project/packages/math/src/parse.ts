export function parse(value: string): number;
export function parse(value: number): number;
export function parse(value: string | number): number {
  return typeof value === 'string' ? Number(value) : value;
}

function clamp(value: number): number {
  return Math.max(0, value);
}

export class Normalizer {
  private normalize(value: number): number {
    return clamp(value);
  }

  public run(value: number): number {
    return this.normalize(value);
  }
}

export function unused(value: number): number {
  return value * 2;
}
