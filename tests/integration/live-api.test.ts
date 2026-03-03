/**
 * Integration Tests: Real backend - customers, usage, charges, balance.
 * Requires DRIP_API_KEY and DRIP_API_URL or DRIP_BASE_URL environment variables.
 * Auto-skips when env vars are not set.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Drip, DripError } from '@drip-sdk/node';

const apiKey = process.env.DRIP_API_KEY;
const rawUrl = process.env.DRIP_BASE_URL || process.env.DRIP_API_URL || 'https://drip-app-hlunj.ondigitalocean.app';
const baseUrl = rawUrl?.endsWith('/v1') ? rawUrl : `${rawUrl}/v1`;

const shouldRun = !!apiKey;

describe.skipIf(!shouldRun)('Live API integration', () => {
  let drip: Drip;
  let createdCustomerId: string;

  beforeAll(() => {
    drip = new Drip({ apiKey: apiKey!, baseUrl: baseUrl! });
  });

  describe('Connectivity', () => {
    it('ping returns ok:true', async () => {
      const health = await drip.ping();
      expect(health.ok).toBe(true);
      expect(health.status).toBe('healthy');
    });

    it('ping returns positive latencyMs', async () => {
      const health = await drip.ping();
      expect(health.latencyMs).toBeGreaterThan(0);
    });
  });

  describe('Customer lifecycle', () => {
    it('creates a customer with externalCustomerId', async () => {
      const extId = `test_sdk_${Date.now()}`;
      const customer = await drip.createCustomer({
        externalCustomerId: extId,
      });
      expect(customer.id).toBeDefined();
      expect(customer.externalCustomerId).toBe(extId);
      createdCustomerId = customer.id;
    });

    it('gets the created customer by ID', async () => {
      const customer = await drip.getCustomer(createdCustomerId);
      expect(customer.id).toBe(createdCustomerId);
    });

    it('lists customers and finds the created one', async () => {
      const { data: customers, count } = await drip.listCustomers({ limit: 100 });
      expect(count).toBeGreaterThan(0);
      const found = customers.find((c) => c.id === createdCustomerId);
      expect(found).toBeDefined();
    });
  });

  describe('Usage tracking', () => {
    it('tracks usage for a customer', async () => {
      const result = await drip.trackUsage({
        customerId: createdCustomerId,
        meter: 'api_calls',
        quantity: 1,
        description: 'SDK integration test',
      });
      expect(result.success).toBe(true);
      expect(result.usageEventId).toBeDefined();
    });

    it('idempotency key prevents duplicate tracking', async () => {
      const key = `idem_test_${Date.now()}`;
      const result1 = await drip.trackUsage({
        customerId: createdCustomerId,
        meter: 'api_calls',
        quantity: 1,
        idempotencyKey: key,
      });
      const result2 = await drip.trackUsage({
        customerId: createdCustomerId,
        meter: 'api_calls',
        quantity: 1,
        idempotencyKey: key,
      });
      // Second call should return same event (deduplicated)
      expect(result1.usageEventId).toBe(result2.usageEventId);
    });
  });

  describe('Balance', () => {
    it('getBalance returns balance for customer', async () => {
      const balance = await drip.getBalance(createdCustomerId);
      expect(balance.customerId).toBe(createdCustomerId);
      expect(balance.balanceUsdc).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('throws DripError 404 for nonexistent customer', async () => {
      try {
        await drip.getCustomer('nonexistent_id_xyz');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DripError);
        expect((e as DripError).statusCode).toBe(404);
      }
    });
  });
});
