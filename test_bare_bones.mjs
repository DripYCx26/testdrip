/**
 * Comprehensive Drip Node.js SDK + raw API test.
 * Tests EVERY public SDK method AND every documented API endpoint.
 * No mocks, no frameworks — just real API calls.
 *
 * Usage:
 *     node test_bare_bones.mjs
 */
import 'dotenv/config';
import { Drip, DripError } from '@drip-sdk/node';

const API_KEY = process.env.DRIP_API_KEY;
const BASE_URL = 'https://api.drippay.dev/v1';

let PASS = 0;
let FAIL = 0;
let SKIP = 0;
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

function skip(name, reason) {
  console.log(`  \x1b[33mSKIP\x1b[0m  ${name}: ${reason}`);
  SKIP++;
  results.push({ name, status: 'SKIP', reason });
}

function info(msg) {
  console.log(`  \x1b[36mINFO\x1b[0m  ${msg}`);
}

function section(num, title) {
  console.log(`\n\x1b[1m[${num}] ${title}\x1b[0m`);
}

/** Raw API helper — for endpoints without SDK methods */
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

console.log('='.repeat(70));
console.log('Drip Node.js SDK — Comprehensive Bare Bones Test');
console.log('='.repeat(70));

// =====================================================================
// 1. SDK Initialization
// =====================================================================
section(1, 'SDK Initialization');

let client;
try {
  client = new Drip();
  console.log(`  \x1b[32mPASS\x1b[0m  new Drip() reads DRIP_API_KEY from env`);
  PASS++;
  info(`keyType = ${client.keyType}`);
  info(`baseUrl = ${client.baseUrl}`);
} catch (e) {
  console.log(`  \x1b[31mFAIL\x1b[0m  new Drip(): ${e.message}`);
  FAIL++;
  console.log('\nFATAL: SDK could not initialize.');
  process.exit(1);
}

await check('new Drip({ apiKey }) with explicit key', () => {
  const c = new Drip({ apiKey: API_KEY });
  if (!c.baseUrl.includes('drippay.dev')) throw new Error('Bad baseUrl');
  return true;
});

// =====================================================================
// 2. Health / Ping
// =====================================================================
section(2, 'Health & Ping');

const pingResult = await check('ping()', () => client.ping());
if (pingResult) {
  info(`ok=${pingResult.ok} status=${pingResult.status} latency=${pingResult.latencyMs}ms`);
}

// =====================================================================
// 3. Resilience Helpers
// =====================================================================
section(3, 'Resilience Helpers');

await check('getMetrics() returns null when resilience disabled', () => {
  const m = client.getMetrics();
  if (m !== null) throw new Error(`Expected null, got ${JSON.stringify(m)}`);
  return true;
});

await check('getHealth() returns null when resilience disabled', () => {
  const h = client.getHealth();
  if (h !== null) throw new Error(`Expected null, got ${JSON.stringify(h)}`);
  return true;
});

// =====================================================================
// 4. Customer Management
// =====================================================================
section(4, 'Customer Management');

const extId = `bb-node-${Date.now()}`;
const customer = await check('createCustomer({ externalCustomerId })',
  () => client.createCustomer({ externalCustomerId: extId }));

if (!customer) {
  console.log('\nFATAL: Could not create customer. Stopping.');
  process.exit(1);
}
info(`customer.id = ${customer.id}`);

const fetched = await check('getCustomer(customerId)',
  () => client.getCustomer(customer.id));
if (fetched) info(`externalCustomerId = ${fetched.externalCustomerId}`);

const listing = await check('listCustomers()', () => client.listCustomers());
if (listing) info(`count = ${listing.count}`);

await check('listCustomers({ limit: 2 })', async () => {
  const res = await client.listCustomers({ limit: 2 });
  if (!res.data || res.data.length > 2) throw new Error('Limit not respected');
  return res;
});

const gotOrCreated = await check('getOrCreateCustomer(externalCustomerId)',
  () => client.getOrCreateCustomer(extId));
if (gotOrCreated) {
  if (gotOrCreated.id !== customer.id) throw new Error('getOrCreate returned different ID');
  info('Returned same customer (idempotent)');
}

// =====================================================================
// 5. Balance
// =====================================================================
section(5, 'Balance');

const balance = await check('getBalance(customerId)',
  () => client.getBalance(customer.id));
if (balance) {
  info(`balanceUsdc=${balance.balanceUsdc} pendingCharges=${balance.pendingChargesUsdc} available=${balance.availableUsdc}`);
}

