const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY;

const RESEND_API_KEY =
  process.env.RESEND_API_KEY;

const WEEKLY_EMAIL_RECIPIENTS =
  process.env.WEEKLY_EMAIL_RECIPIENTS;

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY;


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

if (!OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY is missing."
  );
}


/* =========================================================
   CLIENTS
========================================================= */

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});


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
  Prevent duplicate regulator names such as:

  Corporate insider pays BCSC... | BCSC | BCSC
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
   AI SUMMARY
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
    await openai.responses.create({
      model:
        "gpt-4.1-mini",

      input: [
        {
          role:
            "system",

          content: `
You are an analyst writing NorthAmTrack regulatory news summaries.

Your job is to understand the source material and explain the regulatory development entirely in your own words.

STRICT RULES:

1. Write no more than 60 words.
2. Completely paraphrase the source.
3. Never reproduce a sentence from the source verbatim.
4. Never reproduce a distinctive phrase from the source verbatim unless it is an unavoidable legal or regulatory term.
5. Never use direct quotations.
6. Never use quotation marks.
7. Do not simply shorten or extract sentences from the article.
8. Ignore website navigation, breadcrumbs, menus, page headings, dates, publication numbers, footer text and boilerplate.
9. Explain the actual regulatory development clearly.
10. State who or what is involved when relevant.
11. Mention the main regulatory significance only when it is clear from the source.
12. Use neutral, professional, plain English.
13. Do not add facts that are not supported by the source.
14. Do not include headings such as Summary, Why it matters, Action or Key takeaway.
15. Do not include recommendations.
16. Return only the finished summary.

The summary must sound like an independent NorthAmTrack explanation, not copied regulator text.
`
        },
        {
          role:
            "user",

          content:
            `Regulator: ${cleanText(item.regulator)}\n` +
            `Article title: ${cleanEmailTitle(
              item.title,
              item.regulator
            )}\n\n` +
            `SOURCE MATERIAL:\n${sourceText.slice(
              0,
              12000
            )}\n\n` +
            "Write an original NorthAmTrack summary of this development. " +
            "Use entirely fresh wording and no more than 60 words. " +
            "Do not quote or copy the source."
        }
      ],

      max_output_tokens:
        140
    });

  let summary =
    cleanText(
      response.output_text
    );

  /*
    Safety net:
    remove quotation marks if any appear.
  */
  summary =
    summary
      .replace(/[“”"]/g, "")
      .replace(/[‘’]/g, "'")
      .trim();

  /*
    Hard maximum of 60 words.
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
        .join(" ");

    summary =
      summary
        .replace(
          /[,:;–—-]+$/,
          ""
        )
        .trim();

    if (
      !/[.!?]$/.test(summary)
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
        "✓ Summary generated"
      );

    } catch (error) {
      console.warn(
        `Summary generation failed for "${item.title}": ${error.message}`
      );

      /*
        If AI fails, do NOT dump the raw
        full_text into the email.
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
   BUILD ARTICLE HTML
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
      ) ||
      "Please review the official regulatory release for further information."
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
   SEND EMAIL
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
        <meta
          charset="UTF-8"
        />

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
      "\nGenerating original 60-word summaries...\n"
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
