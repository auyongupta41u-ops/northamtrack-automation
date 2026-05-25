#!/usr/bin/env node

/**
 * NORTHAMTRACK REGULATORY AUTOMATION SCRAPER - V4
 * Fixed version that matches the actual Supabase schema
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

console.log('🚀 Starting Scraper V4...');
console.log(`📅 Time: ${new Date().toISOString()}`);
console.log(`🌐 Supabase URL: ${SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
console.log(`🔑 Service Key: ${SUPABASE_KEY ? '✅ Set' : '❌ Missing'}`);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Regulator mapping
const REGULATOR_MAP = {
  'SEC': { name: 'SEC', full_name: 'U.S. Securities and Exchange Commission', country: 'USA' },
  'OSC': { name: 'OSC', full_name: 'Ontario Securities Commission', country: 'Canada' },
  'CSA': { name: 'CSA', full_name: 'Canadian Securities Administrators', country: 'Canada' },
  'BCSC': { name: 'BCSC', full_name: 'British Columbia Securities Commission', country: 'Canada' },
  'ASC': { name: 'ASC', full_name: 'Alberta Securities Commission', country: 'Canada' },
  'AMF': { name: 'AMF', full_name: 'Autorité des marchés financiers', country: 'Canada' },
  'FCAA': { name: 'FCAA', full_name: 'Financial and Consumer Affairs Authority', country: 'Canada' },
  'CIRO': { name: 'CIRO', full_name: 'Canadian Investment Regulatory Organization', country: 'Canada' }
};

// Mock data
const MOCK_UPDATES = [
  {
    title: 'SEC Charges Investment Adviser with Fraud',
    summary: 'The SEC charged an investment adviser with defrauding clients.',
    regulator: 'SEC',
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
    category: 'regulatory_notice',
    impact_rating: 'MEDIUM',
    relevance: 0.90,
    tags: ['Suitability', 'Compliance'],
    source_url: 'https://www.ciro.ca/news/2024-mock-1'
  }
];

async function main() {
  try {
    console.log('\n🔗 Testing Supabase connection...');
    const { data, error } = await supabase
      .from('scraper_runs')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Connection failed:', error.message);
      throw error;
    }
    console.log('✅ Supabase connection OK');

    console.log('\n📝 Creating scraper run record...');
    const { data: runData, error: runError } = await supabase
      .from('scraper_runs')
      .insert({
        run_type: 'test',
        triggered_by: 'mock_data_v4',
        status: 'running',
        regulators_processed: []
      })
      .select()
      .single();

    if (runError) {
      console.error('❌ Failed to create run record:', runError.message);
      throw runError;
    }
    
    const runId = runData.id;
    console.log(`✅ Run record created: ${runId}`);

    console.log(`\n📥 Processing ${MOCK_UPDATES.length} mock updates...`);
    let processed = 0;
    let duplicates = 0;
    let errors = 0;

    for (const item of MOCK_UPDATES) {
      try {
        console.log(`  Processing: ${item.title.substring(0, 50)}...`);

        // Get regulator info
        const regulatorInfo = REGULATOR_MAP[item.regulator];
        if (!regulatorInfo) {
          console.error(`    ❌ Unknown regulator: ${item.regulator}`);
          errors++;
          continue;
        }

        // Check for duplicate
        const { data: existing, error: checkError } = await supabase
          .from('regulatory_updates')
          .select('id')
          .eq('source_url', item.source_url)
          .single();

        if (existing) {
          console.log(`    ⏭️  Duplicate, skipping`);
          duplicates++;
          continue;
        }

        // Insert update with ALL required fields
        const { data: insertedData, error: insertError } = await supabase
          .from('regulatory_updates')
          .insert({
            title: item.title,
            summary: item.summary,
            full_text: item.summary,
            source_url: item.source_url,
            regulator: item.regulator,
            regulator_name: regulatorInfo.full_name,  // ← REQUIRED
            regulator_country: regulatorInfo.country,  // ← REQUIRED
            category: item.category,
            impact_rating: item.impact_rating,
            mutual_fund_relevance: item.relevance,
            tags: item.tags,
            published_date: new Date().toISOString(),
            is_active: true,
            is_processed: false
          })
          .select();

        if (insertError) {
          console.error(`    ❌ Insert failed:`, insertError.message);
          errors++;
          continue;
        }

        console.log(`    ✅ Inserted successfully`);
        processed++;

      } catch (error) {
        console.error(`    ❌ Error:`, error.message);
        errors++;
      }
    }

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
        duration_seconds: 0
      })
      .eq('id', runId);

    if (updateError) {
      console.error('❌ Failed to update run record:', updateError.message);
      throw updateError;
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ SCRAPER V4 COMPLETED');
    console.log('='.repeat(60));
    console.log(`📊 Results:`);
    console.log(`   Total: ${MOCK_UPDATES.length}`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Duplicates: ${duplicates}`);
    console.log(`   Errors: ${errors}`);
    console.log('='.repeat(60));

    if (processed > 0) {
      console.log('\n✨ Check your Supabase dashboard!');
      console.log('   Table: regulatory_updates');
      console.log(`   New rows: ${processed}`);
    }

    process.exit(0);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