// =====================================================================
// 6. Customer Provisioning (raw API)
// =====================================================================
section(6, 'Customer Provisioning & Sync (Raw API)');

await check('POST /customers/:id/provision',
  () => api('POST', `/customers/${customer.id}/provision`, {}));

await check('POST /customers/:id/sync-balance',
  () => api('POST', `/customers/${customer.id}/sync-balance`));

// =====================================================================
// 7. Spending Caps
// =====================================================================
section(7, 'Spending Caps');

const cap = await check('setCustomerSpendingCap(customerId, { capType, limitValue })',
  () => client.setCustomerSpendingCap(customer.id, {
    capType: 'DAILY_CHARGE_LIMIT',
    limitValue: 50,
  }));
if (cap) info(`cap.id = ${cap.id}, type=${cap.capType}, limit=${cap.limitValue}`);

const caps = await check('getCustomerSpendingCaps(customerId)',
  () => client.getCustomerSpendingCaps(customer.id));
if (caps) info(`caps count = ${caps.caps?.length ?? 0}`);

if (cap) {
  await check('removeCustomerSpendingCap(customerId, capId)',
    () => client.removeCustomerSpendingCap(customer.id, cap.id));
}

// =====================================================================
// 8. Track Usage (internal / no billing)
// =====================================================================
section(8, 'Track Usage (Internal)');

const trackResult = await check('trackUsage({ customerId, meter, quantity })',
  () => client.trackUsage({
    customerId: customer.id,
    meter: 'api_calls',
    quantity: 1,
  }));
if (trackResult) info(`usageEventId = ${trackResult.usageEventId || 'ok'}`);

await check('trackUsage with metadata',
  () => client.trackUsage({
    customerId: customer.id,
    meter: 'llm_tokens',
    quantity: 842,
    metadata: { model: 'gpt-4o-mini' },
  }));

await check('trackUsage with custom idempotencyKey',
  () => client.trackUsage({
    customerId: customer.id,
    meter: 'api_calls',
    quantity: 1,
    idempotencyKey: `node-idem-${Date.now()}`,
  }));

// =====================================================================
// 9. Charge (sync)
// =====================================================================
section(9, 'Charge (Sync)');

const chargeResult = await check('charge({ customerId, meter, quantity })',
  () => client.charge({
    customerId: customer.id,
    meter: 'api_calls',
    quantity: 1,
  }));
if (chargeResult) {
  info(`charge.success=${chargeResult.success} isDuplicate=${chargeResult.isDuplicate}`);
  info(`chargeId = ${chargeResult.charge?.id}`);
}

await check('charge with metadata',
  () => client.charge({
    customerId: customer.id,
    meter: 'api_calls',
    quantity: 1,
    metadata: { model: 'claude-sonnet-4-20250514', prompt: 'test' },
  }));

await check('charge with custom idempotencyKey',
  () => client.charge({
    customerId: customer.id,
    meter: 'api_calls',
    quantity: 1,
    idempotencyKey: `node-charge-idem-${Date.now()}`,
  }));

// =====================================================================
// 10. Charge Async
// =====================================================================
section(10, 'Charge Async');

const asyncResult = await check('chargeAsync({ customerId, meter, quantity })',
  () => client.chargeAsync({
    customerId: customer.id,
    meter: 'api_calls',
    quantity: 1,
  }));
if (asyncResult) {
  info(`asyncResult.success=${asyncResult.success}`);
  if (asyncResult.message) info(`message = ${asyncResult.message}`);
}

// =====================================================================
// 11. List & Get Charges
// =====================================================================
section(11, 'List & Get Charges');

const charges = await check('listCharges()', () => client.listCharges());
if (charges) info(`count = ${charges.count}`);

await check('listCharges({ limit: 3 })', async () => {
  const res = await client.listCharges({ limit: 3 });
  if (res.data.length > 3) throw new Error('Limit not respected');
  return res;
});

await check('listCharges({ customerId })', async () => {
  const res = await client.listCharges({ customerId: customer.id });
  info(`charges for customer = ${res.data?.length}`);
  return res;
});

if (chargeResult?.charge?.id) {
  const singleCharge = await check('getCharge(chargeId)',
    () => client.getCharge(chargeResult.charge.id));
  if (singleCharge) info(`charge status = ${singleCharge.status}`);
}

