import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineAgent } from "eve";
import logTool from "./tools/log";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export default defineAgent({
  model: openrouter("openai/gpt-6.1-sol"),
  modelContextWindowTokens: 1_000_000,
  defaultTools: false,
  tools: [logTool],
});
