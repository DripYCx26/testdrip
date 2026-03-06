#!/usr/bin/env python3
"""
Bare-bones Drip Python SDK test.
Follows README docs exactly. No mocks, no frameworks, just real API calls.

Usage:
    python test_bare_bones.py
"""
import os
import sys
import time

# Step 1: Test .env loading (README says: "auto-loads .env files when python-dotenv is installed")
# We do NOT manually call load_dotenv() — the SDK should handle it.

from drip import Drip, DripError, DripAPIError

PASS = 0
FAIL = 0

def check(name, fn):
    global PASS, FAIL
    try:
        result = fn()
        print(f"  PASS  {name}")
        PASS += 1
        return result
    except Exception as e:
        print(f"  FAIL  {name}: {e}")
        FAIL += 1
        return None


print("=" * 60)
print("Drip Python SDK — Bare Bones Test")
print("=" * 60)

# --- SDK INIT ---
# README: "Auto-reads DRIP_API_KEY from environment"
# README: "Or pass config explicitly"
print("\n[1] SDK Initialization")

client = None
def init_from_env():
    global client
    # README says this should work if DRIP_API_KEY is in env or .env
    client = Drip()
    assert client is not None
    return client

check("Drip() reads DRIP_API_KEY from env/.env", init_from_env)

if client is None:
    print("\nFATAL: SDK could not initialize. Is DRIP_API_KEY set in .env or environment?")
    sys.exit(1)

print(f"  INFO  key_type = {client._key_type}")
print(f"  INFO  base_url = {client._base_url}")

# --- PING ---
# README: "drip.ping() — Verify API connection"
print("\n[2] Ping")
check("ping()", lambda: client.ping())

# --- CREATE CUSTOMER ---
# README: "customer = drip.create_customer(external_customer_id='user_123')"
print("\n[3] Create Customer")
ext_id = f"barebone-test-{int(time.time())}"
customer = check("create_customer(external_customer_id=...)",
    lambda: client.create_customer(external_customer_id=ext_id))

if customer is None:
    print("\nFATAL: Could not create customer. Stopping.")
    sys.exit(1)

print(f"  INFO  customer.id = {customer.id}")

# --- GET CUSTOMER ---
# README: "get_customer(customer_id)"
print("\n[4] Get Customer")
fetched = check("get_customer(customer_id)",
    lambda: client.get_customer(customer.id))

# --- LIST CUSTOMERS ---
# README: "list_customers(options)"
print("\n[5] List Customers")
listing = check("list_customers()", lambda: client.list_customers())
if listing:
    print(f"  INFO  count = {listing.count}")

# --- TRACK USAGE ---
# README: "drip.track_usage(customer_id=customer.id, meter='api_calls', quantity=1)"
print("\n[6] Track Usage")
usage_result = check("track_usage(customer_id, meter, quantity)",
    lambda: client.track_usage(
        customer_id=customer.id,
        meter="api_calls",
        quantity=1
    ))

# --- TRACK USAGE WITH METADATA ---
# README: "drip.track_usage(..., metadata={'model': 'gpt-4o-mini'})"
print("\n[7] Track Usage with Metadata")
check("track_usage(..., metadata={...})",
    lambda: client.track_usage(
        customer_id=customer.id,
        meter="llm_tokens",
        quantity=842,
        metadata={"model": "gpt-4o-mini"}
    ))

# --- CHARGE ---
# README: "drip.charge(customer_id=customer.id, meter='api_calls', quantity=1)"
print("\n[8] Charge")
charge_result = check("charge(customer_id, meter, quantity)",
    lambda: client.charge(
        customer_id=customer.id,
        meter="api_calls",
        quantity=1
    ))
if charge_result:
    print(f"  INFO  charge = {charge_result}")

# --- CHARGE ASYNC ---
# README: "charge_async(customer_id, meter, quantity) — returns immediately"
print("\n[9] Charge Async")
async_result = check("charge_async(customer_id, meter, quantity)",
    lambda: client.charge_async(
        customer_id=customer.id,
        meter="api_calls",
        quantity=1
    ))
if async_result:
    print(f"  INFO  async_result = {async_result}")

# --- LIST CHARGES ---
# README: "list_charges(options)"
print("\n[10] List Charges")
charges = check("list_charges()", lambda: client.list_charges())
if charges:
    print(f"  INFO  count = {charges.count}")

# --- GET BALANCE ---
# README: "get_balance(customer_id)"
print("\n[11] Get Balance")
balance = check("get_balance(customer_id)",
    lambda: client.get_balance(customer.id))
if balance:
    print(f"  INFO  balance = {balance}")

# --- RECORD RUN ---
# README: "drip.record_run(customer_id=..., workflow='research-agent', events=[...], status='COMPLETED')"
print("\n[12] Record Run")
run_result = check("record_run(customer_id, workflow, events, status)",
    lambda: client.record_run(
        customer_id=customer.id,
        workflow="research-agent",
        events=[
            {"event_type": "llm.call", "quantity": 1700, "units": "tokens"},
            {"event_type": "tool.call", "quantity": 1},
        ],
        status="COMPLETED"
    ))
if run_result:
    print(f"  INFO  run = {run_result}")

# --- RUN CONTEXT MANAGER ---
# README: "with drip.run('research-agent', customer_id=customer.id) as run:"
print("\n[13] Run Context Manager")
def test_run_ctx():
    with client.run("ctx-test-agent", customer_id=customer.id) as run:
        run.event("llm.call", quantity=500, units="tokens")
        run.event("tool.call", quantity=1)
    return True
check("run() context manager", test_run_ctx)

# --- LIST EVENTS ---
# README: "list_events(options)"
print("\n[14] List Events")
events = check("list_events()", lambda: client.list_events())
if events:
    print(f"  INFO  events count = {len(events.data) if hasattr(events, 'data') else events}")

# --- ERROR HANDLING ---
# README: "except DripAPIError as e: print(f'API error {e.status_code}: {e.message}')"
print("\n[15] Error Handling")
def test_error():
    try:
        client.get_customer("nonexistent-id-12345")
        return False  # Should have thrown
    except DripAPIError as e:
        print(f"  INFO  Caught DripAPIError: status={e.status_code} message={e.message}")
        return True
    except DripError as e:
        print(f"  INFO  Caught DripError: {e}")
        return True
check("DripAPIError on 404", test_error)

# --- SINGLETON ---
# README: "from drip import drip" then "drip.ping()"
print("\n[16] Singleton")
def test_singleton():
    from drip import drip as drip_singleton
    drip_singleton.ping()
    return True
check("drip singleton auto-init", test_singleton)

# --- SUMMARY ---
print("\n" + "=" * 60)
print(f"RESULTS: {PASS} passed, {FAIL} failed out of {PASS + FAIL}")
print("=" * 60)

if FAIL > 0:
    sys.exit(1)