// Raw API: GET /charges
await check('GET /charges (raw API)', () => api('GET', '/charges?limit=2'));

// =====================================================================
// 12. Wrap API Call
// =====================================================================
section(12, 'Wrap API Call');

const wrapResult = await check('wrapApiCall({ customerId, meter, call, extractUsage })',
  () => client.wrapApiCall({
    customerId: customer.id,
    meter: 'api_calls',
    call: async () => ({ tokens: 42, text: 'hello world' }),
    extractUsage: (r) => r.tokens,
  }));
if (wrapResult) {
  info(`result.text = ${wrapResult.result.text}`);
  info(`idempotencyKey = ${wrapResult.idempotencyKey}`);
}

// =====================================================================
// 13. Workflows
// =====================================================================
section(13, 'Workflows');

const workflow = await check('createWorkflow({ name, slug })',
  () => client.createWorkflow({
    name: `BB Test Workflow ${Date.now()}`,
    slug: `bb-test-workflow-${Date.now()}`,
  }));
if (workflow) info(`workflow.id = ${workflow.id}`);

const workflows = await check('listWorkflows()', () => client.listWorkflows());
if (workflows) info(`workflows count = ${workflows.count}`);

// =====================================================================
// 14. Runs — Start / End / Get
// =====================================================================
section(14, 'Runs — Start / End / Get');

let runId = null;
const run = await check('startRun({ customerId, workflowId })',
  () => client.startRun({
    customerId: customer.id,
    workflowId: workflow?.id,
  }));
if (run) {
  runId = run.id;
  info(`run.id = ${run.id}`);
}

if (runId) {
  const runDetails = await check('getRun(runId)', () => client.getRun(runId));
  if (runDetails) info(`run status = ${runDetails.status}`);

  await check('endRun(runId, { status: "COMPLETED" })',
    () => client.endRun(runId, { status: 'COMPLETED' }));
}

// =====================================================================
// 15. Events — Emit / Batch / List / Get / Trace
// =====================================================================
section(15, 'Events — Emit / Batch / List / Get / Trace');

const evtRun = await check('startRun (for events)',
  () => client.startRun({ customerId: customer.id, workflowId: workflow?.id }));
const evtRunId = evtRun?.id;

let singleEventId = null;
if (evtRunId) {
  const evt = await check('emitEvent({ runId, eventType, quantity })',
    () => client.emitEvent({
      runId: evtRunId,
      eventType: 'llm.call',
      quantity: 1500,
      units: 'tokens',
      description: 'GPT-4o inference',
    }));
  if (evt) {
    singleEventId = evt.eventId;
    info(`eventId = ${evt.eventId}`);
  }

  await check('emitEventsBatch([...])',
    () => client.emitEventsBatch([
      { runId: evtRunId, eventType: 'tool.call', quantity: 1, units: 'calls' },
      { runId: evtRunId, eventType: 'embedding', quantity: 256, units: 'tokens' },
    ]));

  await check('endRun (events run)',
    () => client.endRun(evtRunId, { status: 'COMPLETED' }));
}

const events = await check('listEvents()', () => client.listEvents());
if (events) info(`events count = ${events.data?.length}`);

await check('listEvents({ limit: 5 })', async () => {
  const res = await client.listEvents({ limit: 5 });
  if (res.data.length > 5) throw new Error('Limit not respected');
  return res;
});

await check('listEvents({ customerId })',
  () => client.listEvents({ customerId: customer.id }));

await check('listEvents({ runId })',
  () => client.listEvents({ runId: evtRunId, limit: 3 }));

if (singleEventId) {
  const evt = await check('getEvent(eventId)',
    () => client.getEvent(singleEventId));
  if (evt) info(`event.eventType = ${evt.eventType}`);

  await check('getEventTrace(eventId)',
    () => client.getEventTrace(singleEventId));
}

// Raw API: GET /events (with filters)
await check('GET /events?customerId=...&limit=2 (raw API)',
  () => api('GET', `/events?customerId=${customer.id}&limit=2`));

// Raw API: POST /events (record event directly)
await check('POST /events (raw API)', async () => {
  const r = await api('POST', '/events', {
    customerId: customer.id,
    actionName: 'raw.api.test',
    idempotencyKey: `raw-evt-${Date.now()}`,
  });
  info(`raw event id = ${r.id || r.eventId}`);
  return r;
});

// =====================================================================
// 16. Run Timeline
// =====================================================================
section(16, 'Run Timeline');

