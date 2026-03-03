# Drip C++ SDK — Race Condition Bug Report

**Version:** 0.1.0 | **Run:** `make run-race`

---

## Summary

Race tests exposed **2 SDK bugs** when `Client` is used concurrently:

| Bug | Observed | Root cause |
|-----|----------|------------|
| 1. `ping()` mutates shared state | 9× 404 in mixed-load test | `base_url` stripped of `/v1` during ping; other threads use wrong URL |
| 2. `recordRun` fallback sends invalid `workflowId` | 4× 404 in concurrent recordRun | Fallback uses slug; API expects `wf_xxx` ID |

---

## How the Race Conditions Were Forced

### Bug 1: Mixed load test (12 threads, shared `Client`)

Each thread performs one of: `ping()`, `trackUsage()`, `listCustomers()`, or `getBalance()`. All share the same `Client` instance.

When a thread calls `ping()`, it mutates `impl_->base_url` to strip `/v1` so it can hit `/health` at the root. Other threads may call `getBalance()`, `listCustomers()`, or `trackUsage()` during that window. Those calls build `url = base_url + path`. They inherit the corrupted base (without `/v1`) and hit paths like `https://api.app/customers/...` instead of `https://api.app/v1/customers/...` → 404.

### Bug 2: Concurrent recordRun test (4 threads, same slug)

Four threads each call `recordRun()` with workflow slug `"cpp-race-test"` (a workflow that does not exist yet). Each call:

1. GETs `/workflows` to resolve the slug
2. If not found, POSTs `/workflows` to create it
3. If that throws, falls back to `workflow_id = params.workflow` (the slug)
4. Calls `startRun()` with that value
5. POSTs to `/runs` with `workflowId: "cpp-race-test"`

Multiple threads racing to create the same workflow can cause creation to fail. When it does, the fallback passes the slug to `startRun()`, which sends it to POST `/runs`. The API expects a real `wf_xxx` ID, not a slug → 404.

---

## Bug 1: `ping()` not thread-safe

**Location:** `client.cpp` ~lines 407–430

`ping()` temporarily sets `impl_->base_url` to the health URL (without `/v1`). Concurrent requests use this modified base and hit paths like `/customers/...` instead of `/v1/customers/...` → 404.

**Fix:** Use a local URL for the health request instead of mutating `impl_->base_url`.

---

## Bug 2: `recordRun` fallback produces invalid requests

**Location:** `client.cpp` ~lines 499–503

When workflow lookup/create throws, `recordRun` falls back to `workflow_id = params.workflow` (slug). `startRun()` then sends this slug to POST /runs. The API requires a real workflow ID (`wf_xxx`); the slug is rejected → 404.

**Fix:** Remove or replace the fallback so a valid workflow ID is always sent, or let the exception propagate.

---

## Recommendations

1. Make `ping()` thread-safe (avoid mutating shared `base_url`).
2. Fix the `recordRun` fallback so it never sends a slug as `workflowId`.
3. Document whether `Client` is safe for concurrent use.
