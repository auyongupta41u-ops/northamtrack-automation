const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY;

const RESEND_API_KEY =
  process.env.RESEND_API_KEY;

const WEEKLY_EMAIL_RECIPIENTS =
  process.env.WEEKLY_EMAIL_RECIPIENTS;

const GROQ_API_KEY =
  process.env.GROQ_API_KEY;


/* =========================================================
   ENVIRONMENT CHECKS
========================================================= */

if (!SUPABASE_URL) {
  throw new Error(
    "SUPABASE_URL is missing."
  );
}

if (!SUPABASE_SERVICE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_KEY is missing."
  );
}

if (!RESEND_API_KEY) {
  throw new Error(
    "RESEND_API_KEY is missing."
  );
}

if (!WEEKLY_EMAIL_RECIPIENTS) {
  throw new Error(
    "WEEKLY_EMAIL_RECIPIENTS is missing."
  );
}

if (!GROQ_API_KEY) {
  throw new Error(
    "GROQ_API_KEY is missing."
  );
}


/* =========================================================
   SUPABASE
========================================================= */

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);


/* =========================================================
   TEXT HELPERS
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


/*
  Prevent:
  Headline | BCSC | BCSC
*/
function cleanEmailTitle(
  title = "",
  regulator = ""
) {
  let cleanedTitle =
    cleanText(title);

  const cleanedRegulator =
    cleanText(regulator);

  if (!cleanedRegulator) {
    return cleanedTitle;
  }

  const escapedRegulator =
    cleanedRegulator.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const duplicatePattern =
    new RegExp(
      `\\s*\\|\\s*${escapedRegulator}\\s*$`,
      "i"
    );

  cleanedTitle =
    cleanedTitle.replace(
      duplicatePattern,
      ""
    );

  return cleanedTitle.trim();
}


/* =========================================================
   DATE HELPERS
========================================================= */

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone:
        "Asia/Kolkata",

      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric"
    }
  ).format(date);
}


function getWeekEndingLabel() {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone:
        "Asia/Kolkata",

      weekday:
        "long",

      day:
        "2-digit",

      month:
        "long",

      year:
        "numeric"
    }
  ).format(new Date());
}


/* =========================================================
   FETCH WEEKLY UPDATES
========================================================= */

