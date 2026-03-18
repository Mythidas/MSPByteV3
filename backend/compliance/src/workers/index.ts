import { Logger } from "@workspace/core/lib/utils/logger";
import { ComplianceWorker } from "./compliance-worker";
import { startListener, type Listener } from "../events/listener";

const MODULE = "compliance";
const CONTEXT = "workers";

let worker: ComplianceWorker | null = null;
let listener: Listener | null = null;

export function startWorkers(): void {
  worker = new ComplianceWorker();
  listener = startListener();
  Logger.info({ module: MODULE, context: CONTEXT, message: "workers started" });
}

export async function stopWorkers(): Promise<void> {
  Logger.info({ module: MODULE, context: CONTEXT, message: "stopping workers..." });
  await Promise.all([
    worker?.close(),
    listener?.close(),
  ]);
  Logger.info({ module: MODULE, context: CONTEXT, message: "workers stopped" });
}
