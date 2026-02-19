/**
 * Shared OpenAI client factory.
 * Centralizes API key validation and client instantiation
 * so every service uses a single pattern.
 */
import OpenAI from "openai"

/** Create a new OpenAI client using the OPENAI_API_KEY env var. Throws if the key is missing. */
export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}
