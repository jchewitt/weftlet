export function execute(reading: { observedAt: number; value: number }, now: number) { return now - reading.observedAt <= 60000; }
