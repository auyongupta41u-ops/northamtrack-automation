/**
 * NORTHAMTRACK ENHANCED ARTICLE SUMMARIZATION MODULE
 *
 * Generates concise 50–100 word summaries for regulatory updates.
 * Uses OpenAI when an API key is available and a safe fallback otherwise.
 */

let openai = null;

try {
  const OpenAI =
    require("openai").default ||
    require("openai");

  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  } else {
    console.warn(
      "OPENAI_API_KEY is missing. Using manual summary fallback."
    );
  }
} catch (error) {
  console.warn(
    "OpenAI module is unavailable. Using manual summary fallback."
  );

  openai = null;
}

/**
 * Remove HTML and normalize whitespace.
 */
function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Return a text segment within a rough word limit.
 */
function limitWords(text, maximumWords = 100) {
  const words = cleanText(text).split(/\s+/);

  if (words.length <= maximumWords) {
    return words.join(" ");
  }

  return `${words
    .slice(0, maximumWords)
    .join(" ")
    .replace(/[,:;]$/, "")}.`;
}

/**
 * Manual fallback when OpenAI is unavailable.
 */
function createManualSummary(
  title,
  description,
  regulator
) {
  const cleanedDescription =
    cleanText(description);

  if (cleanedDescription) {
    const summary =
      limitWords(cleanedDescription, 90);

    const wordCount =
      summary.split(/\s+/).length;

    if (wordCount >= 45) {
      return summary;
    }

    return limitWords(
      `${summary} The announcement was issued by ${regulator} and may be relevant to regulated firms, market participants and compliance teams. Readers should review the official release for the complete facts, regulatory implications and any required next steps.`,
      100
    );
  }

  return limitWords(
    `${regulator} has issued an update titled "${title}". The announcement may concern securities regulation, market conduct, enforcement, disclosure or investor protection. Regulated firms and compliance teams should review the official release to understand the underlying facts, determine whether their activities are affected and identify any actions, deadlines or monitoring requirements that may apply.`,
    100
  );
}

/**
 * Generate a concise 50–100 word article summary.
 */
async function generateSummary(
  title,
  description,
  regulator
) {
  const cleanedTitle = cleanText(title);
  const cleanedDescription =
    cleanText(description);

  if (
    openai &&
    process.env.OPENAI_API_KEY &&
    cleanedDescription
  ) {
    try {
      const response =
        await openai.responses.create({
          model: "gpt-4.1-mini",
          input: [
            {
              role: "system",
              content:
                "You are a regulatory intelligence analyst. " +
                "Write a simple, neutral summary of the regulatory development. " +
                "Paraphrase the source in your own words rather than copying sentences. " +
                "Ignore website navigation, breadcrumbs, menus, headers, footer text, location labels and other webpage clutter. " +
                "Focus only on the substantive regulatory announcement."
            },
            {
              role: "user",
              content:
                `Regulator: ${regulator}\n` +
                `Title: ${cleanedTitle}\n` +
                `Article text: ${cleanedDescription}\n\n` +
                "Write a concise summary of about 50 to 80 words. " +
                "Use plain professional English and 2 to 3 sentences. " +
                "Explain what the regulator announced or published, the main subject, and any important regulatory implication. " +
                "Do not quote the article. " +
                "Do not copy introductory wording such as 'Home / News'. " +
                "Do not invent facts or implications that are not supported by the article. " +
                "Do not include headings, bullet points or labels."
            }
          ],
          max_output_tokens: 180
        });

      const summary =
        cleanText(response.output_text);

      const wordCount =
        summary.split(/\s+/).length;

      if (
        summary &&
        wordCount >= 40 &&
        wordCount <= 110
      ) {
        return summary;
      }

      if (summary) {
        return limitWords(summary, 100);
      }
    } catch (apiError) {
      console.warn(
        `OpenAI summary failed: ${apiError.message}. Using fallback.`
      );
    }
  }

  return createManualSummary(
    cleanedTitle,
    cleanedDescription,
    regulator
  );
}

/**
 * Generate the "Why it matters" section.
 */
