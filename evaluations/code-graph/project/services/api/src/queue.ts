export interface Queue { publish(topic: string, payload: unknown): void }
export function enqueue(queue: Queue, payload: unknown): void {
  queue.publish('readings.ready', payload);
}
