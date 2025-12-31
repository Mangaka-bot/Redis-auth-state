import pino from "pino";

export const logger = pino({
  transport: {
    target: "pino-pretty",
    options: { colorize: true },
  },
});

logger.prompt = console.log.bind(console);

export default logger;