function generateWhyItMatters(
  title,
  description,
  regulator
) {
  const combined =
    `${title} ${description}`.toLowerCase();

  if (
    combined.includes("enforcement") ||
    combined.includes("alleges") ||
    combined.includes("fraud") ||
    combined.includes("charged") ||
    combined.includes("penalty") ||
    combined.includes("sanction") ||
    combined.includes("settlement")
  ) {
    return (
      `This ${regulator} development may indicate enforcement, conduct or supervisory risks relevant to regulated firms. ` +
      "Legal and compliance teams should consider whether similar activities, controls or governance issues could arise within their own operations."
    );
  }

  if (
    combined.includes("consultation") ||
    combined.includes("proposal") ||
    combined.includes("proposes") ||
    combined.includes("comment")
  ) {
    return (
      `This ${regulator} development may lead to future regulatory requirements or policy changes. ` +
      "Firms should assess whether the proposal could affect their products, disclosures, operations or compliance obligations."
    );
  }

  if (
    combined.includes("guidance") ||
    combined.includes("guideline") ||
    combined.includes("expectation")
  ) {
    return (
      `This ${regulator} guidance may clarify regulatory expectations for market participants. ` +
      "Relevant teams should compare the guidance with current policies, controls and operating practices to identify any gaps."
    );
  }

  if (
    combined.includes("final amendment") ||
    combined.includes("final rule") ||
    combined.includes("amendment") ||
    combined.includes("rule change")
  ) {
    return (
      `This ${regulator} development may introduce or modify regulatory requirements. ` +
      "Firms should determine whether implementation changes are needed across disclosures, systems, procedures or compliance controls."
    );
  }

  if (
    combined.includes("year in review") ||
    combined.includes("annual report") ||
    combined.includes("business plan") ||
    combined.includes("strategic plan")
  ) {
    return (
      `This ${regulator} publication provides insight into the regulator's priorities, recent work and future direction. ` +
      "It can help firms anticipate areas of regulatory focus and consider whether upcoming initiatives may affect their business or compliance planning."
    );
  }

  return (
    `This ${regulator} development may be relevant to firms operating in the Canadian securities market. ` +
    "Legal and compliance teams should review the announcement and assess whether it has any implications for their products, operations, disclosures or regulatory obligations."
  );
}

  if (
    combined.includes("rule") ||
    combined.includes("regulation") ||
    combined.includes("amendment") ||
    combined.includes("proposal") ||
    combined.includes("consultation")
  ) {
    return (
      `This ${regulator} development may change regulatory expectations or future compliance obligations. ` +
      "Affected firms should assess its scope, identify impacted policies and operations, and monitor implementation dates or further guidance."
    );
  }

  if (
    combined.includes("fund") ||
    combined.includes("investment")
  ) {
    return (
      `This update may be relevant to investment managers, funds, dealers or other market participants. ` +
      "Firms should consider whether it affects product governance, disclosure, distribution, compliance controls or investor communications."
    );
  }

  return (
    `This ${regulator} update may affect regulatory compliance, market conduct, disclosure or investor protection. ` +
    "Firms should review the source material and determine whether any operational, legal or compliance response is required."
  );
}

/**
 * Generate concise practical actions.
 */
function generateActionsNeeded(
  title,
  description,
  regulator
) {
  const combined =
    `${title} ${description}`.toLowerCase();

  if (
    combined.includes("enforcement") ||
    combined.includes("alleges") ||
    combined.includes("fraud") ||
    combined.includes("charged")
  ) {
    return [
      "1. Review the allegations or findings",
      "2. Check for similar conduct or control gaps",
      "3. Brief legal and compliance teams",
      "4. Strengthen monitoring where necessary"
    ].join("\n");
  }

  if (
    combined.includes("proposal") ||
    combined.includes("consultation")
  ) {
    return [
      "1. Review the proposal and consultation deadline",
      "2. Assess business and compliance impact",
      "3. Consider submitting comments",
      "4. Monitor the final regulatory outcome"
    ].join("\n");
  }

  return [
    `1. Review the complete ${regulator} release`,
    "2. Assess relevance to the firm",
    "3. Identify compliance or disclosure implications",
    "4. Monitor related guidance or follow-up"
  ].join("\n");
}

/**
 * Generate the complete summary object.
 */
async function generateEnhancedSummary(
  article
) {
  const {
    title = "",
    description = "",
    regulator = "Unknown"
  } = article;

  const summary =
    await generateSummary(
      title,
      description,
      regulator
    );

  return {
    summary,

    why_it_matters:
      generateWhyItMatters(
        title,
        description,
        regulator
      ),

    actions_needed:
      generateActionsNeeded(
        title,
        description,
        regulator
      ),

    summarization_version: "3.0"
  };
}

module.exports = {
  generateSummary,
  generateWhyItMatters,
  generateActionsNeeded,
  generateEnhancedSummary,
  createManualSummary,
  cleanText,
  limitWords
};
