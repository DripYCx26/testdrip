# Drip Test Coverage Documentation

This document describes what features are tested across the Drip health-check and validation tooling, and estimates the coverage of tests for the Drip API and SDK.

---

## Overview

The `testdrip` project validates the **Drip backend** and **@drip-sdk/node** (Node.js SDK) through multiple test layers:

- **TypeScript (Vitest)**: Unit, contract, smoke, module, and integration tests
- **Python**: Ad-hoc scripts that call the live API via `httpx` or the `drip` Python SDK
- **Health checks (CLI)**: TypeScript and Python CLIs that run ~38 health checks against a live backend

---

## Features Under Test

### Drip API Surface (Backend)

| Category | Endpoints / Features | Tested By |
|----------|----------------------|-----------|
| **Connectivity** | `GET /health`, `GET /mode`, `GET /time`, `GET /time/ping` | `test_final_coverage.py`, integration tests |
| **Customers** | Create, get, list, delete, provision, sync-balance | Health checks, `live-api.test.ts`, `test_final_coverage.py`, `test_provision_sync.py` |
| **Balance** | `GET /customers/:id/balance` | Health checks, `drip-client.test.ts` |
| **Charges** | charge, getCharge, listCharges, getChargeStatus, export | Health checks, contract tests, `test_final_coverage.py` |
| **Usage** | trackUsage, POST /usage, POST /usage/internal | Health checks, contract tests |
| **Checkout** | POST /checkout | Health checks, contract tests |
| **Webhooks** | Create, list, get, delete, test, rotate-secret | Health checks, contract tests |
| **Workflows** | Create, list | Health checks, contract tests |
| **Runs** | startRun, endRun, getRun, getRunTimeline, recordRun | Health checks, contract tests |
| **Run events** | emitEvent, emitEventsBatch | Health checks, contract tests |
| **Meters / Pricing** | listMeters, pricing-plans CRUD | Health checks, `test_final_coverage.py` |
| **Cost estimation** | estimateFromUsage, estimateFromHypothetical | Health checks, contract tests |
| **x402 Protocol** | sign, prepare, status, parsePaymentProof, generatePaymentRequest | `x402-flow.test.ts`, `test_final_coverage.py` |
| **Proofs & settlements** | GET /proofs, settlements candidates, trigger | `test_final_coverage.py` |
| **Resilience** | GET /metrics, GET /health | Health checks |
| **Utilities** | generateIdempotencyKey, createStreamMeter | Health checks |

---

## TypeScript Test Suites

### Unit Tests (`tests/unit/`)

| File | Features Tested | Notes |
|------|-----------------|-------|
| `config.test.ts` | `loadConfig()` — env parsing, defaults, DRIP_API_KEY required | No SDK dependency |
| `runner.test.ts` | `runChecks()` — execution, callbacks, error handling | No SDK dependency |
| `reporter.test.ts` | `Reporter`, `printJson`, JSON output shape | No SDK dependency |
| `types.test.ts` | `CheckResult`, `CheckContext`, `CheckFunction` types | No SDK dependency |
| `core-client.test.ts` | Core Drip: createCustomer, trackUsage, recordRun, method presence | Requires `@drip-sdk/node/core` |
| `drip-client.test.ts` | Full Drip: customers, charges, checkout, webhooks, runs, meters, estimates, static methods, error handling, ping | Requires `@drip-sdk/node` |
| `error-handling.test.ts` | DripError construction, API error propagation, timeout, network errors | Requires `@drip-sdk/node` |
| `singleton-proxy.test.ts` | `drip` singleton lazy init, keyType | Requires `@drip-sdk/node` |

### Contract Tests (`tests/contract/`)

| File | Features Tested | Notes |
|------|-----------------|-------|
| `api-contract.test.ts` | Exact URL, method, headers, body for every SDK call (customers, balance, charges, checkout, webhooks, workflows, runs, events, recordRun, meters, estimates, ping) | High-value regression suite |
| `middleware-contract.test.ts` | Express `dripMiddleware`, Next.js `withDrip`, `hasPaymentProofHeaders` | Requires `@drip-sdk/node/express`, `@drip-sdk/node/next` |
| `x402-flow.test.ts` | `generatePaymentRequest`, `parsePaymentProof`, `hasPaymentProof`, `getHeader` | Requires `@drip-sdk/node/middleware` |

### Smoke Tests (`tests/smoke/`)

| File | Features Tested | Notes |
|------|-----------------|-------|
| `01-imports.test.ts` | All entry points: main, core, next, express, middleware, langchain | Verifies exports and package structure |
| `02-constructor.test.ts` | Drip constructor, resilience options | Basic instantiation |
| `03-types.test.ts` | Type inference for DripConfig, Customer, ChargeResult, RunTimeline, etc. | Type-level tests |

### Module Tests (`tests/module/`)

| File | Features Tested | Notes |
|------|-----------------|-------|
| `esm-import.test.mjs` | ESM import of `@drip-sdk/node` | Module resolution |
| `cjs-require.test.cjs` | CJS require of `@drip-sdk/node` | CommonJS compatibility |

### Integration Tests (`tests/integration/`)

| File | Features Tested | Notes |
|------|-----------------|-------|
| `live-api.test.ts` | Live backend: ping, customer lifecycle, usage, balance, error handling | Requires `DRIP_API_KEY`, `DRIP_BASE_URL` |
| `live-runs.test.ts` | Live runs: start, emit, end, timeline | Requires env vars |
| `live-webhooks.test.ts` | Live webhooks: create, list, test, delete | Requires env vars |