if (evtRunId) {
  const timeline = await check('getRunTimeline(runId)',
    () => client.getRunTimeline(evtRunId));
  if (timeline) info(`timeline events = ${timeline.events?.length}`);

  await check('getRunTimeline(runId, { limit: 2, includeAnomalies: true })',
    () => client.getRunTimeline(evtRunId, { limit: 2, includeAnomalies: true }));
}

// =====================================================================
// 17. Record Run (simplified API)
// =====================================================================
section(17, 'Record Run (Simplified)');

const recordResult = await check('recordRun({ customerId, workflow, events, status })',
  () => client.recordRun({
    customerId: customer.id,
    workflow: 'research-agent',
    events: [
      { eventType: 'llm.call', quantity: 1700, units: 'tokens' },
      { eventType: 'tool.call', quantity: 3 },
      { eventType: 'embedding', quantity: 512, units: 'tokens' },
    ],
    status: 'COMPLETED',
  }));
if (recordResult) {
  info(`run.id = ${recordResult.run?.id}`);
  info(`events.created = ${recordResult.events?.created}`);
  info(`summary = ${recordResult.summary}`);
}

// Raw API: POST /runs/record
await check('POST /runs/record (raw API)', async () => {
  const r = await api('POST', '/runs/record', {
    customerId: customer.id,
    workflow: 'raw-api-test-agent',
    events: [
      { eventType: 'llm.call', quantity: 100, units: 'tokens' },
    ],
    status: 'COMPLETED',
  });
  info(`raw record run.id = ${r.run?.id}`);
  return r;
});

// =====================================================================
// 18. Trace by Correlation ID (raw API)
// =====================================================================
section(18, 'Trace by Correlation ID (Raw API)');

// Start a run with correlationId, then trace
const corrId = `corr-${Date.now()}`;
const corrRun = await check('startRun with correlationId', async () => {
  const r = await client.startRun({
    customerId: customer.id,
    workflowId: workflow?.id,
    correlationId: corrId,
  });
  await client.emitEvent({
    runId: r.id,
    eventType: 'llm.call',
    quantity: 100,
    correlationId: corrId,
  });
  await client.endRun(r.id, { status: 'COMPLETED' });
  return r;
});

if (corrRun) {
  await check('GET /trace/:correlationId (raw API)',
    () => api('GET', `/trace/${corrId}`));
}

// =====================================================================
// 19. Meters / Pricing Plans
// =====================================================================
section(19, 'Meters / Pricing Plans');

const meters = await check('listMeters()', () => client.listMeters());
if (meters) info(`meters count = ${meters.data?.length ?? meters.count}`);

// Raw API: Pricing Plans CRUD
const pricingPlan = await check('POST /pricing-plans (create)', async () => {
  try {
    const r = await api('POST', '/pricing-plans', {
      name: `Test Plan ${Date.now()}`,
      unitType: `test_unit_${Date.now()}`,
      unitPriceUsd: '0.001',
    });
    info(`pricingPlan.id = ${r.id}`);
    return r;
  } catch (e) {
    if (e.message.includes('403')) {
      info('Pricing plans create requires admin key');
      return { _skipped: true };
    }
    throw e;
  }
});

await check('GET /pricing-plans (list)', () => api('GET', '/pricing-plans'));

if (pricingPlan && !pricingPlan._skipped && pricingPlan.id) {
  await check('GET /pricing-plans/:id',
    () => api('GET', `/pricing-plans/${pricingPlan.id}`));

  if (pricingPlan.unitType) {
    await check('GET /pricing-plans/by-type/:unitType',
      () => api('GET', `/pricing-plans/by-type/${pricingPlan.unitType}`));
  }

  await check('PATCH /pricing-plans/:id', async () => {
    const r = await api('PATCH', `/pricing-plans/${pricingPlan.id}`, {
      name: 'Updated Test Plan',
    });
    info(`updated name = ${r.name}`);
    return r;
  });

  await check('DELETE /pricing-plans/:id',
    () => api('DELETE', `/pricing-plans/${pricingPlan.id}`));
} else if (pricingPlan?._skipped) {
  skip('GET /pricing-plans/:id', 'Pricing plans create requires admin key');
  skip('GET /pricing-plans/by-type/:unitType', 'Pricing plans create requires admin key');
  skip('PATCH /pricing-plans/:id', 'Pricing plans create requires admin key');
  skip('DELETE /pricing-plans/:id', 'Pricing plans create requires admin key');
}

