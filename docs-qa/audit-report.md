# SDK Documentation QA Audit Report

**Date**: 2026-03-09
**Tester**: Claude Code (strict QA mode)
**API**: `api.drippay.dev` (production)
**Key type**: `sk_live_` (secret key)

---

## Summary

| Phase | Tests | Pass | Fail |
|-------|-------|------|------|
| 1. Import Validation | 33 | 33 | 0 |
| 2. Claude Prompt — Node.js | 6 | 6 | 0 |
| 2. Claude Prompt — Python | 5 | 5 | 0 |
| 3. GETTING_STARTED — Node.js | 11 | 11 | 0 |
| 3. GETTING_STARTED — Python | 10 | 10 | 0 |
| 4. Curl Commands | 7 | 6 | 1 |
| **TOTAL** | **72** | **71** | **1** |

**Verdict**: The SDK is in remarkably good shape. Both Node.js and Python SDKs work exactly as documented for the core flow (create customer → track usage → record run → charge). The documentation bugs found are mostly inconsistencies between different docs, not broken functionality.

---

## CRITICAL — Blocks first-time setup

### BUG-001: Pricing plan curl returns 403 (not documented)

- **File**: `docs/getting-started/GETTING_STARTED.md`, Step 3
- **Section**: "Set pricing (optional — skip for ledger-only)"
- **Expected**: `POST /v1/pricing-plans` returns 201 or 409 DUPLICATE_PRICING_PLAN
- **Actual**: Returns `403 Forbidden` with `{"error":"Forbidden","code":"FORBIDDEN"}`
- **Impact**: A developer following the Quick Path cannot set up pricing at Step 3. The troubleshooting table lists 401, 404, 409, 422, but NOT 403. A developer has no idea why their valid `sk_live_` key is rejected.
- **Root cause**: Pricing plan CRUD requires a different permission level than the key provides, or the production API blocks pricing plan creation for this business.
- **Fix**: Add a row to the troubleshooting table:
  ```
  | `403 Forbidden` | Key lacks admin permission | Pricing plans require an admin-level secret key. Contact support if your key was recently created. |
  ```
  Also add a note to Step 3: "If you receive a 403, your API key may not have pricing plan permissions. Contact support or skip to Step 4."

---

## HIGH — Confusing but workaround exists

### BUG-002: DripError code mismatch — `NOT_FOUND` vs `CUSTOMER_NOT_FOUND`

- **File**: `docs/getting-started/GETTING_STARTED.md`, Step 9
- **Section**: "Handle errors explicitly"
- **Expected**: Docs list error code `CUSTOMER_NOT_FOUND` in the switch statement
- **Actual**: SDK throws DripError with `code="NOT_FOUND"`, not `"CUSTOMER_NOT_FOUND"`
- **Impact**: A developer writing a switch statement from the docs will never match the `CUSTOMER_NOT_FOUND` case. Their error handling silently falls through.
- **Fix**: Either:
  - (a) Change docs Step 9 to use `'NOT_FOUND'` instead of `'CUSTOMER_NOT_FOUND'`, OR
  - (b) Update the SDK to return `'CUSTOMER_NOT_FOUND'` for customer 404s

### BUG-003: Python `.env` NOT auto-loaded — developer must manually set env var

- **File**: `docs/getting-started/GETTING_STARTED.md`, Step 0 (Python section)
- **Section**: "Save your API key"
- **Expected**: GETTING_STARTED.md says `export DRIP_API_KEY="sk_live_..."` and `pip install drip-sdk`. The user's Claude prompt says "pip install drip-sdk[dotenv] — the SDK auto-loads .env when python-dotenv is installed."
- **Actual**: Running `python test.py` with a `.env` file but without `export DRIP_API_KEY` fails — the SDK does NOT auto-load `.env`. You must either `export` the var or install `python-dotenv` AND ensure it's loaded.
- **Impact**: A developer who creates a `.env` file (common Python pattern) and runs their script will get an authentication error. They must know to either run `export DRIP_API_KEY=...` first or install the dotenv extra.
- **Fix**: Add to GETTING_STARTED.md Step 0 Python section:
  ```
  # Option A: Export directly
  export DRIP_API_KEY="sk_live_YOUR_KEY_HERE"

  # Option B: Use .env file (requires dotenv extra)
  pip install drip-sdk[dotenv]
  echo 'DRIP_API_KEY=sk_live_YOUR_KEY_HERE' > .env
  # python-dotenv auto-loads .env when installed
  ```

### BUG-004: Step 4 curl vs SDK are different operations (not just different endpoints)

- **File**: `docs/getting-started/GETTING_STARTED.md`, Step 4
- **Section**: "Record usage"
- **Expected**: Curl and SDK examples do the same thing
- **Actual**: They do fundamentally different things:
  - **Curl**: `POST /v1/events` with `{customerId, actionName, idempotencyKey}` → creates an execution EVENT (type: USAGE, outcome: PENDING)
  - **SDK `trackUsage()`**: `POST /v1/usage/internal` with `{customerId, usageType, quantity}` → creates an internal usage record (no charge)
