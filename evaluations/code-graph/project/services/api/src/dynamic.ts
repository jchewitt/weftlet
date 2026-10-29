export type Handler = (value: number) => number;
export function dispatch(handlers: Record<string, Handler>, key: string, value: number): number {
  return handlers[key](value);
}
