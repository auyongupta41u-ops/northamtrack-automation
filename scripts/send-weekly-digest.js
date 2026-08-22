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

if (!OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY is missing."
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});


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


function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

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
      full_text,
      source_url,
      published_date,
      regulator,
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
      model: "gpt-4.1-mini",

      input: [
        {
          role: "system",
          content:
            "You are a regulatory intelligence analyst. " +
            "Write simple, neutral regulatory summaries in plain professional English. " +
            "Paraphrase the source rather than copying sentences."
        },
        {
          role: "user",
          content:
            `Regulator: ${item.regulator}\n` +
            `Title: ${item.title}\n` +
            `Article text: ${sourceText.slice(0, 12000)}\n\n` +
            "Write a concise summary of no more than 60 words. " +
            "Explain what happened, who was involved, and the key regulatory significance. " +
            "Do not include headings. " +
            "Do not quote the source. " +
            "Do not copy website navigation, dates, labels, breadcrumbs or boilerplate. " +
            "Do not include recommendations, actions, impact ratings or 'Why it matters'. " +
            "Return only the summary."
        }
      ],

      max_output_tokens: 120
    });

  const summary =
    cleanText(
      response.output_text
    );

  return summary;
}


async function createDigestItems(
  items
) {
  const results = [];

  for (
    let index = 0;
    index < items.length;
    index++
  ) {
    const item = items[index];

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
        `✓ Summary generated`
      );

    } catch (error) {
      console.warn(
        `Summary generation failed for "${item.title}": ${error.message}`
      );

      results.push({
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

  return results;
}


function buildArticleHtml(item) {
  const title =
    escapeHtml(
      item.title
    );

  const regulator =
    escapeHtml(
      item.regulator || ""
    );

  const date =
    formatDate(
      item.published_date
    );

  const summary =
    escapeHtml(
      item.summary ||
      "Please review the official regulatory release for further information."
    );

  const url =
    escapeHtml(
      item.source_url
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
        ${title}${regulator ? ` | ${regulator}` : ""}
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

  if (!recipients.length) {
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
            ${escapeHtml(weekEnding)}
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

    const digestItems =
      await createDigestItems(
        items
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