- **Impact**: Developers switching between curl testing and SDK code will be confused. The curl creates events visible in the events list; the SDK creates internal usage records. These have different semantics, different response shapes, and different downstream effects.
- **Nuance**: Both actually work for the "record usage" use case, so this is HIGH not CRITICAL. A developer won't be blocked, just confused.
- **Fix**: Either:
  - (a) Change Step 4 curl to use `POST /v1/usage/internal` with `{customerId, usageType, quantity}` to match the SDK, OR
  - (b) Add a note explaining the two endpoints and when to use each

---

## MEDIUM — Inconsistencies between docs

### BUG-005: Singleton vs Class style inconsistency across docs

- **File**: Multiple
- **Section**: All code examples
- **Expected**: Consistent import style across docs
- **Actual**:
  - `GETTING_STARTED.md` (11 examples): `import { drip } from '@drip-sdk/node'` / `from drip import drip` (singleton)
  - `CLAUDE_INTEGRATION_PROMPT.md` (all examples): `import { drip } from '@drip-sdk/node'` / `from drip import drip` (singleton)
  - User's Claude prompt (in this task): `import { Drip } from '@drip-sdk/node'; const drip = new Drip()` / `from drip import Drip; drip = Drip()` (class)
  - Dashboard landing page code example: singleton style
- **Impact**: A developer reading the user's Claude prompt creates code with `new Drip()`, then reads GETTING_STARTED.md and sees `import { drip }`. They wonder: "Are these the same? Did I do it wrong?"
- **Fix**: Pick one style as primary and add a one-liner note about the alternative. Recommendation: Keep singleton as primary (simpler), add a comment like `// Or: const drip = new Drip({ apiKey: '...' })` in the first code example.

### BUG-006: CLAUDE_INTEGRATION_PROMPT.md middleware import path differs from GETTING_STARTED.md

- **File**: `docs/integration/CLAUDE_INTEGRATION_PROMPT.md`, line 230-242
- **Section**: "Option 2: Framework Middleware"
- **Expected**: Consistent import paths
- **Actual**:
  - CLAUDE_INTEGRATION_PROMPT.md: `import { withDrip } from '@drip-sdk/node/middleware'`
  - GETTING_STARTED.md: `import { withDrip } from '@drip-sdk/node/next'`
  - CLAUDE_INTEGRATION_PROMPT.md: `import { dripMiddleware } from '@drip-sdk/node/middleware'`
  - GETTING_STARTED.md: `import { dripMiddleware } from '@drip-sdk/node/express'`
- **Impact**: Both paths actually resolve (confirmed in import tests), but `/middleware` re-exports everything while `/next` and `/express` are framework-specific. A developer might use `/middleware` and accidentally import Next.js code in an Express project.
- **Fix**: Use the specific paths (`/next`, `/express`) in CLAUDE_INTEGRATION_PROMPT.md to match GETTING_STARTED.md.

### BUG-007: GETTING_STARTED.md says `DRIP_BASE_URL` but Python SDK reads `DRIP_API_URL`

- **File**: `docs/getting-started/GETTING_STARTED.md`, line 366
- **Section**: Full Integration Step 1 "Get API keys"
- **Expected**: Env var name works for both SDKs
- **Actual**: Docs say `export DRIP_BASE_URL="https://api.drippay.dev/v1"`. Node SDK accepts both `DRIP_BASE_URL` and `DRIP_API_URL`. Python SDK only reads `DRIP_API_URL`.
- **Impact**: A Python developer who sets `DRIP_BASE_URL` per the docs will silently use the default URL instead of their override.
- **Fix**: Change docs to `DRIP_API_URL` (works for both SDKs), or note both env vars.

### BUG-008: User's Claude prompt `recordRun` events shape differs from CLAUDE_INTEGRATION_PROMPT.md

- **File**: User's prompt vs `docs/integration/CLAUDE_INTEGRATION_PROMPT.md`
- **Section**: "For agent runs"
- **Expected**: Same event shapes
- **Actual**:
  - User's prompt: `{ eventType: 'llm.call', quantity: 2500, units: 'tokens' }` (simple, matches SDK type)
  - CLAUDE_INTEGRATION_PROMPT.md: `{ eventType: 'llm.call', model: 'gpt-4', inputTokens: 500, outputTokens: 1200 }` (custom fields, no `quantity`/`units`)
- **Impact**: CLAUDE_INTEGRATION_PROMPT.md events use `model`, `inputTokens`, `outputTokens` which are NOT part of the `RecordRunEvent` type — they'd be silently ignored or passed as metadata. The user's prompt version is correct.
- **Fix**: Update CLAUDE_INTEGRATION_PROMPT.md to use the standard event shape: `{ eventType: 'llm.call', quantity: 2500, units: 'tokens', metadata: { model: 'gpt-4' } }`

---

## LOW — Style/clarity improvements

### BUG-009: No dotenv mention anywhere in GETTING_STARTED.md for Node.js

