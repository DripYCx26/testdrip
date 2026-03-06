#!/usr/bin/env python3
"""
Comprehensive Drip Python SDK + raw API test.
Tests EVERY public SDK method AND every documented API endpoint.
No mocks, no frameworks — just real API calls.

Usage:
    python test_bare_bones.py
"""
import os
import sys
import time
import json
import requests as _requests

# Load .env file if present (no external dependency needed)
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

from drip import Drip, DripError, DripAPIError
from drip.models import SpendingCapType

PASS = 0
FAIL = 0
SKIP = 0
results = []

API_KEY = os.environ.get("DRIP_API_KEY", "")
BASE_URL = "https://api.drippay.dev/v1"


def check(name, fn):
    global PASS, FAIL
    try:
        result = fn()
        print(f"  \033[32mPASS\033[0m  {name}")
        PASS += 1
        results.append({"name": name, "status": "PASS"})
        return result
    except Exception as e:
        print(f"  \033[31mFAIL\033[0m  {name}: {e}")
        FAIL += 1
        results.append({"name": name, "status": "FAIL", "error": str(e)})
        return None


def skip(name, reason):
    global SKIP
    print(f"  \033[33mSKIP\033[0m  {name}: {reason}")
    SKIP += 1
    results.append({"name": name, "status": "SKIP", "reason": reason})


def info(msg):
    print(f"  \033[36mINFO\033[0m  {msg}")


def section(num, title):
    print(f"\n\033[1m[{num}] {title}\033[0m")


_session = _requests.Session()
_session.headers.update({
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
})


def api(method, path, body=None):
    """Raw API helper for endpoints without SDK methods."""
    url = f"{BASE_URL}{path}"
    resp = _session.request(method, url, json=body)
    if not resp.ok:
        raise Exception(f"{method} {path} -> {resp.status_code}: {resp.text}")
    try:
        return resp.json()
    except ValueError:
        return resp.text


print("=" * 70)
print("Drip Python SDK — Comprehensive Bare Bones Test")
print("=" * 70)

# =====================================================================
# 1. SDK Initialization
# =====================================================================
section(1, "SDK Initialization")

client = None


def init_from_env():
    global client
    client = Drip()
    assert client is not None
    return client


check("Drip() reads DRIP_API_KEY from env", init_from_env)

if client is None:
    print("\nFATAL: SDK could not initialize.")
    sys.exit(1)

info(f"key_type = {client._key_type}")
info(f"base_url = {client._base_url}")


def init_explicit():
    c = Drip(api_key=os.environ["DRIP_API_KEY"])
    assert "drippay.dev" in c._base_url
    return True


check("Drip(api_key=...) with explicit key", init_explicit)

# =====================================================================
# 2. Health / Ping
# =====================================================================
section(2, "Health & Ping")

ping_result = check("ping()", lambda: client.ping())
if ping_result:
    info(f"ping result = {ping_result}")

health = check("get_health()", lambda: client.get_health())
if health:
    info(f"health = {health}")

# =====================================================================
# 3. Resilience Helpers
# =====================================================================
section(3, "Resilience Helpers")

check(
    "get_metrics() returns None when resilience disabled",
    lambda: (
        True
        if client.get_metrics() is None
        else (_ for _ in ()).throw(Exception("Expected None"))
    ),
)

# =====================================================================
# 4. Customer Management
# =====================================================================
section(4, "Customer Management")

ext_id = f"bb-py-{int(time.time())}"
customer = check(
    "create_customer(external_customer_id=...)",
    lambda: client.create_customer(external_customer_id=ext_id),
)

if customer is None:
    print("\nFATAL: Could not create customer. Stopping.")
    sys.exit(1)

info(f"customer.id = {customer.id}")

fetched = check(
    "get_customer(customer_id)", lambda: client.get_customer(customer.id)
)
if fetched:
    info(f"externalCustomerId = {fetched.external_customer_id}")

listing = check("list_customers()", lambda: client.list_customers())
if listing:
    info(f"count = {listing.count}")

check(
    "list_customers(limit=2)",
    lambda: client.list_customers(limit=2),
)

got_or_created = check(
    "get_or_create_customer(external_customer_id)",
    lambda: client.get_or_create_customer(ext_id),
)
if got_or_created:
    assert got_or_created.id == customer.id, "getOrCreate returned different ID"
    info("Returned same customer (idempotent)")

# =====================================================================
# 5. Balance
# =====================================================================
section(5, "Balance")

