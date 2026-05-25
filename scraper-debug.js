#!/usr/bin/env node

/**
 * DEBUG SCRAPER - Shows exactly what's happening
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

console.log('='.repeat(70));
console.log('🔍 DEBUG SCRAPER - Diagnostic Mode');
console.log('='.repeat(70));
console.log(`📅 Time: ${new Date().toISOString()}`);
console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
console.log(`🔑 Service Key: ${SUPABASE_KEY ? SUPABASE_KEY.substring(0, 20) + '...' : 'MISSING'}`);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ FATAL: Missing Supabase credentials!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('STEP 1: Test Supabase Connection');
    console.log('='.repeat(70));
    
    const { data: testData, error: testError } = await supabase
      .from('scraper_runs')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Connection failed:', testError);
      throw testError;
    }
    console.log('✅ Supabase connection OK');

    console.log('\n' + '='.repeat(70));
    console.log('STEP 2: Check regulatory_updates table structure');
    console.log('='.repeat(70));
    
    const { data: sampleData, error: sampleError } = await supabase
      .from('regulatory_updates')
      .select('*')
      .limit(1);
    
    if (sampleError) {
      console.error('❌ Cannot query table:', sampleError);
      throw sampleError;
    }
    console.log('✅ Table exists and is readable');

    console.log('\n' + '='.repeat(70));
    console.log('STEP 3: Attempt to insert one test record');
    console.log('='.repeat(70));
    
    const testRecord = {
      title: 'DEBUG TEST - ' + new Date().toISOString(),
      summary: 'This is a test record to debug the insert issue',
      full_text: 'This is a test record to debug the insert issue',
      source_url: 'https://debug-test-' + Date.now() + '.example.com',
      regulator: 'SEC',
      regulator_name: 'U.S. Securities and Exchange Commission',
      regulator_country: 'USA',
      category: 'news',
      impact_rating: 'LOW',
      mutual_fund_relevance: 0.5,
      tags: ['Debug', 'Test'],
      published_date: new Date().toISOString(),
      is_active: true,
      is_processed: false
    };

    console.log('\n📝 Attempting to insert record:');
    console.log(JSON.stringify(testRecord, null, 2));

    const { data: insertData, error: insertError } = await supabase
      .from('regulatory_updates')
      .insert([testRecord])
      .select();

    if (insertError) {
      console.error('\n❌ INSERT FAILED!');
      console.error('Error Code:', insertError.code);
      console.error('Error Message:', insertError.message);
      console.error('Error Details:', insertError);
      throw insertError;
    }

    console.log('\n✅ INSERT SUCCESSFUL!');
    console.log('Inserted data:', insertData);

    console.log('\n' + '='.repeat(70));
    console.log('STEP 4: Verify record was inserted');
    console.log('='.repeat(70));
    
    const { data: verifyData, error: verifyError } = await supabase
      .from('regulatory_updates')
      .select('*')
      .eq('source_url', testRecord.source_url);

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
      throw verifyError;
    }

    if (verifyData && verifyData.length > 0) {
      console.log('✅ Record verified in database!');
      console.log('Record:', verifyData[0]);
    } else {
      console.error('❌ Record not found after insert!');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ DEBUG COMPLETE - All tests passed!');
    console.log('='.repeat(70));
    console.log('\n🎉 Your Supabase setup is working correctly!');
    console.log('The issue might be with the mock data format.');
    console.log('Try running scraper-v4.js next.');

    process.exit(0);

  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ DEBUG FAILED');
    console.error('='.repeat(70));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main();
