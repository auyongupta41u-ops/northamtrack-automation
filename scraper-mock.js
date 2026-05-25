#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════════════════════════
 * NORTHAMTRACK REGULATORY AUTOMATION SCRAPER - MOCK VERSION
 * Version 2.0 - Testing with Mock Data
 * 
 * This version uses mock data to test Supabase connection without fetching feeds
 * ════════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RUN_ID = process.env.RUN_ID || 'mock-' + Date.now();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Mock data for testing
const MOCK_UPDATES = [
  {
    title: 'SEC Charges Investment Adviser with Fraud',
    summary: 'The SEC charged an investment adviser with defrauding clients.',
    regulator: 'SEC',
    regulator_name: 'U.S. Securities and Exchange Commission',
    regulator_country: 'USA',
    category: 'enforcement_order',
    impact_rating: 'HIGH',
    relevance: 0.95,
    tags: ['Fraud', 'Enforcement'],
    source_url: 'https://www.sec.gov/news/press-release/2024-mock-1'
  },
  {
    title: 'OSC Releases Guidance on Fee Disclosure',
    summary: 'Ontario Securities Commission releases new guidance on mutual fund fee disclosure.',
    regulator: 'OSC',
    regulator_name: 'Ontario Securities Commission',
    regulator_country: 'Canada',
    category: 'regulatory_notice',
    impact_rating: 'MEDIUM',
    relevance: 0.85,
    tags: ['Fee Disclosure', 'Compliance'],
    source_url: 'https://www.osc.ca/news/2024-mock-1'
  },
  {
    title: 'CSA Settles with Investment Manager',
    summary: 'Canadian Securities Administrators settle enforcement action with investment manager.',
    regulator: 'CSA',
    regulator_name: 'Canadian Securities Administrators',
    regulator_country: 'Canada',
    category: 'settlement',
    impact_rating: 'MEDIUM',
    relevance: 0.90,
    tags: ['Settlement', 'Enforcement'],
    source_url: 'https://www.securities-administrators.ca/news/2024-mock-1'
  },
  {
    title: 'BCSC Issues Investor Alert on Cryptocurrency Fraud',
    summary: 'British Columbia Securities Commission warns investors about cryptocurrency scams.',
    regulator: 'BCSC',
    regulator_name: 'British Columbia Securities Commission',
    regulator_country: 'Canada',
    category: 'investor_alert',
    impact_rating: 'HIGH',
    relevance: 0.70,
    tags: ['Cryptocurrency', 'Fraud', 'Alert'],
    source_url: 'https://www.bcsc.bc.ca/news/2024-mock-1'
  },
  {
    title: 'ASC Approves New Compliance Rule',
    summary: 'Alberta Securities Commission approves new compliance requirements for dealers.',
    regulator: 'ASC',
    regulator_name: 'Alberta Securities Commission',
    regulator_country: 'Canada',
    category: 'decision',
    impact_rating: 'MEDIUM',
    relevance: 0.80,
    tags: ['Compliance', 'Regulation'],
    source_url: 'https://www.asc.ca/news/2024-mock-1'
  },
  {
    title: 'AMF Consultation on ESG Disclosure',
    summary: 'Autorité des marchés financiers launches consultation on ESG disclosure requirements.',
    regulator: 'AMF',
    regulator_name: 'Autorité des marchés financiers',
    regulator_country: 'Canada',
    category: 'regulatory_notice',
    impact_rating: 'LOW',
    relevance: 0.75,
    tags: ['ESG', 'Compliance'],
    source_url: 'https://www.amf-quebec.ca/news/2024-mock-1'
  },
  {
    title: 'FCAA Enforcement Action Against Dealer',
    summary: 'Financial and Consumer Affairs Authority takes enforcement action against securities dealer.',
    regulator: 'FCAA',
    regulator_name: 'Financial and Consumer Affairs Authority',
    regulator_country: 'Canada',
    category: 'enforcement_order',
    impact_rating: 'MEDIUM',
    relevance: 0.85,
    tags: ['Enforcement', 'Compliance'],
    source_url: 'https://www.fcaa.gov.sk.ca/news/2024-mock-1'
  },
  {
    title: 'CIRO Updates Suitability Requirements',
    summary: 'Canadian Investment Regulatory Organization updates suitability requirements for advisers.',
    regulator: 'CIRO',
    regulator_name: 'Canadian Investment Regulatory Organization',
    regulator_country: 'Canada',
    category: 'regulatory_notice',
    impact_rating: 'MEDIUM',
    relevance: 0.90,
    tags: ['Suitability', 'Compliance'],
    source_url: 'https://www.ciro.ca/news/2024-mock-1'
  }
];

