import { Logger } from "@workspace/shared/lib/utils/logger";
import { EvaluationsWorker } from "./evaluations-worker";
import { startListener, type Listener } from "../events/listener";
import { EvaluationScheduler } from "../scheduler/EvaluationScheduler";

const MODULE = "evaluations";
const CONTEXT = "workers";

let worker: EvaluationsWorker | null = null;
let listener: Listener | null = null;
let scheduler: EvaluationScheduler | null = null;

export function startWorkers(): void {
  worker = new EvaluationsWorker();
  listener = startListener();
  scheduler = new EvaluationScheduler();
  scheduler.start();
  Logger.info({ module: MODULE, context: CONTEXT, message: "workers started" });
}

export async function stopWorkers(): Promise<void> {
  Logger.info({ module: MODULE, context: CONTEXT, message: "stopping workers..." });
  scheduler?.stop();
  await Promise.all([worker?.close(), listener?.close()]);
  Logger.info({ module: MODULE, context: CONTEXT, message: "workers stopped" });
}
