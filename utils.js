import { BufferJSON } from "baileys";

export const serialize = (data) => JSON.stringify(data, BufferJSON.replacer);

export const deserialize = (json) => JSON.parse(json, BufferJSON.reviver);

export const deepClone = (obj) => deserialize(serialize(obj));

export const execPipeline = async (pipeline) => {
  const results = await pipeline.exec();
  const errors = results?.flatMap(([err], i) => err ? [{ i, err }] : []);

  if (errors?.length) {
    throw new AggregateError(
      errors.map(e => e.err),
      `[RedisAuthState] Pipeline: ${errors.length}/${results.length} commands failed`
    );
  }

  return results?.map(([, val]) => val);
};