import { defineTool } from "eve";

export default defineTool({
  name: "log",
  description: "Log a message to the system log for debugging or auditing purposes.",
  parameters: {
    type: "object",
    properties: {
      level: {
        type: "string",
        enum: ["INFO", "WARN", "ERROR", "DEBUG"],
        description: "The severity level of the log message.",
      },
      message: {
        type: "string",
        description: "The message to log.",
      },
      context: {
        type: "string",
        description: "Optional additional context or metadata related to the log.",
      },
    },
    required: ["level", "message"],
  },
  handler: async ({ level, message, context }) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}${context ? ` | Context: ${context}` : ""}`;

    // In a real implementation, this would write to a file,
    // a logging service (like Winston, Pino, or CloudWatch), or stdout.
    console.log(logEntry);

    return {
      success: true,
      entry: logEntry,
    };
  },
});