// ════════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🚀 Starting MOCK regulatory automation scraper...');
  console.log(`📅 Run ID: ${RUN_ID}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
  console.log(`📝 Using MOCK data (${MOCK_UPDATES.length} items)`);
  
  const startTime = Date.now();
  let processed = 0;
  let duplicates = 0;
  let errors = 0;

  try {
    // Verify Supabase connection
    console.log('\n🔗 Verifying Supabase connection...');
    const { data: testData, error: testError } = await supabase
      .from('scraper_runs')
      .select('count')
      .limit(1);
    
    if (testError) {
      throw new Error(`Supabase connection failed: ${testError.message}`);
    }
    console.log('✅ Supabase connection verified');

    // Create scraper run record
    console.log('\n📝 Creating scraper run record...');
    const { data: runData, error: runError } = await supabase
      .from('scraper_runs')
      .insert({
        run_type: 'test',
        triggered_by: 'mock_data',
        status: 'running',
        regulators_processed: []
      })
      .select()
      .single();

    if (runError) throw runError;
    const runId = runData.id;
    console.log(`✅ Run record created: ${runId}`);

    // Process mock data
    console.log(`\n📥 Processing ${MOCK_UPDATES.length} mock updates...`);
    
    for (const item of MOCK_UPDATES) {
      try {
        // Check for duplicates
        const { data: existing } = await supabase
          .from('regulatory_updates')
          .select('id')
          .eq('source_url', item.source_url)
          .single();

        if (existing) {
          console.log(`  ⏭️  Skipped (duplicate): ${item.title.substring(0, 50)}...`);
          duplicates++;
          continue;
        }

        // Insert update
        const { error: insertError } = await supabase
          .from('regulatory_updates')
          .insert({
            title: item.title,
            summary: item.summary,
            full_text: item.summary,
            source_url: item.source_url,
            regulator: item.regulator,
            regulator_name: item.regulator_name,
            regulator_country: item.regulator_country,
            category: item.category,
            impact_rating: item.impact_rating,
            mutual_fund_relevance: item.relevance,
            tags: item.tags,
            published_date: new Date().toISOString(),
            is_active: true
          });

        if (insertError) {
          if (insertError.code === '23505') {
            // Duplicate key error
            console.log(`  ⏭️  Skipped (duplicate): ${item.title.substring(0, 50)}...`);
            duplicates++;
          } else {
            throw insertError;
          }
        } else {
          console.log(`  ✅ Inserted: ${item.title.substring(0, 50)}...`);
          processed++;
        }
      } catch (error) {
        console.error(`  ❌ Error processing item: ${error.message}`);
        errors++;
      }
    }

    // Update scraper run record
    const duration = Math.floor((Date.now() - startTime) / 1000);
    console.log('\n💾 Updating scraper run record...');
    const { error: updateError } = await supabase
      .from('scraper_runs')
      .update({
        status: 'completed',
        total_fetched: MOCK_UPDATES.length,
        total_processed: processed,
        total_duplicates: duplicates,
        total_errors: errors,
        regulators_processed: ['SEC', 'OSC', 'CSA', 'BCSC', 'ASC', 'AMF', 'FCAA', 'CIRO'],
        completed_at: new Date().toISOString(),
        duration_seconds: duration
      })
      .eq('id', runId);

    if (updateError) throw updateError;

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ MOCK SCRAPER COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log(`📊 Statistics:`);
    console.log(`   Total Items: ${MOCK_UPDATES.length}`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Duplicates: ${duplicates}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Duration: ${duration} seconds`);
    console.log('='.repeat(80));
    console.log('\n✨ Check your Supabase dashboard to see the data!');
    console.log(`   Go to: ${SUPABASE_URL}/project/default/editor`);
    console.log('   Table: regulatory_updates');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
