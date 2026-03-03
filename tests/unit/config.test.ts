/**
 * Unit Tests: loadConfig from src/config.ts
 * Mocks dotenv so tests control env vars without .env file interfering.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn() }));

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns config with DRIP_API_KEY', async () => {
    process.env.DRIP_API_KEY = 'sk_test_abc123';
    delete process.env.DRIP_API_URL;
    delete process.env.TEST_CUSTOMER_ID;
    delete process.env.SKIP_CLEANUP;
    delete process.env.CHECK_TIMEOUT;

    const { loadConfig: load } = await import('../../src/config.js');
    const config = load();

    expect(config.apiKey).toBe('sk_test_abc123');
    expect(config.apiUrl).toBe('https://drip-app-hlunj.ondigitalocean.app');
    expect(config.testCustomerId).toBeUndefined();
    expect(config.skipCleanup).toBe(false);
    expect(config.timeout).toBe(30000);
  });

  it('throws when DRIP_API_KEY is missing', async () => {
    delete process.env.DRIP_API_KEY;

    const { loadConfig: load } = await import('../../src/config.js');
    expect(() => load()).toThrow('DRIP_API_KEY environment variable is required');
  });

  it('uses DRIP_API_URL when set', async () => {
    process.env.DRIP_API_KEY = 'sk_test_xyz';
    process.env.DRIP_API_URL = 'https://custom.drip.example.com';

    const { loadConfig: load } = await import('../../src/config.js');
    const config = load();

    expect(config.apiUrl).toBe('https://custom.drip.example.com');
  });

  it('uses TEST_CUSTOMER_ID when set', async () => {
    process.env.DRIP_API_KEY = 'sk_test_xyz';
    process.env.TEST_CUSTOMER_ID = 'cust_test_999';

    const { loadConfig: load } = await import('../../src/config.js');
    const config = load();

    expect(config.testCustomerId).toBe('cust_test_999');
  });

  it('sets skipCleanup to true when SKIP_CLEANUP is "true"', async () => {
    process.env.DRIP_API_KEY = 'sk_test_xyz';
    process.env.SKIP_CLEANUP = 'true';

    const { loadConfig: load } = await import('../../src/config.js');
    const config = load();

    expect(config.skipCleanup).toBe(true);
  });

  it('sets skipCleanup to false when SKIP_CLEANUP is "false"', async () => {
    process.env.DRIP_API_KEY = 'sk_test_xyz';
    process.env.SKIP_CLEANUP = 'false';

    const { loadConfig: load } = await import('../../src/config.js');
    const config = load();

    expect(config.skipCleanup).toBe(false);
  });

  it('uses CHECK_TIMEOUT when set', async () => {
    process.env.DRIP_API_KEY = 'sk_test_xyz';
    process.env.CHECK_TIMEOUT = '60000';

    const { loadConfig: load } = await import('../../src/config.js');
    const config = load();

    expect(config.timeout).toBe(60000);
  });

  it('parses CHECK_TIMEOUT as integer', async () => {
    process.env.DRIP_API_KEY = 'sk_test_xyz';
    process.env.CHECK_TIMEOUT = '5000';

    const { loadConfig: load } = await import('../../src/config.js');
    const config = load();

    expect(config.timeout).toBe(5000);
  });
});
