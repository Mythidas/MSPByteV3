import {
  WorkflowTriggerEvent,
  WorkflowTriggerEventName,
} from "@workspace/core/types/event";
import type { Queue, Worker } from "bullmq";

export type EventHandler<T extends WorkflowTriggerEvent> = (
  event: T,
) => Promise<void>;

// Services call this to publish an event — ingestor emits data_ready,
// compliance emits drift_detected
export function publishEvent(
  queue: Queue,
  event: WorkflowTriggerEvent,
): Promise<void> {
  return queue
    .add(event.event, event, {
      attempts: 2,
      removeOnComplete: { age: 60 * 60 * 24 },
    })
    .then(() => undefined);
}

// Services call this to subscribe — workflows listens for both
export function subscribeToEvent<T extends WorkflowTriggerEvent>(
  worker: Worker,
  eventName: WorkflowTriggerEventName,
  handler: EventHandler<T>,
): void {
  worker.on("completed", async (job) => {
    if (job.name === eventName) {
      await handler(job.data as T);
    }
  });
}