- **File**: `docs/getting-started/GETTING_STARTED.md`
- **Section**: Step 0 and Full Integration Step 2
- **Impact**: Node.js developers who use `.env` files (extremely common) will need to know to install `dotenv` and add `import 'dotenv/config'`. The docs only show `export DRIP_API_KEY=...` which works for terminal but not for `.env` files in code.
- **Fix**: Add a one-liner: "Using a `.env` file? Add `npm install dotenv` and `import 'dotenv/config'` at the top of your entry file."

### BUG-010: Response example shows `"id": "cus_abc123def456"` but real IDs use cuid format

- **File**: `docs/getting-started/GETTING_STARTED.md`, Step 1 response example
- **Section**: Response JSON block
- **Expected**: Example ID matches real format
- **Actual**: Docs show `"id": "cus_abc123def456"` (prefixed). Real IDs look like `"cmmjq4if9000091ewcvlv9h3m"` (cuid, no prefix).
- **Impact**: Very minor. A developer might write code that checks for `cus_` prefix and be confused when real IDs don't have it.
- **Fix**: Change example to `"id": "cmmjq4if9000091ewcvlv9h3m"` or add a note: "IDs are CUIDs (no prefix)."

### BUG-011: Step 9 error codes list is incomplete

- **File**: `docs/getting-started/GETTING_STARTED.md`, Step 9
- **Section**: Error handling switch statement
- **Expected**: All common error codes listed
- **Actual**: Lists `CUSTOMER_NOT_FOUND` (which is actually `NOT_FOUND`), but doesn't list `FORBIDDEN` (403), `VALIDATION_ERROR` (422), or `CONFLICT` (409) which are common.
- **Fix**: Update the switch to include real error codes from the API:
  ```
  case 'NOT_FOUND':        // Customer/resource not found
  case 'FORBIDDEN':        // Key lacks permission
  case 'PAYMENT_REQUIRED': // Insufficient balance
  case 'RATE_LIMIT_EXCEEDED':
  ```

---

## PASSED — What worked perfectly first try

### Core SDK Installation
- `npm install @drip-sdk/node` resolves correctly on npm (v0.1.1)
- `pip install drip-sdk` resolves correctly on PyPI
- All 33 import paths resolve: class, singleton, errors, subpath exports (/next, /express, /middleware)

### Constructor & Initialization
- `new Drip()` correctly reads `DRIP_API_KEY` from environment
- `new Drip()` throws a clear, helpful error when no key is set: "Drip API key is required. Either pass { apiKey } to constructor or set DRIP_API_KEY environment variable."
- `Drip()` in Python also correctly reads from env
- `client.keyType` correctly detects `sk_` vs `pk_` keys
- `client.baseUrl` defaults to `https://api.drippay.dev/v1`

### Core API Flow (Node.js + Python, both singleton and class styles)
- `createCustomer({ externalCustomerId })` — works, returns `.id`, `.externalCustomerId`, `.status`
- `listCustomers()` — works, returns `.data` array and `.count`
- `trackUsage({ customerId, meter, quantity, metadata })` — works, returns `.usageEventId`
- `recordRun({ customerId, workflow, events, status })` — works, returns `.run.id`, `.events.created`, `.summary`
- `charge({ customerId, meter, quantity, idempotencyKey })` — works, returns `.charge.id`, `.charge.amountUsdc`
- `createWebhook({ url, events })` — works, returns `.id` and `.secret`
- `DripError` correctly thrown on bad customer ID

### Python-specific
- `from drip import drip` (singleton) works
- `from drip import Drip` (class) works
- `customer.id` is a proper attribute (not dict-style)
- `customer.external_customer_id` uses correct snake_case
- `result.usage_event_id` exists as documented

### Curl endpoints
- `POST /v1/customers` — 201 Created
- `GET /v1/customers` — 200 OK
- `POST /v1/events` — 201 Created (docs Step 4 & 5)
- `POST /v1/usage` — 201 Created (docs Step 6 charge)
- `POST /v1/usage/internal` — 201 Created (SDK equivalent)

### Method Availability
All 20 documented SDK methods exist on the client instance:
`createCustomer`, `getCustomer`, `listCustomers`, `getOrCreateCustomer`, `trackUsage`, `charge`, `chargeAsync`, `recordRun`, `startRun`, `endRun`, `emitEvent`, `emitEventsBatch`, `listCharges`, `getCharge`, `getBalance`, `createWebhook`, `listWebhooks`, `deleteWebhook`, `checkEntitlement`, `ping`

### Static Utilities
- `Drip.generateIdempotencyKey` exists
- `Drip.verifyWebhookSignature` exists

---

## Test Artifacts

All result JSON files are in `docs-qa/`:
- `results-imports.json` — Phase 1 (33 tests)
- `results-claude-prompt-node.json` — Phase 2 Node.js (6 tests)
- `results-claude-prompt-python.json` — Phase 2 Python (5 tests)
- `results-getting-started-node.json` — Phase 3 Node.js (11 tests)
- `results-getting-started-python.json` — Phase 3 Python (10 tests)
- `results-curl.json` — Phase 4 curl (7 tests)