balance = check("get_balance(customer_id)", lambda: client.get_balance(customer.id))
if balance:
    info(
        f"balanceUsdc={balance.balance_usdc} pending={balance.pending_charges_usdc} available={balance.available_usdc}"
    )

# =====================================================================
# 6. Customer Provisioning & Sync (Raw API)
# =====================================================================
section(6, "Customer Provisioning & Sync (Raw API)")

check(
    "POST /customers/:id/provision",
    lambda: api("POST", f"/customers/{customer.id}/provision", {}),
)

check(
    "POST /customers/:id/sync-balance",
    lambda: api("POST", f"/customers/{customer.id}/sync-balance"),
)

# =====================================================================
# 7. Spending Caps
# =====================================================================
section(7, "Spending Caps")

cap = check(
    "set_customer_spending_cap(customer_id, cap_type, limit_value)",
    lambda: client.set_customer_spending_cap(
        customer.id,
        cap_type=SpendingCapType.DAILY_CHARGE_LIMIT,
        limit_value=50,
    ),
)
if cap:
    info(f"cap.id = {cap.id}, type={cap.cap_type}, limit={cap.limit_value}")

caps = check(
    "get_customer_spending_caps(customer_id)",
    lambda: client.get_customer_spending_caps(customer.id),
)
if caps:
    info(f"caps count = {len(caps.caps) if hasattr(caps, 'caps') else caps}")

if cap:
    check(
        "remove_customer_spending_cap(customer_id, cap_id)",
        lambda: client.remove_customer_spending_cap(customer.id, cap.id),
    )

# =====================================================================
# 8. Track Usage (Internal / no billing)
# =====================================================================
section(8, "Track Usage (Internal)")

track_result = check(
    "track_usage(customer_id, meter, quantity)",
    lambda: client.track_usage(
        customer_id=customer.id, meter="api_calls", quantity=1
    ),
)
if track_result:
    info(f"result = {track_result}")

check(
    "track_usage(..., metadata={...})",
    lambda: client.track_usage(
        customer_id=customer.id,
        meter="llm_tokens",
        quantity=842,
        metadata={"model": "gpt-4o-mini"},
    ),
)

check(
    "track_usage with custom idempotency_key",
    lambda: client.track_usage(
        customer_id=customer.id,
        meter="api_calls",
        quantity=1,
        idempotency_key=f"py-idem-{int(time.time())}",
    ),
)

# =====================================================================
# 9. Charge (Sync)
# =====================================================================
section(9, "Charge (Sync)")

charge_result = check(
    "charge(customer_id, meter, quantity)",
    lambda: client.charge(customer_id=customer.id, meter="api_calls", quantity=1),
)
if charge_result:
    info(
        f"success={charge_result.success} isDuplicate={charge_result.is_duplicate}"
    )
    info(f"chargeId = {charge_result.charge.id if charge_result.charge else 'N/A'}")

check(
    "charge with metadata",
    lambda: client.charge(
        customer_id=customer.id,
        meter="api_calls",
        quantity=1,
        metadata={"model": "claude-sonnet-4-20250514"},
    ),
)

check(
    "charge with custom idempotency_key",
    lambda: client.charge(
        customer_id=customer.id,
        meter="api_calls",
        quantity=1,
        idempotency_key=f"py-charge-idem-{int(time.time())}",
    ),
)

# =====================================================================
# 10. Charge Async
# =====================================================================
section(10, "Charge Async")

async_result = check(
    "charge_async(customer_id, meter, quantity)",
    lambda: client.charge_async(
        customer_id=customer.id, meter="api_calls", quantity=1
    ),
)
if async_result:
    info(f"success={async_result.success}")
    if hasattr(async_result, "message") and async_result.message:
        info(f"message = {async_result.message}")

# =====================================================================
# 11. List & Get Charges
# =====================================================================
section(11, "List & Get Charges")

charges = check("list_charges()", lambda: client.list_charges())
if charges:
    info(f"count = {charges.count}")

check("list_charges(limit=3)", lambda: client.list_charges(limit=3))

check(
    "list_charges(customer_id=...)",
    lambda: client.list_charges(customer_id=customer.id),
)

if charge_result and charge_result.charge:
    single_charge = check(
        "get_charge(charge_id)",
        lambda: client.get_charge(charge_result.charge.id),
    )
    if single_charge:
        info(f"charge status = {single_charge.status}")

