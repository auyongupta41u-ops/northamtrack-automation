const puppeteer = require("puppeteer");

const {
  upsertRegulatoryUpdates
} = require("../services/database");

const {
  generateEnhancedSummary
} = require("../summarizer-enhanced");

const HOME_URL = "https://www.asc.ca/";

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

  /*
   * Reject dates that are more than one day in the future.
   * This prevents consultation deadlines and implementation
   * dates from being saved as publication dates.
   */
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
      `Rejected future publication date: ${cleanedValue}`
    );

    return null;
  }

  return parsedDate.toISOString();
}

function determineCategory(title = "") {
  const lowerTitle = title.toLowerCase();

  if (
    lowerTitle.includes("sanction") ||
    lowerTitle.includes("settles") ||
    lowerTitle.includes("settlement") ||
    lowerTitle.includes("fraud") ||
    lowerTitle.includes("enforcement") ||
    lowerTitle.includes("penalty") ||
    lowerTitle.includes("charged") ||
    lowerTitle.includes("alleges") ||
    lowerTitle.includes("illegal tipping") ||
    lowerTitle.includes("breaches")
  ) {
    return "enforcement_order";
  }

  if (
    lowerTitle.includes("proposal") ||
    lowerTitle.includes("proposes") ||
    lowerTitle.includes("consultation") ||
    lowerTitle.includes("amendment") ||
    lowerTitle.includes("guidance") ||
    lowerTitle.includes("rule") ||
    lowerTitle.includes("notice") ||
    lowerTitle.includes("policy")
  ) {
    return "regulatory_notice";
  }

  return "news";
}

function determineImpactRating(title = "") {
  const lowerTitle = title.toLowerCase();

  if (
    lowerTitle.includes("sanction") ||
    lowerTitle.includes("settlement") ||
    lowerTitle.includes("settles") ||
    lowerTitle.includes("penalty") ||
    lowerTitle.includes("fraud") ||
    lowerTitle.includes("charged") ||
    lowerTitle.includes("illegal tipping") ||
    lowerTitle.includes("final amendments")
  ) {
    return "MEDIUM";
  }

  if (
    lowerTitle.includes("guidance") ||
    lowerTitle.includes("proposal") ||
    lowerTitle.includes("proposes") ||
    lowerTitle.includes("consultation") ||
    lowerTitle.includes("amendment") ||
    lowerTitle.includes("policy")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function determineMutualFundRelevance(
  title = "",
  fullText = ""
) {
  const combinedText =
    `${title} ${fullText}`.toLowerCase();

  if (
    combinedText.includes("mutual fund") ||
    combinedText.includes("investment fund") ||
    combinedText.includes("exchange-traded fund") ||
    combinedText.includes("etf") ||
    combinedText.includes("fund manager") ||
    combinedText.includes("asset manager") ||
    combinedText.includes("portfolio manager")
  ) {
    return 0.75;
  }

  if (
    combinedText.includes("dealer") ||
    combinedText.includes("registrant") ||
    combinedText.includes("securities") ||
    combinedText.includes("issuer") ||
    combinedText.includes("investment") ||
    combinedText.includes("capital market")
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
    "Opening the official ASC homepage..."
  );

  await page.goto(HOME_URL, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });

  await new Promise((resolve) => {
    setTimeout(resolve, 5000);
  });

  console.log("ASC homepage loaded.");

  const releases = await page.evaluate(() => {
    const seen = new Set();

    function normalize(value = "") {
      return String(value)
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

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
          title: normalize(
            link.textContent
          ),

          source_url: link.href,

          listing_date:
            dateElement?.getAttribute(
              "datetime"
            ) ||
            normalize(
              dateElement?.textContent
            )
        };
      })
      .filter((item) => {
        if (
          !item.title ||
          item.title.length < 15
        ) {
          return false;
        }

        let pathname;

        try {
          pathname = new URL(
            item.source_url
          )
            .pathname
            .toLowerCase()
            .replace(/\/$/, "");
        } catch {
          return false;
        }

        const articlePath =
          "/news-and-publications/news-releases/";

        const isNewsRelease =
          pathname.includes(articlePath);

        if (
          !isNewsRelease ||
          seen.has(pathname)
        ) {
          return false;
        }

        seen.add(pathname);

        return true;
      });
  });

  console.log(
    `Found ${releases.length} ASC news releases.`
  );

  releases
    .slice(0, MAX_ARTICLES)
    .forEach((release, index) => {
      console.log(
        `${index + 1}. ${release.title}`
      );

      console.log(release.source_url);
    });

  return releases.slice(
    0,
    MAX_ARTICLES
  );
}

