/**
 * Unit Tests: Core SDK subset validation.
 * Validates that @drip-sdk/node/core has the correct subset of methods.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Drip, DripError } from '@drip-sdk/node/core';
import {
  installMockFetch,
  mockJsonResponse,
  mockCustomer,
  mockTrackUsageResult,
  mockRecordRunResult,
  BASE_URL,
} from '../helpers/mock-fetch.js';

describe('Core Drip client', () => {
  let mockFetch: ReturnType<typeof installMockFetch>;
  let drip: InstanceType<typeof Drip>;

  beforeEach(() => {
    mockFetch = installMockFetch();
    drip = new Drip({ apiKey: 'sk_test_core', baseUrl: BASE_URL });
  });

  afterEach(() => {
    globalThis.fetch = undefined as unknown as typeof globalThis.fetch;
  });

  describe('Available methods', () => {
    it('has ping method', () => {
      expect(typeof drip.ping).toBe('function');
    });

    it('has createCustomer method', () => {
      expect(typeof drip.createCustomer).toBe('function');
    });

    it('has getCustomer method', () => {
      expect(typeof drip.getCustomer).toBe('function');
    });

    it('has listCustomers method', () => {
      expect(typeof drip.listCustomers).toBe('function');
    });

    it('has trackUsage method', () => {
      expect(typeof drip.trackUsage).toBe('function');
    });

    it('has recordRun method', () => {
      expect(typeof drip.recordRun).toBe('function');
    });

    it('has startRun method', () => {
      expect(typeof drip.startRun).toBe('function');
    });

    it('has endRun method', () => {
      expect(typeof drip.endRun).toBe('function');
    });

    it('has emitEvent method', () => {
      expect(typeof drip.emitEvent).toBe('function');
    });

    it('has emitEventsBatch method', () => {
      expect(typeof drip.emitEventsBatch).toBe('function');
    });

    it('has getRun method', () => {
      expect(typeof drip.getRun).toBe('function');
    });

    it('has getRunTimeline method', () => {
      expect(typeof drip.getRunTimeline).toBe('function');
    });
  });

  describe('createCustomer', () => {
    it('sends POST to /customers', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockCustomer()));
      const result = await drip.createCustomer({ externalCustomerId: 'ext_123' });
      expect(result.id).toBe('cust_test_123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/customers`);
      expect(init?.method).toBe('POST');
    });
  });

  describe('trackUsage', () => {
    it('sends POST to /usage/internal', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockTrackUsageResult()));
      const result = await drip.trackUsage({
        customerId: 'cust_test_123',
        meter: 'api_calls',
        quantity: 5,
      });
      expect(result.success).toBe(true);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/usage/internal`);
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init?.body as string);
      expect(body.usageType).toBe('api_calls');
      expect(body.quantity).toBe(5);
    });
  });

  describe('recordRun', () => {
    it('sends POST to /runs/record', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(mockRecordRunResult()));
      const result = await drip.recordRun({
        customerId: 'cust_test_123',
        workflow: 'test_workflow',
        events: [{ eventType: 'agent.step', quantity: 1 }],
        status: 'COMPLETED',
      });
      expect(result.run.id).toBe('run_test_123');
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/runs/record`);
    });
  });

  describe('DripError export', () => {
    it('DripError has expected shape (message, statusCode, extends Error)', () => {
      const err = new DripError('test', 400);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DripError);
      expect(err.message).toBe('test');
      expect(err.statusCode).toBe(400);
    });
  });
});