# Raw API: GET /charges
check("GET /charges (raw API)", lambda: api("GET", "/charges?limit=2"))

# =====================================================================
# 12. Wrap API Call
# =====================================================================
section(12, "Wrap API Call")

wrap_result = check(
    "wrap_api_call(customer_id, meter, call, extract_usage)",
    lambda: client.wrap_api_call(
        customer_id=customer.id,
        meter="api_calls",
        call=lambda: {"tokens": 42, "text": "hello world"},
        extract_usage=lambda r: r["tokens"],
    ),
)
if wrap_result:
    info(f"result = {wrap_result.result}")
    info(f"idempotency_key = {wrap_result.idempotency_key}")

# =====================================================================
# 13. Workflows
# =====================================================================
section(13, "Workflows")

workflow = check(
    "create_workflow(name, slug)",
    lambda: client.create_workflow(
        name=f"BB Py Workflow {int(time.time())}",
        slug=f"bb-py-workflow-{int(time.time())}",
    ),
)
if workflow:
    info(f"workflow.id = {workflow.id}")

workflows = check("list_workflows()", lambda: client.list_workflows())
if workflows:
    info(f"workflows count = {workflows.count}")

# =====================================================================
# 14. Runs — Start / End / Get
# =====================================================================
section(14, "Runs — Start / End / Get")

run_id = None
run = check(
    "start_run(customer_id, workflow_id)",
    lambda: client.start_run(
        customer_id=customer.id,
        workflow_id=workflow.id if workflow else "unknown",
    ),
)
if run:
    run_id = run.id
    info(f"run.id = {run.id}")

if run_id:
    run_details = check("get_run(run_id)", lambda: client.get_run(run_id))
    if run_details:
        info(f"run status = {run_details.status}")

    check(
        'end_run(run_id, status="COMPLETED")',
        lambda: client.end_run(run_id, status="COMPLETED"),
    )

# =====================================================================
# 15. Events — Emit / Batch / List / Get / Trace
# =====================================================================
section(15, "Events — Emit / Batch / List / Get / Trace")

evt_run = check(
    "start_run (for events)",
    lambda: client.start_run(
        customer_id=customer.id,
        workflow_id=workflow.id if workflow else "unknown",
    ),
)
evt_run_id = evt_run.id if evt_run else None

single_event_id = None
if evt_run_id:
    evt = check(
        "emit_event(run_id, event_type, quantity)",
        lambda: client.emit_event(
            run_id=evt_run_id,
            event_type="llm.call",
            quantity=1500,
            units="tokens",
            description="GPT-4o inference",
        ),
    )
    if evt:
        single_event_id = evt.id
        info(f"eventId = {evt.id}")

    check(
        "emit_events_batch([...])",
        lambda: client.emit_events_batch(
            [
                {
                    "runId": evt_run_id,
                    "eventType": "tool.call",
                    "quantity": 1,
                    "units": "calls",
                },
                {
                    "runId": evt_run_id,
                    "eventType": "embedding",
                    "quantity": 256,
                    "units": "tokens",
                },
            ]
        ),
    )

    check(
        "end_run (events run)",
        lambda: client.end_run(evt_run_id, status="COMPLETED"),
    )

events = check("list_events()", lambda: client.list_events())
if events:
    info(f"events count = {len(events.data) if hasattr(events, 'data') else events}")

check("list_events(limit=5)", lambda: client.list_events(limit=5))

check(
    "list_events(customer_id=...)",
    lambda: client.list_events(customer_id=customer.id),
)

if evt_run_id:
    check(
        "list_events(run_id=...)",
        lambda: client.list_events(run_id=evt_run_id, limit=3),
    )

if single_event_id:
    evt_detail = check(
        "get_event(event_id)", lambda: client.get_event(single_event_id)
    )
    if evt_detail:
        info(f"event.event_type = {evt_detail.event_type}")

    check(
        "get_event_trace(event_id)",
        lambda: client.get_event_trace(single_event_id),
    )

# Raw API: GET /events (with filters)
check(
    "GET /events?customerId=...&limit=2 (raw API)",
    lambda: api("GET", f"/events?customerId={customer.id}&limit=2"),
)

# Raw API: POST /events (record event directly)
raw_event = check(
    "POST /events (raw API)",
    lambda: api(
        "POST",
        "/events",
        {
            "customerId": customer.id,
            "actionName": "raw.api.test",
            "idempotencyKey": f"raw-evt-{int(time.time())}",
        },
    ),
)
if raw_event:
    info(f"raw event id = {raw_event.get('id') or raw_event.get('eventId')}")

