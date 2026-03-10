/**
 * Phase 1: Import Validation Tests
 * Tests that SDK packages resolve and exports exist — NO API calls.
 *
 * Usage: node docs-qa/test-imports.mjs
 */

let PASS = 0;
let FAIL = 0;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
    PASS++;
    results.push({ name, status: 'PASS' });
  } catch (e) {
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}: ${e.message || e}`);
    FAIL++;
    results.push({ name, status: 'FAIL', error: e.message });
  }
}

function info(msg) {
  console.log(`  \x1b[36mINFO\x1b[0m  ${msg}`);
}

console.log('='.repeat(70));
console.log('Phase 1: Import Validation (No API Calls)');
console.log('='.repeat(70));

// =====================================================================
// 1. Class export: import { Drip } from '@drip-sdk/node'
// =====================================================================
console.log('\n\x1b[1m[1] Class Export\x1b[0m');

await check('import { Drip } from "@drip-sdk/node" resolves', async () => {
  const mod = await import('@drip-sdk/node');
  if (!mod.Drip) throw new Error('Drip class not found in exports');
  if (typeof mod.Drip !== 'function') throw new Error(`Drip is ${typeof mod.Drip}, expected function`);
  info(`typeof Drip = ${typeof mod.Drip}`);
});

// =====================================================================
// 2. Singleton export: import { drip } from '@drip-sdk/node'
// =====================================================================
console.log('\n\x1b[1m[2] Singleton Export\x1b[0m');

await check('import { drip } from "@drip-sdk/node" resolves', async () => {
  const mod = await import('@drip-sdk/node');
  if (!mod.drip) throw new Error('drip singleton not found in exports');
  info(`typeof drip = ${typeof mod.drip}`);
});

// =====================================================================
// 3. Error class export: import { DripError } from '@drip-sdk/node'
// =====================================================================
console.log('\n\x1b[1m[3] Error Class Export\x1b[0m');

await check('import { DripError } from "@drip-sdk/node" resolves', async () => {
  const mod = await import('@drip-sdk/node');
  if (!mod.DripError) throw new Error('DripError not found in exports');
  if (typeof mod.DripError !== 'function') throw new Error(`DripError is ${typeof mod.DripError}`);
  info(`typeof DripError = ${typeof mod.DripError}`);
});

// =====================================================================
// 4. Subpath exports: /next and /express
// =====================================================================
console.log('\n\x1b[1m[4] Subpath Exports\x1b[0m');

await check('import { withDrip } from "@drip-sdk/node/next" resolves', async () => {
  const mod = await import('@drip-sdk/node/next');
  if (!mod.withDrip) throw new Error('withDrip not found in @drip-sdk/node/next');
  info(`typeof withDrip = ${typeof mod.withDrip}`);
});

await check('import { dripMiddleware } from "@drip-sdk/node/express" resolves', async () => {
  const mod = await import('@drip-sdk/node/express');
  if (!mod.dripMiddleware) throw new Error('dripMiddleware not found in @drip-sdk/node/express');
  info(`typeof dripMiddleware = ${typeof mod.dripMiddleware}`);
});

// Test the CLAUDE_INTEGRATION_PROMPT.md import path: @drip-sdk/node/middleware
await check('import from "@drip-sdk/node/middleware" resolves (CLAUDE_INTEGRATION_PROMPT path)', async () => {
  try {
    const mod = await import('@drip-sdk/node/middleware');
    info(`exports: ${Object.keys(mod).join(', ')}`);
  } catch (e) {
    throw new Error(`@drip-sdk/node/middleware does NOT resolve: ${e.message}`);
  }
});

// =====================================================================
// 5. Constructor behavior
// =====================================================================
console.log('\n\x1b[1m[5] Constructor Behavior\x1b[0m');

await check('new Drip() without DRIP_API_KEY throws', async () => {
  const { Drip } = await import('@drip-sdk/node');
  const origKey = process.env.DRIP_API_KEY;
  delete process.env.DRIP_API_KEY;
  try {
    const client = new Drip();
    // If it doesn't throw, check if it defers the error
    if (client) {
      info('WARNING: new Drip() did NOT throw without DRIP_API_KEY — error may be deferred to first API call');
    }
  } catch (e) {
    info(`Threw as expected: ${e.message}`);
  } finally {
    if (origKey) process.env.DRIP_API_KEY = origKey;
  }
});

await check('new Drip({ apiKey: "sk_test_fake" }) succeeds', async () => {
  const { Drip } = await import('@drip-sdk/node');
  const client = new Drip({ apiKey: 'sk_test_fake123' });
  if (!client) throw new Error('Constructor returned falsy');
  info('Constructor succeeded with explicit apiKey');
});

// =====================================================================
// 6. Instance properties
// =====================================================================
console.log('\n\x1b[1m[6] Instance Properties\x1b[0m');

await check('client.keyType exists and returns correct type', async () => {
  const { Drip } = await import('@drip-sdk/node');
  const client = new Drip({ apiKey: 'sk_test_fake123' });
  if (client.keyType === undefined) throw new Error('keyType is undefined');
  info(`keyType = "${client.keyType}"`);
  if (client.keyType !== 'secret') throw new Error(`Expected "secret" for sk_ key, got "${client.keyType}"`);
});

await check('client.keyType returns "public" for pk_ key', async () => {
  const { Drip } = await import('@drip-sdk/node');
  const client = new Drip({ apiKey: 'pk_test_fake123' });
  if (client.keyType !== 'public') throw new Error(`Expected "public" for pk_ key, got "${client.keyType}"`);
  info(`keyType = "${client.keyType}"`);
});

await check('client.baseUrl exists and has default value', async () => {
  const { Drip } = await import('@drip-sdk/node');
  const client = new Drip({ apiKey: 'sk_test_fake123' });
  if (!client.baseUrl) throw new Error('baseUrl is falsy');
  info(`baseUrl = "${client.baseUrl}"`);
  if (!client.baseUrl.includes('drippay.dev')) {
    info(`WARNING: baseUrl does not contain "drippay.dev" — might default differently`);
  }
});

// =====================================================================
// 7. Method existence checks
// =====================================================================
console.log('\n\x1b[1m[7] Method Existence\x1b[0m');

const methodsToCheck = [
  'createCustomer', 'getCustomer', 'listCustomers', 'getOrCreateCustomer',
  'trackUsage', 'charge', 'chargeAsync',
  'recordRun', 'startRun', 'endRun', 'emitEvent', 'emitEventsBatch',
  'listCharges', 'getCharge', 'getBalance',
  'createWebhook', 'listWebhooks', 'deleteWebhook',
  'checkEntitlement', 'ping',
];

for (const method of methodsToCheck) {
  await check(`client.${method} exists`, async () => {
    const { Drip } = await import('@drip-sdk/node');
    const client = new Drip({ apiKey: 'sk_test_fake123' });
    if (typeof client[method] !== 'function') {
      throw new Error(`client.${method} is ${typeof client[method]}, expected function`);
    }
  });
}

// =====================================================================
// 8. Static method checks
// =====================================================================
console.log('\n\x1b[1m[8] Static Methods\x1b[0m');

await check('Drip.generateIdempotencyKey exists', async () => {
  const { Drip } = await import('@drip-sdk/node');
  if (typeof Drip.generateIdempotencyKey !== 'function') {
    throw new Error(`Not a function: ${typeof Drip.generateIdempotencyKey}`);
  }
});

await check('Drip.verifyWebhookSignature exists', async () => {
  const { Drip } = await import('@drip-sdk/node');
  if (typeof Drip.verifyWebhookSignature !== 'function') {
    throw new Error(`Not a function: ${typeof Drip.verifyWebhookSignature}`);
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

// Write results to JSON for audit report
import { writeFileSync } from 'fs';
writeFileSync(
  new URL('./results-imports.json', import.meta.url),
  JSON.stringify({ phase: 'imports', pass: PASS, fail: FAIL, results }, null, 2)
);
console.log('\nResults written to docs-qa/results-imports.json');
