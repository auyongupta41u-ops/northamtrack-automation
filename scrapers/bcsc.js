const puppeteer = require("puppeteer");

const {
  upsertRegulatoryUpdates
} = require("../services/database");

const {
  generateEnhancedSummary
} = require("../summarizer-enhanced");

const NEWS_URL =
  "https://www.bcsc.bc.ca/about/media-room/news-releases";

const MAX_ARTICLES = 10;

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

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
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
    lowerTitle.includes("alleges") ||
    lowerTitle.includes("sanction") ||
    lowerTitle.includes("penalty") ||
    lowerTitle.includes("fraud") ||
    lowerTitle.includes("charged") ||
    lowerTitle.includes("enforcement")
  ) {
    return "enforcement_order";
  }

  if (
    lowerTitle.includes("proposal") ||
    lowerTitle.includes("consultation") ||
    lowerTitle.includes("amendment") ||
    lowerTitle.includes("notice") ||
    lowerTitle.includes("rule")
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
    lowerTitle.includes("alleges")
  ) {
    return "MEDIUM";
  }

  if (
    lowerTitle.includes("proposal") ||
    lowerTitle.includes("amendment") ||
    lowerTitle.includes("consultation") ||
    lowerTitle.includes("rule")
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
    combinedText.includes("asset manager")
  ) {
    return 0.75;
  }

  if (
    combinedText.includes("dealer") ||
    combinedText.includes("securities") ||
    combinedText.includes("issuer") ||
    combinedText.includes("investment")
  ) {
    return 0.55;
  }

  return 0.45;
}

/**
 * Collect unique BCSC news-release links from the listing page.
 */
async function collectReleaseLinks(page) {
  console.log(
    "Opening the BCSC news releases listing page..."
  );

  await page.goto(NEWS_URL, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  await page.waitForFunction(
    () =>
      Array.from(
        document.querySelectorAll("a[href]")
      ).some((link) =>
        link.href.includes(
          "/about/media-room/news-releases/"
        )
      ),
    {
      timeout: 30000
    }
  );

  const releases = await page.evaluate(() => {
    const seenUrls = new Set();

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
        const listingUrl =
          "https://www.bcsc.bc.ca/about/media-room/news-releases";

        const normalizedUrl =
          release.source_url.replace(/\/$/, "");

        const isArticle =
          release.title &&
          release.source_url.includes(
            "/about/media-room/news-releases/"
          ) &&
          normalizedUrl !== listingUrl;

        if (
          !isArticle ||
          seenUrls.has(release.source_url)
        ) {
          return false;
        }

        seenUrls.add(release.source_url);
        return true;
      });
  });

  console.log(
    `Found ${releases.length} possible BCSC news releases.`
  );

  return releases.slice(0, MAX_ARTICLES);
}

/**
 * Open one article and extract its title, date and body.
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
    timeout: 60000
  });

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
     * Try to obtain a date from structured JSON-LD data.
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
          // Ignore invalid JSON-LD blocks.
        }
      }
    }

    /*
     * Remove elements that commonly contaminate article text.
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
      ".navigation"
    ];

    document
      .querySelectorAll(
        removableSelectors.join(",")
      )
      .forEach((element) => {
        element.remove();
      });

    /*
     * Examine several possible article containers and
     * retain the longest meaningful block.
     */
    const selectors = [
      "article",
      "main article",
      ".news-release-content",
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
     * Paragraph fallback if no article container worked.
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
      (first, second) =>
        second.length - first.length
    );

    return {
      title,
      published_date: publishedDate,
      full_text: candidateTexts[0] || ""
    };
  });

  const title =
    cleanText(extracted.title) ||
    release.title;

  const fullText =
    cleanText(extracted.full_text);

  const publishedDate =
    convertToISODate(
      extracted.published_date
    ) ||
    convertToISODate(
      release.listing_date
    );

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
 * Main BCSC scraper.
 */
async function scrapeBCSC() {
  let browser;

  try {
    console.log(
      "Starting the BCSC scraper..."
    );

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ]
    });

    const listingPage =
      await browser.newPage();

    await listingPage.setUserAgent(
      "Mozilla/5.0 (compatible; NorthAmTrack Regulatory Monitor/1.0)"
    );

    const releases =
      await collectReleaseLinks(
        listingPage
      );

    if (releases.length === 0) {
      throw new Error(
        "No BCSC news-release links were found."
      );
    }

    const articlePage =
      await browser.newPage();

    await articlePage.setUserAgent(
      "Mozilla/5.0 (compatible; NorthAmTrack Regulatory Monitor/1.0)"
    );

    const items = [];

    for (
      let index = 0;
      index < releases.length;
      index++
    ) {
      const release = releases[index];

      console.log(
        `\nProcessing BCSC article ${
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
         * Limit the amount of article text sent to the AI.
         * The complete extracted text is still stored in Supabase.
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

        const enhanced =
          await generateEnhancedSummary({
            title: article.title,
            description:
              summarizationText,
            regulator: "BCSC",
            category:
              determineCategory(
                article.title
              )
          });

        const fallbackText =
          article.full_text ||
          `BCSC news release concerning ${article.title}. Please review the official release for complete information.`;

        items.push({
          title: article.title,

          summary:
            enhanced.summary,

          full_text:
            fallbackText,

          source_url:
            article.source_url,

          /*
           * Null is preferable to inserting an incorrect
           * publication date.
           */
          published_date:
            article.published_date,

          regulator: "BCSC",

          regulator_name:
            "British Columbia Securities Commission",

          regulator_country:
            "Canada",

          category:
            determineCategory(
              article.title
            ),

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
            "BCSC",
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
        "No BCSC articles were successfully prepared."
      );
    }

    console.log(
      `\nSending ${items.length} BCSC articles to Supabase...`
    );

    const result =
      await upsertRegulatoryUpdates(
        items
      );

    console.log(
      "\nBCSC Supabase result:"
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
        `${result.failed} BCSC records failed to save.`
      );
    }

    console.log(
      "\nBCSC full-text scraping, summarization and Supabase update completed successfully."
    );
  } catch (error) {
    console.error(
      "\nBCSC scraper failed."
    );

    console.error(error.message);

    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

scrapeBCSC();