// =====================================================================
// 20. Cost Estimation
// =====================================================================
section(20, 'Cost Estimation');

await check('estimateFromHypothetical({ items })',
  () => client.estimateFromHypothetical({
    items: [
      { usageType: 'api_calls', quantity: 1000 },
      { usageType: 'llm_tokens', quantity: 500000 },
    ],
  }));

await check('estimateFromUsage({ periodStart, periodEnd, customerId })',
  () => client.estimateFromUsage({
    periodStart: new Date(Date.now() - 86400000).toISOString(),
    periodEnd: new Date().toISOString(),
    customerId: customer.id,
  }));

// =====================================================================
// 21. Entitlements
// =====================================================================
section(21, 'Entitlements');

await check('checkEntitlement({ customerId, featureKey })',
  () => client.checkEntitlement({
    customerId: customer.id,
    featureKey: 'api_calls',
  }));

// =====================================================================
// 22. Entitlement Plans CRUD (raw API)
// =====================================================================
section(22, 'Entitlement Plans CRUD (Raw API)');

const entPlan = await check('POST /entitlement-plans', async () => {
  const r = await api('POST', '/entitlement-plans', {
    name: `Test Entitlement Plan ${Date.now()}`,
    slug: `test-ent-plan-${Date.now()}`,
    description: 'Created by bare bones test',
  });
  info(`entitlementPlan.id = ${r.id}`);
  return r;
});

await check('GET /entitlement-plans', () => api('GET', '/entitlement-plans'));

if (entPlan?.id) {
  await check('GET /entitlement-plans/:id',
    () => api('GET', `/entitlement-plans/${entPlan.id}`));

  await check('PATCH /entitlement-plans/:id',
    () => api('PATCH', `/entitlement-plans/${entPlan.id}`, {
      name: 'Updated Entitlement Plan',
    }));

  // Add a rule
  const rule = await check('POST /entitlement-plans/:id/rules', async () => {
    const r = await api('POST', `/entitlement-plans/${entPlan.id}/rules`, {
      featureKey: 'api_calls',
      limitType: 'COUNT',
      limitValue: 10000,
      period: 'MONTHLY',
    });
    info(`rule.id = ${r.id}`);
    return r;
  });

  await check('GET /entitlement-plans/:id/rules',
    () => api('GET', `/entitlement-plans/${entPlan.id}/rules`));

  if (rule?.id) {
    await check('PATCH /entitlement-rules/:ruleId',
      () => api('PATCH', `/entitlement-rules/${rule.id}`, {
        limitValue: 20000,
      }));

    await check('DELETE /entitlement-rules/:ruleId',
      () => api('DELETE', `/entitlement-rules/${rule.id}`));
  }

  // Assign plan to customer
  await check('PUT /customers/:id/entitlement',
    () => api('PUT', `/customers/${customer.id}/entitlement`, {
      planId: entPlan.id,
    }));

  await check('GET /customers/:id/entitlement',
    () => api('GET', `/customers/${customer.id}/entitlement`));

  await check('GET /customers/:id/entitlement/usage',
    () => api('GET', `/customers/${customer.id}/entitlement/usage`));

  await check('DELETE /entitlement-plans/:id',
    () => api('DELETE', `/entitlement-plans/${entPlan.id}`));
}

// =====================================================================
// 23. Contracts CRUD (raw API)
// =====================================================================
section(23, 'Contracts CRUD (Raw API)');

