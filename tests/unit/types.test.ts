/**
 * Unit Tests: Type interfaces from src/types.ts
 */
import { describe, it, expect } from 'vitest';
import type { CheckResult, CheckContext, CheckFunction } from '../../src/types.js';

describe('types', () => {
  describe('CheckResult', () => {
    it('allows valid CheckResult shape', () => {
      const result: CheckResult = {
        name: 'Test',
        success: true,
        duration: 100,
        message: 'OK',
      };
      expect(result.name).toBe('Test');
      expect(result.success).toBe(true);
      expect(result.duration).toBe(100);
      expect(result.message).toBe('OK');
    });

    it('allows optional details and suggestion', () => {
      const result: CheckResult = {
        name: 'Failed',
        success: false,
        duration: 5,
        message: 'Error',
        details: 'More info',
        suggestion: 'Try X',
      };
      expect(result.details).toBe('More info');
      expect(result.suggestion).toBe('Try X');
    });
  });

  describe('CheckContext', () => {
    it('requires apiKey, apiUrl, skipCleanup, timeout', () => {
      const ctx: CheckContext = {
        apiKey: 'sk_test',
        apiUrl: 'https://api.example.com',
        skipCleanup: false,
        timeout: 30000,
      };
      expect(ctx.apiKey).toBeDefined();
      expect(ctx.apiUrl).toBeDefined();
      expect(ctx.skipCleanup).toBe(false);
      expect(ctx.timeout).toBe(30000);
    });

    it('allows optional testCustomerId and createdCustomerId', () => {
      const ctx: CheckContext = {
        apiKey: 'sk_test',
        apiUrl: 'https://api.example.com',
        testCustomerId: 'cust_123',
        createdCustomerId: 'cust_456',
        skipCleanup: false,
        timeout: 30000,
      };
      expect(ctx.testCustomerId).toBe('cust_123');
      expect(ctx.createdCustomerId).toBe('cust_456');
    });
  });

  describe('CheckFunction', () => {
    it('accepts async function that returns CheckResult', async () => {
      const fn: CheckFunction = async () => ({
        name: 'Mock',
        success: true,
        duration: 0,
        message: 'OK',
      });
      const result = await fn({} as CheckContext);
      expect(result.success).toBe(true);
    });
  });
});