async function extractArticle(
  articlePage,
  release
) {
  console.log(
    `\nOpening ASC article: ${release.title}`
  );

  await articlePage.goto(
    release.source_url,
    {
      waitUntil: "domcontentloaded",
      timeout: 90000
    }
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 2500);
  });

  try {
    await articlePage.waitForSelector(
      "h1, main, article",
      {
        timeout: 20000
      }
    );
  } catch {
    console.warn(
      "ASC article selector was not detected. Using fallback extraction."
    );
  }

  const extracted =
    await articlePage.evaluate(() => {
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

      let publishedDate = "";

      const metadataDateElement =
        document.querySelector(
          'meta[property="article:published_time"]'
        ) ||
        document.querySelector(
          'meta[name="date"]'
        ) ||
        document.querySelector(
          'meta[name="publication_date"]'
        ) ||
        document.querySelector(
          'meta[name="publishdate"]'
        );

      if (metadataDateElement) {
        publishedDate =
          metadataDateElement.getAttribute(
            "content"
          ) || "";
      }

      if (!publishedDate) {
        const visibleDateElement =
          document.querySelector("time") ||
          document.querySelector(
            ".news-release-date"
          ) ||
          document.querySelector(
            ".publication-date"
          ) ||
          document.querySelector(
            '[class*="publish-date"]'
          ) ||
          document.querySelector(
            '[class*="publication-date"]'
          ) ||
          document.querySelector(
            '[class*="date"]'
          );

        if (visibleDateElement) {
          publishedDate =
            visibleDateElement.getAttribute(
              "datetime"
            ) ||
            normalize(
              visibleDateElement.textContent
            );
        }
      }

      if (!publishedDate) {
        const jsonLdScripts =
          Array.from(
            document.querySelectorAll(
              'script[type="application/ld+json"]'
            )
          );

        for (
          const script
          of jsonLdScripts
        ) {
          try {
            const parsed = JSON.parse(
              script.textContent
            );

            const entries =
              Array.isArray(parsed)
                ? parsed
                : [parsed];

            for (
              const entry
              of entries
            ) {
              const candidate =
                entry?.datePublished ||
                entry?.dateCreated;

              if (candidate) {
                publishedDate =
                  candidate;

                break;
              }
            }

            if (publishedDate) {
              break;
            }
          } catch {
            // Ignore invalid JSON-LD.
          }
        }
      }

      /*
       * ASC article URLs contain the publication date:
       * /news-releases/2026/07/9-article-title
       */
      if (!publishedDate) {
        const pathDateMatch =
          window.location.pathname.match(
            /\/news-releases\/(\d{4})\/(\d{1,2})\/(\d{1,2})-/i
          );

        if (pathDateMatch) {
          const year =
            pathDateMatch[1];

          const month =
            String(
              pathDateMatch[2]
            ).padStart(2, "0");

          const day =
            String(
              pathDateMatch[3]
            ).padStart(2, "0");

          publishedDate =
            `${year}-${month}-${day}`;
        }
      }

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
        ".sidebar",
        ".search-form"
      ];

      document
        .querySelectorAll(
          removableSelectors.join(",")
        )
        .forEach((element) => {
          element.remove();
        });

      const candidateSelectors = [
        "article",
        "main article",
        ".news-release-content",
        ".article-content",
        ".content-body",
        ".entry-content",
        ".page-content",
        ".general-content",
        ".body",
        "main"
      ];

      const candidateTexts = [];

      for (
        const selector
        of candidateSelectors
      ) {
        document
          .querySelectorAll(selector)
          .forEach((element) => {
            const text = normalize(
              element.innerText ||
              element.textContent
            );

            if (text.length >= 250) {
              candidateTexts.push(
                text
              );
            }
          });
      }

      const paragraphText =
        Array.from(
          document.querySelectorAll("p")
        )
          .map((paragraph) =>
            normalize(
              paragraph.textContent
            )
          )
          .filter(
            (paragraph) =>
              paragraph.length >= 30
          )
          .join(" ");

      if (
        paragraphText.length >= 250
      ) {
        candidateTexts.push(
          paragraphText
        );
      }

      candidateTexts.sort(
        (first, second) =>
          second.length -
          first.length
      );

      let fullText =
        candidateTexts[0] || "";

      /*
       * Remove common ASC navigation text
       * if it appears at the beginning.
       */
      fullText = fullText
        .replace(
          /^News Release\s*/i,
          ""
        )
        .replace(
          /^News\s*&\s*Publications\s*/i,
          ""
        )
        .trim();

      return {
        title,
        published_date:
          publishedDate,
        full_text: fullText
      };
    });

  const title =
    cleanText(extracted.title) ||
    cleanText(release.title)
      .replace(
        /^News Release\s+\d{2}\.\d{2}\.\d{4}\s+/i,
        ""
      );

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

  if (
    !articleDate &&
    !listingDate
  ) {
    console.warn(
      "No valid ASC publication date was found. Using the scraper run date."
    );
  }

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
    full_text: fullText
  };
}

async function scrapeASC() {
  let browser;

  try {
    console.log(
      "================================="
    );

    console.log(
      "ASC PRODUCTION SCRAPER"
    );

    console.log(
      "=================================\n"
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

    await configurePage(
      listingPage
    );

    const releases =
      await collectReleaseLinks(
        listingPage
      );

    if (releases.length === 0) {
      throw new Error(
        "No ASC news-release links were found."
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
      index < releases.length;
      index++
    ) {
      const release =
        releases[index];

      console.log(
        `\nProcessing ASC article ${
          index + 1
        } of ${releases.length}`
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
          "Generating ASC enhanced summary..."
        );

        const enhanced =
          await generateEnhancedSummary({
            title: article.title,
            description:
              summarizationText,
            regulator: "ASC",
            category
          });

        const fallbackFullText =
          article.full_text ||
          `ASC news release concerning ${article.title}. Please review the official release for complete information.`;

        items.push({
          title: article.title,

          summary:
            enhanced.summary,

          full_text:
            fallbackFullText,

          source_url:
            article.source_url,

          published_date:
            article.published_date,

          regulator: "ASC",

          regulator_name:
            "Alberta Securities Commission",

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
            "ASC",
            "News Release",
            "Alberta"
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
        "No ASC articles were successfully prepared."
      );
    }

    console.log(
      `\nSending ${items.length} ASC articles to Supabase...`
    );

    const result =
      await upsertRegulatoryUpdates(
        items
      );

    console.log(
      "\nASC Supabase result:"
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
        `${result.failed} ASC records failed to save.`
      );
    }

    console.log(
      "\nASC scraping, summarization and Supabase update completed successfully."
    );
  } catch (error) {
    console.error(
      "\nASC production scraper failed."
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

scrapeASC();
