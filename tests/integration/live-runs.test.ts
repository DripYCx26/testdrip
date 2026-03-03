/**
 * Integration Tests: Real backend - runs, events, timelines.
 * Requires DRIP_API_KEY and DRIP_API_URL or DRIP_BASE_URL environment variables.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Drip } from '@drip-sdk/node';

const apiKey = process.env.DRIP_API_KEY;
const rawUrl = process.env.DRIP_BASE_URL || process.env.DRIP_API_URL || 'https://drip-app-hlunj.ondigitalocean.app';
const baseUrl = rawUrl?.endsWith('/v1') ? rawUrl : `${rawUrl}/v1`;

const shouldRun = !!apiKey;

describe.skipIf(!shouldRun)('Live Runs integration', () => {
  let drip: Drip;
  let customerId: string;

  beforeAll(async () => {
    drip = new Drip({ apiKey: apiKey!, baseUrl: baseUrl! });
    // Create a test customer for runs
    const customer = await drip.createCustomer({
      externalCustomerId: `run_test_${Date.now()}`,
    });
    customerId = customer.id;
  });

  it('recordRun creates a complete run', async () => {
    const result = await drip.recordRun({
      customerId,
      workflow: 'sdk_test_workflow',
      events: [
        { eventType: 'agent.start', description: 'Test started' },
        { eventType: 'tool.call', quantity: 5, units: 'calls' },
        { eventType: 'agent.end', description: 'Test completed' },
      ],
      status: 'COMPLETED',
    });
    expect(result.run.id).toBeDefined();
    expect(result.events.created).toBeGreaterThanOrEqual(1);
    expect(result.summary).toBeDefined();
  });

  it('getRun returns details for a run', async () => {
    const record = await drip.recordRun({
      customerId,
      workflow: 'sdk_test_workflow',
      events: [{ eventType: 'test.event', quantity: 1 }],
      status: 'COMPLETED',
    });
    const run = await drip.getRun(record.run.id);
    expect(run.id).toBe(record.run.id);
    expect(run.status).toBe('COMPLETED');
    expect(run.totals).toBeDefined();
  });

  it('getRunTimeline returns events', async () => {
    const record = await drip.recordRun({
      customerId,
      workflow: 'sdk_test_workflow',
      events: [
        { eventType: 'step.a', quantity: 1 },
        { eventType: 'step.b', quantity: 2 },
      ],
      status: 'COMPLETED',
    });
    const timeline = await drip.getRunTimeline(record.run.id);
    expect(timeline.runId).toBe(record.run.id);
    expect(timeline.events.length).toBeGreaterThanOrEqual(1);
    expect(timeline.summary).toBeDefined();
    expect(timeline.summary.totalEvents).toBeGreaterThanOrEqual(1);
  });
});
