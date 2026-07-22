// ─────────────────────────────────────────────────────────────────────────────
// leads.js — turn raw scrape items into clean call-list rows.
//
// No scoring, no AI. Each business is normalized to the fields you actually work
// from on the phone, then given two simple flags so you can eyeball or filter:
//   • low_reviews  — fewer than LOW_REVIEW_THRESHOLD reviews
//   • no_website   — no website on the listing
//
// Tuning: the only knob is LOW_REVIEW_THRESHOLD in config.js.
// ─────────────────────────────────────────────────────────────────────────────

import { LOW_REVIEW_THRESHOLD } from "./config.js";

/**
 * Normalize the many field-name variants different scrapers use into the fields
 * the call list needs. Defensive: any missing field is safe.
 *
 * @param {object} raw - a single dataset item from Apify
 * @returns {{name,phone,website,category,rating,reviewCount}}
 */
export function normalizeLead(raw = {}) {
  const reviewCount = firstNumber(
    raw.reviewsCount,
    raw.reviews_count,
    raw.reviewCount,
    raw.userRatingCount,
    raw.reviews
  );
  const rating = firstNumber(
    raw.totalScore,
    raw.rating,
    raw.stars,
    raw.averageRating
  );
  return {
    name: firstString(raw.title, raw.name, raw.businessName) || "(unknown)",
    phone: firstString(raw.phone, raw.phoneNumber, raw.phoneUnformatted) || "",
    website: firstString(raw.website, raw.url, raw.webUrl) || "",
    category:
      firstString(raw.categoryName, raw.category) ||
      (Array.isArray(raw.categories) ? raw.categories.join(", ") : "") ||
      "",
    rating: rating ?? 0,
    reviewCount: reviewCount ?? 0,
  };
}

/**
 * Add the two flags to a normalized lead. Flags are "YES" when the condition is
 * true and "" otherwise, so they filter cleanly in Google Sheets.
 *
 * @param {object} lead - output of normalizeLead()
 * @returns {object} the same lead with { flag_low_reviews, flag_no_website }
 */
export function flagLead(lead) {
  return {
    ...lead,
    flag_low_reviews: lead.reviewCount < LOW_REVIEW_THRESHOLD ? "YES" : "",
    flag_no_website: lead.website && lead.website.trim() ? "" : "YES",
  };
}

/**
 * Sort leads best-first. No scoring model — just most-reviewed (most established)
 * at the top, which is the most useful default order for working a call list.
 */
export function sortLeads(leads) {
  return [...leads].sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
}

// ── small helpers ──
function firstNumber(...vals) {
  for (const v of vals) {
    const n = typeof v === "string" ? Number(v.replace(/[, ]/g, "")) : v;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return undefined;
}
function firstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}
