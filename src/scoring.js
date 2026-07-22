// ─────────────────────────────────────────────────────────────────────────────
// scoring.js — ISOLATED, TUNABLE lead-scoring logic.
//
// This scoring is a rough PROXY for likely business size / worth-calling.
// It is NOT a revenue measurement. It just ranks the scraped businesses so the
// best-looking leads float to the top of the call list. Tune the constants below.
//
// HOW TO TUNE: every weight and threshold that matters lives in the CONFIG block
// right here at the top. To change how leads are ranked, edit these labeled
// numbers — you should not need to touch the logic further down.
// ─────────────────────────────────────────────────────────────────────────────

import { MIN_REVIEWS } from "./config.js";

// ── TUNABLE CONSTANTS ────────────────────────────────────────────────────────

const CONFIG = {
  // HARD FLOOR: fewer than this many reviews and the lead is EXCLUDED entirely
  // (scoreLead returns null). Mirrors MIN_REVIEWS in config.js — kept in sync so
  // the rule is obvious whether you read scoring or index.
  minReviews: MIN_REVIEWS,

  // ── Review count ──
  // More reviews ≈ busier, more established business = higher score.
  // We use a logarithmic curve so returns diminish: a 900-review national chain
  // should NOT bury every strong 40-review local. Score contribution is:
  //   reviewWeight * log10(reviewCount)
  // e.g. 10 reviews → 1.0 unit, 100 → 2.0 units, 1000 → 3.0 units (times weight).
  reviewWeight: 20,

  // Optional cap on how many reviews "count" toward the score. Anything above
  // this is treated as this number, so mega-chains don't run away with it.
  // Set high (or Infinity) to disable the cap.
  reviewCountCap: 500,

  // ── Rating ──
  // Moderate weight. Rating is 0–5 stars; multiplied directly by this weight.
  // A 4.8 business gets 4.8 * ratingWeight. Set to 0 to ignore rating.
  ratingWeight: 6,

  // ── Website ──
  // Owner may value EITHER direction, so this is a single signed number you flip:
  //   POSITIVE  → reward businesses that HAVE a website (looks legit/established).
  //   NEGATIVE  → reward businesses with NO website (a gap you can pitch/sell into).
  // Default rewards having a website. Flip the sign to hunt no-website leads.
  websiteBonus: 10,

  // ── Category / service-type match ──
  // If the scraped business category contains one of the target keywords, add
  // this bonus. Keeps on-target businesses ahead of loosely-related ones that
  // happened to show up in the same search.
  categoryMatchBonus: 15,

  // ── Missing-phone penalty ──
  // A lead with no phone number can't be cold-called. We don't drop it (the
  // owner may still want it), but we push it down the list.
  noPhonePenalty: 40,
};

// ── SCORING LOGIC (you normally won't need to edit below this line) ──────────

/**
 * Normalize the many field-name variants different scrapers use into the six
 * fields scoring + openers care about. Defensive: any missing field is safe.
 *
 * @param {object} raw - a single dataset item from Apify
 * @returns {{name,phone,website,rating,reviewCount,category,address}}
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
    rating: rating ?? 0,
    reviewCount: reviewCount ?? 0,
    category:
      firstString(raw.categoryName, raw.category) ||
      (Array.isArray(raw.categories) ? raw.categories.join(", ") : "") ||
      "",
    address: firstString(raw.address, raw.fullAddress, raw.street) || "",
  };
}

/**
 * Score a single NORMALIZED lead.
 *
 * @param {object} lead - output of normalizeLead()
 * @param {string[]} [targetKeywords] - lowercase words from the session's search
 *        term(s), used for the category-match bonus. Optional.
 * @returns {number|null} numeric score, or null if the lead is below the hard
 *          review floor and must be EXCLUDED from the call list.
 */
export function scoreLead(lead, targetKeywords = []) {
  // HARD FLOOR — enforced here. Below the floor = not a call-list lead.
  if (!Number.isFinite(lead.reviewCount) || lead.reviewCount < CONFIG.minReviews) {
    return null;
  }

  let score = 0;

  // Review count, log-scaled with a cap so chains don't dominate.
  const cappedReviews = Math.min(lead.reviewCount, CONFIG.reviewCountCap);
  score += CONFIG.reviewWeight * Math.log10(cappedReviews);

  // Rating.
  score += CONFIG.ratingWeight * (lead.rating || 0);

  // Website presence (sign of websiteBonus decides direction).
  const hasWebsite = Boolean(lead.website && lead.website.trim());
  if (hasWebsite) {
    score += CONFIG.websiteBonus;
  } else {
    score -= CONFIG.websiteBonus;
  }

  // Category / service-type match to the target search.
  if (targetKeywords.length && lead.category) {
    const cat = lead.category.toLowerCase();
    if (targetKeywords.some((kw) => kw && cat.includes(kw))) {
      score += CONFIG.categoryMatchBonus;
    }
  }

  // Can't call a lead with no phone — push it down (but keep it).
  const hasPhone = Boolean(lead.phone && lead.phone.trim());
  if (!hasPhone) {
    score -= CONFIG.noPhonePenalty;
  }

  // Round to 1 decimal for a clean sheet.
  return Math.round(score * 10) / 10;
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

// Export the config so index/tests can read weights if needed (read-only intent).
export const SCORING_CONFIG = CONFIG;
