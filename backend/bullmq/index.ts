import Fastify from "fastify";
import Queue from "bull";
import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { INTEGRATIONS } from "@workspace/shared/config/integrations/integrations";
import { BaseAdapter } from "@bull-board/api/baseAdapter";

// Create queues
const queues = [];

for (const [key, value] of Object.entries(INTEGRATIONS)) {
  for (const sp of value.supportedTypes) {
    queues.push(new Queue(`ingest.${key}.${sp.type}`) as any);
  }
}

// Setup Fastify adapter
const serverAdapter = new FastifyAdapter();
serverAdapter.setBasePath("/admin/queues");

// Create Bull Board
createBullBoard({
  queues: queues.map((q) => new BullAdapter(q)),
  serverAdapter,
});

// Create Fastify app
const app = Fastify();

// Register Bull Board plugin
await app.register(serverAdapter.registerPlugin() as any, {
  prefix: "/admin/queues",
});

// Start server
app.listen({ port: 3005 }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(`Running on ${address}`);
  console.log(`UI: ${address}/admin/queues`);
});
