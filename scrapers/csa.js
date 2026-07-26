const puppeteer = require("puppeteer");

const {
  upsertRegulatoryUpdates
} = require("../services/database");

const {
  generateEnhancedSummary
} = require("../summarizer-enhanced");

const NEWS_URL =
  "https://www.securities-administrators.ca/news/";

const MAX_ARTICLES = 15;

/**
 * Clean extracted webpage text.
 */
function cleanText(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert a date value into ISO format.
 * Returns null when the date cannot be parsed.
 */
function convertToISODate(value) {
  if (!value) {
    return null;
  }

  const cleanedValue = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parsedDate = new Date(cleanedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  /*
   * Reject dates that are more than one day in the future.
   * This prevents implementation dates, consultation deadlines
   * and event dates from being saved as publication dates.
   */
  const tomorrow = new Date();

  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  if (parsedDate.getTime() > tomorrow.getTime()) {
    console.warn(
      `Rejected future publication date: ${cleanedValue}`
    );

    return null;
  }

  return parsedDate.toISOString();
}

/**
 * Determine a basic category from the article title.
 */
function determineCategory(title = "") {
  const lowerTitle = title.toLowerCase();

  if (
    lowerTitle.includes("fraud") ||
    lowerTitle.includes("enforcement") ||
    lowerTitle.includes("sanction") ||
    lowerTitle.includes("penalty") ||
    lowerTitle.includes("charged") ||
    lowerTitle.includes("alleges")
  ) {
    return "enforcement_order";
  }

  if (
    lowerTitle.includes("proposal") ||
    lowerTitle.includes("consultation") ||
    lowerTitle.includes("amendment") ||
    lowerTitle.includes("notice") ||
    lowerTitle.includes("rule") ||
    lowerTitle.includes("guidance")
  ) {
    return "regulatory_notice";
  }

  return "news";
}

/**
 * Assign a basic initial impact rating.
 */
function determineImpactRating(title = "") {
  const lowerTitle = title.toLowerCase();

  if (
    lowerTitle.includes("fraud") ||
    lowerTitle.includes("penalty") ||
    lowerTitle.includes("sanction") ||
    lowerTitle.includes("charged") ||
    lowerTitle.includes("alleges") ||
    lowerTitle.includes("final amendments")
  ) {
    return "MEDIUM";
  }

  if (
    lowerTitle.includes("proposal") ||
    lowerTitle.includes("amendment") ||
    lowerTitle.includes("consultation") ||
    lowerTitle.includes("rule") ||
    lowerTitle.includes("guidance")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

/**
 * Assign a basic mutual-fund relevance score.
 */
function determineMutualFundRelevance(
  title = "",
  fullText = ""
) {
  const combinedText =
    `${title} ${fullText}`.toLowerCase();

  if (
    combinedText.includes("mutual fund") ||
    combinedText.includes("investment fund") ||
    combinedText.includes("fund manager") ||
    combinedText.includes("asset manager") ||
    combinedText.includes("principal distributor")
  ) {
    return 0.75;
  }

  if (
    combinedText.includes("dealer") ||
    combinedText.includes("securities") ||
    combinedText.includes("issuer") ||
    combinedText.includes("investment") ||
    combinedText.includes("registrant")
  ) {
    return 0.55;
  }

  return 0.45;
}

/**
 * Collect unique CSA news links from the official listing page.
 */
async function collectReleaseLinks(page) {
  console.log(
    "Opening the official CSA news listing page..."
  );

  await page.goto(NEWS_URL, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });

  await new Promise((resolve) =>
    setTimeout(resolve, 5000)
  );

  const releases = await page.evaluate(() => {
    const seenUrls = new Set();

    const listingUrl =
      "https://www.securities-administrators.ca/news";

    return Array.from(
      document.querySelectorAll("a[href]")
    )
      .map((link) => {
        const container =
          link.closest("article") ||
          link.closest("li") ||
          link.closest("div");

        const dateElement =
          container?.querySelector("time") ||
          container?.querySelector(".date") ||
          container?.querySelector(
            '[class*="date"]'
          );

        return {
          title: link.textContent
            .replace(/\s+/g, " ")
            .trim(),

          source_url: link.href,

          listing_date:
            dateElement?.getAttribute(
              "datetime"
            ) ||
            dateElement?.textContent
              ?.replace(/\s+/g, " ")
              .trim() ||
            ""
        };
      })
      .filter((release) => {
        const normalizedUrl =
          release.source_url
            .split("#")[0]
            .replace(/\/$/, "");

        const isArticle =
          release.title &&
          release.title.length >= 15 &&
          normalizedUrl.startsWith(
            `${listingUrl}/`
          ) &&
          normalizedUrl !== listingUrl &&
          !release.source_url.includes("#") &&
          release.title.toLowerCase() !==
            "skip to content";

        if (
          !isArticle ||
          seenUrls.has(normalizedUrl)
        ) {
          return false;
        }

        release.source_url =
          `${normalizedUrl}/`;

        seenUrls.add(normalizedUrl);

        return true;
      });
  });

  console.log(
    `Found ${releases.length} possible CSA news articles.`
  );

  return releases.slice(0, MAX_ARTICLES);
}

/**
 * Open one CSA article and extract its title, date and body.
 */
async function extractArticle(
  articlePage,
  release
) {
  console.log(
    `\nOpening article: ${release.title}`
  );

  await articlePage.goto(release.source_url, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });

  await new Promise((resolve) =>
    setTimeout(resolve, 2000)
  );

  try {
    await articlePage.waitForSelector(
      "h1, article, main",
      {
        timeout: 20000
      }
    );
  } catch (error) {
    console.warn(
      "Main article selector was not detected. Attempting fallback extraction."
    );
  }
  const extracted = await articlePage.evaluate(() => {
    function normalize(value = "") {
      return String(value)
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const title =
      normalize(
        document.querySelector("h1")
          ?.textContent
      ) ||
      normalize(document.title);

    /*
     * Try several common date locations.
     */
    const dateElement =
      document.querySelector(
        'meta[property="article:published_time"]'
      ) ||
      document.querySelector(
        'meta[name="date"]'
      ) ||
      document.querySelector(
        'meta[name="publication_date"]'
      ) ||
      document.querySelector("time") ||
      document.querySelector(".date") ||
      document.querySelector(
        '[class*="publish-date"]'
      ) ||
      document.querySelector(
        '[class*="publication-date"]'
      ) ||
      document.querySelector(
        '[class*="date"]'
      );

    let publishedDate = "";

    if (dateElement) {
      publishedDate =
        dateElement.getAttribute("content") ||
        dateElement.getAttribute("datetime") ||
        normalize(dateElement.textContent);
    }

    /*
     * Try to obtain a date from JSON-LD.
     */
    if (!publishedDate) {
      const jsonLdScripts =
        Array.from(
          document.querySelectorAll(
            'script[type="application/ld+json"]'
          )
        );

      for (const script of jsonLdScripts) {
        try {
          const parsed = JSON.parse(
            script.textContent
          );

          const entries =
            Array.isArray(parsed)
              ? parsed
              : [parsed];

          for (const entry of entries) {
            const candidate =
              entry?.datePublished ||
              entry?.dateCreated ||
              entry?.dateModified;

            if (candidate) {
              publishedDate = candidate;
              break;
            }
          }

          if (publishedDate) {
            break;
          }
        } catch (error) {
          // Ignore invalid JSON-LD
        }
      }
    }

    /*
     * Remove unnecessary page elements.
     */
    const removableSelectors = [
      "script",
      "style",
      "nav",
      "footer",
      "header",
      "aside",
      "form",
      "button",
      ".breadcrumb",
      ".breadcrumbs",
      ".social-share",
      ".share",
      ".related-content",
      ".navigation",
      ".menu",
      ".search-form"
    ];

    document
      .querySelectorAll(
        removableSelectors.join(",")
      )
      .forEach((element) => {
        element.remove();
      });

    /*
     * Try multiple article containers.
     */
    const selectors = [
      "article",
      "main article",
      ".entry-content",
      ".post-content",
      ".news-content",
      ".article-content",
      ".page-content",
      ".content-body",
      ".rich-text",
      ".main-content",
      "main"
    ];

    const candidateTexts = [];

    for (const selector of selectors) {
      document
        .querySelectorAll(selector)
        .forEach((element) => {
          const text = normalize(
            element.innerText ||
            element.textContent
          );

          if (text.length >= 200) {
            candidateTexts.push(text);
          }
        });
    }

    /*
     * Paragraph fallback.
     */
    const paragraphText =
      Array.from(
        document.querySelectorAll("p")
      )
        .map((paragraph) =>
          normalize(paragraph.textContent)
        )
        .filter(
          (paragraph) =>
            paragraph.length >= 30
        )
        .join(" ");

    if (paragraphText.length >= 200) {
      candidateTexts.push(paragraphText);
    }

    candidateTexts.sort(
      (a, b) => b.length - a.length
    );

    const fullText =
      candidateTexts[0] || "";

    
    return {
      title,
      published_date: publishedDate,
      full_text: fullText
    };
  });

  const title =
    cleanText(extracted.title) ||
    release.title;

  const fullText =
    cleanText(extracted.full_text);

 const articlePublishedDate =
  convertToISODate(
    extracted.published_date
  );

const listingPublishedDate =
  convertToISODate(
    release.listing_date
  );

const publishedDate =
  articlePublishedDate ||
  listingPublishedDate ||
  new Date().toISOString();

if (!articlePublishedDate && listingPublishedDate) {
  console.log(
    "Using the date extracted from the CSA news listing."
  );
}

if (!articlePublishedDate && !listingPublishedDate) {
  console.warn(
    "No valid publication date was found. Using the scraper run date."
  );
}

  console.log(
    `Extracted ${fullText.length} characters.`
  );

  console.log(
    `Publication date: ${
      publishedDate || "Not found"
    }`
  );

  return {
    title,
    source_url: release.source_url,
    published_date: publishedDate,
    full_text: fullText
  };
}
/**
 * Main CSA scraper.
 */
async function scrapeCSA() {
  let browser;

  try {
    console.log(
      "Starting the CSA scraper..."
    );

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const listingPage =
      await browser.newPage();

    await listingPage.setViewport({
      width: 1366,
      height: 768
    });

    await listingPage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/131.0.0.0 Safari/537.36"
    );

    await listingPage.setExtraHTTPHeaders({
      "accept-language":
        "en-CA,en-US;q=0.9,en;q=0.8"
    });

    const releases =
      await collectReleaseLinks(
        listingPage
      );

    if (releases.length === 0) {
      throw new Error(
        "No CSA news links were found."
      );
    }

    const articlePage =
      await browser.newPage();

    await articlePage.setViewport({
      width: 1366,
      height: 768
    });

    await articlePage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/131.0.0.0 Safari/537.36"
    );

    await articlePage.setExtraHTTPHeaders({
      "accept-language":
        "en-CA,en-US;q=0.9,en;q=0.8"
    });

    const items = [];

    for (
      let index = 0;
      index < releases.length;
      index++
    ) {
      const release = releases[index];

      console.log(
        `\nProcessing CSA article ${
          index + 1
        } of ${releases.length}`
      );

      try {
        const article =
          await extractArticle(
            articlePage,
            release
          );

        /*
         * Limit the amount of text sent to the AI.
         * The complete text is still stored in Supabase.
         */
        const summarizationText =
          article.full_text
            ? article.full_text.slice(
                0,
                15000
              )
            : article.title;

        console.log(
          "Generating 50–100 word summary..."
        );

        const category =
          determineCategory(
            article.title
          );

        const enhanced =
          await generateEnhancedSummary({
            title: article.title,
            description:
              summarizationText,
            regulator: "CSA",
            category
          });

        const fallbackText =
          article.full_text ||
          `CSA news release concerning ${article.title}. Please review the official release for complete information.`;

        items.push({
          title: article.title,

          summary:
            enhanced.summary,

          full_text:
            fallbackText,

          source_url:
            article.source_url,

          published_date:
            article.published_date,

          regulator: "CSA",

          regulator_name:
            "Canadian Securities Administrators",

          regulator_country:
            "Canada",

          category,

          impact_rating:
            determineImpactRating(
              article.title
            ),

          mutual_fund_relevance:
            determineMutualFundRelevance(
              article.title,
              article.full_text
            ),

          why_it_matters:
            enhanced.why_it_matters,

          actions_needed:
            enhanced.actions_needed,

          tags: [
            "CSA",
            "News Release"
          ],

          summarization_version:
            enhanced.summarization_version
        });

        console.log(
          `Prepared: ${article.title}`
        );
      } catch (articleError) {
        console.error(
          `Failed to process "${release.title}": ${articleError.message}`
        );
      }
    }
    if (items.length === 0) {
      throw new Error(
        "No CSA articles were successfully prepared."
      );
    }

    console.log(
      `\nSending ${items.length} CSA articles to Supabase...`
    );

    const result =
      await upsertRegulatoryUpdates(items);

    console.log(
      "\nCSA Supabase result:"
    );

    console.log(
      `Inserted: ${result.inserted}`
    );

    console.log(
      `Updated: ${result.updated}`
    );

    console.log(
      `Failed: ${result.failed}`
    );

    if (result.failed > 0) {
      throw new Error(
        `${result.failed} CSA records failed to save.`
      );
    }

    console.log(
      "\nCSA full-text scraping, summarization and Supabase update completed successfully."
    );

  } catch (error) {

    console.error(
      "\nCSA scraper failed."
    );

    console.error(
      error.stack || error.message
    );

    process.exitCode = 1;

  } finally {

    if (browser) {
      await browser.close();
    }

  }
}

scrapeCSA();