---

## Python Test Scripts

| File | Features Tested | Notes |
|------|-----------------|-------|
| `test_drip_core.py` | Core SDK (usage, runs, no billing): ping, create_customer, track_usage, start_run, emit_event, record_run | Uses `drip.core.Drip` |
| `test_drip_sdk.py` | Full SDK: customers, charges, balance, wrap_api_call | Uses `drip.Drip` |
| `test_python_sdk.py` | Python SDK coverage | Ad-hoc |
| `test_new_use_cases.py` | 15 scenarios: AI pipeline, user= shorthand, batch events, multi-agent, audit trail, retry safety, failed run, burst, StreamMeter, record_run, list/query, wrap_api_call, provision/sync, playground settle | Live API |
| `test_usage.py` | Usage tracking | Live API |
| `test_final_coverage.py` | 23+ endpoints: health, mode, time, x402, pricing-plans CRUD, proofs, settlements, charges export | Raw httpx |
| `test_provision_sync.py` | POST /provision, POST /sync-balance | Raw httpx |
| `test_onchain.py` | End-to-end: provision, sync-balance, charge, demo-settle | Raw httpx |
| `test_entitlements.py` | Entitlements features | Live API |
| `test_subscriptions_entitlements.py` | Subscriptions and entitlements | Live API |
| `test_remaining.py` | Additional endpoints | Live API |
| `test_full_e2e.py` | Full end-to-end flow | Live API |

---

## Health Checks (CLI)

The **drip-health** CLI (TypeScript) and Python equivalent run **38 checks** against a live backend:

| Group | Checks |
|-------|--------|
| Connectivity & auth | Connectivity, Authentication |
| Customer | Create, Get, List, Cleanup |
| Charge | Create, Status, Get, List (filtered) |
| Usage | trackUsage, trackUsage (idempotency), Balance Get |
| Streaming | StreamMeter Add, StreamMeter Flush |
| Idempotency | Idempotency check |
| API wrapping | wrapApiCall (basic, idempotency, error handling) |
| Checkout | Checkout Create |
| Webhooks | Sign, Verify, Create, List, Get, Test, Rotate Secret, Delete |
| Workflows | Create, List |
| Runs | Create, Timeline, End, Emit Event, Emit Batch, Record Run |
| Meters | List Meters |
| Estimates | From Usage, From Hypothetical |
| Resilience | Get Metrics, Get Health |
| Utilities | generateIdempotencyKey, createStreamMeter |

---

## Estimated Coverage

### SDK API (Node.js / @drip-sdk/node)

| Area | Estimated Coverage | Notes |
|------|--------------------|-------|
| **Core methods** | ~95% | Contract + drip-client tests cover all public methods |
| **Error handling** | ~90% | DripError, 4xx/5xx, timeout, network errors |
| **Static utilities** | ~100% | Webhook sig, idempotency key |
| **Entry points / exports** | ~100% | Smoke tests verify all exports |
| **Middleware (Express, Next)** | ~80% | Contract tests; some paths may be untested |
| **x402 / payment proof** | ~75% | x402-flow tests; edge cases may remain |

### Backend API

| Area | Estimated Coverage | Notes |
|------|--------------------|-------|
| **Primary CRUD** | ~95% | Health checks + Python scripts |
| **x402 & settlements** | ~70% | test_final_coverage, test_provision_sync |
| **Pricing plans CRUD** | ~60% | test_final_coverage; less exercised in health checks |
| **Proofs, settlements extras** | ~50% | test_final_coverage only |
| **Public no-auth endpoints** | ~80% | test_final_coverage |

### Health Check Infrastructure (TypeScript)

| Area | Estimated Coverage | Notes |
|------|--------------------|-------|
| **config.ts** | ~95% | Unit tests |
| **runner.ts** | ~90% | Unit tests; timeout race edge case possible |
| **reporter.ts** | ~85% | Unit tests; stdout formatting partially covered |
| **types.ts** | ~100% | Unit tests |
| **Check implementations** | ~60% | Exercised via live run; not unit-tested in isolation |
| **drip-client.ts wrapper** | ~40% | Indirectly via checks; no dedicated unit tests |

### Python Code

| Area | Estimated Coverage | Notes |
|------|--------------------|-------|
| **config.py** | ~0% | No unit tests |
| **runner.py** | ~0% | No unit tests |
| **reporter.py** | ~0% | No unit tests |
| **drip_client.py** | ~0% | No unit tests |
| **checks/** | ~0% (unit) | Only exercised via live CLI runs |

---

## Summary

- **SDK (Node.js)**: Strong coverage via contract and unit tests; requires `@drip-sdk/node` to be available (e.g. `file:../drip/packages/sdk`).
- **Backend API**: Broad coverage via health checks and Python scripts; some admin/extras endpoints have lighter coverage.
- **Health check CLI (TypeScript)**: Config, runner, reporter, and types are well tested; check logic is mostly integration-tested.
- **Python tooling**: No unit tests; validation relies on manual/CI runs of the scripts and health checks.

---

## Running Tests

```bash
# TypeScript unit tests (no SDK)
npx vitest run tests/unit/config.test.ts tests/unit/runner.test.ts tests/unit/reporter.test.ts tests/unit/types.test.ts

# Full TypeScript suite (requires @drip-sdk/node)
npm test

# Python (requires DRIP_API_KEY, DRIP_API_URL)
python test_drip_core.py
python test_new_use_cases.py
python test_final_coverage.py

# Health checks
npm run check
```
