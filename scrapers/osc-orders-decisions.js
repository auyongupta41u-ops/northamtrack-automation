/**
 * NORTHAMTRACK
 * OSC Orders, Rulings & Decisions
 * PRODUCTION SCRAPER
 *
 * -------------------------------------------------------
 * WHAT THIS SCRAPER DOES
 * -------------------------------------------------------
 * 1. Crawls OSC Orders, Rulings & Decisions
 * 2. Follows pagination
 * 3. Keeps records published from 1 January 2026 onwards
 * 4. Extracts official OSC metadata
 * 5. Opens each individual decision
 * 6. Extracts the official OSC Headnote
 * 7. Preserves page text for future analysis
 * 8. Generates NorthAmTrack AI legal intelligence
 * 9. Writes/upserts into Supabase regulatory_decisions
 *
 * IMPORTANT
 * -------------------------------------------------------
 * Official OSC content and AI analysis remain separate.
 *
 * Official:
 * - title
 * - published_date
 * - document_type
 * - instrument
 * - related_to
 * - headnote
 * - source_url
 *
 * NorthAmTrack generated:
 * - ai_summary
 * - impact_rating
 * - why_it_matters
 * - actions_needed
 * - investment_fund_relevance
 * - affected_instruments
 */

const puppeteer = require("puppeteer");

// ========================================================
// CONFIGURATION
// ========================================================

const BASE_URL = "https://www.osc.ca";

const LISTING_URL =
  "https://www.osc.ca/en/securities-law/orders-rulings-and-decisions";

const CUTOFF_DATE = new Date("2026-01-01T00:00:00Z");

const MAX_PAGES = 50;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Can be overridden in GitHub Secrets/Variables later if desired.
const GROQ_MODEL =
  process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SUPABASE_TABLE = "regulatory_decisions";


// ========================================================
// VALIDATE ENVIRONMENT
// ========================================================

function validateEnvironment() {
  const missing = [];

  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_KEY) missing.push("SUPABASE_KEY");
  if (!GROQ_API_KEY) missing.push("GROQ_API_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}


// ========================================================
// GENERAL HELPERS
// ========================================================

function cleanText(value) {
  if (!value) return null;

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function absoluteUrl(url) {
  if (!url) return null;

  try {
    return new URL(url, BASE_URL).href;
  } catch {
    return null;
  }
}


function parseOSCDate(value) {
  if (!value) return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}


function formatDate(date) {
  if (!date) return null;

  return date.toISOString().slice(0, 10);
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// ========================================================
// PUPPETEER PAGE CONFIGURATION
// ========================================================

async function configurePage(page) {
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0.0.0 Safari/537.36"
  );

  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-CA,en;q=0.9"
  });

  page.setDefaultNavigationTimeout(60000);
}


// ========================================================
// EXTRACT ONE OSC LISTING PAGE
// ========================================================

