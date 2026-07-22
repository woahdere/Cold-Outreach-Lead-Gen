// config.js — central place for env vars and swappable settings.
// No secrets are hardcoded here; everything sensitive comes from the environment
// (loaded from .env by dotenv). See .env.example for the full list.

import dotenv from "dotenv";
dotenv.config();

/**
 * Read a required env var or throw a clear, human-readable error.
 * Fail loud and early rather than crashing deep inside a run.
 */
function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and fill it in (see README.md).`
    );
  }
  return value;
}

export const config = {
  // ── Secrets (required) ──
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  apifyToken: required("APIFY_TOKEN"),
  googleServiceAccountJson: required("GOOGLE_SERVICE_ACCOUNT_JSON"),
  googleSheetId: required("GOOGLE_SHEET_ID"),

  // ── Swappable settings (optional, with defaults) ──

  // Claude model used for signal + call opener generation.
  // Swap to a cheaper/faster model for cost at volume (e.g. claude-sonnet-5).
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",

  // The Apify actor that scrapes Google Maps. Kept here so it's easy to swap.
  // Default is Compass's Google Places crawler — a reliable Maps business scraper.
  // See README for what this actor returns and what it costs on Apify.
  apifyActorId: process.env.APIFY_ACTOR_ID || "compass/crawler-google-places",

  // How many Claude opener calls to run concurrently. Higher = faster but more
  // load on the API. Keep it modest to stay well within rate limits.
  claudeConcurrency: Number(process.env.CLAUDE_CONCURRENCY || 5),
};

// ── Run-wide constants (not secrets; tune here) ──

// Hard business rule from the brief: a lead needs at least this many reviews
// to make the call list at all. Enforced in scoring.js AND index.js.
export const MIN_REVIEWS = 10;

// Never write more than this many leads to a single session's sheet.
export const MAX_LEADS = 100;
