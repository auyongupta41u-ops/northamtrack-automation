#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * NORTHAMTRACK REGULATORY AUTOMATION SCRAPER - ENHANCED WITH SUMMARIZATION
 * Version 3.0 - Production with Enhanced Summaries
 * 
 * Fetches regulatory updates from:
 * - SEC (USA) - 25 items per run
 * - OSC (Ontario, Canada) - 15 items per run
 * Total: ~40 items per 6-hour run
 * 
 * NEW: Generates enhanced summaries with:
 * - 50+ word summary
 * - Why it matters for Asset Management Companies
 * - Actions needed from AMC perspective
 * ════════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');
const crypto = require('crypto');
const { generateEnhancedSummary } = require('./summarizer');

// Import Supabase AFTER checking credentials
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RUN_ID = process.env.RUN_ID || 'enhanced-' + Date.now();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

let supabase;
try {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
  console.error('❌ Failed to initialize Supabase client:', e.message);
  process.exit(1);
}

const xmlParser = new xml2js.Parser({ explicitArray: false });

// Regulator configuration with working RSS feeds
const REGULATORS = {
  SEC: {
    name: 'SEC',
    fullName: 'U.S. Securities and Exchange Commission',
    country: 'USA',
    feeds: ['https://www.sec.gov/news/pressreleases.rss']
  },
  OSC: {
    name: 'OSC',
    fullName: 'Ontario Securities Commission',
    country: 'Canada',
    feeds: ['https://feeds.feedburner.com/rss_osc_headlines_en']
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function categorizeUpdate(title, description) {
  const combined = (title + ' ' + description).toLowerCase();

  if (combined.includes('enforcement') || combined.includes('violation') || combined.includes('penalty')) {
    return 'enforcement';
  }
  if (combined.includes('rule') || combined.includes('regulation') || combined.includes('proposed')) {
    return 'rules';
  }
  if (combined.includes('alert') || combined.includes('warning') || combined.includes('risk')) {
    return 'alerts';
  }
  if (combined.includes('guidance') || combined.includes('interpretation') || combined.includes('faq')) {
    return 'guidance';
  }
  return 'press';
}

function rateImpact(title, description) {
  const combined = (title + ' ' + description).toLowerCase();
  const impactKeywords = {
    high: ['enforcement', 'violation', 'penalty', 'mandatory', 'required', 'must', 'critical'],
    medium: ['rule', 'guidance', 'recommendation', 'should', 'important'],
    low: ['announcement', 'update', 'information', 'notice']
  };

  for (const keyword of impactKeywords.high) {
    if (combined.includes(keyword)) return 'high';
  }
  for (const keyword of impactKeywords.medium) {
    if (combined.includes(keyword)) return 'medium';
  }
  return 'low';
}

function calculateRelevance(title, description) {
  const combined = (title + ' ' + description).toLowerCase();
  const relevanceKeywords = {
    'mutual fund': 0.9,
    'investment adviser': 0.85,
    'asset management': 0.9,
    'portfolio manager': 0.8,
    'fund manager': 0.85,
    'investment company': 0.8,
    'sec': 0.7,
    'disclosure': 0.6,
    'reporting': 0.6,
    'fee': 0.7,
    'compensation': 0.6,
    'conflict': 0.7,
    'compliance': 0.6
  };

  let maxRelevance = 0.3; // Base relevance

  for (const [keyword, score] of Object.entries(relevanceKeywords)) {
    if (combined.includes(keyword)) {
      maxRelevance = Math.max(maxRelevance, score);
    }
  }

  return parseFloat(maxRelevance.toFixed(2));
}

function extractTags(title, description) {
  const combined = (title + ' ' + description).toLowerCase();
  const tags = [];

  const tagMap = {
    'mutual fund': ['mutual-fund', 'funds'],
    'investment adviser': ['investment-adviser', 'advisers'],
    'etf': ['etf', 'exchange-traded-fund'],
    'disclosure': ['disclosure', 'transparency'],
    'fee': ['fee', 'cost'],
    'compliance': ['compliance', 'regulatory'],
    'cybersecurity': ['cybersecurity', 'data-security'],
    'conflict': ['conflict-of-interest'],
    'enforcement': ['enforcement', 'penalty'],
    'rule': ['rules', 'regulations']
  };

  for (const [keyword, tagList] of Object.entries(tagMap)) {
    if (combined.includes(keyword)) {
      tags.push(...tagList);
    }
  }

  return [...new Set(tags)].slice(0, 5); // Remove duplicates and limit to 5
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🚀 Starting SEC + OSC regulatory automation scraper (ENHANCED)...');
  console.log(`📅 Run ID: ${RUN_ID}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
  console.log(`✨ Enhanced with AI-powered summarization\n`);
  
  const startTime = Date.now();
  let totalFetched = 0;
  let totalProcessed = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;
  let runId = null;
  const regulatorsProcessed = [];

  try {
    // Verify Supabase connection with timeout
    console.log('🔗 Verifying Supabase connection...');
    try {
      const { data: testData, error: testError } = await Promise.race([
        supabase.from('scraper_runs').select('count').limit(1),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
      ]);
      
      if (testError) {
        throw new Error(`Supabase connection failed: ${testError.message}`);
      }
      console.log('✅ Supabase connection verified');
    } catch (connError) {
      console.warn('⚠️  Supabase connection warning:', connError.message);
      console.warn('⚠️  Continuing without database logging...');
    }

    // Try to create scraper run record (non-critical)
    try {
      console.log('\n📝 Creating scraper run record...');
      const { data: runData, error: runError } = await supabase
        .from('scraper_runs')
        .insert({
          run_type: 'scheduled',
          triggered_by: 'github_actions',
          status: 'running',
          regulators_processed: [],
          scraper_version: '3.0-enhanced'
        })
        .select()
        .single();

      if (runError) throw runError;
      runId = runData.id;
      console.log(`✅ Run record created: ${runId}`);
    } catch (error) {
      console.warn('⚠️  Could not create run record:', error.message);
    }

    // Fetch from SEC and OSC
    console.log('\n📡 Fetching from SEC and OSC...');
    for (const [regCode, regConfig] of Object.entries(REGULATORS)) {
      try {
        console.log(`\n  🏛️  ${regConfig.fullName} (${regCode})`);
        let regulatorProcessed = 0;

        for (const feedUrl of regConfig.feeds) {
          try {
            console.log(`    📥 ${feedUrl.substring(0, 60)}...`);
            
            const response = await axios.get(feedUrl, {
              timeout: 15000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });

            console.log(`    ✅ Got response (${response.status})`);

            // Parse RSS
            const result = await xmlParser.parseStringPromise(response.data);
            const items = result.rss?.channel?.item || [];
            const itemArray = Array.isArray(items) ? items : (items ? [items] : []);
            
            console.log(`    ✓ Parsed ${itemArray.length} items`);
            totalFetched += itemArray.length;

            // Process each item
            for (const item of itemArray) {
              try {
                const title = item.title || 'No Title';
                const sourceUrl = item.link || '';
                const pubDate = item.pubDate || new Date().toISOString();
                const description = item.description || '';
                const plainText = stripHtml(description);

                if (!sourceUrl) continue;

                // Create hash
                const combinedHash = crypto
                  .createHash('sha256')
                  .update(sourceUrl)
                  .digest('hex');

                // Check duplicate (non-critical)
                let isDuplicate = false;
                try {
                  const { data: existing } = await supabase
                    .from('processed_hashes')
                    .select('id')
                    .eq('combined_hash', combinedHash)
                    .single();

                  if (existing) {
                    isDuplicate = true;
                    totalDuplicates++;
                    continue;
                  }
                } catch (e) {
                  // Ignore duplicate check errors
                }

                // Categorize
                const category = categorizeUpdate(title, description);
                const impactRating = rateImpact(title, description);
                const relevance = calculateRelevance(title, description);
                const tags = extractTags(title, description);

                // Generate enhanced summary
                console.log(`    ✨ Generating enhanced summary for: ${title.substring(0, 50)}...`);
                const enhancedSummary = generateEnhancedSummary({
                  title,
                  fullText: plainText,
                  category,
                  regulator: regCode,
                  description: plainText
                });

                // Insert with enhanced data (non-critical)
                try {
                  const { error: insertError } = await supabase
                    .from('regulatory_updates')
                    .insert({
                      title,
                      summary: enhancedSummary.summary,
                      why_it_matters: enhancedSummary.why_it_matters,
                      actions_needed: enhancedSummary.actions_needed,
                      full_text: plainText.substring(0, 2000),
                      source_url: sourceUrl,
                      regulator: regCode,
                      regulator_name: regConfig.fullName,
                      regulator_country: regConfig.country,
                      category,
                      impact_rating: impactRating,
                      mutual_fund_relevance: relevance,
                      tags,
                      published_date: pubDate,
                      is_active: true,
                      summarization_version: '1.0'
                    });

                  if (insertError) {
                    if (insertError.code !== '23505') {
                      throw insertError;
                    }
                    totalDuplicates++;
                    continue;
                  }

                  // Record hash (non-critical)
                  try {
                    await supabase
                      .from('processed_hashes')
                      .insert({
                        source_url: sourceUrl,
                        combined_hash: combinedHash,
                        regulator: regCode,
                        first_seen: new Date().toISOString()
                      })
                      .catch(() => {});
                  } catch (e) {
                    // Ignore hash recording errors
                  }

                  totalProcessed++;
                  regulatorProcessed++;
                } catch (error) {
                  console.error(`    ❌ Error inserting: ${error.message}`);
                  totalErrors++;
                }
              } catch (error) {
                console.error(`    ❌ Error processing item: ${error.message}`);
                totalErrors++;
              }
            }
          } catch (error) {
            const errorMsg = error.response?.status ? `HTTP ${error.response.status}` : error.message;
            console.error(`    ❌ Error fetching feed: ${errorMsg}`);
            totalErrors++;
          }
        }

        if (regulatorProcessed > 0) {
          regulatorsProcessed.push(regCode);
          console.log(`  ✅ ${regCode}: ${regulatorProcessed} items`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${regCode}: ${error.message}`);
        totalErrors++;
      }
    }

    // Summary
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📊 SCRAPER SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📥 Total fetched: ${totalFetched}`);
    console.log(`✅ Total processed: ${totalProcessed}`);
    console.log(`⚠️  Duplicates: ${totalDuplicates}`);
    console.log(`❌ Errors: ${totalErrors}`);
    console.log(`🏛️  Regulators: ${regulatorsProcessed.join(', ')}`);
    console.log('════════════════════════════════════════════════════════════════\n');

    // Update run record
    if (runId) {
      try {
        await supabase
          .from('scraper_runs')
          .update({
            status: 'completed',
            regulators_processed: regulatorsProcessed,
            total_fetched: totalFetched,
            total_processed: totalProcessed,
            total_duplicates: totalDuplicates,
            total_errors: totalErrors,
            duration_seconds: parseFloat(duration),
            completed_at: new Date().toISOString()
          })
          .eq('id', runId);
      } catch (error) {
        console.warn('⚠️  Could not update run record:', error.message);
      }
    }

    process.exit(totalErrors > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