async function extractListingPage(page, pageNumber) {
  const url =
    pageNumber === 0
      ? LISTING_URL
      : `${LISTING_URL}?page=${pageNumber}`;

  console.log("\n==================================================");
  console.log(`OSC LISTING PAGE ${pageNumber + 1}`);
  console.log(url);
  console.log("==================================================");

  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  const status = response ? response.status() : null;

  console.log("HTTP status:", status || "NO RESPONSE");

  if (!response || status >= 400) {
    throw new Error(
      `Unable to load OSC listing page ${pageNumber + 1}.`
    );
  }

  const result = await page.evaluate(() => {
    const tidy = (text) =>
      text
        ? text
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        : null;

    const rows = Array.from(
      document.querySelectorAll("table tbody tr")
    );

    const records = rows
      .map((row) => {
        const cells = Array.from(
          row.querySelectorAll("td")
        );

        if (cells.length < 2) {
          return null;
        }

        const link = row.querySelector(
          'a[href*="/securities-law/orders-rulings-decisions/"]'
        );

        if (!link) {
          return null;
        }

        return {
          published_date_text: tidy(cells[0]?.innerText),

          title:
            tidy(link.innerText) ||
            tidy(cells[1]?.innerText),

          source_url: link.href,

          instrument:
            tidy(cells[2]?.innerText),

          document_type:
            tidy(cells[3]?.innerText),

          related_to:
            tidy(cells[4]?.innerText)
        };
      })
      .filter(Boolean);

    /*
 * FALLBACK:
 * OSC does not always expose the listing as normal
 * table rows to Puppeteer/GitHub Actions.
 *
 * If table extraction returns no records, collect
 * decision links directly from the page.
 */

if (records.length === 0) {
  const links = Array.from(
    document.querySelectorAll(
      'a[href*="/securities-law/orders-rulings-decisions/"]'
    )
  );

  const unique = new Map();

  links.forEach((link) => {
    const title = tidy(link.innerText);

    if (!title || !link.href) {
      return;
    }

    /*
     * Exclude navigation/anchor links and retain only
     * actual individual OSC decision pages.
     */

    try {
      const url = new URL(link.href);

      const path = url.pathname.replace(/\/+$/, "");

      if (
        path ===
        "/en/securities-law/orders-rulings-decisions"
      ) {
        return;
      }

      if (
        !path.startsWith(
          "/en/securities-law/orders-rulings-decisions/"
        )
      ) {
        return;
      }
    } catch {
      return;
    }

    if (!unique.has(link.href)) {
      /*
       * Try to recover metadata from the closest
       * surrounding row/container where available.
       */

      const row =
        link.closest("tr");

      const cells = row
        ? Array.from(row.querySelectorAll("td"))
        : [];

     /*
 * Recover metadata from the closest surrounding
 * OSC result container when normal table rows
 * are not available.
 */

const container =
  link.closest("tr") ||
  link.closest("article") ||
  link.closest(".views-row") ||
  link.closest(".search-result") ||
  link.parentElement?.parentElement ||
  link.parentElement;

const containerText =
  tidy(container?.innerText) || "";

/*
 * OSC dates normally appear in formats such as:
 * October 8, 2026
 * Oct 8, 2026
 * 2026-10-08
 */

const dateMatch =
  containerText.match(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s+\d{4}\b/i
  ) ||
  containerText.match(
    /\b\d{4}-\d{2}-\d{2}\b/
  );

const publishedDate =
  tidy(cells[0]?.innerText) ||
  (dateMatch ? tidy(dateMatch[0]) : null);

unique.set(link.href, {
  published_date_text:
    publishedDate,

  title,

  source_url:
    link.href,

  instrument:
    tidy(cells[2]?.innerText),

  document_type:
    tidy(cells[3]?.innerText),

  related_to:
    tidy(cells[4]?.innerText)
});
   }
  });
  return {
    records:
      Array.from(unique.values()),

    tableRowsFound:
      rows.length,

    usedFallback:
      true
  };
}

return {
  records,

  tableRowsFound:
    rows.length,

  usedFallback:
    false
};
});

console.log(
  "Table rows detected:",
  result.tableRowsFound
);

console.log(
  "Decision records detected:",
  result.records.length
);

if (result.usedFallback) {
  console.log(
    "OSC table rows unavailable — direct-link fallback used."
  );
}

return result.records;
}

// ========================================================
// COLLECT ALL QUALIFYING OSC RECORDS
// ========================================================

async function collectOSCRecords(page) {
  const collected = new Map();

  let reachedPre2026 = false;

  for (
    let pageNumber = 0;
    pageNumber < MAX_PAGES;
    pageNumber++
  ) {
    const records = await extractListingPage(
      page,
      pageNumber
    );

    if (records.length === 0) {
      console.log(
        "No decision records found. Ending pagination."
      );

      break;
    }

    let datedRecordsOnPage = 0;
    let oldRecordsOnPage = 0;

    for (const record of records) {
      const parsedDate = parseOSCDate(
        record.published_date_text
      );

      if (!parsedDate) {
        console.log(
          `WARNING: Could not parse date: ${record.title}`
        );

        continue;
      }

      datedRecordsOnPage++;

      if (parsedDate < CUTOFF_DATE) {
        oldRecordsOnPage++;
        continue;
      }

      const sourceUrl = absoluteUrl(
        record.source_url
      );

      if (!sourceUrl) {
        continue;
      }

      if (!collected.has(sourceUrl)) {
        collected.set(sourceUrl, {
          regulator: "OSC",

          jurisdiction: "Ontario, Canada",

          published_date:
            formatDate(parsedDate),

          title:
            cleanText(record.title),

          document_type:
            cleanText(record.document_type),

          instrument:
            cleanText(record.instrument),

          related_to:
            cleanText(record.related_to),

          source_url:
            sourceUrl,

          source_section:
            "Orders, Rulings & Decisions"
        });
      }
    }

    console.log(
      `Total unique 2026+ records so far: ${collected.size}`
    );

    /*
     * OSC listing is newest first.
     *
     * Once an entire page consists of records older
     * than 1 January 2026, later pages should also
     * be older.
     */

    if (
      datedRecordsOnPage > 0 &&
      oldRecordsOnPage === datedRecordsOnPage
    ) {
      reachedPre2026 = true;

      console.log(
        "Reached a page containing only pre-2026 records."
      );

      console.log(
        "Stopping OSC pagination."
      );

      break;
    }

    await sleep(300);
  }

  const records = Array.from(
    collected.values()
  ).sort(
    (a, b) =>
      new Date(b.published_date) -
      new Date(a.published_date)
  );

  console.log("\n==================================================");
  console.log("OSC LISTING COLLECTION COMPLETE");
  console.log("==================================================");

  console.log(
    "Total qualifying records:",
    records.length
  );

  console.log(
    "Reached pre-2026 records:",
    reachedPre2026
  );

  if (records.length > 0) {
    console.log(
      "Newest:",
      records[0].published_date,
      records[0].title
    );

    console.log(
      "Oldest:",
      records[records.length - 1].published_date,
      records[records.length - 1].title
    );
  }

  return records;
}