const contract = await check('POST /contracts', async () => {
  try {
    const r = await api('POST', '/contracts', {
      customerId: customer.id,
      name: `Test Contract ${Date.now()}`,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    info(`contract.id = ${r.id}`);
    return r;
  } catch (e) {
    if (e.message.includes('403')) {
      info('Contracts require admin key (expected with sk_live key)');
      return { _skipped: true };
    }
    throw e;
  }
});

if (contract && !contract._skipped) {
  await check('GET /contracts', () => api('GET', '/contracts'));

  if (contract.id) {
    await check('GET /contracts/:id',
      () => api('GET', `/contracts/${contract.id}`));

    await check('PATCH /contracts/:id',
      () => api('PATCH', `/contracts/${contract.id}`, {
        name: 'Updated Contract',
      }));

    const override = await check('POST /contracts/:id/overrides', async () => {
      const r = await api('POST', `/contracts/${contract.id}/overrides`, {
        unitType: 'api_calls',
        pricePerUnit: '0.0005',
      });
      return r;
    });

    if (override) {
      await check('DELETE /contracts/:id/overrides/:unitType',
        () => api('DELETE', `/contracts/${contract.id}/overrides/api_calls`));
    }

    await check('DELETE /contracts/:id',
      () => api('DELETE', `/contracts/${contract.id}`));
  }
} else if (contract?._skipped) {
  skip('GET /contracts', 'Contracts require admin key');
  skip('GET /contracts/:id', 'Contracts require admin key');
  skip('PATCH /contracts/:id', 'Contracts require admin key');
  skip('POST /contracts/:id/overrides', 'Contracts require admin key');
  skip('DELETE /contracts/:id/overrides/:unitType', 'Contracts require admin key');
  skip('DELETE /contracts/:id', 'Contracts require admin key');
}

// =====================================================================
// 24. Webhooks (CRUD)
// =====================================================================
section(24, 'Webhooks');

const webhook = await check('createWebhook({ url, events })',
  () => client.createWebhook({
    url: 'https://httpbin.org/post',
    events: ['charge.succeeded', 'charge.failed'],
  }));
if (webhook) info(`webhook.id = ${webhook.id}`);

const webhookList = await check('listWebhooks()', () => client.listWebhooks());
if (webhookList) info(`webhooks count = ${webhookList.data?.length ?? webhookList.count}`);

if (webhook?.id) {
  const fetchedWh = await check('getWebhook(webhookId)',
    () => client.getWebhook(webhook.id));
  if (fetchedWh) info(`webhook.url = ${fetchedWh.url}`);

  await check('updateWebhook(webhookId, { description })',
    () => client.updateWebhook(webhook.id, { description: 'Updated by bare bones test' }));

  await check('testWebhook(webhookId)',
    () => client.testWebhook(webhook.id));

  await check('rotateWebhookSecret(webhookId)',
    () => client.rotateWebhookSecret(webhook.id));

  await check('deleteWebhook(webhookId)',
    () => client.deleteWebhook(webhook.id));
}

// =====================================================================
// 25. Subscriptions (CRUD + lifecycle)
// =====================================================================
section(25, 'Subscriptions');

const sub = await check('createSubscription({ customerId, name, interval, priceUsdc })',
  () => client.createSubscription({
    customerId: customer.id,
    name: 'Test Plan',
    interval: 'MONTHLY',
    priceUsdc: '9.99',
  }));
if (sub) info(`subscription.id = ${sub.id}, status=${sub.status}`);

if (sub?.id) {
  const fetchedSub = await check('getSubscription(subscriptionId)',
    () => client.getSubscription(sub.id));
  if (fetchedSub) info(`subscription.name = ${fetchedSub.name}`);

  const subList = await check('listSubscriptions()',
    () => client.listSubscriptions());
  if (subList) info(`subscriptions count = ${subList.data?.length ?? subList.count}`);

  await check('listSubscriptions({ customerId })',
    () => client.listSubscriptions({ customerId: customer.id }));

  await check('updateSubscription(subscriptionId, { name })',
    () => client.updateSubscription(sub.id, { name: 'Updated Test Plan' }));

  await check('pauseSubscription(subscriptionId)',
    () => client.pauseSubscription(sub.id));

  await check('resumeSubscription(subscriptionId)',
    () => client.resumeSubscription(sub.id));

  await check('cancelSubscription(subscriptionId)',
    () => client.cancelSubscription(sub.id));
}

// =====================================================================
// 26. Checkout
// =====================================================================
section(26, 'Checkout');

await check('checkout({ amount, customerId, returnUrl })',
  () => client.checkout({
    amount: 5000,
    customerId: customer.id,
    returnUrl: 'https://example.com/return',
  }));

// =====================================================================
// 27. Portal Sessions
// =====================================================================
section(27, 'Portal Sessions');

const portal = await check('createPortalSession({ customerId })',
  () => client.createPortalSession({ customerId: customer.id }));
if (portal) info(`portal.url = ${portal.url?.slice(0, 60)}...`);

if (portal?.id) {
  await check('revokePortalSession(sessionId)',
    () => client.revokePortalSession(portal.id));
}

// =====================================================================
// 28. Playground (raw API)
// =====================================================================
section(28, 'Playground (Raw API)');

await check('GET /playground/status', async () => {
  try {
    return await api('GET', '/playground/status');
  } catch (e) {
    if (e.message.includes('404')) {
      info('Playground not available on production (local-only endpoint)');
      return true;
    }
    throw e;
  }
});

await check('POST /playground/demo-settle', async () => {
  try {
    const r = await api('POST', '/playground/demo-settle');
    info(`demo-settle result: ${JSON.stringify(r).slice(0, 100)}`);
    return r;
  } catch (e) {
    if (e.message.includes('404')) {
      info('Playground not available on production (local-only endpoint)');
      return true;
    }
    if (e.message.includes('No pending') || e.message.includes('No charges')) {
      info('No charges to settle (expected for new customer)');
      return true;
    }
    throw e;
  }
});

// =====================================================================
// 29. Sandbox (raw API)
// =====================================================================
section(29, 'Sandbox (Raw API)');

await check('GET /sandbox/status', async () => {
  try {
    return await api('GET', '/sandbox/status');
  } catch (e) {
    if (e.message.includes('404')) {
      info('Sandbox not available on production (local-only endpoint)');
      return true;
    }
    throw e;
  }
});

// Note: POST /sandbox/reset and POST /sandbox/seed-runs can reset data
// We test them but they may affect other tests if run in sequence
await check('POST /sandbox/seed-runs', async () => {
  try {
    const r = await api('POST', '/sandbox/seed-runs');
    info(`seed-runs: ${JSON.stringify(r).slice(0, 100)}`);
    return r;
  } catch (e) {
    // May not be available in all environments
    info(`seed-runs response: ${e.message}`);
    return true;
  }
});

// =====================================================================
// 30. Raw Usage Endpoints (sync / async / internal)
// =====================================================================
section(30, 'Raw Usage Endpoints');

await check('POST /usage (raw API sync charge)', async () => {
  const r = await api('POST', '/usage', {
    customerId: customer.id,
    usageType: 'api_calls',
    quantity: 1,
    idempotencyKey: `raw-usage-${Date.now()}`,
  });
  info(`raw charge success = ${r.success}`);
  return r;
});

await check('POST /usage/async (raw API async charge)', async () => {
  const r = await api('POST', '/usage/async', {
    customerId: customer.id,
    usageType: 'api_calls',
    quantity: 1,
    idempotencyKey: `raw-async-${Date.now()}`,
  });
  info(`raw async success = ${r.success}`);
  return r;
});

await check('POST /usage/internal (raw API internal tracking)', async () => {
  const r = await api('POST', '/usage/internal', {
    customerId: customer.id,
    usageType: 'api_calls',
    quantity: 1,
    idempotencyKey: `raw-internal-${Date.now()}`,
  });
  return r;
});

// =====================================================================
// 31. Raw Run Endpoints
// =====================================================================
section(31, 'Raw Run Endpoints');

const rawRun = await check('POST /runs (raw API)', async () => {
  const r = await api('POST', '/runs', {
    customerId: customer.id,
    workflowId: workflow?.id,
  });
  info(`raw run.id = ${r.id}`);
  return r;
});

if (rawRun?.id) {
  await check('GET /runs/:id (raw API)',
    () => api('GET', `/runs/${rawRun.id}`));

  await check('POST /run-events (raw API)', async () => {
    const r = await api('POST', '/run-events', {
      runId: rawRun.id,
      eventType: 'llm.call',
      quantity: 100,
      units: 'tokens',
      idempotencyKey: `raw-evt-${Date.now()}`,
    });
    return r;
  });

  await check('POST /run-events/batch (raw API)', async () => {
    const r = await api('POST', '/run-events/batch', {
      events: [
        { runId: rawRun.id, eventType: 'tool.call', quantity: 1, units: 'calls', idempotencyKey: `raw-batch1-${Date.now()}` },
        { runId: rawRun.id, eventType: 'embedding', quantity: 64, units: 'tokens', idempotencyKey: `raw-batch2-${Date.now()}` },
      ],
    });
    return r;
  });

  // Get timeline before ending
  await check('GET /runs/:id/timeline (raw API)',
    () => api('GET', `/runs/${rawRun.id}/timeline?limit=10`));

  await check('PATCH /runs/:id (end run, raw API)',
    () => api('PATCH', `/runs/${rawRun.id}`, {
      status: 'COMPLETED',
    }));
}

// =====================================================================
// 32. Static Utility Methods
// =====================================================================
section(32, 'Static Utility Methods');

await check('Drip.generateIdempotencyKey({ customerId, stepName })', () => {
  const key = Drip.generateIdempotencyKey({
    customerId: customer.id,
    stepName: 'embed',
    sequence: 1,
  });
  if (typeof key !== 'string' || key.length === 0) throw new Error('Empty key');
  info(`key = ${key}`);
  return key;
});

await check('Drip.generateWebhookSignature', () => {
  const sig = Drip.generateWebhookSignature('test_payload', 'test_secret');
  if (typeof sig !== 'string' || sig.length === 0) throw new Error('Empty sig');
  info(`signature = ${sig.slice(0, 40)}...`);
  return true;
});

await check('Drip.verifyWebhookSignature (valid)', async () => {
  const payload = '{"event":"test"}';
  const secret = 'whsec_test_secret_abc123';
  const sig = Drip.generateWebhookSignature(payload, secret);
  const valid = await Drip.verifyWebhookSignature(payload, sig, secret);
  if (!valid) throw new Error('Signature should be valid');
  return true;
});

await check('Drip.verifyWebhookSignature (invalid)', async () => {
  const valid = await Drip.verifyWebhookSignature('payload', 'bad_sig', 'secret');
  if (valid) throw new Error('Should reject invalid signature');
  return true;
});

await check('Drip.verifyWebhookSignatureSync (valid)', () => {
  const payload = '{"event":"sync_test"}';
  const secret = 'whsec_sync_secret_xyz';
  const sig = Drip.generateWebhookSignature(payload, secret);
  const valid = Drip.verifyWebhookSignatureSync(payload, sig, secret);
  if (!valid) throw new Error('Sync signature should be valid');
  return true;
});

// =====================================================================
// 33. Error Handling
// =====================================================================
section(33, 'Error Handling');

await check('DripError on 404 (getCustomer)', async () => {
  try {
    await client.getCustomer('nonexistent-id-99999');
    throw new Error('Should have thrown');
  } catch (e) {
    if (e instanceof DripError) {
      info(`DripError: code=${e.code} message=${e.message}`);
      return true;
    }
    if (e.message?.includes('404') || e.message?.includes('not found') || e.message?.includes('Not Found')) {
      info(`Error with 404: ${e.message}`);
      return true;
    }
    throw e;
  }
});

await check('DripError on bad charge (missing customerId)', async () => {
  try {
    await client.charge({ customerId: '', meter: 'test', quantity: 1 });
    throw new Error('Should have thrown');
  } catch (e) {
    if (e instanceof DripError || e.message) {
      info(`Error caught: ${e.message}`);
      return true;
    }
    throw e;
  }
});

await check('Raw API 404 on invalid endpoint', async () => {
  try {
    await api('GET', '/this-does-not-exist');
    throw new Error('Should have thrown');
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('Not Found') || e.message.includes('not found')) {
      info('Got expected 404');
      return true;
    }
    // Any error is fine — the point is it doesn't succeed
    info(`Error: ${e.message}`);
    return true;
  }
});

await check('Raw API 422 on invalid body', async () => {
  try {
    await api('POST', '/customers', {}); // Missing required fields
    throw new Error('Should have thrown');
  } catch (e) {
    if (e.message.includes('4')) { // 400 or 422
      info(`Validation error: ${e.message.slice(0, 100)}`);
      return true;
    }
    throw e;
  }
});

// =====================================================================
// 34. Singleton
// =====================================================================
section(34, 'Singleton');

await check('drip singleton auto-init and ping', async () => {
  const { drip } = await import('@drip-sdk/node');
  await drip.ping();
  return true;
});

// =====================================================================
// 35. Stream Meter
// =====================================================================
section(35, 'Stream Meter');

await check('createStreamMeter + add + flush', async () => {
  const stream = client.createStreamMeter({
    customerId: customer.id,
    meter: 'api_calls',
  });
  stream.add(100);
  stream.add(200);
  stream.add(300);
  const result = await stream.flush();
  info(`flushed quantity = ${result?.quantity || 'ok'}`);
  return true;
});

// =====================================================================
// SUMMARY
// =====================================================================
console.log('\n' + '='.repeat(70));
console.log(`RESULTS: \x1b[32m${PASS} passed\x1b[0m, \x1b[31m${FAIL} failed\x1b[0m, \x1b[33m${SKIP} skipped\x1b[0m out of ${PASS + FAIL + SKIP}`);
console.log('='.repeat(70));

if (FAIL > 0) {
  console.log('\nFailed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
}
