export class InspectionError extends Error {
  constructor(readonly code: 'changed' | 'limit' | 'invalid-json' | 'unsafe', message: string) { super(message); }
}