// ========================================================
// EXTRACT OFFICIAL OSC DECISION CONTENT
// ========================================================

async function extractDecisionContent(
  browser,
  record,
  index,
  total
) {
  const page = await browser.newPage();

  await configurePage(page);

  try {
    console.log("\n--------------------------------------------------");
    console.log(
      `[${index}/${total}] ${record.title}`
    );
    console.log("--------------------------------------------------");

    const response = await page.goto(
      record.source_url,
      {
        waitUntil: "domcontentloaded",
        timeout: 60000
      }
    );

    const status =
      response ? response.status() : null;

    console.log(
      "Decision HTTP status:",
      status || "NO RESPONSE"
    );

    if (!response || status >= 400) {
      return {
        ...record,

        headnote: null,

        raw_text: null,

        extraction_status: "PAGE_ERROR"
      };
    }

    const extracted = await page.evaluate(() => {
      const tidy = (text) =>
        text
          ? text
              .replace(/\u00a0/g, " ")
              .replace(/\s+/g, " ")
              .trim()
          : null;

      const bodyText =
        document.body?.innerText || "";

      const headings = Array.from(
        document.querySelectorAll(
          "h1, h2, h3, h4, h5, h6"
        )
      );

      const headnoteHeading =
        headings.find(
          (heading) =>
            tidy(
              heading.innerText
            )?.toLowerCase() === "headnote"
        );

      let headnote = null;

      /*
       * Primary extraction method.
       */

      if (headnoteHeading) {
        const pieces = [];

        let node =
          headnoteHeading.nextElementSibling;

        while (node) {
          if (
            /^H[1-6]$/.test(node.tagName)
          ) {
            break;
          }

          const text =
            tidy(node.innerText);

          if (text) {
            pieces.push(text);
          }

          node =
            node.nextElementSibling;
        }

        headnote =
          tidy(pieces.join(" "));
      }

      /*
       * Fallback extraction.
       */

      if (!headnote) {
        const match =
          bodyText.match(
            /Headnote\s+([\s\S]*?)(?=\n\s*(?:Statutes|Rules|Applicable|Representations|IN THE MATTER|AND IN THE MATTER|ORDER|DECISION|Reasons|Background)\b)/i
          );

        if (match && match[1]) {
          headnote =
            tidy(match[1]);
        }
      }

      return {
        headnote,

        raw_text:
          tidy(bodyText)
      };
    });

    console.log(
      "Headnote:",
      extracted.headnote
        ? `FOUND (${extracted.headnote.length} characters)`
        : "NOT FOUND"
    );

    return {
      ...record,

      headnote:
        extracted.headnote,

      raw_text:
        extracted.raw_text,

      extraction_status:
        "SUCCESS"
    };
  } catch (error) {
    console.error(
      "Decision extraction error:",
      error.message
    );

    return {
      ...record,

      headnote: null,

      raw_text: null,

      extraction_status: "ERROR",

      extraction_error:
        error.message
    };
  } finally {
    await page.close();
  }
}


// ========================================================
// GROQ AI ANALYSIS
// ========================================================

