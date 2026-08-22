const { createClient } = require("@supabase/supabase-js");

const {
  generateEnhancedSummary
} = require("../summarizer-enhanced");

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY;

const RESEND_API_KEY =
  process.env.RESEND_API_KEY;

const WEEKLY_EMAIL_RECIPIENTS =
  process.env.WEEKLY_EMAIL_RECIPIENTS;


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
  Prevent headlines such as:

  Corporate insider pays BCSC... | BCSC | BCSC

  If the stored title already ends in "| BCSC",
  the email will not add BCSC again.
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
   CLASSIFICATION
========================================================= */

function isDecision(item) {
  const category =
    cleanText(
      item.category
    ).toLowerCase();

  const title =
    cleanText(
      item.title
    ).toLowerCase();

  return (
    category.includes("order") ||
    category.includes("decision") ||
    category.includes("ruling") ||
    title.includes("order") ||
    title.includes("decision") ||
    title.includes("ruling")
  );
}


/* =========================================================
   GET WEEKLY UPDATES FROM SUPABASE
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
  } =
    await supabase
      .from(
        "regulatory_updates"
      )
      .select(`
        title,
        summary,
        full_text,
        source_url,
        published_date,
        regulator,
        category,
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
   CREATE CLEAN DIGEST SUMMARIES
========================================================= */

async function createDigestSummaries(
  items
) {

  const cleanedItems = [];

  for (
    let index = 0;
    index < items.length;
    index++
  ) {

    const item =
      items[index];

    console.log(
      `Generating digest summary ${
        index + 1
      } of ${items.length}: ${
        item.title
      }`
    );

    try {

      const sourceText =
        cleanText(
          item.full_text ||
          item.summary ||
          item.title
        );

      const enhanced =
        await generateEnhancedSummary({
          title:
            cleanEmailTitle(
              item.title,
              item.regulator
            ),

          description:
            sourceText.slice(
              0,
              12000
            ),

          regulator:
            item.regulator,

          category:
            item.category
        });

      const generatedSummary =
        cleanText(
          enhanced?.summary
        );

      cleanedItems.push({
        ...item,

        title:
          cleanEmailTitle(
            item.title,
            item.regulator
          ),

        summary:
          generatedSummary ||
          cleanText(
            item.summary
          )
      });

      console.log(
        `✓ Digest summary generated: ${item.title}`
      );

    } catch (error) {

      console.warn(
        `Could not regenerate summary for "${item.title}": ${error.message}`
      );

      cleanedItems.push({
        ...item,

        title:
          cleanEmailTitle(
            item.title,
            item.regulator
          ),

        summary:
          cleanText(
            item.summary
          )
      });
    }
  }

  return cleanedItems;
}


/* =========================================================
   BUILD ONE ARTICLE
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

  const date =
    formatDate(
      item.published_date
    );

  return `
    <div
      style="
        margin-bottom:30px;
        padding-bottom:24px;
        border-bottom:1px solid #dddddd;
      "
    >

      <div
        style="
          font-size:16px;
          font-weight:700;
          line-height:1.5;
          margin-bottom:8px;
          color:#202124;
        "
      >
        • ${title}${
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
              color:#707070;
              margin-bottom:13px;
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
          line-height:1.7;
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
   BUILD SECTION
========================================================= */

function buildSection(
  heading,
  items
) {

  if (!items.length) {
    return "";
  }

  return `
    <div
      style="
        margin-top:34px;
      "
    >

      <div
        style="
          font-size:18px;
          font-weight:700;
          margin-bottom:20px;
          color:#202124;
          border-bottom:2px solid #202124;
          padding-bottom:8px;
        "
      >
        ${escapeHtml(heading)}
      </div>

      ${
        items
          .map(
            buildArticleHtml
          )
          .join("")
      }

    </div>
  `;
}


/* =========================================================
   SEND EMAIL THROUGH RESEND
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

  const decisions =
    items.filter(
      isDecision
    );

  const regulatoryUpdates =
    items.filter(
      (item) =>
        !isDecision(item)
    );

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
          background:#f4f4f4;
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
              font-size:26px;
              font-weight:700;
              color:#111111;
              margin-bottom:4px;
            "
          >
            NorthAmTrack
          </div>

          <div
            style="
              font-size:14px;
              color:#777777;
              margin-bottom:30px;
            "
          >
            Regulatory Intelligence Platform
          </div>

          <div
            style="
              font-size:21px;
              font-weight:700;
              line-height:1.4;
              margin-bottom:9px;
              color:#202124;
            "
          >
            Regulatory updates for the week ending
            ${escapeHtml(
              weekEnding
            )}
          </div>

          <div
            style="
              font-size:14px;
              color:#666666;
              line-height:1.5;
              margin-bottom:28px;
            "
          >
            ${
              items.length
            }
            regulatory development${
              items.length === 1
                ? ""
                : "s"
            }
            identified during the last seven days.
          </div>

          ${
            buildSection(
              "Regulatory Updates",
              regulatoryUpdates
            )
          }

          ${
            buildSection(
              "Orders, Rulings and Decisions",
              decisions
            )
          }

          <div
            style="
              margin-top:38px;
              padding-top:20px;
              border-top:1px solid #dddddd;
              font-size:12px;
              line-height:1.6;
              color:#777777;
            "
          >
            This regulatory digest was generated
            automatically by NorthAmTrack.

            Please refer to the linked regulator
            publication for the authoritative source
            and complete information.
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
      "\nCreating clean digest summaries...\n"
    );

    const digestItems =
      await createDigestSummaries(
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
