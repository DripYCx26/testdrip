/**
 * Unit Tests: Reporter and format functions from src/reporter.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Reporter,
  printHeader,
  printCheckStart,
  printCheckResult,
  printSummary,
  printJson,
} from '../../src/reporter.js';
import type { CheckResult } from '../../src/types.js';
import type { RunnerResult } from '../../src/runner.js';

describe('Reporter', () => {
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; stdoutWrite: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      stdoutWrite: vi.spyOn(process.stdout, 'write').mockImplementation(() => true),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Reporter class', () => {
    it('start() prints header when not json mode', () => {
      const reporter = new Reporter({ json: false });
      reporter.start();
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('start() does not print header in json mode', () => {
      const reporter = new Reporter({ json: true });
      reporter.start();
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('onCheckStart writes to stdout when not json', () => {
      const reporter = new Reporter({ json: false });
      reporter.onCheckStart('Connectivity');
      expect(consoleSpy.stdoutWrite).toHaveBeenCalled();
    });

    it('onCheckComplete prints result when not json', () => {
      const reporter = new Reporter({ json: false });
      const result: CheckResult = {
        name: 'Test',
        success: true,
        duration: 50,
        message: 'OK',
      };
      reporter.onCheckComplete(result);
      expect(consoleSpy.stdoutWrite).toHaveBeenCalled();
    });

    it('finish() prints JSON when json option is true', () => {
      const reporter = new Reporter({ json: true });
      const runnerResult: RunnerResult = {
        results: [
          {
            name: 'check1',
            success: true,
            duration: 10,
            message: 'OK',
          },
        ],
        totalDuration: 10,
        passed: 1,
        failed: 0,
      };
      reporter.finish(runnerResult);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"status": "healthy"'),
      );
    });

    it('finish() prints summary when json option is false', () => {
      const reporter = new Reporter({ json: false });
      const runnerResult: RunnerResult = {
        results: [],
        totalDuration: 0,
        passed: 2,
        failed: 0,
      };
      reporter.finish(runnerResult);
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });
});

describe('printJson', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs valid JSON with status healthy when no failures', () => {
    const result: RunnerResult = {
      results: [
        { name: 'a', success: true, duration: 5, message: 'OK' },
        { name: 'b', success: true, duration: 10, message: 'OK' },
      ],
      totalDuration: 15,
      passed: 2,
      failed: 0,
    };
    printJson(result);
    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('healthy');
    expect(parsed.checks).toHaveLength(2);
    expect(parsed.summary.passed).toBe(2);
    expect(parsed.summary.failed).toBe(0);
  });

  it('outputs status unhealthy when failures exist', () => {
    const result: RunnerResult = {
      results: [
        { name: 'a', success: true, duration: 5, message: 'OK' },
        { name: 'b', success: false, duration: 2, message: 'Failed' },
      ],
      totalDuration: 7,
      passed: 1,
      failed: 1,
    };
    printJson(result);
    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('unhealthy');
    expect(parsed.checks[1].success).toBe(false);
  });

  it('includes details and suggestion when present', () => {
    const result: RunnerResult = {
      results: [
        {
          name: 'failing',
          success: false,
          duration: 1,
          message: 'Error',
          details: 'More info',
          suggestion: 'Fix it',
        },
      ],
      totalDuration: 1,
      passed: 0,
      failed: 1,
    };
    printJson(result);
    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.checks[0].details).toBe('More info');
    expect(parsed.checks[0].suggestion).toBe('Fix it');
  });
});
