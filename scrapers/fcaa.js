const puppeteer = require("puppeteer");

const {
  upsertRegulatoryUpdates
} = require("../services/database");

const {
  generateEnhancedSummary
} = require("../summarizer-enhanced");

const NEWS_URL =
  "https://fcaa.gov.sk.ca/whats-new/fcaa-news-releases";

const MAX_ARTICLES = 15;

function cleanText(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function convertToISODate(value) {
  if (!value) {
    return null;
  }

  const cleanedValue = cleanText(value);
  const parsedDate = new Date(cleanedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const maximumAllowedDate = new Date();

  maximumAllowedDate.setDate(
    maximumAllowedDate.getDate() + 1
  );

  maximumAllowedDate.setHours(
    23,
    59,
    59,
    999
  );

  if (
    parsedDate.getTime() >
    maximumAllowedDate.getTime()
  ) {
    console.warn(
      `Rejected future FCAA publication date: ${cleanedValue}`
    );

    return null;
  }

  return parsedDate.toISOString();
}

function determineCategory(title = "") {
  const lowerTitle =
    title.toLowerCase();

  if (
    lowerTitle.includes("investor alert") ||
    lowerTitle.includes("consumer alert") ||
    lowerTitle.includes("fraud") ||
    lowerTitle.includes("scam") ||
    lowerTitle.includes("sanction") ||
    lowerTitle.includes("penalty") ||
    lowerTitle.includes("settlement") ||
    lowerTitle.includes("not registered")
  ) {
    return "enforcement_order";
  }

  if (
    lowerTitle.includes("consultation") ||
    lowerTitle.includes("proposal") ||
    lowerTitle.includes("proposes") ||
    lowerTitle.includes("guidance") ||
    lowerTitle.includes("amendment") ||
    lowerTitle.includes("notice")
  ) {
    return "regulatory_notice";
  }

  return "news";
}

function determineImpactRating(
  title = ""
) {
  const lowerTitle =
    title.toLowerCase();

  if (
    lowerTitle.includes("investor alert") ||
    lowerTitle.includes("consumer alert") ||
    lowerTitle.includes("fraud") ||
    lowerTitle.includes("scam") ||
    lowerTitle.includes("penalty") ||
    lowerTitle.includes("sanction")
  ) {
    return "MEDIUM";
  }

  if (
    lowerTitle.includes("guidance") ||
    lowerTitle.includes("proposal") ||
    lowerTitle.includes("consultation") ||
    lowerTitle.includes("amendment")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function determineMutualFundRelevance(
  title = "",
  fullText = ""
) {
  const combined =
    `${title} ${fullText}`.toLowerCase();

  if (
    combined.includes("mutual fund") ||
    combined.includes("investment fund") ||
    combined.includes(
      "exchange-traded fund"
    ) ||
    combined.includes("etf") ||
    combined.includes(
      "portfolio manager"
    ) ||
    combined.includes("fund manager") ||
    combined.includes("asset manager")
  ) {
    return 0.75;
  }

  if (
    combined.includes("dealer") ||
    combined.includes("registrant") ||
    combined.includes("securities") ||
    combined.includes("investment") ||
    combined.includes("issuer") ||
    combined.includes("capital market")
  ) {
    return 0.55;
  }

  return 0.45;
}

async function configurePage(page) {
  await page.setViewport({
    width: 1366,
    height: 768
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/138.0.0.0 Safari/537.36"
  );

  await page.setExtraHTTPHeaders({
    "accept-language":
      "en-CA,en-US;q=0.9,en;q=0.8"
  });
}

async function collectReleaseLinks(page) {
  console.log(
    "Opening official FCAA News Releases page..."
  );

  await page.goto(
    NEWS_URL,
    {
      waitUntil: "networkidle2",
      timeout: 90000
    }
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });

  console.log(
    "FCAA News Releases page loaded."
  );

  const releases =
    await page.evaluate(() => {
      const clean = (value = "") =>
        String(value)
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const dateRegex =
        /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},\s+\d{4}\b/i;

      const seen =
        new Set();

      const results = [];

      const links =
        Array.from(
          document.querySelectorAll(
            "a[href]"
          )
        );

      for (const link of links) {
        const title =
          clean(link.textContent);

        if (
          !title ||
          title.length < 20
        ) {
          continue;
        }

        let url;

        try {
          url =
            new URL(link.href);
        } catch {
          continue;
        }

        /*
         * Current FCAA news releases link
         * to Government of Saskatchewan
         * News and Media pages.
         */
        const host =
          url.hostname
            .toLowerCase();

        const path =
          url.pathname
            .toLowerCase();

        const validHost =
          host ===
            "www.saskatchewan.ca" ||
          host ===
            "saskatchewan.ca";

        const validArticlePath =
          path.startsWith(
            "/government/news-and-media/"
          );

        if (
          !validHost ||
          !validArticlePath
        ) {
          continue;
        }

        /*
         * Confirm that this link appears
         * beside a publication date on
         * the FCAA News Releases page.
         */
        let container =
          link.parentElement;

        let listingDate = "";

        let attempts = 0;

        while (
          container &&
          attempts < 5
        ) {
          const text =
            clean(
              container.innerText ||
              container.textContent
            );

          const match =
            text.match(dateRegex);

          if (match) {
            listingDate =
              match[0];
            break;
          }

          container =
            container.parentElement;

          attempts++;
        }

        /*
         * No date nearby means this is
         * probably navigation/footer content,
         * not a release listed by FCAA.
         */
        if (!listingDate) {
          continue;
        }

        const normalizedUrl =
          url.href.split("#")[0];

        if (
          seen.has(normalizedUrl)
        ) {
          continue;
        }

        seen.add(
          normalizedUrl
        );

        results.push({
          title,
          source_url:
            normalizedUrl,
          listing_date:
            listingDate
        });
      }

      return results;
    });

  console.log(
    `Found ${releases.length} FCAA news releases.`
  );

  releases
    .slice(0, MAX_ARTICLES)
    .forEach(
      (release, index) => {
        console.log(
          `\n${index + 1}. ${release.title}`
        );

        console.log(
          `Date: ${release.listing_date}`
        );

        console.log(
          release.source_url
        );
      }
    );

  return releases.slice(
    0,
    MAX_ARTICLES
  );
}

async function extractArticle(
  page,
  release
) {
  console.log(
    `\nOpening FCAA article: ${release.title}`
  );

  await page.goto(
    release.source_url,
    {
      waitUntil:
        "networkidle2",
      timeout: 90000
    }
  );

  await new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        2000
      );
    }
  );

  const extracted =
    await page.evaluate(() => {
      const clean =
        (value = "") =>
          String(value)
            .replace(
              /\u00a0/g,
              " "
            )
            .replace(
              /\s+/g,
              " "
            )
            .trim();

      const h1 =
        clean(
          document.querySelector(
            "h1"
          )?.textContent
        );

      const title =
        h1 || "";

      let publishedDate = "";

      /*
       * Government of Saskatchewan
       * pages display:
       * "Released on August 5, 2026"
       */
      const bodyText =
        clean(
          document.body
            ?.innerText
        );

      const releasedMatch =
        bodyText.match(
          /Released on\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})/i
        );

      if (releasedMatch) {
        publishedDate =
          releasedMatch[1];
      }

      if (!publishedDate) {
        const metaDate =
          document.querySelector(
            'meta[property="article:published_time"]'
          ) ||
          document.querySelector(
            'meta[name="date"]'
          ) ||
          document.querySelector(
            'meta[name="publication_date"]'
          );

        if (metaDate) {
          publishedDate =
            metaDate.getAttribute(
              "content"
            ) || "";
        }
      }

      /*
       * Remove website navigation before
       * extracting substantive article text.
       */
      [
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
        ".navigation",
        ".menu",
        ".sidebar",
        ".social-share"
      ].forEach(
        (selector) => {
          document
            .querySelectorAll(
              selector
            )
            .forEach(
              (element) => {
                element.remove();
              }
            );
        }
      );

      const paragraphs =
        Array.from(
          document.querySelectorAll(
            "main p, article p"
          )
        )
          .map(
            (paragraph) =>
              clean(
                paragraph
                  .textContent
              )
          )
          .filter(
            (text) =>
              text.length >= 25
          );

      let fullText =
        paragraphs.join(" ");

      /*
       * Fallback if the page structure changes.
       */
      if (
        fullText.length < 200
      ) {
        const main =
          document.querySelector(
            "main"
          ) ||
          document.querySelector(
            "article"
          );

        fullText =
          clean(
            main?.innerText ||
            main?.textContent
          );
      }

      return {
        title,
        published_date:
          publishedDate,
        full_text:
          fullText
      };
    });

  const extractedTitle =
    cleanText(
      extracted.title
    );

  const listingTitle =
    cleanText(
      release.title
    );

  const title =
    extractedTitle &&
    extractedTitle.length >= 15
      ? extractedTitle
      : listingTitle;

  const fullText =
    cleanText(
      extracted.full_text
    );

  const articleDate =
    convertToISODate(
      extracted.published_date
    );

  const listingDate =
    convertToISODate(
      release.listing_date
    );

  const publishedDate =
    articleDate ||
    listingDate ||
    new Date().toISOString();

  console.log(
    `Extracted ${fullText.length} characters.`
  );

  console.log(
    `Publication date: ${publishedDate}`
  );

  return {
    title,
    source_url:
      release.source_url,
    published_date:
      publishedDate,
    full_text:
      fullText
  };
}

