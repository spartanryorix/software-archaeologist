import OpenAI from "openai";
import { config } from "./config.js";

const client = new OpenAI({
  baseURL: config.inferenceBase,
  apiKey: config.inferenceKey || "missing",
  timeout: 120_000,
  maxRetries: 1,
});

export const inferenceConfigured = () => Boolean(config.inferenceKey);

function extractJSON(text) {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/** Ask Vultr Serverless Inference for ONE JSON object. Primary model, then fallback. */
export async function askJSON({ system, user, maxTokens = 2500 }) {
  let lastErr = new Error("no attempt made");
  for (const model of [config.modelPrimary, config.modelFallback]) {
    for (let i = 0; i < 2; i++) {
      // Reasoning models spend tokens "thinking" before they answer: leave generous headroom.
      const budget = Math.min(16000, Math.max(4000, maxTokens * 3) * (i + 1));
      try {
        const r = await client.chat.completions.create({
          model,
          max_tokens: budget,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user + (i ? "\n\nYour previous reply was not valid JSON. Reply with ONLY one JSON object." : "") },
          ],
        });
        const choice = r.choices?.[0];
        const msg = choice?.message;
        const text = msg?.content || msg?.reasoning_content || "";
        const json = extractJSON(text);
        if (json) return { json, model };
        lastErr = new Error(`invalid JSON from ${model} (finish_reason=${choice?.finish_reason}, ${String(text).length} chars)`);
        console.error(`[llm] ${lastErr.message}; starts with: ${JSON.stringify(String(text).slice(0, 200))}`);
      } catch (e) {
        lastErr = e;
        console.error(`[llm] ${model} request failed: ${String(e.message || e).slice(0, 200)}`);
      }
    }
  }
  throw lastErr;
}