async function generateAIAnalysis(record) {
  console.log(
    "Generating NorthAmTrack analysis..."
  );

  /*
   * Prefer official Headnote.
   *
   * If no Headnote exists, use the extracted page
   * text, limited to avoid unnecessarily large prompts.
   */

  const sourceMaterial =
    record.headnote ||
    record.raw_text?.slice(0, 15000) ||
    "";

  if (!sourceMaterial) {
    console.log(
      "No usable content for AI analysis."
    );

    return {
      ai_summary: null,

      impact_rating: "LOW",

      why_it_matters:
        "No substantive text was available for automated analysis.",

      actions_needed:
        "Review the original OSC document manually.",

      investment_fund_relevance:
        "NONE",

      affected_instruments:
        record.instrument || null,

      analysis_status:
        "REVIEW_REQUIRED"
    };
  }

  const prompt = `
You are the regulatory intelligence engine for NorthAmTrack.

NorthAmTrack monitors Canadian and US securities regulation, with particular emphasis on investment funds, asset managers, fund managers, portfolio managers, dealers, distributors and related financial-services businesses.

Analyze the following Ontario Securities Commission document.

IMPORTANT RULES:

1. Do not invent facts.
2. Base the analysis only on the information supplied.
3. Distinguish the regulator's decision from your interpretation.
4. The official Headnote is authoritative source material and must not be rewritten as if your summary were the regulator's wording.
5. Focus on practical legal and regulatory significance.
6. Give particular attention to investment funds and asset management.
7. If the decision has little or no investment-fund relevance, say so.
8. Do not assume that an Order or Decision is an enforcement action.
9. Exemptive relief decisions should be described as exemptive relief where appropriate.
10. Return valid JSON only. Do not use Markdown.

DOCUMENT METADATA

Regulator:
OSC

Jurisdiction:
Ontario, Canada

Published date:
${record.published_date || "Not available"}

Title:
${record.title || "Not available"}

Document type:
${record.document_type || "Not available"}

Instrument:
${record.instrument || "Not available"}

Related to:
${record.related_to || "Not available"}

OFFICIAL SOURCE MATERIAL

${sourceMaterial}

Return exactly this JSON structure:

{
  "ai_summary": "A concise plain-English summary of the regulatory decision, normally 2-4 sentences.",
  "impact_rating": "HIGH, MEDIUM or LOW",
  "why_it_matters": "Explain the legal/regulatory significance and practical implications.",
  "actions_needed": "State practical review or compliance actions. If no immediate action is required, say so clearly.",
  "investment_fund_relevance": "HIGH, MEDIUM, LOW or NONE",
  "affected_instruments": "List the principal statutes, rules, national instruments or regulatory instruments affected, separated by semicolons."
}
`.trim();

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${GROQ_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          model: GROQ_MODEL,

          messages: [
            {
              role: "system",

              content:
                "You are a precise legal and regulatory intelligence analyst. Return valid JSON only."
            },

            {
              role: "user",

              content: prompt
            }
          ],

          temperature: 0.1,

          response_format: {
            type: "json_object"
          }
        })
      }
    );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        `Groq HTTP ${response.status}: ${errorText}`
      );
    }

    const data =
      await response.json();

    const content =
      data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "Groq returned no analysis content."
      );
    }

    const parsed =
      JSON.parse(content);

    const allowedImpact = [
      "HIGH",
      "MEDIUM",
      "LOW"
    ];

    const allowedRelevance = [
      "HIGH",
      "MEDIUM",
      "LOW",
      "NONE"
    ];

    const impactRating =
      allowedImpact.includes(
        String(
          parsed.impact_rating
        ).toUpperCase()
      )
        ? String(
            parsed.impact_rating
          ).toUpperCase()
        : "LOW";

    const fundRelevance =
      allowedRelevance.includes(
        String(
          parsed.investment_fund_relevance
        ).toUpperCase()
      )
        ? String(
            parsed.investment_fund_relevance
          ).toUpperCase()
        : "NONE";

    console.log(
      "AI analysis completed:",
      impactRating,
      "/ Fund relevance:",
      fundRelevance
    );

    return {
      ai_summary:
        cleanText(parsed.ai_summary),

      impact_rating:
        impactRating,

      why_it_matters:
        cleanText(parsed.why_it_matters),

      actions_needed:
        cleanText(parsed.actions_needed),

      investment_fund_relevance:
        fundRelevance,

      affected_instruments:
        cleanText(
          parsed.affected_instruments
        ) ||
        record.instrument ||
        null,

      analysis_status:
        "ANALYZED"
    };
  } catch (error) {
    console.error(
      "AI analysis failed:",
      error.message
    );

    /*
     * We still preserve the OSC record in Supabase.
     * AI failure must not cause loss of official
     * regulatory data.
     */

    return {
      ai_summary: null,

      impact_rating: null,

      why_it_matters: null,

      actions_needed: null,

      investment_fund_relevance:
        null,

      affected_instruments:
        record.instrument || null,

      analysis_status:
        "AI_FAILED"
    };
  }
}