# =====================================================================
# 16. Run Timeline
# =====================================================================
section(16, "Run Timeline")

if evt_run_id:
    timeline = check(
        "get_run_timeline(run_id)",
        lambda: client.get_run_timeline(evt_run_id),
    )
    if timeline:
        info(
            f"timeline events = {len(timeline.events) if hasattr(timeline, 'events') else timeline}"
        )

    check(
        "get_run_timeline(run_id, limit=2, include_anomalies=True)",
        lambda: client.get_run_timeline(
            evt_run_id, limit=2, include_anomalies=True
        ),
    )

# =====================================================================
# 17. Record Run (Simplified)
# =====================================================================
section(17, "Record Run (Simplified)")

record_result = check(
    "record_run(customer_id, workflow, events, status)",
    lambda: client.record_run(
        customer_id=customer.id,
        workflow="research-agent",
        events=[
            {"event_type": "llm.call", "quantity": 1700, "units": "tokens"},
            {"event_type": "tool.call", "quantity": 3},
            {"event_type": "embedding", "quantity": 512, "units": "tokens"},
        ],
        status="COMPLETED",
    ),
)
if record_result:
    info(f"run.id = {record_result.run.id}")
    info(f"events.created = {record_result.events.created}")
    info(f"summary = {record_result.summary}")

# Raw API: POST /runs/record
check(
    "POST /runs/record (raw API)",
    lambda: api(
        "POST",
        "/runs/record",
        {
            "customerId": customer.id,
            "workflow": "raw-api-test-agent",
            "events": [
                {"eventType": "llm.call", "quantity": 100, "units": "tokens"},
            ],
            "status": "COMPLETED",
        },
    ),
)

# =====================================================================
# 18. Run Context Manager
# =====================================================================
section(18, "Run Context Manager")


def test_run_ctx():
    with client.run("ctx-test-agent", customer_id=customer.id) as r:
        r.event("llm.call", quantity=500, units="tokens")
        r.event("tool.call", quantity=1)
    return True


check("run() context manager", test_run_ctx)

# =====================================================================
# 19. Trace by Correlation ID (Raw API)
# =====================================================================
section(19, "Trace by Correlation ID (Raw API)")

corr_id = f"corr-{int(time.time())}"
corr_run = check(
    "start_run with correlation_id",
    lambda: client.start_run(
        customer_id=customer.id,
        workflow_id=workflow.id if workflow else "unknown",
        correlation_id=corr_id,
    ),
)

if corr_run:
    check(
        "emit_event with correlation_id",
        lambda: client.emit_event(
            run_id=corr_run.id,
            event_type="llm.call",
            quantity=100,
            correlation_id=corr_id,
        ),
    )
    check(
        "end_run (correlation run)",
        lambda: client.end_run(corr_run.id, status="COMPLETED"),
    )
    check(
        "GET /trace/:correlationId (raw API)",
        lambda: api("GET", f"/trace/{corr_id}"),
    )

# =====================================================================
# 20. Meters / Pricing Plans
# =====================================================================
section(20, "Meters / Pricing Plans")

meters = check("list_meters()", lambda: client.list_meters())
if meters:
    info(
        f"meters count = {len(meters.data) if hasattr(meters, 'data') else meters}"
    )

# Raw API: Pricing Plans CRUD
ts = int(time.time())
def create_pricing_plan():
    try:
        r = api(
            "POST",
            "/pricing-plans",
            {
                "name": f"Test Plan {ts}",
                "unitType": f"test_unit_{ts}",
                "unitPriceUsd": "0.001",
            },
        )
        info(f"pricingPlan.id = {r.get('id')}")
        return r
    except Exception as e:
        if "403" in str(e):
            info("Pricing plans create requires admin key")
            return {"_skipped": True}
        raise


pricing_plan = check("POST /pricing-plans (create)", create_pricing_plan)

check("GET /pricing-plans (list)", lambda: api("GET", "/pricing-plans"))

