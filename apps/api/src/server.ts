import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { BullVideoQueue } from "./queue.js";

const config = loadConfig();
const queue = new BullVideoQueue(config.redisUrl);
const app = await buildApp({ config, queue });

const shutdown = async () => {
  await app.close();
  await queue.close();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

await app.listen({
  host: config.host,
  port: config.port,
});
