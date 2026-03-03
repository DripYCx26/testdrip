/**
 * Contract Tests: Express and Next.js middleware adapter behavior.
 * Validates that the middleware adapters produce correct responses
 * and attach the expected context.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  dripMiddleware,
  hasDripContext,
  getDripContext,
  hasPaymentProofHeaders,
} from '@drip-sdk/node/express';
import { withDrip } from '@drip-sdk/node/next';
import {
  installMockFetch,
  mockJsonResponse,
  mockChargeResult,
} from '../helpers/mock-fetch.js';

// ============================================================================
// Express Middleware Contract
// ============================================================================

function createMockExpressReq(headers: Record<string, string> = {}, query: Record<string, string> = {}) {
  return {
    headers: {
      'x-drip-customer-id': 'cust_test_123',
      ...headers,
    },
    query,
    method: 'POST',
    url: '/api/test',
    path: '/api/test',
    get(name: string) {
      return this.headers[name.toLowerCase()];
    },
  };
}

function createMockExpressRes() {
  const res = {
    statusCode: 200,
    _headers: {} as Record<string, string>,
    _body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    set(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
    send(body: unknown) {
      res._body = body;
      return res;
    },
  };
  return res;
}

describe('Express dripMiddleware contract', () => {
  let mockFetch: ReturnType<typeof installMockFetch>;

  beforeEach(() => {
    mockFetch = installMockFetch();
    process.env.DRIP_API_KEY = 'sk_test_middleware';
  });

  afterEach(() => {
    globalThis.fetch = undefined as unknown as typeof globalThis.fetch;
    delete process.env.DRIP_API_KEY;
  });

  it('calls next() on successful charge', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockChargeResult()));

    const middleware = dripMiddleware({ meter: 'api_calls', quantity: 1 });
    const req = createMockExpressReq();
    const res = createMockExpressRes();
    const next = vi.fn();

    await middleware(req as never, res as never, next);
    expect(next).toHaveBeenCalled();
  });

  it('attaches drip context to req', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockChargeResult()));

    const middleware = dripMiddleware({ meter: 'api_calls', quantity: 1 });
    const req = createMockExpressReq();
    const res = createMockExpressRes();
    const next = vi.fn();

    await middleware(req as never, res as never, next);

    // Check context exists
    expect(hasDripContext(req as never)).toBe(true);
    const ctx = getDripContext(req as never);
    expect(ctx).toBeDefined();
    expect(ctx.customerId).toBe('cust_test_123');
    expect(ctx.charge).toBeDefined();
  });

  it('sends 400 when customer ID header missing', async () => {
    const middleware = dripMiddleware({ meter: 'api_calls', quantity: 1 });
    const req = createMockExpressReq({ 'x-drip-customer-id': '' });
    // Remove the header entirely
    delete (req.headers as Record<string, string>)['x-drip-customer-id'];
    const res = createMockExpressRes();
    const next = vi.fn();

    await middleware(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('resolves customer from query when configured', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockChargeResult()));

    const middleware = dripMiddleware({
      meter: 'api_calls',
      quantity: 1,
      customerResolver: 'query',
    });
    const req = createMockExpressReq(
      {},
      { drip_customer_id: 'cust_from_query' },
    );
    delete (req.headers as Record<string, string>)['x-drip-customer-id'];
    const res = createMockExpressRes();
    const next = vi.fn();

    await middleware(req as never, res as never, next);
    expect(next).toHaveBeenCalled();
  });
});

// ============================================================================
// Next.js withDrip Contract
// ============================================================================

function createMockNextRequest(
  headers: Record<string, string> = {},
  searchParams: Record<string, string> = {},
) {
  const hdrs = new Headers({
    'x-drip-customer-id': 'cust_test_123',
    ...headers,
  });
  const params = new URLSearchParams(searchParams);
  return {
    headers: hdrs,
    url: 'http://localhost/api/test?' + params.toString(),
    method: 'POST',
    nextUrl: { searchParams: params },
    json: () => Promise.resolve({}),
  };
}

describe('Next.js withDrip contract', () => {
  let mockFetch: ReturnType<typeof installMockFetch>;

  beforeEach(() => {
    mockFetch = installMockFetch();
    process.env.DRIP_API_KEY = 'sk_test_middleware';
  });

  afterEach(() => {
    globalThis.fetch = undefined as unknown as typeof globalThis.fetch;
    delete process.env.DRIP_API_KEY;
  });

  it('returns handler response on successful charge', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockChargeResult()));

    const handler = withDrip(
      { meter: 'api_calls', quantity: 1 },
      async (_req, ctx) => {
        return Response.json({ success: true, customerId: ctx.customerId });
      },
    );

    const req = createMockNextRequest();
    const response = await handler(req as never, { params: Promise.resolve({}) });
    expect(response).toBeInstanceOf(Response);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.customerId).toBe('cust_test_123');
  });

  it('returns 400 when customer ID missing', async () => {
    const handler = withDrip(
      { meter: 'api_calls', quantity: 1 },
      async () => Response.json({ ok: true }),
    );

    const req = createMockNextRequest({ 'x-drip-customer-id': '' });
    req.headers.delete('x-drip-customer-id');
    const response = await handler(req as never, { params: Promise.resolve({}) });
    expect(response.status).toBe(400);
  });

  it('passes DripContext to handler', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(mockChargeResult()));

    let capturedCtx: Record<string, unknown> | null = null;
    const handler = withDrip(
      { meter: 'api_calls', quantity: 1 },
      async (_req, ctx) => {
        capturedCtx = ctx as unknown as Record<string, unknown>;
        return Response.json({ ok: true });
      },
    );

    const req = createMockNextRequest();
    await handler(req as never, { params: Promise.resolve({}) });

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.customerId).toBe('cust_test_123');
    expect(capturedCtx!.charge).toBeDefined();
  });
});

// ============================================================================
// Payment Proof Header Detection
// ============================================================================

describe('hasPaymentProofHeaders', () => {
  it('returns false when no payment headers', () => {
    const req = { headers: { 'content-type': 'application/json' } };
    expect(hasPaymentProofHeaders(req)).toBe(false);
  });

  it('returns true when all payment proof headers present', () => {
    const req = {
      headers: {
        'x-payment-signature': '0x' + 'ab'.repeat(65),
        'x-payment-session-key': 'ab'.repeat(32),
        'x-payment-smart-account': 'ab'.repeat(20),
        'x-payment-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-payment-amount': '0.01',
        'x-payment-recipient': 'ab'.repeat(20),
        'x-payment-usage-id': 'usage_123',
        'x-payment-nonce': 'nonce_123',
      },
    };
    expect(hasPaymentProofHeaders(req)).toBe(true);
  });
});