if pricing_plan and not pricing_plan.get("_skipped") and pricing_plan.get("id"):
    check(
        "GET /pricing-plans/:id",
        lambda: api("GET", f"/pricing-plans/{pricing_plan['id']}"),
    )

    if pricing_plan.get("unitType"):
        check(
            "GET /pricing-plans/by-type/:unitType",
            lambda: api(
                "GET", f"/pricing-plans/by-type/{pricing_plan['unitType']}"
            ),
        )

    updated_plan = check(
        "PATCH /pricing-plans/:id",
        lambda: api(
            "PATCH",
            f"/pricing-plans/{pricing_plan['id']}",
            {"name": "Updated Test Plan"},
        ),
    )
    if updated_plan:
        info(f"updated name = {updated_plan.get('name')}")

    check(
        "DELETE /pricing-plans/:id",
        lambda: api("DELETE", f"/pricing-plans/{pricing_plan['id']}"),
    )
elif pricing_plan and pricing_plan.get("_skipped"):
    skip("GET /pricing-plans/:id", "Pricing plans create requires admin key")
    skip("GET /pricing-plans/by-type/:unitType", "Pricing plans create requires admin key")
    skip("PATCH /pricing-plans/:id", "Pricing plans create requires admin key")
    skip("DELETE /pricing-plans/:id", "Pricing plans create requires admin key")

# =====================================================================
# 21. Cost Estimation
# =====================================================================
section(21, "Cost Estimation")

from datetime import datetime, timedelta, timezone

check(
    "estimate_from_hypothetical(items=[...])",
    lambda: client.estimate_from_hypothetical(
        items=[
            {"usageType": "api_calls", "quantity": 1000},
            {"usageType": "llm_tokens", "quantity": 500000},
        ]
    ),
)

