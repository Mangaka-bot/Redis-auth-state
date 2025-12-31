import { proto, initAuthCreds } from "baileys";
import { logger } from "./logger.js";
import { RedisClient as redis } from "./redis-manager.js"
import { serialize, deserialize, execPipeline } from "./utils.js";

const INCR_KEY = "baileys:session:INCR_ID";

const SIGNAL_TYPES = Object.freeze([
  'pre-key',
  'session',
  'sender-key',
  'sender-key-memory',
  'app-state-sync-key',
  'app-state-sync-version',
  'lid-mapping',
  'device-list',
  'tctoken',
]);

const createSessionID = async () => {
  return await redis.incr(INCR_KEY);
};

class SessionKeyBuilder {
  #base;

  constructor(sessionId) {
    this.#base = `baileys:session:${sessionId}`;
  }

  get creds() {
    return `${this.#base}:creds`;
  }

  forType(signalType) {
    return `${this.#base}:${signalType}`;
  }

  getAllKeys() {
    return SIGNAL_TYPES.map((type) => this.forType(type));
  }
}

export async function useRedisAuthState({sessionId, ttl = null}) {

  sessionId ??= await createSessionID();

  const keys = new SessionKeyBuilder(sessionId);

  const deleteSession = async () => {
    try {
      const signalKeys = keys.getAllKeys();
      const deleted = await redis.del(keys.creds, ...signalKeys);
      logger.info(`[RedisAuthState] Deleted ${deleted} keys for session "${sessionId}"`);
    } catch (err) {
      logger.error(err, `[RedisAuthState] Failed to delete session "${sessionId}"`);
      throw err;
    }
  };

  const clearKeys = async () => {
    try {
        const signalKeys = keys.getAllKeys();
        await redis.del(...signalKeys);
      } catch (err) {
        logger.error(err, `[RedisAuthState] Failed to clear keys`);
        throw err;
    }
  };

  const writeCreds = async (credsData) => {
    try {
      const args = ttl && ttl > 0 ? ['EX', ttl] : [];
      await redis.set(keys.creds, serialize(credsData), ...args);
    } catch (err) {
      logger.error(err, `[RedisAuthState] Failed to write credentials`);
      throw err;
    }
  };

  const readCreds = async () => {
    try {
      const data = await redis.get(keys.creds);
      return data ? deserialize(data) : null;
    } catch (err) {
      logger.error(err, `[RedisAuthState] Failed to read credentials`);
      return null;
    }
  };

  const creds = (await readCreds()) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          if (!ids.length) return {};

          const data = {};

          try {
            const hashKey = keys.forType(type);
            const values = await redis.hmget(hashKey, ...ids);

            for (let i = 0; i < ids.length; i++) {
              const id = ids[i];
              const rawValue = values[i];

              if (rawValue) {
                let parsed = deserialize(rawValue);

                // Special handling for app-state-sync-key
                if (type === "app-state-sync-key" && parsed) {
                  parsed = proto.Message.AppStateSyncKeyData.fromObject(parsed);
                }

                data[id] = parsed;
              } else {
                data[id] = null;
              }
            }
          } catch (err) {
            logger.error(err, `[RedisAuthState] Failed to get ${type} keys`);
            return Object.fromEntries(ids.map(id => [id, null]));
          }

          return data;
        },
        
        set: async (data) => {
          const pipeline = redis.pipeline();
          const setsPerHash = new Map();
          const deletesPerHash = new Map();

          for (const category of Object.keys(data)) {
            const categoryData = data[category];
            if (!categoryData) continue;

            const hashKey = keys.forType(category);

            for (const id of Object.keys(categoryData)) {
              const value = categoryData[id];

              if (value !== null && value !== undefined) {
                if (!setsPerHash.has(hashKey)) {
                  setsPerHash.set(hashKey, {});
                }
                setsPerHash.get(hashKey)[id] = serialize(value);
              } else {
                if (!deletesPerHash.has(hashKey)) {
                  deletesPerHash.set(hashKey, []);
                }
                deletesPerHash.get(hashKey).push(id);
              }
            }
          }

          // Execute batch set operations using HSET
          for (const [hashKey, fields] of setsPerHash) {
            if (Object.keys(fields).length > 0) {
              pipeline.hset(hashKey, fields);
              if (ttl && ttl > 0) {
                pipeline.expire(hashKey, ttl);
              }
            }
          }

          // Execute batch delete operations using HDEL
          for (const [hashKey, fieldIds] of deletesPerHash) {
            if (fieldIds.length > 0) {
              pipeline.hdel(hashKey, ...fieldIds);
            }
          }
          
          if (setsPerHash.size > 0 || deletesPerHash.size > 0) {
            try {
              await execPipeline(pipeline);
            } catch (err) {
              logger.error(err, `[RedisAuthState] Failed to set keys`);
              throw err;
            }
          }
        },
        clear: clearKeys
      },
    },

    saveCreds: async () => writeCreds(creds),
    delete: deleteSession,
    clear: clearKeys,
    id: sessionId
  };
};