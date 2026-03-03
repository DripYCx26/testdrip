/**
 * Vitest setup: load .env so integration tests get DRIP_API_KEY, DRIP_API_URL, etc.
 * Uses fs/path directly to avoid being affected by vi.mock('dotenv') in config tests.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && v && !k.startsWith('#')) {
      process.env[k] = v.replace(/^["']|["']$/g, '');
    }
  }
}
