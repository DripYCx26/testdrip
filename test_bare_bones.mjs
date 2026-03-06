/**
 * Bare-bones Drip Node.js SDK test.
 * Follows README docs exactly. No mocks, no frameworks, just real API calls.
 *
 * Usage:
 *     node test_bare_bones.mjs
 */

// NOTE: SDK README says "auto-loads .env when dotenv is installed" but this
// doesn't work in practice because tsup tree-shakes the require('dotenv') call.
// You MUST load dotenv yourself. This is a documentation bug.
import 'dotenv/config';

import { Drip, DripError } from '@drip-sdk/node';

let PASS = 0;
let FAIL = 0;

async function check(name, fn) {
  try {
    const result = await fn();
    console.log(`  PASS  ${name}`);
    PASS++;
    return result;
  } catch (e) {
    console.log(`  FAIL  ${name}: ${e.message || e}`);
    FAIL++;
    return null;
  }
}

console.log('='.repeat(60));
console.log('Drip Node.js SDK — Bare Bones Test');
console.log('='.repeat(60));

// --- SDK INIT ---
// README: "Auto-reads DRIP_API_KEY from environment"
console.log('\n[1] SDK Initialization');

let client;
try {
  // README says: const client = new Drip();
  client = new Drip();
  console.log(`  PASS  new Drip() reads DRIP_API_KEY from env/.env`);
  PASS++;
} catch (e) {
  console.log(`  FAIL  new Drip(): ${e.message}`);
  FAIL++;
  console.log('\nFATAL: SDK could not initialize. Is DRIP_API_KEY set in .env or environment?');
  process.exit(1);
}

console.log(`  INFO  keyType = ${client.keyType}`);
console.log(`  INFO  baseUrl = ${client.baseUrl}`);

// --- PING ---
// README: "await drip.ping()"
console.log('\n[2] Ping');
await check('ping()', () => client.ping());

// --- CREATE CUSTOMER ---
// README: "const customer = await drip.createCustomer({ externalCustomerId: 'user_123' })"
console.log('\n[3] Create Customer');
const extId = `barebone-test-${Date.now()}`;
const customer = await check('createCustomer({ externalCustomerId })',
  () => client.createCustomer({ externalCustomerId: extId }));

if (!customer) {
  console.log('\nFATAL: Could not create customer. Stopping.');
  process.exit(1);
}
console.log(`  INFO  customer.id = ${customer.id}`);

// --- GET CUSTOMER ---
// README: "getCustomer(customerId)"
console.log('\n[4] Get Customer');
const fetched = await check('getCustomer(customerId)',
  () => client.getCustomer(customer.id));

// --- LIST CUSTOMERS ---
// README: "listCustomers(options)"
console.log('\n[5] List Customers');
const listing = await check('listCustomers()', () => client.listCustomers());
if (listing) console.log(`  INFO  count = ${listing.count}`);

// --- TRACK USAGE ---
// README: "await drip.trackUsage({ customerId: customer.id, meter: 'api_calls', quantity: 1 })"
console.log('\n[6] Track Usage');
const usageResult = await check('trackUsage({ customerId, meter, quantity })',
  () => client.trackUsage({
    customerId: customer.id,
    meter: 'api_calls',
    quantity: 1,
  }));

// --- TRACK USAGE WITH METADATA ---
// README: "await drip.trackUsage({ ..., metadata: { model: 'gpt-4o-mini' } })"
console.log('\n[7] Track Usage with Metadata');
await check('trackUsage({ ..., metadata })',
  () => client.trackUsage({
    customerId: customer.id,
    meter: 'llm_tokens',
    quantity: 842,
    metadata: { model: 'gpt-4o-mini' },
  }));

// --- CHARGE ---
// README: "await drip.charge({ customerId, meter, quantity })"
console.log('\n[8] Charge');
const chargeResult = await check('charge({ customerId, meter, quantity })',
  () => client.charge({
    customerId: customer.id,
    meter: 'api_calls',
    quantity: 1,
  }));
if (chargeResult) console.log(`  INFO  charge = ${JSON.stringify(chargeResult).slice(0, 100)}`);

// --- CHARGE ASYNC ---
// README: "chargeAsync(params) — returns 202 immediately"
console.log('\n[9] Charge Async');
const asyncResult = await check('chargeAsync({ customerId, meter, quantity })',
  () => client.chargeAsync({
    customerId: customer.id,
    meter: 'api_calls',
    quantity: 1,
  }));
if (asyncResult) console.log(`  INFO  asyncResult = ${JSON.stringify(asyncResult).slice(0, 100)}`);

// --- LIST CHARGES ---
// README: "listCharges(options?)"
console.log('\n[10] List Charges');
const charges = await check('listCharges()', () => client.listCharges());
if (charges) console.log(`  INFO  count = ${charges.count}`);

// --- GET BALANCE ---
// README: "getBalance(customerId)"
console.log('\n[11] Get Balance');
const balance = await check('getBalance(customerId)',
  () => client.getBalance(customer.id));
if (balance) console.log(`  INFO  balance = ${JSON.stringify(balance)}`);

// --- RECORD RUN ---
// README: "await drip.recordRun({ customerId, workflow, events, status })"
console.log('\n[12] Record Run');
const runResult = await check('recordRun({ customerId, workflow, events, status })',
  () => client.recordRun({
    customerId: customer.id,
    workflow: 'research-agent',
    events: [
      { eventType: 'llm.call', quantity: 1700, units: 'tokens' },
      { eventType: 'tool.call', quantity: 1 },
    ],
    status: 'COMPLETED',
  }));
if (runResult) console.log(`  INFO  run = ${JSON.stringify(runResult).slice(0, 100)}`);

// --- LIST EVENTS ---
// README: "listEvents(options?)"
console.log('\n[13] List Events');
const events = await check('listEvents()', () => client.listEvents());
if (events) console.log(`  INFO  events count = ${events.data?.length ?? 'unknown'}`);

// --- ERROR HANDLING ---
// README: "if (error instanceof DripError) { console.error(...) }"
console.log('\n[14] Error Handling');
await check('DripError on 404', async () => {
  try {
    await client.getCustomer('nonexistent-id-12345');
    throw new Error('Should have thrown');
  } catch (e) {
    if (e instanceof DripError) {
      console.log(`  INFO  Caught DripError: code=${e.code} message=${e.message}`);
      return true;
    }
    // Check if it's a generic Error from the SDK
    if (e.message && e.message.includes('404')) {
      console.log(`  INFO  Caught Error with 404: ${e.message}`);
      return true;
    }
    throw e;
  }
});

// --- SINGLETON ---
// README: "import { drip } from '@drip-sdk/node'"
console.log('\n[15] Singleton');
await check('drip singleton auto-init', async () => {
  const { drip } = await import('@drip-sdk/node');
  await drip.ping();
  return true;
});

// --- SUMMARY ---
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${PASS} passed, ${FAIL} failed out of ${PASS + FAIL}`);
console.log('='.repeat(60));

if (FAIL > 0) process.exit(1);
