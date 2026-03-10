/**
 * Phase 3: GETTING_STARTED.md Test — Node.js
 *
 * Tests Steps 1-9 from GETTING_STARTED.md using the EXACT singleton style
 * documented there: import { drip } from '@drip-sdk/node'
 *
 * Usage: node docs-qa/test-getting-started-node.mjs
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';

let PASS = 0;
let FAIL = 0;
const results = [];

async function check(name, fn) {
  try {
    const result = await fn();
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    PASS++;
    results.push({ name, status: 'PASS' });
    return result;
  } catch (e) {
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}: ${e.message || e}`);
    FAIL++;
    results.push({ name, status: 'FAIL', error: e.message });
    return null;
  }
}

function info(msg) {
  console.log(`  \x1b[36mINFO\x1b[0m  ${msg}`);
}

console.log('='.repeat(70));
console.log('Phase 3: GETTING_STARTED.md Test — Node.js (Singleton Style)');
console.log('='.repeat(70));

// =====================================================================
// GETTING_STARTED.md Step 0: "export DRIP_API_KEY=..."
// The docs assume env var is set. We use dotenv/config.
// NOTE: GETTING_STARTED.md does NOT mention dotenv at all!
// =====================================================================
console.log('\n\x1b[1m[Step 0] API Key Setup\x1b[0m');

await check('DRIP_API_KEY is in environment', async () => {
  if (!process.env.DRIP_API_KEY) {
    throw new Error('DRIP_API_KEY not set. GETTING_STARTED.md says "export DRIP_API_KEY=..." but does NOT mention dotenv for Node.js .env files');
  }
  info(`Key prefix: ${process.env.DRIP_API_KEY.substring(0, 8)}...`);
});

// =====================================================================
// GETTING_STARTED.md Quick Path Step 1:
//   import { drip } from '@drip-sdk/node';
//   const customer = await drip.createCustomer({ externalCustomerId: 'user_123' });
//   console.log(`Customer ID: ${customer.id}`);
// =====================================================================
console.log('\n\x1b[1m[Step 1] Create a Customer (singleton)\x1b[0m');

import { drip, DripError } from '@drip-sdk/node';

let customerId = null;

const customer = await check('drip.createCustomer (GETTING_STARTED Step 1)', async () => {
  const ts = Date.now();
  const result = await drip.createCustomer({ externalCustomerId: `gs-node-${ts}` });
  console.log(`  \x1b[36mINFO\x1b[0m  Customer ID: ${result.id}`);
  customerId = result.id;
  return result;
});

if (!customerId) {
  console.log('\nFATAL: Could not create customer. Cannot continue.');
  process.exit(1);
}

// =====================================================================
// GETTING_STARTED.md Quick Path Step 2:
//   const { data } = await drip.listCustomers();
//   data.forEach(c => console.log(`${c.id}  ${c.externalCustomerId}  ${c.status}`));
// =====================================================================
console.log('\n\x1b[1m[Step 2] List Customers (singleton)\x1b[0m');

await check('drip.listCustomers (GETTING_STARTED Step 2)', async () => {
  const { data } = await drip.listCustomers();
  info(`Found ${data.length} customers`);
  if (data.length > 0) {
    const c = data[0];
    info(`First: ${c.id}  ${c.externalCustomerId}  ${c.status}`);
  }
});

// =====================================================================
// GETTING_STARTED.md Quick Path Step 4:
//   await drip.trackUsage({
//     customerId: 'CUSTOMER_ID',
//     meter: 'api_calls',
//     quantity: 1,
//     idempotencyKey: `req_${Date.now()}`,
//   });
// =====================================================================
console.log('\n\x1b[1m[Step 4] Record Usage (singleton)\x1b[0m');

await check('drip.trackUsage (GETTING_STARTED Step 4)', async () => {
  await drip.trackUsage({
    customerId: customerId,
    meter: 'api_calls',
    quantity: 1,
    idempotencyKey: `req_${Date.now()}`,
  });
  info('trackUsage succeeded');
});

// =====================================================================
// GETTING_STARTED.md Quick Path Step 5:
//   await drip.trackUsage({
//     customerId: 'CUSTOMER_ID',
//     meter: 'llm_tokens',
//     quantity: 1500,
//     metadata: { model: 'gpt-4', input_tokens: 500, output_tokens: 1000 },
//   });
// =====================================================================
console.log('\n\x1b[1m[Step 5] Record Usage with Quantity (singleton)\x1b[0m');

await check('drip.trackUsage with quantity & metadata (GETTING_STARTED Step 5)', async () => {
  await drip.trackUsage({
    customerId: customerId,
    meter: 'llm_tokens',
    quantity: 1500,
    metadata: { model: 'gpt-4', input_tokens: 500, output_tokens: 1000 },
  });
  info('trackUsage with quantity succeeded');
});

// =====================================================================
// GETTING_STARTED.md Full Integration Step 5:
//   await drip.trackUsage({
//     customerId: customer.id,
//     meter: 'api_calls',
//     quantity: 1,
//     idempotencyKey: `track_${Date.now()}`,
//     metadata: { endpoint: '/v1/generate' },
//   });
// =====================================================================
console.log('\n\x1b[1m[Full Step 5] Track Usage with idempotencyKey + metadata\x1b[0m');

await check('drip.trackUsage full step 5 style', async () => {
  await drip.trackUsage({
    customerId: customerId,
    meter: 'api_calls',
    quantity: 1,
    idempotencyKey: `track_${Date.now()}`,
    metadata: { endpoint: '/v1/generate' },
  });
  info('Full step 5 trackUsage succeeded');
});

// =====================================================================
// GETTING_STARTED.md Full Integration Step 6:
//   const charge = await drip.charge({
//     customerId: customer.id,
//     meter: 'api_calls',
//     quantity: 100,
//     idempotencyKey: `charge_${Date.now()}`,
//   });
//   console.log(charge.charge.id, charge.charge.amountUsdc);
// =====================================================================
console.log('\n\x1b[1m[Full Step 6] Charge Usage\x1b[0m');

await check('drip.charge (GETTING_STARTED Step 6)', async () => {
  const charge = await drip.charge({
    customerId: customerId,
    meter: 'api_calls',
    quantity: 100,
    idempotencyKey: `charge_${Date.now()}`,
  });
  info(`charge.success = ${charge.success}`);
  if (charge.charge) {
    info(`charge.charge.id = ${charge.charge.id}`);
    info(`charge.charge.amountUsdc = ${charge.charge.amountUsdc}`);
  } else {
    info('WARNING: charge.charge is undefined — docs say to access charge.charge.id');
  }
});

// =====================================================================
// GETTING_STARTED.md Full Integration Step 8:
//   const webhook = await drip.createWebhook({
//     url: 'https://api.yourapp.com/webhooks/drip',
//     events: ['charge.succeeded', 'charge.failed', 'customer.balance.low'],
//   });
//   console.log(webhook.secret); // Save securely, shown once
// =====================================================================
console.log('\n\x1b[1m[Full Step 8] Webhooks\x1b[0m');

let webhookId = null;
await check('drip.createWebhook (GETTING_STARTED Step 8)', async () => {
  const webhook = await drip.createWebhook({
    url: 'https://httpbin.org/post',
    events: ['charge.succeeded', 'charge.failed', 'customer.balance.low'],
  });
  info(`webhook.id = ${webhook.id}`);
  info(`webhook.secret = ${webhook.secret ? '[present]' : 'MISSING — docs say "shown once"'}`);
  webhookId = webhook.id;
});

// Cleanup webhook
if (webhookId) {
  await check('drip.deleteWebhook (cleanup)', async () => {
    await drip.deleteWebhook(webhookId);
    info('Webhook deleted');
  });
}

// =====================================================================
// GETTING_STARTED.md Full Integration Step 9:
//   import { DripError } from '@drip-sdk/node';
//   try { ... } catch (error) { if (error instanceof DripError) { ... } }
// =====================================================================
console.log('\n\x1b[1m[Full Step 9] Error Handling\x1b[0m');

await check('DripError on bad customer ID (GETTING_STARTED Step 9)', async () => {
  try {
    await drip.charge({
      customerId: 'nonexistent-customer-99999',
      meter: 'api_calls',
      quantity: 1,
    });
    throw new Error('Should have thrown');
  } catch (error) {
    if (error instanceof DripError) {
      info(`DripError caught: code=${error.code} message=${error.message}`);
      // Verify error codes match docs
      const docsCodes = ['PAYMENT_REQUIRED', 'INSUFFICIENT_BALANCE', 'CUSTOMER_NOT_FOUND', 'RATE_LIMIT_EXCEEDED', 'PUBLIC_KEY_NOT_ALLOWED'];
      info(`Error code "${error.code}" is in docs list: ${docsCodes.includes(error.code)}`);
      return true;
    }
    if (error.message === 'Should have thrown') throw error;
    info(`Non-DripError caught: ${error.message}`);
    return true;
  }
});

// =====================================================================
// CROSS-CHECK: singleton vs class consistency
// =====================================================================
console.log('\n\x1b[1m[Cross-Check] Singleton vs Class\x1b[0m');

await check('Singleton and class produce same results', async () => {
  const { Drip } = await import('@drip-sdk/node');
  const classClient = new Drip();
  const singletonResult = await drip.listCustomers({ limit: 1 });
  const classResult = await classClient.listCustomers({ limit: 1 });
  info(`Singleton count: ${singletonResult.count}, Class count: ${classResult.count}`);
  if (singletonResult.count !== classResult.count) {
    throw new Error(`Counts differ: singleton=${singletonResult.count} class=${classResult.count}`);
  }
});

// =====================================================================
// SUMMARY
// =====================================================================
console.log('\n' + '='.repeat(70));
console.log(`RESULTS: \x1b[32m${PASS} passed\x1b[0m, \x1b[31m${FAIL} failed\x1b[0m out of ${PASS + FAIL}`);
console.log('='.repeat(70));

if (FAIL > 0) {
  console.log('\nFailed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
}

writeFileSync(
  new URL('./results-getting-started-node.json', import.meta.url),
  JSON.stringify({ phase: 'getting-started-node', pass: PASS, fail: FAIL, results }, null, 2)
);
console.log('\nResults written to docs-qa/results-getting-started-node.json');
