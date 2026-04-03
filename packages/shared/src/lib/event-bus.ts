import {
  WorkflowTriggerEvent,
  WorkflowTriggerEventName,
} from "@workspace/shared/types/jobs/event";
import { Queue, Worker } from "bullmq";

export type EventHandler<T extends WorkflowTriggerEvent> = (
  event: T,
) => Promise<void>;

// Services call this to publish an event — ingestor emits data_ready,
// compliance emits drift_detected
export function publishEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue: Queue<any, any, string, any, any, string>,
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
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  worker.on("completed", async (job) => {
    if (job.name === eventName) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      await handler(job.data as T);
    }
  });
}
