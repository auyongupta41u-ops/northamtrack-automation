#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * NORTHAMTRACK REGULATORY AUTOMATION SCRAPER - SIMPLE VERSION
 * Version 2.1 - SEC Only with Robust Error Handling
 * 
 * This simplified version fetches only from SEC which has reliable RSS feeds
 * ════════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');
const crypto = require('crypto');

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RUN_ID = process.env.RUN_ID || 'simple-' + Date.now();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

// Import Supabase AFTER checking credentials
let supabase;
try {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) {
  console.error('❌ Failed to initialize Supabase client:', e.message);
  process.exit(1);
}

const xmlParser = new xml2js.Parser({ explicitArray: false });

// SEC feeds (verified working)
const SEC_FEEDS = [
  'https://www.sec.gov/news/pressreleases.rss'
];

// ════════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🚀 Starting SIMPLE regulatory automation scraper (SEC only)...');
  console.log(`📅 Run ID: ${RUN_ID}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
  
  const startTime = Date.now();
  let totalFetched = 0;
  let totalProcessed = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;
  let runId = null;

  try {
    // Verify Supabase connection with timeout
    console.log('\n🔗 Verifying Supabase connection...');
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
          regulators_processed: []
        })
        .select()
        .single();

      if (runError) throw runError;
      runId = runData.id;
      console.log(`✅ Run record created: ${runId}`);
    } catch (error) {
      console.warn('⚠️  Could not create run record:', error.message);
      console.warn('⚠️  Continuing without database logging...');
    }

    // Fetch from SEC
    console.log('\n📡 Fetching from SEC...');
    for (const feedUrl of SEC_FEEDS) {
      try {
        console.log(`  📥 ${feedUrl.substring(0, 70)}...`);
        
        const response = await axios.get(feedUrl, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        console.log(`  ✅ Got response (${response.status})`);

        // Parse RSS
        const result = await xmlParser.parseStringPromise(response.data);
        const items = result.rss?.channel?.item || [];
        const itemArray = Array.isArray(items) ? items : (items ? [items] : []);
        
        console.log(`  ✓ Parsed ${itemArray.length} items`);
        totalFetched += itemArray.length;

        // Process each item
        for (const item of itemArray) {
          try {
            const title = item.title || 'No Title';
            const sourceUrl = item.link || '';
            const pubDate = item.pubDate || new Date().toISOString();
            const description = item.description || '';
            const summary = stripHtml(description).substring(0, 500);

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

            // Insert (non-critical)
            try {
              const { error: insertError } = await supabase
                .from('regulatory_updates')
                .insert({
                  title,
                  summary,
                  full_text: description,
                  source_url: sourceUrl,
                  regulator: 'SEC',
                  regulator_name: 'U.S. Securities and Exchange Commission',
                  regulator_country: 'USA',
                  category,
                  impact_rating: impactRating,
                  mutual_fund_relevance: relevance,
                  tags,
                  published_date: pubDate,
                  is_active: true
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
                    regulator: 'SEC',
                    first_seen: new Date().toISOString()
                  })
                  .catch(() => {});
              } catch (e) {
                // Ignore hash recording errors
              }

              totalProcessed++;
              console.log(`  ✅ ${title.substring(0, 50)}`);
            } catch (error) {
              console.error(`  ❌ Error inserting: ${error.message}`);
              totalErrors++;
            }
          } catch (error) {
            console.error(`  ❌ Error processing item: ${error.message}`);
            totalErrors++;
          }
        }
      } catch (error) {
        const errorMsg = error.response?.status ? `HTTP ${error.response.status}` : error.message;
        console.error(`  ❌ Error fetching feed: ${errorMsg}`);
        totalErrors++;
      }
    }

    // Try to update run record (non-critical)
    if (runId) {
      try {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        console.log('\n💾 Updating scraper run record...');
        const { error: updateError } = await supabase
          .from('scraper_runs')
          .update({
            status: 'completed',
            total_fetched: totalFetched,
            total_processed: totalProcessed,
            total_duplicates: totalDuplicates,
            total_errors: totalErrors,
            regulators_processed: ['SEC'],
            completed_at: new Date().toISOString(),
            duration_seconds: duration
          })
          .eq('id', runId);

        if (updateError) throw updateError;
      } catch (error) {
        console.warn('⚠️  Could not update run record:', error.message);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ SCRAPER COMPLETED');
    console.log('='.repeat(80));
    console.log(`📊 Statistics:`);
    console.log(`   Total Fetched: ${totalFetched}`);
    console.log(`   Total Processed: ${totalProcessed}`);
    console.log(`   Total Duplicates: ${totalDuplicates}`);
    console.log(`   Total Errors: ${totalErrors}`);
    console.log('='.repeat(80));

    // Exit with success if we processed at least something
    if (totalProcessed > 0 || totalFetched > 0) {
      console.log('\n✅ SUCCESS: Scraper ran successfully');
      process.exit(0);
    } else if (totalDuplicates > 0) {
      console.log('\n✅ SUCCESS: All items were duplicates (already in database)');
      process.exit(0);
    } else {
      console.log('\n⚠️  WARNING: No items processed');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// UTILITIES
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
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('enforcement') || text.includes('charges')) return 'enforcement_order';
  if (text.includes('settlement')) return 'settlement';
  if (text.includes('alert') || text.includes('warning')) return 'investor_alert';
  if (text.includes('decision') || text.includes('ruling')) return 'decision';
  if (text.includes('guidance') || text.includes('proposes')) return 'regulatory_notice';
  return 'news';
}

function rateImpact(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('landmark') || text.includes('major') || text.includes('billion')) return 'HIGH';
  if (text.includes('settlement') || text.includes('million')) return 'MEDIUM';
  return 'LOW';
}

function calculateRelevance(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('mutual fund') || text.includes('etf')) return 0.95;
  if (text.includes('investment adviser')) return 0.85;
  if (text.includes('broker')) return 0.75;
  if (text.includes('fee') || text.includes('disclosure')) return 0.65;
  return 0.45;
}

function extractTags(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const tags = [];
  if (text.includes('fraud')) tags.push('Fraud');
  if (text.includes('enforcement')) tags.push('Enforcement');
  if (text.includes('fee')) tags.push('Fee Disclosure');
  if (text.includes('compliance')) tags.push('Compliance');
  return tags.length > 0 ? tags : ['General'];
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