async function run() {
  let browser;

  try {
    console.log(
      "================================"
    );

    console.log(
      "FCAA PRODUCTION SCRAPER"
    );

    console.log(
      "Official FCAA News Releases only"
    );

    console.log(
      "================================\n"
    );

    browser =
      await puppeteer.launch({
        headless: true,

        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage"
        ]
      });

    const listingPage =
      await browser.newPage();

    await configurePage(
      listingPage
    );

    const releases =
      await collectReleaseLinks(
        listingPage
      );

    if (
      releases.length === 0
    ) {
      throw new Error(
        "No FCAA news releases were found."
      );
    }

    const articlePage =
      await browser.newPage();

    await configurePage(
      articlePage
    );

    const items = [];

    for (
      let index = 0;
      index <
      releases.length;
      index++
    ) {
      const release =
        releases[index];

      console.log(
        `\nProcessing FCAA article ${
          index + 1
        } of ${
          releases.length
        }`
      );

      try {
        const article =
          await extractArticle(
            articlePage,
            release
          );

        const category =
          determineCategory(
            article.title
          );

        const summarizationText =
          article.full_text
            ? article.full_text.slice(
                0,
                15000
              )
            : article.title;

        console.log(
          "Generating FCAA enhanced summary..."
        );

        const enhanced =
          await generateEnhancedSummary({
            title:
              article.title,

            description:
              summarizationText,

            regulator:
              "FCAA",

            category
          });

        const fallbackFullText =
          article.full_text ||
          `FCAA news release concerning ${article.title}. Please review the official release for complete information.`;

        items.push({
          title:
            article.title,

          summary:
            enhanced.summary,

          full_text:
            fallbackFullText,

          source_url:
            article.source_url,

          published_date:
            article.published_date,

          regulator:
            "FCAA",

          regulator_name:
            "Financial and Consumer Affairs Authority of Saskatchewan",

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
            "FCAA",
            "Saskatchewan",
            "News Release"
          ],

          summarization_version:
            enhanced.summarization_version
        });

        console.log(
          `Prepared: ${article.title}`
        );
      } catch (
        articleError
      ) {
        console.error(
          `Failed to process "${release.title}": ${articleError.message}`
        );
      }
    }

    if (
      items.length === 0
    ) {
      throw new Error(
        "No FCAA articles were successfully prepared."
      );
    }

    console.log(
      `\nSending ${items.length} FCAA articles to Supabase...`
    );

    const result =
      await upsertRegulatoryUpdates(
        items
      );

    console.log(
      "\nFCAA Supabase result:"
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

    if (
      result.failed > 0
    ) {
      throw new Error(
        `${result.failed} FCAA records failed to save.`
      );
    }

    console.log(
      "\nFCAA production scraper completed successfully."
    );
  } catch (error) {
    console.error(
      "\nFCAA production scraper failed."
    );

    console.error(
      error.stack ||
      error.message
    );

    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

run();
