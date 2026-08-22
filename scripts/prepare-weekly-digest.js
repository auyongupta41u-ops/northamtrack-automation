const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is missing.");
}

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is missing.");
}

if (!GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is missing.");
}

/* =========================================================
   SUPABASE
========================================================= */

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

/* =========================================================
   HELPERS
========================================================= */

function cleanText(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanEmailTitle(title = "", regulator = "") {
  let cleanedTitle = cleanText(title);
  const cleanedRegulator = cleanText(regulator);

  if (!cleanedRegulator) {
    return cleanedTitle;
  }

  const escapedRegulator = cleanedRegulator.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const duplicatePattern = new RegExp(
    `\\s*\\|\\s*${escapedRegulator}\\s*$`,
    "i"
  );

  return cleanedTitle
    .replace(duplicatePattern, "")
    .trim();
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  ).format(date);
}

/* =========================================================
   FETCH LAST 7 DAYS
========================================================= */

async function getWeeklyUpdates() {
  const now = new Date();

  const sevenDaysAgo = new Date(
    now.getTime() -
    7 * 24 * 60 * 60 * 1000
  );

  console.log(
    `Fetching updates since ${sevenDaysAgo.toISOString()}`
  );

  const { data, error } = await supabase
    .from("regulatory_updates")
    .select(`
      title,
      summary,
      full_text,
      source_url,
      published_date,
      regulator,
      regulator_name,
      category,
      is_active
    `)
    .eq("is_active", true)
    .gte(
      "published_date",
      sevenDaysAgo.toISOString()
    )
    .lte(
      "published_date",
      now.toISOString()
    )
    .order(
      "published_date",
      {
        ascending: false
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

/* =========================================================
   SOURCE TEXT
========================================================= */

function getSourceText(item) {
  const fullText =
    cleanText(item.full_text);

  const summary =
    cleanText(item.summary);

  if (fullText.length > 100) {
    return fullText;
  }

  if (summary.length > 50) {
    return summary;
  }

  return cleanText(item.title);
}

/* =========================================================
   GROQ SUMMARY
========================================================= */

async function generateSummary(
  item,
  attempt = 1
) {
  const MAX_RETRIES = 4;

  const title = cleanEmailTitle(
    item.title,
    item.regulator
  );

  const regulator = cleanText(
    item.regulator_name ||
    item.regulator
  );

  const sourceText =
    getSourceText(item)
      .slice(0, 5500);

  const prompt = `
You are preparing a short regulatory news summary for NorthAmTrack.

ARTICLE TITLE:
${title}

REGULATOR:
${regulator}

SOURCE MATERIAL:
${sourceText}

Write ONE concise factual paragraph explaining the regulatory development.

STRICT RULES:

- Maximum 60 words.
- Write entirely in your own words.
- Do not copy source sentences.
- Do not use quotations.
- Do not use quotation marks.
- Ignore website navigation, menus, breadcrumbs, labels and boilerplate.
- Do not repeat the title.
- Do not include headings.
- Do not include recommendations.
- Do not include "Why it matters".
- Do not invent facts.
- Explain what happened and who or what is involved.
- Use neutral professional English.
- Return only the final summary paragraph.
`;

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
        model:
          "openai/gpt-oss-20b",

        messages: [
          {
            role: "user",
            content: prompt
          }
        ],

        include_reasoning: false,
        reasoning_effort: "low",
        temperature: 0.3,
        max_completion_tokens: 180,
        stream: false
      })
    }
  );

  const rawResponse =
    await response.text();

  let result;

  try {
    result =
      JSON.parse(rawResponse);
  } catch {
    throw new Error(
      `Groq returned invalid JSON: ${rawResponse.slice(0, 500)}`
    );
  }

  if (response.status === 429) {
    if (attempt > MAX_RETRIES) {
      throw new Error(
        "Groq rate limit exceeded after retries."
      );
    }

    const waitSeconds =
      attempt * 10;

    console.log(
      `Rate limit reached. Waiting ${waitSeconds}s...`
    );

    await sleep(
      waitSeconds * 1000
    );

    return generateSummary(
      item,
      attempt + 1
    );
  }

  if (!response.ok) {
    throw new Error(
      `Groq API ${response.status}: ${rawResponse.slice(0, 1000)}`
    );
  }

  let summary = cleanText(
    result?.choices?.[0]
      ?.message?.content
  );

  if (!summary) {
    throw new Error(
      "Groq returned an empty summary."
    );
  }

  summary = summary
    .replace(/^summary\s*:\s*/i, "")
    .replace(/^final summary\s*:\s*/i, "")
    .replace(/[“”"]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/^[•\-–—]\s*/, "")
    .trim();

  const words =
    summary
      .split(/\s+/)
      .filter(Boolean);

  if (words.length > 60) {
    summary =
      words
        .slice(0, 60)
        .join(" ")
        .trim();

    if (!/[.!?]$/.test(summary)) {
      summary += ".";
    }
  }

  return summary;
}

/* =========================================================
   CREATE DRAFT
========================================================= */

async function createDraftItems(items) {
  const results = [];

  for (
    let index = 0;
    index < items.length;
    index++
  ) {
    const item = items[index];

    console.log(
      `Generating ${index + 1}/${items.length}: ${item.title}`
    );

    try {
      const summary =
        await generateSummary(item);

      results.push({
        title:
          cleanEmailTitle(
            item.title,
            item.regulator
          ),

        regulator:
          cleanText(
            item.regulator
          ),

        published_date:
          item.published_date,

        display_date:
          formatDate(
            item.published_date
          ),

        summary,

        source_url:
          item.source_url,

        category:
          item.category
      });

      console.log(
        "✓ Summary generated"
      );

    } catch (error) {
      console.error(
        `Summary failed: ${error.message}`
      );

      results.push({
        title:
          cleanEmailTitle(
            item.title,
            item.regulator
          ),

        regulator:
          cleanText(
            item.regulator
          ),

        published_date:
          item.published_date,

        display_date:
          formatDate(
            item.published_date
          ),

        summary:
          "Summary could not be generated. Please review the source article.",

        source_url:
          item.source_url,

        category:
          item.category
      });
    }

    if (index < items.length - 1) {
      console.log(
        "Waiting 6 seconds..."
      );

      await sleep(6000);
    }
  }

  return results;
}

/* =========================================================
   HTML DRAFT
========================================================= */

function buildDraftHtml(items) {
  const articles = items
    .map((item) => {
      const title =
        escapeHtml(item.title);

      const regulator =
        escapeHtml(item.regulator);

      const date =
        escapeHtml(item.display_date);

      const summary =
        escapeHtml(item.summary);

      const url =
        escapeHtml(item.source_url);

      return `
        <div style="
          padding:20px 0;
          border-bottom:1px solid #ddd;
        ">

          <div style="
            font-size:17px;
            font-weight:700;
            margin-bottom:8px;
          ">
            ${title}${
              regulator
                ? ` | ${regulator}`
                : ""
            }
          </div>

          <div style="
            font-size:13px;
            color:#666;
            margin-bottom:12px;
          ">
            ${date}
          </div>

          <div style="
            font-size:15px;
            line-height:1.6;
            margin-bottom:12px;
          ">
            ${summary}
          </div>

          <div>
            <strong>
              For further information:
            </strong>

            <br>

            <a href="${url}">
              ${url}
            </a>
          </div>

        </div>
      `;
    })
    .join("");

  return `
<!DOCTYPE html>

<html>

<head>
  <meta charset="UTF-8">
  <title>NorthAmTrack Weekly Digest Draft</title>
</head>

<body style="
  font-family:Arial, Helvetica, sans-serif;
  max-width:800px;
  margin:40px auto;
  padding:20px;
">

  <h1>
    NorthAmTrack Weekly Digest Draft
  </h1>

  <p>
    Generated automatically for review.
    This draft has NOT been emailed to the distribution list.
  </p>

  ${articles}

</body>

</html>
`;
}

/* =========================================================
   SAVE DRAFT FILES
========================================================= */

function saveDraft(items) {
  const outputDirectory =
    path.join(
      process.cwd(),
      "output"
    );

  fs.mkdirSync(
    outputDirectory,
    {
      recursive: true
    }
  );

  const jsonPath =
    path.join(
      outputDirectory,
      "weekly-digest-draft.json"
    );

  const htmlPath =
    path.join(
      outputDirectory,
      "weekly-digest-draft.html"
    );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generated_at:
          new Date().toISOString(),

        article_count:
          items.length,

        articles:
          items
      },
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    htmlPath,
    buildDraftHtml(items),
    "utf8"
  );

  console.log(
    `Draft JSON saved: ${jsonPath}`
  );

  console.log(
    `Draft HTML saved: ${htmlPath}`
  );
}

/* =========================================================
   MAIN
========================================================= */

async function run() {
  try {
    console.log(
      "================================"
    );

    console.log(
      "NORTHAMTRACK WEEKLY DIGEST DRAFT"
    );

    console.log(
      "================================\n"
    );

    const items =
      await getWeeklyUpdates();

    console.log(
      `Found ${items.length} updates from the last 7 days.`
    );

    if (!items.length) {
      console.log(
        "No updates found."
      );

      return;
    }

    const draftItems =
      await createDraftItems(
        items
      );

    saveDraft(
      draftItems
    );

    console.log(
      "\nDraft preparation complete."
    );

    console.log(
      "NO EMAIL HAS BEEN SENT."
    );

  } catch (error) {
    console.error(
      "\nDraft preparation failed."
    );

    console.error(
      error.stack ||
      error.message
    );

    process.exit(1);
  }
}

run();
