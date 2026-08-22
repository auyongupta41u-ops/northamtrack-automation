const { createClient } = require("@supabase/supabase-js");

/* =========================================================
   ENVIRONMENT VARIABLES
========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const WEEKLY_EMAIL_RECIPIENTS = process.env.WEEKLY_EMAIL_RECIPIENTS;
const GROQ_API_KEY = process.env.GROQ_API_KEY;


/* =========================================================
   CHECK REQUIRED VARIABLES
========================================================= */

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is missing.");
}

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is missing.");
}

if (!RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is missing.");
}

if (!WEEKLY_EMAIL_RECIPIENTS) {
  throw new Error("WEEKLY_EMAIL_RECIPIENTS is missing.");
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


/* =========================================================
   CLEAN TITLE
========================================================= */

function cleanEmailTitle(title = "", regulator = "") {
  let cleanedTitle = cleanText(title);
  const cleanedRegulator = cleanText(regulator);

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
   DATE FORMAT
========================================================= */

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


function getWeekEndingLabel() {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  ).format(new Date());
}


/* =========================================================
   FETCH LAST 7 DAYS FROM SUPABASE
========================================================= */

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

  const { data, error } =
    await supabase
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
   CHOOSE BEST SOURCE TEXT
========================================================= */

function getSourceText(item) {

  const fullText =
    cleanText(item.full_text);

  const existingSummary =
    cleanText(item.summary);

  /*
    Prefer full article text.

    If full text isn't available, use the
    existing stored summary as context.

    Title is the final fallback.
  */

  if (fullText.length > 100) {
    return fullText;
  }

  if (existingSummary.length > 50) {
    return existingSummary;
  }

  return cleanText(item.title);
}


/* =========================================================
   GROQ SUMMARY
========================================================= */

async function generateDigestSummary(item) {

  const sourceText =
    getSourceText(item);

  const title =
    cleanEmailTitle(
      item.title,
      item.regulator
    );

  const regulator =
    cleanText(
      item.regulator_name ||
      item.regulator
    );

  const prompt = `
You are preparing a short regulatory news summary for NorthAmTrack.

ARTICLE TITLE:
${title}

REGULATOR:
${regulator}

SOURCE MATERIAL:
${sourceText.slice(0, 12000)}

TASK:

Read and understand the source material.

Write ONE concise factual paragraph explaining the regulatory development in your own words.

STRICT RULES:

1. Maximum 60 words.

2. Rewrite the information entirely in your own words.

3. Do NOT copy sentences from the source.

4. Do NOT reproduce quotations.

5. Do NOT use quotation marks.

6. Do NOT reproduce website navigation text such as:
   Home
   News
   About
   Breadcrumbs
   Menu labels
   Page headings

7. Do NOT start with phrases such as:
   "This article says"
   "The release states"
   "According to the article"
   "Please review"
   "For further information"

8. Do NOT include a heading.

9. Do NOT repeat the article title.

10. Do NOT give legal advice.

11. Do NOT invent information.

12. Focus on:
    - what happened;
    - who or what is affected;
    - the main regulatory development.

13. Use clear professional English understandable by a legal or compliance professional.

Return ONLY the final summary paragraph.
`;


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

        body: JSON.stringify({

          model:
            "openai/gpt-oss-20b",

          messages: [
            {
              role: "user",
              content: prompt
            }
          ],

          /*
            Important for GPT-OSS on Groq:
            don't return reasoning.
          */
          include_reasoning: false,

          /*
            Summarization is straightforward,
            so low reasoning is enough.
          */
          reasoning_effort: "low",

          temperature: 0.3,

          max_completion_tokens: 250,

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

  } catch (error) {

    throw new Error(
      `Groq returned invalid JSON: ${rawResponse.slice(0, 500)}`
    );
  }


  if (!response.ok) {

    throw new Error(
      `Groq API ${response.status}: ${rawResponse.slice(0, 1000)}`
    );
  }


  /*
    Get final answer
  */

  let summary =
    cleanText(
      result?.choices?.[0]
        ?.message?.content
    );


  /*
    Debugging information if Groq
    unexpectedly gives no final answer.
  */

  if (!summary) {

    console.error(
      "Groq returned no content."
    );

    console.error(
      "Finish reason:",
      result?.choices?.[0]
        ?.finish_reason
    );

    console.error(
      "Response:",
      JSON.stringify(result).slice(
        0,
        2000
      )
    );

    throw new Error(
      "Groq returned an empty final summary."
    );
  }


  /* =====================================================
     CLEAN GROQ OUTPUT
  ===================================================== */

  summary =
    summary
      .replace(/^summary\s*:\s*/i, "")
      .replace(/^final summary\s*:\s*/i, "")
      .replace(/[“”"]/g, "")
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();


  /*
    Remove bullet if model adds one.
  */

  summary =
    summary.replace(
      /^[•\-–—]\s*/,
      ""
    );


  /*
    HARD 60 WORD LIMIT
  */

  const words =
    summary
      .split(/\s+/)
      .filter(Boolean);


  if (words.length > 60) {

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
      !/[.!?]$/.test(summary)
    ) {
      summary += ".";
    }
  }


  return summary;
}


/* =========================================================
   GENERATE ALL SUMMARIES
========================================================= */

async function createDigestItems(items) {

  const results = [];


  for (
    let index = 0;
    index < items.length;
    index++
  ) {

    const item =
      items[index];


    console.log(
      `\nGenerating summary ${index + 1} of ${items.length}: ${item.title}`
    );


    try {

      const summary =
        await generateDigestSummary(
          item
        );


      console.log(
        "✓ Groq summary generated"
      );


      console.log(
        `  ${summary}`
      );


      results.push({
        ...item,

        title:
          cleanEmailTitle(
            item.title,
            item.regulator
          ),

        digest_summary:
          summary
      });


    } catch (error) {

      console.error(
        `✗ Summary generation failed for "${item.title}"`
      );

      console.error(
        error.message
      );


      /*
        We deliberately DO NOT put raw scraped
        text into the email if AI fails.
      */

      results.push({
        ...item,

        title:
          cleanEmailTitle(
            item.title,
            item.regulator
          ),

        digest_summary:
          "Please review the official regulatory release for further information."
      });
    }
  }


  return results;
}


/* =========================================================
   BUILD EACH EMAIL ARTICLE
========================================================= */

function buildArticleHtml(item) {

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
    escapeHtml(
      formatDate(
        item.published_date
      )
    );


  const summary =
    escapeHtml(
      cleanText(
        item.digest_summary
      )
    );


  const url =
    escapeHtml(
      cleanText(
        item.source_url
      )
    );


  /*
    If regulator is already present at
    the end of title, don't duplicate it.
  */

  let displayTitle =
    title;


  if (regulator) {

    const lowerTitle =
      title.toLowerCase();

    const suffix =
      `| ${regulator}`.toLowerCase();


    if (
      !lowerTitle.endsWith(
        suffix
      )
    ) {

      displayTitle =
        `${title} | ${regulator}`;
    }
  }


  return `
    <div
      style="
        margin-bottom:32px;
        padding-bottom:28px;
        border-bottom:1px solid #dddddd;
      "
    >

      <div
        style="
          font-size:17px;
          font-weight:700;
          line-height:1.45;
          color:#222222;
          margin-bottom:10px;
        "
      >
        ${displayTitle}
      </div>


      <div
        style="
          font-size:13px;
          color:#777777;
          margin-bottom:16px;
        "
      >
        ${date}
      </div>


      <div
        style="
          font-size:15px;
          line-height:1.65;
          color:#333333;
          margin-bottom:16px;
        "
      >
        ${summary}
      </div>


      <div
        style="
          font-size:14px;
          line-height:1.5;
          color:#222222;
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
   BUILD EMAIL
========================================================= */

function buildEmailHtml(items) {

  const weekEnding =
    getWeekEndingLabel();


  const articles =
    items
      .map(
        buildArticleHtml
      )
      .join("");


  return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

</head>


<body
  style="
    margin:0;
    padding:0;
    background:#f4f4f4;
    font-family:Arial, Helvetica, sans-serif;
  "
>


<div
  style="
    max-width:760px;
    margin:0 auto;
    background:#ffffff;
    padding:36px;
  "
>


  <div
    style="
      font-size:26px;
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
      margin-bottom:30px;
    "
  >
    Regulatory Intelligence
  </div>


  <div
    style="
      font-size:20px;
      font-weight:700;
      color:#222222;
      margin-bottom:8px;
    "
  >
    Weekly Regulatory Digest
  </div>


  <div
    style="
      font-size:13px;
      color:#777777;
      margin-bottom:30px;
    "
  >
    Week ending ${escapeHtml(weekEnding)}
  </div>


  ${articles}


  <div
    style="
      margin-top:25px;
      padding-top:18px;
      border-top:1px solid #dddddd;
      font-size:12px;
      line-height:1.6;
      color:#777777;
    "
  >

    NorthAmTrack automatically compiles this
    regulatory digest.

    Please refer to the linked regulator
    publication for the authoritative source.

  </div>


</div>


</body>

</html>
`;
}


/* =========================================================
   SEND EMAIL THROUGH RESEND
========================================================= */

async function sendEmail(items) {

  const recipients =
    WEEKLY_EMAIL_RECIPIENTS
      .split(",")
      .map(
        email =>
          email.trim()
      )
      .filter(Boolean);


  if (
    recipients.length === 0
  ) {

    throw new Error(
      "No valid WEEKLY_EMAIL_RECIPIENTS found."
    );
  }


  const weekEnding =
    getWeekEndingLabel();


  const subject =
    `NorthAmTrack Weekly Regulatory Digest – ${weekEnding}`;


  const html =
    buildEmailHtml(
      items
    );


  console.log(
    `\nSending digest to ${recipients.length} recipient(s)...`
  );


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
              "NorthAmTrack <digest@updates.northamtrack.in>",

            to:
              recipients,

            subject,

            html
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

    result = {
      raw:
        rawResponse
    };
  }


  if (!response.ok) {

    throw new Error(
      `Resend error ${response.status}: ${JSON.stringify(result)}`
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
   MAIN
========================================================= */

async function run() {

  try {

    console.log(
      "\n=============================="
    );

    console.log(
      "NORTHAMTRACK WEEKLY DIGEST"
    );

    console.log(
      "==============================\n"
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
        "No regulatory updates found."
      );

      console.log(
        "No email will be sent."
      );

      return;
    }


    console.log(
      "\nGenerating Groq summaries..."
    );


    const digestItems =
      await createDigestItems(
        items
      );


    const successful =
      digestItems.filter(
        item =>
          item.digest_summary !==
          "Please review the official regulatory release for further information."
      ).length;


    const failed =
      digestItems.length -
      successful;


    console.log(
      "\nSummary generation complete."
    );

    console.log(
      `Successful: ${successful}`
    );

    console.log(
      `Failed: ${failed}`
    );


    console.log(
      "\nSending weekly digest..."
    );


    await sendEmail(
      digestItems
    );


    console.log(
      "\n=============================="
    );

    console.log(
      "DONE"
    );

    console.log(
      "==============================\n"
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
