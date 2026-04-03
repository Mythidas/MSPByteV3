export const CoreQueueNames = {
  // Ingestor queues
  IngestRealtime: "ingest-realtime", // manual triggers, high priority
  IngestScheduled: "ingest-scheduled", // planner-driven
  IngestBulk: "ingest-bulk", // backfills, low priority
  IngestLinking: "ingest-linking", // junction table population
  IngestEnrichment: "ingest-enrichment", // computed columns, fan-in

  // Compliance queue
  ComplianceEval: "compliance-eval", // evaluation runs

  // Workflow queues
  WorkflowRun: "workflow-run", // node graph execution
  WorkflowAction: "workflow-action", // outbound actions (set config, ticket)
} as const;

export type QueueName = (typeof CoreQueueNames)[keyof typeof CoreQueueNames];
