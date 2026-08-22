const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY;

const RESEND_API_KEY =
  process.env.RESEND_API_KEY;

const WEEKLY_EMAIL_RECIPIENTS =
  process.env.WEEKLY_EMAIL_RECIPIENTS;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is missing.");
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

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

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

function getWeekEndingLabel() {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }
  ).format(new Date());
}

function isDecision(item) {
  const category =
    String(item.category || "")
      .toLowerCase();

  return (
    category.includes("order") ||
    category.includes("decision") ||
    category.includes("ruling")
  );
}

function buildArticleHtml(item) {
  const title =
    escapeHtml(item.title);

  const regulator =
    escapeHtml(item.regulator || "");

  const summary =
    escapeHtml(
      item.summary ||
      "Please review the official regulatory release for further information."
    );

  const url =
    escapeHtml(item.source_url);

  const date =
    formatDate(item.published_date);

  return `
    <div style="
      margin-bottom:28px;
      padding-bottom:22px;
      border-bottom:1px solid #dddddd;
    ">

      <div style="
        font-size:16px;
        font-weight:700;
        line-height:1.45;
        margin-bottom:8px;
        color:#202124;
      ">
        • ${title} | ${regulator}
      </div>

      <div style="
        font-size:13px;
        color:#666666;
        margin-bottom:12px;
      ">
        ${date}
      </div>

      <div style="
        font-size:15px;
        line-height:1.65;
        color:#333333;
        margin-bottom:12px;
      ">
        ${summary}
      </div>

      <div style="
        font-size:14px;
      ">
        For further information:
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

function buildSection(
  heading,
  items
) {
  if (!items.length) {
    return "";
  }

  return `
    <div style="margin-top:30px;">

      <div style="
        font-size:18px;
        font-weight:700;
        margin-bottom:20px;
        color:#202124;
      ">
        ${escapeHtml(heading)}
      </div>

      ${items
        .map(buildArticleHtml)
        .join("")}

    </div>
  `;
}

async function getWeeklyUpdates() {
  const now = new Date();

  const sevenDaysAgo =
    new Date(
      now.getTime() -
      7 * 24 * 60 * 60 * 1000
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
      source_url,
      published_date,
      regulator,
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

async function sendEmail(items) {
  const recipients =
    WEEKLY_EMAIL_RECIPIENTS
      .split(",")
      .map((email) =>
        email.trim()
      )
      .filter(Boolean);

  if (!recipients.length) {
    throw new Error(
      "No valid email recipients configured."
    );
  }

  const decisions =
    items.filter(isDecision);

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
      <body style="
        margin:0;
        padding:0;
        background:#f5f5f5;
        font-family:
          Arial,
          Helvetica,
          sans-serif;
      ">

        <div style="
          max-width:760px;
          margin:0 auto;
          background:#ffffff;
          padding:32px;
        ">

          <div style="
            font-size:24px;
            font-weight:700;
            margin-bottom:5px;
            color:#111111;
          ">
            NorthAmTrack
          </div>

          <div style="
            font-size:14px;
            color:#777777;
            margin-bottom:30px;
          ">
            Regulatory Intelligence Platform
          </div>

          <div style="
            font-size:20px;
            font-weight:700;
            line-height:1.4;
            margin-bottom:8px;
          ">
            Regulatory updates for the week ending
            ${escapeHtml(weekEnding)}
          </div>

          <div style="
            font-size:14px;
            color:#666666;
            margin-bottom:25px;
          ">
            ${items.length}
            regulatory development${
              items.length === 1
                ? ""
                : "s"
            } identified this week.
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

          <div style="
            margin-top:35px;
            padding-top:20px;
            border-top:1px solid #dddddd;
            font-size:12px;
            line-height:1.6;
            color:#777777;
          ">
            This digest was generated automatically
            by NorthAmTrack. Please refer to the
            linked regulator source for the
            authoritative publication.
          </div>

        </div>

      </body>
    </html>
  `;

  const subject =
    `NorthAmTrack – Regulatory updates for the week ending ${weekEnding}`;

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${RESEND_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          from:
            "NorthAmTrack Regulatory Intelligence <digest@updates.northamtrack.in>",

          to: recipients,

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
    "Weekly digest sent successfully."
  );

  console.log(
    `Email ID: ${result.id}`
  );
}

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

    if (!items.length) {
      console.log(
        "No updates found. No email will be sent."
      );

      return;
    }

    await sendEmail(items);

  } catch (error) {
    console.error(
      "Weekly digest failed."
    );

    console.error(
      error.stack ||
      error.message
    );

    process.exit(1);
  }
}

run();
