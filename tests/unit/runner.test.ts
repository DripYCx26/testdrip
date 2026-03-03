/**
 * Unit Tests: runChecks from src/runner.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { runChecks } from '../../src/runner.js';
import type { Check, CheckContext } from '../../src/types.js';

const createMockCheck = (
  name: string,
  success: boolean,
  duration = 10,
  message = success ? 'OK' : 'Failed',
): Check => ({
  name,
  description: `Test check ${name}`,
  run: vi.fn().mockResolvedValue({
    name,
    success,
    duration,
    message,
  }),
});

describe('runChecks', () => {
  const baseContext: CheckContext = {
    apiKey: 'sk_test',
    apiUrl: 'https://test.drip.example.com',
    skipCleanup: false,
    timeout: 5000,
  };

  it('runs all checks and returns results', async () => {
    const check1 = createMockCheck('check1', true, 5);
    const check2 = createMockCheck('check2', true, 8);

    const result = await runChecks({
      checks: [check1, check2],
      context: baseContext,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].name).toBe('check1');
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].name).toBe('check2');
    expect(result.results[1].success).toBe(true);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
    expect(check1.run).toHaveBeenCalledWith(baseContext);
    expect(check2.run).toHaveBeenCalledWith(baseContext);
  });

  it('tracks failed checks', async () => {
    const passCheck = createMockCheck('pass', true);
    const failCheck = createMockCheck('fail', false, 3, 'Something went wrong');

    const result = await runChecks({
      checks: [passCheck, failCheck],
      context: baseContext,
    });

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].message).toBe('Something went wrong');
  });

  it('calls onCheckStart for each check', async () => {
    const check = createMockCheck('single', true);
    const onCheckStart = vi.fn();

    await runChecks({
      checks: [check],
      context: baseContext,
      onCheckStart,
    });

    expect(onCheckStart).toHaveBeenCalledTimes(1);
    expect(onCheckStart).toHaveBeenCalledWith(check);
  });

  it('calls onCheckComplete for each check with result', async () => {
    const check = createMockCheck('single', true, 42);
    const onCheckComplete = vi.fn();

    await runChecks({
      checks: [check],
      context: baseContext,
      onCheckComplete,
    });

    expect(onCheckComplete).toHaveBeenCalledTimes(1);
    expect(onCheckComplete).toHaveBeenCalledWith(check, expect.objectContaining({
      name: 'single',
      success: true,
      duration: 42,
      message: 'OK',
    }));
  });

  it('handles check that throws', async () => {
    const failingCheck: Check = {
      name: 'throws',
      description: 'Throws error',
      run: vi.fn().mockRejectedValue(new Error('Boom')),
    };

    const result = await runChecks({
      checks: [failingCheck],
      context: baseContext,
    });

    expect(result.failed).toBe(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].message).toBe('Boom');
    expect(result.results[0].details).toBe('Check threw an exception');
  });

  it('handles empty checks array', async () => {
    const result = await runChecks({
      checks: [],
      context: baseContext,
    });

    expect(result.results).toHaveLength(0);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.totalDuration).toBeGreaterThanOrEqual(0);
  });
});
