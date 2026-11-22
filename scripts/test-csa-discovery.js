const fs = require("fs");
const path = require("path");

const TARGETS = [
  [
    "CSA homepage",
    "https://www.securities-administrators.ca/"
  ],
  [
    "CSA news archive",
    "https://www.securities-administrators.ca/news/"
  ],
  [
    "CSA news page 2",
    "https://www.securities-administrators.ca/news/page/2/"
  ],
  [
  "CSA individual news article",
  "https://www.securities-administrators.ca/news/csa-and-ciro-to-delay-implementation-of-final-amendments-to-access-fee-and-tick-size-rules/"
  ],
  [
  "FCAA CSA News Releases and Alerts",
  "https://fcaa.gov.sk.ca/whats-new/news-releases"
  ],
  [
    "CSA news feed candidate",
    "https://www.securities-administrators.ca/news/feed/"
  ],
  [
    "CSA site feed candidate",
    "https://www.securities-administrators.ca/feed/"
  ],
  [
    "CSA sitemap candidate",
    "https://www.securities-administrators.ca/wp-sitemap.xml"
  ],
  [
    "CSA robots.txt",
    "https://www.securities-administrators.ca/robots.txt"
  ],
  [
    "Bing RSS discovery",
    "https://www.bing.com/news/search?q=site%3Asecurities-administrators.ca%2Fnews%2F+Canadian+Securities+Administrators&format=rss"
  ],
  [
    "Google News RSS discovery",
    "https://news.google.com/rss/search?q=site%3Asecurities-administrators.ca%2Fnews%2F%20%22Canadian%20Securities%20Administrators%22&hl=en-CA&gl=CA&ceid=CA%3Aen"
  ]
];

function clean(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function extractOfficialNewsUrls(text = "") {
  const decoded = String(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  const matches =
    decoded.match(
      /https?:\/\/(?:www\.)?securities-administrators\.ca\/news\/[A-Za-z0-9\-_%/?=&.#]+/gi
    ) || [];

  return [
    ...new Set(
      matches
        .map((url) =>
          url.replace(/[)"'<>\],;]+$/g, "")
        )
        .filter(
          (url) =>
            !/\/news\/(?:page|category|tag|author|feed)(?:\/|$)/i.test(
              url
            )
        )
    )
  ];
}

async function fetchWithTimeout(
  url,
  timeoutMs = 30000
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(url, {
      redirect: "follow",

      signal: controller.signal,

      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",

        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7",

        "accept-language":
          "en-CA,en;q=0.9"
      }
    });

   const text = await response.text();

// Print robots.txt because it may reveal an alternative
// official CSA sitemap or crawl endpoint.
if (url.includes("robots.txt")) {
  console.log("\n===== CSA ROBOTS.TXT CONTENT =====");
  console.log(text);
  console.log("===== END CSA ROBOTS.TXT =====\n");
}
// Inspect the FCAA page around the latest CSA release.
if (url.includes("fcaa.gov.sk.ca/whats-new/news-releases")) {
  console.log("\n===== FCAA CSA RELEASE CONTENT TEST =====");

  const searchTerms = [
    "new-csa-research-identifies",
    "anti-fraud",
    "November 17",
    "Nov 17"
  ];

  let matchIndex = -1;

  for (const term of searchTerms) {
    matchIndex = text.toLowerCase().indexOf(term.toLowerCase());

    if (matchIndex !== -1) {
      console.log(`Matched FCAA content using: ${term}`);
      break;
    }
  }

  if (matchIndex !== -1) {
    const start = Math.max(0, matchIndex - 1500);
    const end = Math.min(text.length, matchIndex + 5000);

    const surroundingHtml = text.slice(start, end);

    console.log("\n--- RAW HTML AROUND RELEASE ---");
    console.log(surroundingHtml);

    const readableText = surroundingHtml
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    console.log("\n--- READABLE TEXT AROUND RELEASE ---");
    console.log(readableText);
  } else {
    console.log("November 17 CSA release was not found in the FCAA HTML.");
  }

  console.log("\n===== END FCAA CSA RELEASE CONTENT TEST =====\n");
}
return {
      ok: response.ok,

      status: response.status,

      finalUrl: response.url,

      contentType:
        response.headers.get("content-type") || "",

      bodyLength: text.length,

      title: clean(
        text.match(
          /<title[^>]*>([\s\S]*?)<\/title>/i
        )?.[1] || ""
      ),

      cloudflare:
        /just a moment|cf-chl|cloudflare|challenge-platform/i.test(
          text
        ),

      officialNewsUrls:
        extractOfficialNewsUrls(text),

      sample: clean(
        text.replace(/<[^>]+>/g, " ")
      ).slice(0, 350)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(
    "NorthAmTrack CSA Discovery Diagnostic"
  );

  console.log(
    "====================================="
  );

  console.log(
    `Run time: ${new Date().toISOString()}\n`
  );

  const report = {
    generated_at:
      new Date().toISOString(),

    targets: []
  };

  for (const [name, url] of TARGETS) {
    console.log(`\nTesting: ${name}`);
    console.log(`URL: ${url}`);

    try {
      const result =
        await fetchWithTimeout(url);

      console.log(
        `HTTP: ${result.status}`
      );

      console.log(
        `Final URL: ${result.finalUrl}`
      );

      console.log(
        `Content-Type: ${result.contentType}`
      );

      console.log(
        `Body length: ${result.bodyLength}`
      );

      console.log(
        `Title: ${
          result.title || "(none)"
        }`
      );

      console.log(
        `Cloudflare/challenge detected: ${
          result.cloudflare ? "YES" : "NO"
        }`
      );

      console.log(
        `Official CSA /news/ URLs found: ${
          result.officialNewsUrls.length
        }`
      );

      if (
        result.officialNewsUrls.length
      ) {
        result.officialNewsUrls
          .slice(0, 10)
          .forEach(
            (item, index) => {
              console.log(
                `  ${index + 1}. ${item}`
              );
            }
          );
      }

      report.targets.push({
        name,
        url,
        ...result
      });
    } catch (error) {
      console.log(
        `FAILED: ${error.message}`
      );

      report.targets.push({
        name,
        url,
        error: error.message
      });
    }
  }

  const allUrls = [
    ...new Set(
      report.targets.flatMap(
        (target) =>
          target.officialNewsUrls || []
      )
    )
  ];

  report.unique_official_news_urls =
    allUrls;

  console.log("\n\nSUMMARY");

  console.log("=======");

  console.log(
    `Unique official CSA news URLs discovered: ${allUrls.length}`
  );

  const directWorking =
    report.targets.filter(
      (target) =>
        target.url.includes(
          "securities-administrators.ca"
        ) &&
        target.ok &&
        !target.cloudflare
    );

  const externalWorking =
    report.targets.filter(
      (target) =>
        !target.url.includes(
          "securities-administrators.ca"
        ) &&
        target.ok &&
        (
          target.officialNewsUrls || []
        ).length > 0
    );

  console.log(
    `Direct CSA routes accessible without challenge: ${directWorking.length}`
  );

  console.log(
    `External discovery routes yielding official CSA URLs: ${externalWorking.length}`
  );

  fs.mkdirSync(
    "output",
    { recursive: true }
  );

  fs.writeFileSync(
    path.join(
      "output",
      "csa-discovery-diagnostic.json"
    ),

    JSON.stringify(
      report,
      null,
      2
    ),

    "utf8"
  );

  console.log(
    "\nSaved: output/csa-discovery-diagnostic.json"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
