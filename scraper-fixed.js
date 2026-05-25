#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const DATA = [
  { t: 'SEC Charges Investment Adviser with Fraud', s: 'The SEC charged an investment adviser with defrauding clients.', r: 'SEC', rn: 'U.S. Securities and Exchange Commission', rc: 'USA', c: 'enforcement_order', i: 'HIGH', rel: 0.95, tg: ['Fraud', 'Enforcement'], su: 'https://www.sec.gov/news/press-release/2024-mock-1' },
  { t: 'OSC Releases Guidance on Fee Disclosure', s: 'Ontario Securities Commission releases new guidance on mutual fund fee disclosure.', r: 'OSC', rn: 'Ontario Securities Commission', rc: 'Canada', c: 'regulatory_notice', i: 'MEDIUM', rel: 0.85, tg: ['Fee Disclosure', 'Compliance'], su: 'https://www.osc.ca/news/2024-mock-1' },
  { t: 'CSA Settles with Investment Manager', s: 'Canadian Securities Administrators settle enforcement action with investment manager.', r: 'CSA', rn: 'Canadian Securities Administrators', rc: 'Canada', c: 'settlement', i: 'MEDIUM', rel: 0.90, tg: ['Settlement', 'Enforcement'], su: 'https://www.securities-administrators.ca/news/2024-mock-1' },
  { t: 'BCSC Issues Investor Alert on Cryptocurrency Fraud', s: 'British Columbia Securities Commission warns investors about cryptocurrency scams.', r: 'BCSC', rn: 'British Columbia Securities Commission', rc: 'Canada', c: 'investor_alert', i: 'HIGH', rel: 0.70, tg: ['Cryptocurrency', 'Fraud', 'Alert'], su: 'https://www.bcsc.bc.ca/news/2024-mock-1' },
  { t: 'ASC Approves New Compliance Rule', s: 'Alberta Securities Commission approves new compliance requirements for dealers.', r: 'ASC', rn: 'Alberta Securities Commission', rc: 'Canada', c: 'decision', i: 'MEDIUM', rel: 0.80, tg: ['Compliance', 'Regulation'], su: 'https://www.asc.ca/news/2024-mock-1' },
  { t: 'AMF Consultation on ESG Disclosure', s: 'Autorité des marchés financiers launches consultation on ESG disclosure requirements.', r: 'AMF', rn: 'Autorité des marchés financiers', rc: 'Canada', c: 'regulatory_notice', i: 'LOW', rel: 0.75, tg: ['ESG', 'Compliance'], su: 'https://www.amf-quebec.ca/news/2024-mock-1' },
  { t: 'FCAA Enforcement Action Against Dealer', s: 'Financial and Consumer Affairs Authority takes enforcement action against securities dealer.', r: 'FCAA', rn: 'Financial and Consumer Affairs Authority', rc: 'Canada', c: 'enforcement_order', i: 'MEDIUM', rel: 0.85, tg: ['Enforcement', 'Compliance'], su: 'https://www.fcaa.gov.sk.ca/news/2024-mock-1' },
  { t: 'CIRO Updates Suitability Requirements', s: 'Canadian Investment Regulatory Organization updates suitability requirements for advisers.', r: 'CIRO', rn: 'Canadian Investment Regulatory Organization', rc: 'Canada', c: 'regulatory_notice', i: 'MEDIUM', rel: 0.90, tg: ['Suitability', 'Compliance'], su: 'https://www.ciro.ca/news/2024-mock-1' }
];

async function run() {
  console.log('🚀 SCRAPER-FIXED.JS STARTED');
  let processed = 0, errors = 0;
  
  try {
    const { data: runData } = await supabase.from('scraper_runs').insert({ run_type: 'test', triggered_by: 'fixed_scraper', status: 'running', regulators_processed: [] }).select().single();
    const runId = runData.id;
    
    for (const item of DATA) {
      try {
        const { error } = await supabase.from('regulatory_updates').insert({
          title: item.t,
          summary: item.s,
          full_text: item.s,
          source_url: item.su,
          regulator: item.r,
          regulator_name: item.rn,
          regulator_country: item.rc,
          category: item.c,
          impact_rating: item.i,
          mutual_fund_relevance: item.rel,
          tags: item.tg,
          published_date: new Date().toISOString(),
          is_active: true
        });
        
        if (error) throw error;
        console.log(`✅ ${item.t.substring(0, 40)}`);
        processed++;
      } catch (e) {
        console.error(`❌ ${item.t.substring(0, 40)}: ${e.message}`);
        errors++;
      }
    }
    
    await supabase.from('scraper_runs').update({ status: 'completed', total_fetched: DATA.length, total_processed: processed, total_errors: errors, completed_at: new Date().toISOString() }).eq('id', runId);
    
    console.log('\n✅ COMPLETED: ' + processed + ' inserted, ' + errors + ' errors');
    process.exit(0);
  } catch (e) {
    console.error('❌ FATAL:', e.message);
    process.exit(1);
  }
}

run();
