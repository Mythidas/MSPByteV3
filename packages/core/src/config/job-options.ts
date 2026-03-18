import type { JobsOptions } from "bullmq";

export const JobOptions = {
  // Standard ingest job — 3 retries, exponential backoff
  ingest: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 60 * 60 * 24 * 7 }, // keep 7 days
    removeOnFail: { age: 60 * 60 * 24 * 30 }, // keep 30 days
  },

  // Linking jobs are fast and safe to retry aggressively
  linking: {
    attempts: 5,
    backoff: { type: "fixed", delay: 2000 },
    removeOnComplete: { age: 60 * 60 * 24 },
  },

  // Enrichment — wait longer between retries, deps may still be syncing
  enrichment: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: { age: 60 * 60 * 24 * 3 },
  },

  // Compliance eval — low urgency, generous retry window
  complianceEval: {
    attempts: 3,
    backoff: { type: "exponential", delay: 15000 },
    removeOnComplete: { age: 60 * 60 * 24 * 14 },
  },
} satisfies Record<string, JobsOptions>;
