import { Redis } from "ioredis";
import { logger } from "./logger.js";

class RedisClientManager {
  #instance = null;

  constructor(config = {}) {
    this.#instance = new Redis({
      retryStrategy: (times) => Math.min(times * 50, 2000),
      ...config
    });

    this.#instance.on("connect", () => {
      logger.info("[RedisManager] Connected to Redis");
    });

    this.#instance.on("ready", () => {
      logger.info("[RedisManager] Redis client ready");
    });

    this.#instance.on("error", (err) => {
      logger.error(err, "[RedisManager] Redis error");
    });

    this.#instance.on("close", () => {
      logger.info("[RedisManager] Redis connection closed");
    });
  }

  get client() {
    return this.#instance;
  }

  async disconnect() {
    if (this.#instance) {
      await this.#instance.quit();
      this.#instance = null;
      logger.info("[RedisManager] Disconnected from Redis");
    }
  }

  isConnected() {
    return this.#instance?.status === "ready";
  }
}

export const RedisManager = new RedisClientManager();
export const RedisClient = RedisManager.client;

const shutdown = async (signal) => {
  logger.info(`[RedisManager] Received ${signal}, shutting down...`);
  await RedisManager.disconnect();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));