import OpenAI from "openai";

// Lazy, memoized OpenAI-compatible client. Constructing eagerly at import time
// made the whole server fail to boot when AI env was absent. We now build it on
// first use and only require the env then, so AI can be fully optional/toggled.
// Points at any OpenAI-compatible endpoint (e.g. Sarvam AI) via env.

let client: OpenAI | null = null;

/** True when the AI endpoint + key are configured. */
export function isAIConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  );
}

/** Get the shared client, constructing it on first call. Throws if unconfigured. */
export function getOpenAI(): OpenAI {
  if (client) return client;

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_BASE_URL must be set to use the AI integration.",
    );
  }
  if (!apiKey) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_API_KEY must be set to use the AI integration.",
    );
  }

  client = new OpenAI({ apiKey, baseURL });
  return client;
}
