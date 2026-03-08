import type { Worker } from 'bullmq';
import runWorker from './workflow-run.js';
import schedulerWorker from './scheduler.js';

export function initWorkers(): { runWorker: Worker; schedulerWorker: Worker } {
  return { runWorker, schedulerWorker };
}