// ========================================================
// SUPABASE UPSERT
// ========================================================

async function upsertDecision(record) {
  const endpoint =
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
    "?on_conflict=source_url";

  /*
   * Only fields that actually exist in the
   * regulatory_decisions table are sent.
   */

  const payload = {
    regulator:
      record.regulator,

    jurisdiction:
      record.jurisdiction,

    published_date:
      record.published_date,

    title:
      record.title,

    document_type:
      record.document_type,

    instrument:
      record.instrument,

    related_to:
      record.related_to,

    headnote:
      record.headnote,

    source_url:
      record.source_url,

    source_section:
      record.source_section,

    impact_rating:
      record.impact_rating,

    why_it_matters:
      record.why_it_matters,

    actions_needed:
      record.actions_needed,

    investment_fund_relevance:
      record.investment_fund_relevance,

    affected_instruments:
      record.affected_instruments,

    ai_summary:
      record.ai_summary,

    analysis_status:
      record.analysis_status,

    raw_text:
      record.raw_text,

    updated_at:
      new Date().toISOString()
  };

  const response = await fetch(
    endpoint,
    {
      method: "POST",

      headers: {
        apikey:
          SUPABASE_KEY,

        Authorization:
          `Bearer ${SUPABASE_KEY}`,

        "Content-Type":
          "application/json",

        Prefer:
          "resolution=merge-duplicates,return=representation"
      },

      body:
        JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Supabase HTTP ${response.status}: ${errorText}`
    );
  }

  let returned = null;

  const text =
    await response.text();

  if (text) {
    try {
      returned =
        JSON.parse(text);
    } catch {
      returned = text;
    }
  }

  console.log(
    "Supabase upsert successful."
  );

  return returned;
}


// ========================================================
// PROCESS ONE DECISION
// ========================================================

async function processDecision(
  browser,
  record,
  index,
  total
) {
  /*
   * STEP 1
   * Extract official OSC content.
   */

  const extracted =
    await extractDecisionContent(
      browser,
      record,
      index,
      total
    );

  /*
   * STEP 2
   * Generate separate NorthAmTrack intelligence.
   */

  const analysis =
    await generateAIAnalysis(
      extracted
    );

  const completed = {
    ...extracted,
    ...analysis
  };

  /*
   * STEP 3
   * Write/upsert into regulatory_decisions.
   */

  try {
    await upsertDecision(
      completed
    );

    return {
      ...completed,
      database_status:
        "SAVED"
    };
  } catch (error) {
    console.error(
      "Supabase write failed:",
      error.message
    );

    return {
      ...completed,
      database_status:
        "DATABASE_ERROR",

      database_error:
        error.message
    };
  }
}


// ========================================================
// MAIN
// ========================================================

async function run() {
  console.log("==================================================");
  console.log("NORTHAMTRACK");
  console.log("OSC ORDERS, RULINGS & DECISIONS");
  console.log("PRODUCTION SCRAPER");
  console.log("==================================================");

  console.log(
    "Cutoff: 2026-01-01"
  );

  console.log(
    "Supabase table:",
    SUPABASE_TABLE
  );

  console.log(
    "AI model:",
    GROQ_MODEL
  );

  validateEnvironment();

  const browser =
    await puppeteer.launch({
      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

  try {
    // ----------------------------------------------------
    // STEP 1 — COLLECT OSC LISTING RECORDS
    // ----------------------------------------------------

    const listingPage =
      await browser.newPage();

    await configurePage(
      listingPage
    );

    const records =
      await collectOSCRecords(
        listingPage
      );

    await listingPage.close();

    if (records.length === 0) {
      throw new Error(
        "No qualifying OSC decisions were collected."
      );
    }

    // ----------------------------------------------------
    // STEP 2 — PROCESS EACH DECISION
    // ----------------------------------------------------

    console.log("\n==================================================");
    console.log("PROCESSING OSC DECISIONS");
    console.log("==================================================");

    const completed = [];

// TEMPORARY SAFETY LIMIT:
// Process only the first 3 decisions during initial production testing.
const testRecords = records.slice(0, 3);

console.log(
  `TEST MODE: Processing ${testRecords.length} of ${records.length} qualifying decisions.`
);

for (
  let i = 0;
  i < testRecords.length;
  i++
) {
     const result =
  await processDecision(
    browser,
    testRecords[i],
    i + 1,
    testRecords.length
  );

      completed.push(result);

      /*
       * Be respectful to OSC and Groq APIs.
       */

      await sleep(500);
    }

    // ----------------------------------------------------
    // FINAL REPORT
    // ----------------------------------------------------

    const saved =
      completed.filter(
        (item) =>
          item.database_status ===
          "SAVED"
      );

    const databaseErrors =
      completed.filter(
        (item) =>
          item.database_status ===
          "DATABASE_ERROR"
      );

    const headnotesFound =
      completed.filter(
        (item) =>
          Boolean(item.headnote)
      );

    const headnotesMissing =
      completed.filter(
        (item) =>
          !item.headnote
      );

    const analyzed =
      completed.filter(
        (item) =>
          item.analysis_status ===
          "ANALYZED"
      );

    const aiFailed =
      completed.filter(
        (item) =>
          item.analysis_status ===
          "AI_FAILED"
      );

    console.log("\n==================================================");
    console.log("FINAL OSC PRODUCTION REPORT");
    console.log("==================================================");

    console.log(
      "Total qualifying decisions:",
      completed.length
    );

    console.log(
      "Saved/upserted to Supabase:",
      saved.length
    );

    console.log(
      "Database errors:",
      databaseErrors.length
    );

    console.log(
      "Headnotes found:",
      headnotesFound.length
    );

    console.log(
      "Headnotes missing:",
      headnotesMissing.length
    );

    console.log(
      "AI analyses completed:",
      analyzed.length
    );

    console.log(
      "AI analyses failed:",
      aiFailed.length
    );

    // ----------------------------------------------------
    // DATABASE ERRORS
    // ----------------------------------------------------

    if (
      databaseErrors.length > 0
    ) {
      console.log("\nDATABASE ERRORS");

      databaseErrors.forEach(
        (item) => {
          console.log(
            `${item.published_date} | ${item.title}`
          );

          console.log(
            item.database_error
          );
        }
      );
    }

    // ----------------------------------------------------
    // MISSING HEADNOTES
    // ----------------------------------------------------

    if (
      headnotesMissing.length > 0
    ) {
      console.log("\nDECISIONS WITHOUT HEADNOTES");

      headnotesMissing.forEach(
        (item) => {
          console.log(
            `${item.published_date} | ${item.title} | ${item.source_url}`
          );
        }
      );
    }

    // ----------------------------------------------------
    // IMPACT DISTRIBUTION
    // ----------------------------------------------------

    const impactDistribution = {};

    completed.forEach(
      (item) => {
        const impact =
          item.impact_rating ||
          "UNANALYZED";

        impactDistribution[impact] =
          (impactDistribution[impact] || 0) +
          1;
      }
    );

    console.log(
      "\nIMPACT DISTRIBUTION"
    );

    console.log(
      impactDistribution
    );

    // ----------------------------------------------------
    // INVESTMENT FUND RELEVANCE DISTRIBUTION
    // ----------------------------------------------------

    const fundDistribution = {};

    completed.forEach(
      (item) => {
        const relevance =
          item.investment_fund_relevance ||
          "UNANALYZED";

        fundDistribution[relevance] =
          (fundDistribution[relevance] || 0) +
          1;
      }
    );

    console.log(
      "\nINVESTMENT FUND RELEVANCE"
    );

    console.log(
      fundDistribution
    );

    console.log("\n==================================================");

    if (
      databaseErrors.length === 0
    ) {
      console.log(
        "OSC PRODUCTION SCRAPER COMPLETED SUCCESSFULLY"
      );
    } else {
      console.log(
        "OSC SCRAPER COMPLETED WITH DATABASE ERRORS"
      );
    }

    console.log("==================================================");

    /*
     * If every database write failed, fail the workflow.
     *
     * A small number of individual failures will remain
     * visible in the report without destroying the entire run.
     */

    if (
      completed.length > 0 &&
      databaseErrors.length ===
        completed.length
    ) {
      throw new Error(
        "All Supabase writes failed."
      );
    }
  } finally {
    await browser.close();
  }
}


// ========================================================
// START
// ========================================================

run().catch(
  (error) => {
    console.error("\n==================================================");
    console.error("OSC PRODUCTION SCRAPER FAILED");
    console.error("==================================================");

    console.error(
      error.stack || error
    );

    process.exit(1);
  }
);
