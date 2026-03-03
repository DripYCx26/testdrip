/**
 * Integration Tests: Real backend - webhook CRUD.
 * Requires DRIP_API_KEY and DRIP_API_URL or DRIP_BASE_URL environment variables.
 * Must use a secret key (sk_) for webhook operations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Drip, DripError } from '@drip-sdk/node';

const apiKey = process.env.DRIP_API_KEY;
const rawUrl = process.env.DRIP_BASE_URL || process.env.DRIP_API_URL || 'https://drip-app-hlunj.ondigitalocean.app';
const baseUrl = rawUrl?.endsWith('/v1') ? rawUrl : `${rawUrl}/v1`;

const shouldRun = !!(apiKey && apiKey.startsWith('sk_'));

describe.skipIf(!shouldRun)('Live Webhooks integration', () => {
  let drip: Drip;
  let webhookId: string;

  beforeAll(() => {
    drip = new Drip({ apiKey: apiKey!, baseUrl: baseUrl! });
  });

  it('creates a webhook', async () => {
    const webhook = await drip.createWebhook({
      url: 'https://example.com/sdk-test-webhook',
      events: ['charge.succeeded', 'charge.failed'],
      description: 'SDK integration test webhook',
    });
    expect(webhook.id).toBeDefined();
    expect(webhook.secret).toBeDefined();
    expect(webhook.url).toBe('https://example.com/sdk-test-webhook');
    webhookId = webhook.id;
  });

  it('lists webhooks and finds the created one', async () => {
    const { data: webhooks } = await drip.listWebhooks();
    const found = webhooks.find((w) => w.id === webhookId);
    expect(found).toBeDefined();
  });

  it('gets webhook by ID', async () => {
    const webhook = await drip.getWebhook(webhookId);
    expect(webhook.id).toBe(webhookId);
    expect(webhook.events).toContain('charge.succeeded');
  });

  it('rotates webhook secret', async () => {
    const result = await drip.rotateWebhookSecret(webhookId);
    expect(result.secret).toBeDefined();
    expect(typeof result.secret).toBe('string');
  });

  it('deletes the webhook', async () => {
    const result = await drip.deleteWebhook(webhookId);
    expect(result.success).toBe(true);
  });

  it('webhook operations fail with public key', async () => {
    const publicDrip = new Drip({ apiKey: 'pk_test_fake', baseUrl: baseUrl! });
    try {
      await publicDrip.listWebhooks();
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DripError);
      expect((e as DripError).statusCode).toBe(403);
      expect((e as DripError).code).toBe('PUBLIC_KEY_NOT_ALLOWED');
    }
  });
});
