// claudeAgent.js — one Claude call per lead → { signal, call_opener }.
//
// signal      = one specific, TRUE-from-the-data observation about the business
//               (strong review count, no website, niche category, location…).
// call_opener = 2–3 sentences meant to be SPOKEN ALOUD on a cold call:
//               conversational, natural, leads with the signal. No email-isms.
//
// One logical call per lead, run with modest concurrency for speed at ~100 leads.
// If any single lead fails (bad JSON, API error), we log it and continue with a
// safe fallback — one bad lead never crashes the run.

import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `You write cold-call prep for a sales rep who cold-calls local businesses.
For the business given, return a personalization signal and a spoken call opener.

Rules:
- "signal": ONE specific, concrete observation that is TRUE FROM THE DATA provided
  (e.g. a strong review count, a high rating, no website, a niche category, the
  city they're in). Never invent facts not in the data. Keep it under ~15 words.
- "call_opener": 2 to 3 short sentences written to be SPOKEN ALOUD on a phone
  call. Conversational and natural, like one human calling another. It must LEAD
  with the signal so the rep has an instant reason for the call. Do NOT use any
  email phrasing ("I hope this finds you well", "reaching out", "just wanted to
  touch base" are all BANNED). No corporate filler. Sound like a real person.
- Do not mention that this text was AI-generated.

Return ONLY a JSON object, no preamble, no markdown fences, exactly:
{"signal": "...", "call_opener": "..."}`;

/**
 * Generate { signal, call_opener } for a single normalized lead.
 * Always resolves (never throws) — on failure returns a safe fallback so the
 * run continues.
 *
 * @param {object} lead - normalized lead (name, phone, website, rating, reviewCount, category, address)
 * @returns {Promise<{signal:string, call_opener:string}>}
 */
export async function generateOpener(lead) {
  const userContent =
    `Business data:\n` +
    `- Name: ${lead.name}\n` +
    `- Category: ${lead.category || "(unknown)"}\n` +
    `- Rating: ${lead.rating || "n/a"} stars\n` +
    `- Review count: ${lead.reviewCount}\n` +
    `- Has website: ${lead.website ? "yes" : "no"}\n` +
    `- Location/address: ${lead.address || "(unknown)"}`;

  try {
    const resp = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = (resp.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const parsed = safeParseJson(text);
    if (!parsed || typeof parsed.signal !== "string" || typeof parsed.call_opener !== "string") {
      throw new Error(`unexpected response shape: ${text.slice(0, 120)}`);
    }
    return {
      signal: parsed.signal.trim(),
      call_opener: parsed.call_opener.trim(),
    };
  } catch (err) {
    console.warn(`[claude] opener failed for "${lead.name}": ${err.message}`);
    // Safe fallback so the row still has something usable.
    return {
      signal: `${lead.reviewCount} reviews${lead.rating ? `, ${lead.rating}★` : ""}`,
      call_opener: "",
    };
  }
}

/**
 * Run generateOpener across many leads with a small concurrency limit.
 * Returns results in the SAME order as the input array.
 *
 * @param {object[]} leads - normalized leads, already sorted best-first
 * @param {number} [concurrency]
 * @returns {Promise<Array<{signal:string, call_opener:string}>>}
 */
export async function generateOpenersForLeads(leads, concurrency = config.claudeConcurrency) {
  const results = new Array(leads.length);
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < leads.length) {
      const i = cursor++;
      results[i] = await generateOpener(leads[i]);
      done++;
      if (done % 10 === 0 || done === leads.length) {
        console.log(`[claude] generated openers ${done}/${leads.length}`);
      }
    }
  }

  const pool = Array.from(
    { length: Math.max(1, Math.min(concurrency, leads.length)) },
    () => worker()
  );
  await Promise.all(pool);
  return results;
}

/** Parse JSON, tolerating accidental ```json fences or stray text around it. */
function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
