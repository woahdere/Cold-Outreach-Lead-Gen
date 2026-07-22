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
  apifyToken: required("APIFY_TOKEN"),
  googleServiceAccountJson: required("GOOGLE_SERVICE_ACCOUNT_JSON"),
  googleSheetId: required("GOOGLE_SHEET_ID"),

  // ── Swappable settings (optional, with defaults) ──

  // The Apify actor that scrapes Google Maps. Kept here so it's easy to swap.
  // Default is Compass's Google Places crawler — a reliable Maps business scraper.
  // See README for what this actor returns and what it costs on Apify.
  apifyActorId: process.env.APIFY_ACTOR_ID || "compass/crawler-google-places",
};

// ── Run-wide constants (not secrets; tune here) ──

// Reviews at or below this count get a "low reviews" flag on the sheet.
// Nothing is dropped for review count — this only sets the flag threshold.
export const LOW_REVIEW_THRESHOLD = 50;

// Never write more than this many leads to a single session's sheet.
// Results are sorted by review count (most-reviewed first) before the cap.
export const MAX_LEADS = 100;
