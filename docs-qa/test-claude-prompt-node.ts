/**
 * Phase 2: Claude Prompt Test — Node.js
 *
 * This file copies the EXACT code from the user's Claude integration prompt
 * and wraps it in an async main(). We test whether each code block works
 * as documented.
 *
 * Usage: npx tsx docs-qa/test-claude-prompt-node.ts
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

let PASS = 0;
let FAIL = 0;
const results: Array<{ name: string; status: string; error?: string; details?: string }> = [];

async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    PASS++;
    results.push({ name, status: 'PASS' });
    return result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}: ${msg}`);
    FAIL++;
    results.push({ name, status: 'FAIL', error: msg });
    return null;
  }
}

function info(msg: string) {
  console.log(`  \x1b[36mINFO\x1b[0m  ${msg}`);
}

console.log('='.repeat(70));
console.log('Phase 2: Claude Prompt Test — Node.js (Class Style)');
console.log('='.repeat(70));

// =====================================================================
// The Claude prompt says:
//   import 'dotenv/config';  // loads .env file
//   import { Drip } from '@drip-sdk/node';
//   const drip = new Drip();  // reads DRIP_API_KEY from env
// =====================================================================
console.log('\n\x1b[1m[1] SDK Import & Init (from Claude prompt)\x1b[0m');

import { Drip } from '@drip-sdk/node';

let drip: InstanceType<typeof Drip>;

await check('import { Drip } from "@drip-sdk/node" works', async () => {
  if (!Drip) throw new Error('Drip is falsy');
  info(`Drip imported successfully, typeof = ${typeof Drip}`);
});

await check('const drip = new Drip() reads DRIP_API_KEY from env', async () => {
  drip = new Drip();
  info(`Initialized. keyType=${drip.keyType}, baseUrl=${drip.baseUrl}`);
});

// =====================================================================
// The Claude prompt says:
//   const customer = await drip.createCustomer({
//     externalCustomerId: 'your-user-id'
//   });
// =====================================================================
console.log('\n\x1b[1m[2] Create Customer (from Claude prompt)\x1b[0m');

let customerId: string | null = null;

const customer = await check('drip.createCustomer({ externalCustomerId })', async () => {
  const ts = Date.now();
  const result = await drip.createCustomer({
    externalCustomerId: `claude-prompt-test-${ts}`,
  });
  info(`customer.id = ${result.id}`);
  info(`customer.externalCustomerId = ${(result as Record<string, unknown>).externalCustomerId}`);
  info(`customer.status = ${(result as Record<string, unknown>).status}`);
  customerId = result.id;
  return result;
});

if (!customerId) {
  console.log('\nFATAL: Could not create customer. Cannot continue tests.');
  process.exit(1);
}

// =====================================================================
// The Claude prompt says:
//   await drip.trackUsage({
//     customerId: customer.id,
//     meter: 'api_calls',
//     quantity: 1,
//     metadata: { endpoint: '/api/generate' }
//   });
// =====================================================================
console.log('\n\x1b[1m[3] Track Usage (from Claude prompt)\x1b[0m');

await check('drip.trackUsage({ customerId, meter, quantity, metadata })', async () => {
  const result = await drip.trackUsage({
    customerId: customerId!,
    meter: 'api_calls',
    quantity: 1,
    metadata: { endpoint: '/api/generate' },
  });
  info(`result = ${JSON.stringify(result)}`);
});

// =====================================================================
// The Claude prompt says:
//   await drip.recordRun({
//     customerId: customer.id,
//     workflow: 'agent-task',
//     events: [
//       { eventType: 'llm.call', quantity: 2500, units: 'tokens' },
//       { eventType: 'tool.call', quantity: 3, units: 'calls' },
//     ],
//     status: 'COMPLETED'
//   });
// =====================================================================
console.log('\n\x1b[1m[4] Record Run (from Claude prompt)\x1b[0m');

await check('drip.recordRun({ customerId, workflow, events, status })', async () => {
  const result = await drip.recordRun({
    customerId: customerId!,
    workflow: 'agent-task',
    events: [
      { eventType: 'llm.call', quantity: 2500, units: 'tokens' },
      { eventType: 'tool.call', quantity: 3, units: 'calls' },
    ],
    status: 'COMPLETED',
  });
  info(`result = ${JSON.stringify(result)}`);
});

// =====================================================================
// Additional: Test that customer.id is accessible as .id (not .customer_id etc.)
// =====================================================================
console.log('\n\x1b[1m[5] Response Shape Validation\x1b[0m');

await check('customer response has .id property (not .customer_id)', async () => {
  if (!customer) throw new Error('No customer object');
  const c = customer as Record<string, unknown>;
  if (!c.id) throw new Error(`customer.id is ${c.id}`);
  if (typeof c.id !== 'string') throw new Error(`customer.id is ${typeof c.id}, expected string`);
  // Check if docs-suggested fields exist
  const fields = ['id', 'externalCustomerId', 'status'];
  for (const f of fields) {
    info(`customer.${f} = ${c[f]}`);
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

const __dirname = dirname(fileURLToPath(import.meta.url));
writeFileSync(
  join(__dirname, 'results-claude-prompt-node.json'),
  JSON.stringify({ phase: 'claude-prompt-node', pass: PASS, fail: FAIL, results }, null, 2)
);
console.log('\nResults written to docs-qa/results-claude-prompt-node.json');
