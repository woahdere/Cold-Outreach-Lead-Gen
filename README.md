# Cold Outreach — Call List Generator

An **on-demand** tool that builds a ready-to-work cold-call list for a single
calling session. You sit down before a session, tell Claude who to target, and
the tool launches a fresh Google Maps scrape, scores and sorts the businesses,
writes a spoken-word call opener for each one, and drops a clean call list into
your Google Sheet — best leads first.

You never touch the code. **Claude Code is the interface.**

> This build makes the **call list only**. It does not dial anyone, and it is not
> an email tool. The email pipeline is a separate, future build.

---

## 1. How to run a session

1. Open this repo's folder in **Claude Code**.
2. Tell Claude your target in plain English, for example:

   > "Build a call list for marine detailing businesses in Pinellas County, about 60 leads."

3. Claude sets the targeting, launches the scrape, waits for it, scores and ranks
   everything, writes the openers, and saves a new tab in your Google Sheet.
4. Claude prints a short **run summary** and tells you the tab name. Open the
   Sheet and start dialing.

That's it. You decide the target live, in conversation, every time — nothing is
scheduled and nothing is read from a fixed settings file.

### What happens under the hood

```
scrape Google Maps  →  drop anyone under 10 reviews  →  score + sort best-first
   →  keep the top 100  →  Claude writes a signal + call opener per lead
   →  write a fresh, dated tab in your Google Sheet  →  print a summary
```

---

## 2. The four secrets (one-time setup)

These live in a file named `.env` (copied from `.env.example`). The `.env` file is
**never** shared or committed. Fill in these four values:

| Secret | What it is | Where to get it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Lets the tool write the call openers | [console.anthropic.com](https://console.anthropic.com/) → API Keys |
| `APIFY_TOKEN` | Lets the tool run the Google Maps scrape | [console.apify.com](https://console.apify.com/) → Settings → Integrations → API token |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | A Google "robot account" key, so the tool can write your Sheet | See Google setup below |
| `GOOGLE_SHEET_ID` | Which Sheet to write to | The long ID in your Sheet's URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit` |

### Google setup (do this once)

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   **service account** and **download its JSON key file**.
2. Enable **both** the **Google Sheets API** and the **Google Drive API** for that
   project.
3. Open the JSON key file, find the `client_email` (looks like
   `something@your-project.iam.gserviceaccount.com`), and **share your Google
   Sheet with that email address as an Editor** — exactly like sharing a Sheet
   with a coworker. This is the step people forget; without it, writing fails.
4. Put the **entire contents** of that JSON key file, on a single line, as the
   value of `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env`.
   - Quick way to flatten it to one line: `cat your-key.json | tr -d '\n'`

> If you get stuck on any of this, just ask Claude in Claude Code — it can walk
> you through each step.

### Installing (one time)

In Claude Code, ask it to run the install, or run this yourself in the terminal:

```
npm install
```

---

## 3. The scraper (what you're paying for)

The default scraper is Apify's **`compass/crawler-google-places`** — a reliable
Google Maps business scraper. You pay Apify per run based on how many places it
pulls. Requesting ~60–150 places per session is typical and cheap.

The scrape must return: **business name, phone, website, rating, review count,
category, and address.** Review count is the most important — the whole scoring
system is blind without it. If you ever swap to a different scraper (by setting
`APIFY_ACTOR_ID` in `.env`), make sure it still returns those fields.

---

## 4. How to tune the scoring

Scoring decides the order of your call list. It's a rough proxy for "how
worth-calling does this business look" — **not** a revenue measurement.

To adjust it, open **`src/scoring.js`** and edit the labeled numbers in the
`CONFIG` block at the very top of the file. You do not need to understand the
code — just change the numbers and their meaning is written next to each one:

- **`minReviews`** — the hard floor. Businesses under this many reviews are
  dropped entirely (default 10).
- **`reviewWeight`** — how much review count matters (uses diminishing returns so
  a 900-review chain doesn't bury every good 40-review local).
- **`reviewCountCap`** — reviews above this stop helping the score, so mega-chains
  don't dominate.
- **`ratingWeight`** — how much the star rating matters.
- **`websiteBonus`** — reward businesses that **have** a website (positive number,
  the default) or **flip the sign to negative** to favor businesses with **no**
  website (a gap you can pitch into).
- **`categoryMatchBonus`** — extra points if the business category matches what
  you searched for.
- **`noPhonePenalty`** — pushes businesses with no phone number down the list
  (you can't cold-call a number you don't have).

Change a number, save the file, run the next session — done.

---

## 5. Reading the results

Each session writes a **brand-new tab** to your Sheet, named with the date and
target, e.g. `call_list_2026-07-22_pinellas-marine-detailing`. Past sessions are
never overwritten — you keep a full history.

The tab has these columns, already sorted best lead first:

| Column | What it is |
| --- | --- |
| `business_name` | Who to call |
| `phone` | The number to dial |
| `website` | Their site, if any |
| `rating` | Star rating |
| `review_count` | Number of reviews |
| `score` | The ranking score (higher = call sooner) |
| `signal` | The one true thing to open with |
| `call_opener` | 2–3 sentences to say out loud when they pick up |
| `call_status` | **You fill this in:** Called / Voicemail / Booked / Not interested |

After each run, Claude prints a summary:

- **Total scraped** — how many businesses the scrape returned
- **Below 10-review floor** — how many were excluded for too few reviews
- **Qualified** — how many made the cut
- **Written to sheet** — how many are in your call list
- **Capped off** — if more than 100 qualified, how many strong leads were left off
  (run again with a tighter target to reach them)

---

## 6. Notes

- **Dialing is manual.** The tool builds the list; you work the sheet. There is a
  clearly-marked `// DIALING STEP — intentionally not implemented` placeholder in
  the code for a future build.
- **This is the call-list build only.** The email pipeline is separate and not
  included here.
- **Secrets are safe.** `.env` and downloaded key files are gitignored and never
  committed.