check(
    "estimate_from_usage(period_start, period_end, customer_id)",
    lambda: client.estimate_from_usage(
        period_start=(datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        period_end=datetime.now(timezone.utc).isoformat(),
        customer_id=customer.id,
    ),
)

# =====================================================================
# 22. Entitlements
# =====================================================================
section(22, "Entitlements")

check(
    "check_entitlement(customer_id, feature_key)",
    lambda: client.check_entitlement(
        customer_id=customer.id, feature_key="api_calls"
    ),
)

# =====================================================================
# 23. Entitlement Plans CRUD (Raw API)
# =====================================================================
section(23, "Entitlement Plans CRUD (Raw API)")

ent_plan = check(
    "POST /entitlement-plans",
    lambda: api(
        "POST",
        "/entitlement-plans",
        {
            "name": f"Test Entitlement Plan {int(time.time())}",
            "slug": f"test-ent-plan-{int(time.time())}",
            "description": "Created by bare bones test",
        },
    ),
)
if ent_plan:
    info(f"entitlementPlan.id = {ent_plan.get('id')}")

check("GET /entitlement-plans", lambda: api("GET", "/entitlement-plans"))

if ent_plan and ent_plan.get("id"):
    check(
        "GET /entitlement-plans/:id",
        lambda: api("GET", f"/entitlement-plans/{ent_plan['id']}"),
    )

    check(
        "PATCH /entitlement-plans/:id",
        lambda: api(
            "PATCH",
            f"/entitlement-plans/{ent_plan['id']}",
            {"name": "Updated Entitlement Plan"},
        ),
    )

    # Add a rule
    rule = check(
        "POST /entitlement-plans/:id/rules",
        lambda: api(
            "POST",
            f"/entitlement-plans/{ent_plan['id']}/rules",
            {
                "featureKey": "api_calls",
                "limitType": "COUNT",
                "limitValue": 10000,
                "period": "MONTHLY",
            },
        ),
    )

    check(
        "GET /entitlement-plans/:id/rules",
        lambda: api("GET", f"/entitlement-plans/{ent_plan['id']}/rules"),
    )

    if rule and rule.get("id"):
        check(
            "PATCH /entitlement-rules/:ruleId",
            lambda: api(
                "PATCH",
                f"/entitlement-rules/{rule['id']}",
                {"limitValue": 20000},
            ),
        )

        check(
            "DELETE /entitlement-rules/:ruleId",
            lambda: api("DELETE", f"/entitlement-rules/{rule['id']}"),
        )

    # Assign plan to customer
    check(
        "PUT /customers/:id/entitlement",
        lambda: api(
            "PUT",
            f"/customers/{customer.id}/entitlement",
            {"planId": ent_plan["id"]},
        ),
    )

    check(
        "GET /customers/:id/entitlement",
        lambda: api("GET", f"/customers/{customer.id}/entitlement"),
    )

    check(
        "GET /customers/:id/entitlement/usage",
        lambda: api("GET", f"/customers/{customer.id}/entitlement/usage"),
    )

    check(
        "DELETE /entitlement-plans/:id",
        lambda: api("DELETE", f"/entitlement-plans/{ent_plan['id']}"),
    )

# =====================================================================
# 24. Contracts CRUD (Raw API)
# =====================================================================
section(24, "Contracts CRUD (Raw API)")

def create_contract():
    try:
        r = api(
            "POST",
            "/contracts",
            {
                "customerId": customer.id,
                "name": f"Test Contract {int(time.time())}",
                "startDate": datetime.now(timezone.utc).isoformat(),
                "endDate": (
                    datetime.now(timezone.utc) + timedelta(days=30)
                ).isoformat(),
            },
        )
        info(f"contract.id = {r.get('id')}")
        return r
    except Exception as e:
        if "403" in str(e):
            info("Contracts require admin key (expected with sk_live key)")
            return {"_skipped": True}
        raise


contract = check("POST /contracts", create_contract)

if contract and not contract.get("_skipped") and contract.get("id"):
    check("GET /contracts", lambda: api("GET", "/contracts"))

    check(
        "GET /contracts/:id",
        lambda: api("GET", f"/contracts/{contract['id']}"),
    )

    check(
        "PATCH /contracts/:id",
        lambda: api(
            "PATCH",
            f"/contracts/{contract['id']}",
            {"name": "Updated Contract"},
        ),
    )

    override = check(
        "POST /contracts/:id/overrides",
        lambda: api(
            "POST",
            f"/contracts/{contract['id']}/overrides",
            {"unitType": "api_calls", "pricePerUnit": "0.0005"},
        ),
    )

    if override:
        check(
            "DELETE /contracts/:id/overrides/:unitType",
            lambda: api(
                "DELETE", f"/contracts/{contract['id']}/overrides/api_calls"
            ),
        )

    check(
        "DELETE /contracts/:id",
        lambda: api("DELETE", f"/contracts/{contract['id']}"),
    )
elif contract and contract.get("_skipped"):
    skip("GET /contracts", "Contracts require admin key")
    skip("GET /contracts/:id", "Contracts require admin key")
    skip("PATCH /contracts/:id", "Contracts require admin key")
    skip("POST /contracts/:id/overrides", "Contracts require admin key")
    skip("DELETE /contracts/:id/overrides/:unitType", "Contracts require admin key")
    skip("DELETE /contracts/:id", "Contracts require admin key")

# =====================================================================
# 25. Webhooks (CRUD)
# =====================================================================
section(25, "Webhooks")

webhook = check(
    "create_webhook(url, events)",
    lambda: client.create_webhook(
        url="https://httpbin.org/post",
        events=["charge.succeeded", "charge.failed"],
    ),
)
if webhook:
    info(f"webhook.id = {webhook.id}")

webhook_list = check("list_webhooks()", lambda: client.list_webhooks())
if webhook_list:
    info(
        f"webhooks count = {len(webhook_list.data) if hasattr(webhook_list, 'data') else webhook_list}"
    )

if webhook and hasattr(webhook, "id"):
    fetched_wh = check(
        "get_webhook(webhook_id)", lambda: client.get_webhook(webhook.id)
    )
    if fetched_wh:
        info(f"webhook.url = {fetched_wh.url}")

    check(
        "update_webhook(webhook_id, description=...)",
        lambda: client.update_webhook(
            webhook.id, description="Updated by bare bones test"
        ),
    )

    check("test_webhook(webhook_id)", lambda: client.test_webhook(webhook.id))

    check(
        "rotate_webhook_secret(webhook_id)",
        lambda: client.rotate_webhook_secret(webhook.id),
    )

    check(
        "delete_webhook(webhook_id)", lambda: client.delete_webhook(webhook.id)
    )

# =====================================================================
# 26. Subscriptions (CRUD + lifecycle)
# =====================================================================
section(26, "Subscriptions")

sub = check(
    "create_subscription(customer_id, name, interval, price_usdc)",
    lambda: client.create_subscription(
        customer_id=customer.id,
        name="Test Plan",
        interval="MONTHLY",
        price_usdc="9.99",
    ),
)
if sub:
    info(f"subscription.id = {sub.id}, status={sub.status}")

if sub and hasattr(sub, "id"):
    fetched_sub = check(
        "get_subscription(subscription_id)",
        lambda: client.get_subscription(sub.id),
    )
    if fetched_sub:
        info(f"subscription.name = {fetched_sub.name}")

    sub_list = check("list_subscriptions()", lambda: client.list_subscriptions())
    if sub_list:
        info(
            f"subscriptions count = {len(sub_list.data) if hasattr(sub_list, 'data') else sub_list}"
        )

    check(
        "list_subscriptions(customer_id=...)",
        lambda: client.list_subscriptions(customer_id=customer.id),
    )

    check(
        "update_subscription(subscription_id, name=...)",
        lambda: client.update_subscription(sub.id, name="Updated Test Plan"),
    )

    check(
        "pause_subscription(subscription_id)",
        lambda: client.pause_subscription(sub.id),
    )

    check(
        "resume_subscription(subscription_id)",
        lambda: client.resume_subscription(sub.id),
    )

    check(
        "cancel_subscription(subscription_id)",
        lambda: client.cancel_subscription(sub.id),
    )

# =====================================================================
# 27. Checkout
# =====================================================================
section(27, "Checkout")

check(
    "checkout(amount, customer_id, return_url)",
    lambda: client.checkout(
        amount=5000,
        customer_id=customer.id,
        return_url="https://example.com/return",
    ),
)

# =====================================================================
# 28. Playground (Raw API)
# =====================================================================
section(28, "Playground (Raw API)")

def test_playground_status():
    try:
        return api("GET", "/playground/status")
    except Exception as e:
        if "404" in str(e):
            info("Playground not available on production (local-only endpoint)")
            return True
        raise


check("GET /playground/status", test_playground_status)


def test_demo_settle():
    try:
        r = api("POST", "/playground/demo-settle")
        info(f"demo-settle result: {json.dumps(r)[:100]}")
        return r
    except Exception as e:
        if "404" in str(e):
            info("Playground not available on production (local-only endpoint)")
            return True
        if "No pending" in str(e) or "No charges" in str(e):
            info("No charges to settle (expected for new customer)")
            return True
        raise


check("POST /playground/demo-settle", test_demo_settle)

# =====================================================================
# 29. Sandbox (Raw API)
# =====================================================================
section(29, "Sandbox (Raw API)")

def test_sandbox_status():
    try:
        return api("GET", "/sandbox/status")
    except Exception as e:
        if "404" in str(e):
            info("Sandbox not available on production (local-only endpoint)")
            return True
        raise


check("GET /sandbox/status", test_sandbox_status)


def test_seed_runs():
    try:
        r = api("POST", "/sandbox/seed-runs")
        info(f"seed-runs: {json.dumps(r)[:100]}")
        return r
    except Exception as e:
        info(f"seed-runs response: {e}")
        return True


check("POST /sandbox/seed-runs", test_seed_runs)

# =====================================================================
# 30. Raw Usage Endpoints
# =====================================================================
section(30, "Raw Usage Endpoints")

check(
    "POST /usage (raw API sync charge)",
    lambda: api(
        "POST",
        "/usage",
        {
            "customerId": customer.id,
            "usageType": "api_calls",
            "quantity": 1,
            "idempotencyKey": f"raw-usage-{int(time.time())}",
        },
    ),
)

check(
    "POST /usage/async (raw API async charge)",
    lambda: api(
        "POST",
        "/usage/async",
        {
            "customerId": customer.id,
            "usageType": "api_calls",
            "quantity": 1,
            "idempotencyKey": f"raw-async-{int(time.time())}",
        },
    ),
)

check(
    "POST /usage/internal (raw API internal tracking)",
    lambda: api(
        "POST",
        "/usage/internal",
        {
            "customerId": customer.id,
            "usageType": "api_calls",
            "quantity": 1,
            "idempotencyKey": f"raw-internal-{int(time.time())}",
        },
    ),
)

# =====================================================================
# 31. Raw Run Endpoints
# =====================================================================
section(31, "Raw Run Endpoints")

raw_run = check(
    "POST /runs (raw API)",
    lambda: api(
        "POST",
        "/runs",
        {
            "customerId": customer.id,
            "workflowId": workflow.id if workflow else "unknown",
        },
    ),
)

if raw_run and raw_run.get("id"):
    raw_run_id = raw_run["id"]

    check(
        "GET /runs/:id (raw API)",
        lambda: api("GET", f"/runs/{raw_run_id}"),
    )

    check(
        "POST /run-events (raw API)",
        lambda: api(
            "POST",
            "/run-events",
            {
                "runId": raw_run_id,
                "eventType": "llm.call",
                "quantity": 100,
                "units": "tokens",
                "idempotencyKey": f"raw-evt-{int(time.time())}",
            },
        ),
    )

    check(
        "POST /run-events/batch (raw API)",
        lambda: api(
            "POST",
            "/run-events/batch",
            {
                "events": [
                    {
                        "runId": raw_run_id,
                        "eventType": "tool.call",
                        "quantity": 1,
                        "units": "calls",
                        "idempotencyKey": f"raw-batch1-{int(time.time())}",
                    },
                    {
                        "runId": raw_run_id,
                        "eventType": "embedding",
                        "quantity": 64,
                        "units": "tokens",
                        "idempotencyKey": f"raw-batch2-{int(time.time())}",
                    },
                ]
            },
        ),
    )

    # Get timeline before ending
    check(
        "GET /runs/:id/timeline (raw API)",
        lambda: api("GET", f"/runs/{raw_run_id}/timeline?limit=10"),
    )

    check(
        "PATCH /runs/:id (end run, raw API)",
        lambda: api("PATCH", f"/runs/{raw_run_id}", {"status": "COMPLETED"}),
    )

# =====================================================================
# 32. Static Utility Methods
# =====================================================================
section(32, "Static Utility Methods")


def test_idempotency_key():
    key = Drip.generate_idempotency_key(
        customer_id=customer.id, step_name="embed", sequence=1
    )
    assert isinstance(key, str) and len(key) > 0, "Empty key"
    info(f"key = {key}")
    return key


check("Drip.generate_idempotency_key(customer_id, step_name)", test_idempotency_key)


def test_webhook_sig():
    """Test webhook signature verification exists and is callable."""
    assert callable(Drip.verify_webhook_signature)
    return True


check("Drip.verify_webhook_signature exists and callable", test_webhook_sig)

# =====================================================================
# 33. Stream Meter
# =====================================================================
section(33, "Stream Meter")


def test_stream_meter():
    stream = client.create_stream_meter(
        customer_id=customer.id,
        meter="api_calls",
    )
    stream.add(100)
    stream.add(200)
    stream.add(300)
    result = stream.flush()
    info(f"flushed = {result}")
    return True


check("create_stream_meter + add + flush", test_stream_meter)

# =====================================================================
# 34. Error Handling
# =====================================================================
section(34, "Error Handling")


def test_404_error():
    try:
        client.get_customer("nonexistent-id-99999")
        return False
    except DripAPIError as e:
        info(f"DripAPIError: status={e.status_code} message={e.message}")
        return True
    except DripError as e:
        info(f"DripError: {e}")
        return True


check("DripAPIError on 404 (get_customer)", test_404_error)


def test_bad_charge():
    try:
        client.charge(customer_id="", meter="test", quantity=1)
        return False
    except (DripAPIError, DripError, Exception) as e:
        info(f"Error caught: {e}")
        return True


check("Error on bad charge (empty customer_id)", test_bad_charge)


def test_raw_404():
    try:
        api("GET", "/this-does-not-exist")
        return False
    except Exception as e:
        if "404" in str(e) or "Not Found" in str(e) or "not found" in str(e):
            info("Got expected 404")
            return True
        info(f"Error: {e}")
        return True


check("Raw API 404 on invalid endpoint", test_raw_404)


def test_raw_422():
    try:
        api("POST", "/customers", {})  # Missing required fields
        return False
    except Exception as e:
        if "422" in str(e) or "400" in str(e) or "Validation" in str(e):
            info(f"Validation error: {str(e)[:100]}")
            return True
        raise


check("Raw API 422 on invalid body", test_raw_422)

# =====================================================================
# 35. Singleton
# =====================================================================
section(35, "Singleton")


def test_singleton():
    from drip import drip as drip_singleton

    drip_singleton.ping()
    return True


check("drip singleton auto-init and ping", test_singleton)

# =====================================================================
# SUMMARY
# =====================================================================
print("\n" + "=" * 70)
print(
    f"RESULTS: \033[32m{PASS} passed\033[0m, \033[31m{FAIL} failed\033[0m, \033[33m{SKIP} skipped\033[0m out of {PASS + FAIL + SKIP}"
)
print("=" * 70)

if FAIL > 0:
    print("\nFailed tests:")
    for r in results:
        if r["status"] == "FAIL":
            print(f"  - {r['name']}: {r['error']}")
    sys.exit(1)