async function getWeeklyUpdates() {
  const now =
    new Date();

  const sevenDaysAgo =
    new Date(
      now.getTime() -
      7 *
      24 *
      60 *
      60 *
      1000
    );

  console.log(
    `Fetching updates since ${sevenDaysAgo.toISOString()}`
  );

  const {
    data,
    error
  } = await supabase
    .from("regulatory_updates")
    .select(`
      title,
      summary,
      full_text,
      source_url,
      published_date,
      regulator,
      is_active
    `)
    .eq(
      "is_active",
      true
    )
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
   GROQ SUMMARY
========================================================= */

async function generateDigestSummary(
  item
) {
  const sourceText =
    cleanText(
      item.full_text ||
      item.summary ||
      item.title
    );

  const response =
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${GROQ_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            model:
              "openai/gpt-oss-20b",

            messages: [
              {
                role:
                  "system",

                content:
                  "You write NorthAmTrack regulatory summaries. " +
                  "Understand the regulatory development and rewrite it entirely in your own words. " +
                  "Never copy sentences or distinctive phrases from the source. " +
                  "Never use direct quotations or quotation marks. " +
                  "Ignore website navigation, breadcrumbs, menus, page labels, publication numbers and boilerplate. " +
                  "Use neutral professional English. " +
                  "Do not invent facts. " +
                  "Return only the summary."
              },

              {
                role:
                  "user",

                content:
                  `Regulator: ${cleanText(
                    item.regulator
                  )}\n` +

                  `Title: ${cleanEmailTitle(
                    item.title,
                    item.regulator
                  )}\n\n` +

                  `Source article:\n${sourceText.slice(
                    0,
                    10000
                  )}\n\n` +

                  "Write a simple summary in your own words. " +
                  "Maximum 60 words. " +
                  "Explain what happened, who or what is involved, and the main regulatory point. " +
                  "Do not include headings, recommendations, actions, impact ratings or quotations."
              }
            ],

            temperature:
              0.2,

            max_completion_tokens:
              120
          })
      }
    );

  const result =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `Groq error: ${JSON.stringify(result)}`
    );
  }

  let summary =
    cleanText(
      result?.choices?.[0]
        ?.message?.content
    );

  if (!summary) {
    throw new Error(
      "Groq returned an empty summary."
    );
  }

  /*
    Remove quote characters as an additional
    protection even though the prompt forbids them.
  */
  summary =
    summary
      .replace(/[“”"]/g, "")
      .replace(/[‘’]/g, "'")
      .trim();

  /*
    Hard maximum: 60 words.
  */
  const words =
    summary
      .split(/\s+/)
      .filter(Boolean);

  if (
    words.length > 60
  ) {
    summary =
      words
        .slice(0, 60)
        .join(" ")
        .replace(
          /[,:;–—-]+$/,
          ""
        )
        .trim();

    if (
      !/[.!?]$/.test(
        summary
      )
    ) {
      summary += ".";
    }
  }

  return summary;
}


/* =========================================================
   PREPARE DIGEST ITEMS
========================================================= */

async function createDigestItems(
  items
) {
  const results = [];

  for (
    let index = 0;
    index < items.length;
    index++
  ) {
    const item =
      items[index];

    console.log(
      `Generating summary ${
        index + 1
      } of ${items.length}: ${
        item.title
      }`
    );

    try {
      const summary =
        await generateDigestSummary(
          item
        );

      results.push({
        ...item,

        title:
          cleanEmailTitle(
            item.title,
            item.regulator
          ),

        summary
      });

      console.log(
        "✓ Groq summary generated"
      );

    } catch (error) {
      console.warn(
        `Summary generation failed for "${item.title}": ${error.message}`
      );

      /*
        Do not dump raw scraper text into email.
      */
      results.push({
        ...item,

        title:
          cleanEmailTitle(
            item.title,
            item.regulator
          ),

        summary:
          "Please review the official regulatory release for further information."
      });
    }
  }

  return results;
}


/* =========================================================
   ARTICLE EMAIL HTML
========================================================= */

function buildArticleHtml(
  item
) {
  const title =
    escapeHtml(
      cleanEmailTitle(
        item.title,
        item.regulator
      )
    );

  const regulator =
    escapeHtml(
      cleanText(
        item.regulator
      )
    );

  const date =
    formatDate(
      item.published_date
    );

  const summary =
    escapeHtml(
      cleanText(
        item.summary
      )
    );

  const url =
    escapeHtml(
      cleanText(
        item.source_url
      )
    );

  return `
    <div
      style="
        margin-bottom:30px;
        padding-bottom:26px;
        border-bottom:1px solid #dddddd;
      "
    >

      <div
        style="
          font-size:16px;
          font-weight:700;
          line-height:1.5;
          color:#202124;
          margin-bottom:10px;
        "
      >
        ${title}${
          regulator
            ? ` | ${regulator}`
            : ""
        }
      </div>

      ${
        date
          ? `
          <div
            style="
              font-size:13px;
              color:#666666;
              margin-bottom:14px;
            "
          >
            ${date}
          </div>
          `
          : ""
      }

      <div
        style="
          font-size:15px;
          line-height:1.65;
          color:#333333;
          margin-bottom:14px;
        "
      >
        ${summary}
      </div>

      <div
        style="
          font-size:14px;
          line-height:1.5;
        "
      >

        <strong>
          For further information:
        </strong>

        <a
          href="${url}"
          style="
            color:#2457a7;
            text-decoration:underline;
          "
        >
          View official release
        </a>

      </div>

    </div>
  `;
}


/* =========================================================
   SEND THROUGH RESEND
========================================================= */

async function sendEmail(
  items
) {
  const recipients =
    WEEKLY_EMAIL_RECIPIENTS
      .split(",")
      .map(
        (email) =>
          email.trim()
      )
      .filter(Boolean);

  if (
    recipients.length === 0
  ) {
    throw new Error(
      "No valid email recipients configured."
    );
  }

  const weekEnding =
    getWeekEndingLabel();

  const html = `
    <!DOCTYPE html>

    <html>

      <head>
        <meta charset="UTF-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
      </head>

      <body
        style="
          margin:0;
          padding:0;
          background:#f5f5f5;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
        "
      >

        <div
          style="
            max-width:760px;
            margin:0 auto;
            background:#ffffff;
            padding:34px;
          "
        >

          <div
            style="
              font-size:24px;
              font-weight:700;
              color:#111111;
              margin-bottom:5px;
            "
          >
            NorthAmTrack
          </div>

          <div
            style="
              font-size:14px;
              color:#777777;
              margin-bottom:28px;
            "
          >
            Regulatory Intelligence Platform
          </div>

          <div
            style="
              font-size:20px;
              font-weight:700;
              color:#202124;
              line-height:1.4;
              margin-bottom:26px;
            "
          >
            Regulatory updates for the week ending
            ${escapeHtml(
              weekEnding
            )}
          </div>

          ${
            items
              .map(
                buildArticleHtml
              )
              .join("")
          }

          <div
            style="
              margin-top:28px;
              padding-top:18px;
              border-top:1px solid #dddddd;
              font-size:12px;
              line-height:1.6;
              color:#777777;
            "
          >
            This digest was generated automatically
            by NorthAmTrack. Please refer to the
            linked regulator publication for the
            authoritative source.
          </div>

        </div>

      </body>

    </html>
  `;

  const subject =
    `NorthAmTrack – Regulatory updates for the week ending ${weekEnding}`;

  console.log(
    `Sending digest to ${recipients.length} recipient(s)...`
  );

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${RESEND_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            from:
              "NorthAmTrack Regulatory Intelligence <digest@updates.northamtrack.in>",

            to:
              recipients,

            subject,

            html
          })
      }
    );

  const result =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `Resend error: ${JSON.stringify(result)}`
    );
  }

  console.log(
    "✓ Weekly digest sent successfully."
  );

  console.log(
    `Email ID: ${result.id}`
  );
}


/* =========================================================
   RUN
========================================================= */

async function run() {
  try {
    console.log(
      "================================"
    );

    console.log(
      "NORTHAMTRACK WEEKLY DIGEST"
    );

    console.log(
      "================================\n"
    );

    const items =
      await getWeeklyUpdates();

    console.log(
      `Found ${items.length} regulatory updates from the last 7 days.`
    );

    if (
      items.length === 0
    ) {
      console.log(
        "No updates found. No email will be sent."
      );

      return;
    }

    console.log(
      "\nGenerating 60-word Groq summaries...\n"
    );

    const digestItems =
      await createDigestItems(
        items
      );

    console.log(
      "\nSending weekly digest...\n"
    );

    await sendEmail(
      digestItems
    );

  } catch (error) {
    console.error(
      "\nWeekly digest failed."
    );

    console.error(
      error.stack ||
      error.message
    );

    process.exit(1);
  }
}


run();
