import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length
        ? " " + JSON.stringify(meta, null, 0)
        : "";
      return `${timestamp} [${level}] ${message}${metaStr}`;
    })
  ),
  transports: [new winston.transports.Console()],
});
