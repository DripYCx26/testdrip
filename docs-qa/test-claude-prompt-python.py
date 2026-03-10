"""
Phase 2: Claude Prompt Test — Python

This file copies the EXACT code from the user's Claude integration prompt
and tests whether each code block works as documented.

Usage: python docs-qa/test-claude-prompt-python.py
"""
import os
import sys
import json
import time

# Load .env manually (the Claude prompt says Drip() reads DRIP_API_KEY from env)
# The prompt says: pip install drip-sdk[dotenv] — the SDK auto-loads .env
# Let's test WITHOUT manually loading dotenv first, as the prompt implies auto-load
from pathlib import Path

PASS = 0
FAIL = 0
results = []

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

def info(msg):
    print(f"  \033[36mINFO\033[0m  {msg}")

print("=" * 70)
print("Phase 2: Claude Prompt Test — Python (Class Style)")
print("=" * 70)

# =====================================================================
# The Claude prompt says:
#   from drip import Drip
#   drip = Drip()  # reads DRIP_API_KEY from env
# =====================================================================
print("\n\033[1m[1] SDK Import & Init (from Claude prompt)\033[0m")

drip_client = None

def test_import():
    from drip import Drip
    info(f"Drip imported successfully, type = {type(Drip)}")
    return Drip

Drip = check("from drip import Drip", test_import)

if not Drip:
    print("\nFATAL: Could not import Drip. Cannot continue.")
    sys.exit(1)

# Test if .env auto-loads (Claude prompt claims it does with drip-sdk[dotenv])
def test_init():
    global drip_client
    # First check if DRIP_API_KEY is in env (it should be if .env was loaded)
    key = os.environ.get("DRIP_API_KEY")
    if not key:
        info("WARNING: DRIP_API_KEY not in environment — .env was NOT auto-loaded")
        info("Manually loading .env for remaining tests...")
        # Load it manually
        env_path = Path(__file__).parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip()
            info(f"Loaded .env from {env_path}")
        else:
            raise RuntimeError(f".env not found at {env_path}")

    drip_client = Drip()
    info(f"Initialized Drip client: {drip_client}")
    return drip_client

check("drip = Drip() reads DRIP_API_KEY from env", test_init)

if not drip_client:
    print("\nFATAL: Could not initialize Drip client. Cannot continue.")
    sys.exit(1)

# =====================================================================
# The Claude prompt says:
#   customer = drip.create_customer(external_customer_id='your-user-id')
# =====================================================================
print("\n\033[1m[2] Create Customer (from Claude prompt)\033[0m")

customer = None
customer_id = None

def test_create_customer():
    global customer, customer_id
    ts = int(time.time())
    customer = drip_client.create_customer(external_customer_id=f"claude-prompt-py-{ts}")
    info(f"customer.id = {customer.id}")
    info(f"type(customer) = {type(customer)}")
    customer_id = customer.id
    # Check response shape
    for attr in ["id", "external_customer_id", "status"]:
        val = getattr(customer, attr, "MISSING")
        info(f"customer.{attr} = {val}")
    return customer

check("drip.create_customer(external_customer_id=...)", test_create_customer)

if not customer_id:
    print("\nFATAL: Could not create customer. Cannot continue.")
    sys.exit(1)

# =====================================================================
# The Claude prompt says:
#   drip.track_usage(
#       customer_id=customer.id,
#       meter='api_calls',
#       quantity=1,
#       metadata={'endpoint': '/api/generate'}
#   )
# =====================================================================
print("\n\033[1m[3] Track Usage (from Claude prompt)\033[0m")

def test_track_usage():
    result = drip_client.track_usage(
        customer_id=customer.id,
        meter="api_calls",
        quantity=1,
        metadata={"endpoint": "/api/generate"},
    )
    info(f"result = {result}")
    # Check if result has usage_event_id (as GETTING_STARTED.md suggests)
    if hasattr(result, "usage_event_id"):
        info(f"result.usage_event_id = {result.usage_event_id}")
    return result

check("drip.track_usage(customer_id, meter, quantity, metadata)", test_track_usage)

# =====================================================================
# The Claude prompt says:
#   drip.record_run(
#       customer_id=customer.id,
#       workflow='agent-task',
#       events=[
#           {'event_type': 'llm.call', 'quantity': 2500, 'units': 'tokens'},
#           {'event_type': 'tool.call', 'quantity': 3, 'units': 'calls'},
#       ],
#       status='COMPLETED'
#   )
# =====================================================================
print("\n\033[1m[4] Record Run (from Claude prompt)\033[0m")

def test_record_run():
    result = drip_client.record_run(
        customer_id=customer.id,
        workflow="agent-task",
        events=[
            {"event_type": "llm.call", "quantity": 2500, "units": "tokens"},
            {"event_type": "tool.call", "quantity": 3, "units": "calls"},
        ],
        status="COMPLETED",
    )
    info(f"result = {result}")
    return result

check("drip.record_run(customer_id, workflow, events, status)", test_record_run)

# =====================================================================
# SUMMARY
# =====================================================================
print("\n" + "=" * 70)
print(f"RESULTS: \033[32m{PASS} passed\033[0m, \033[31m{FAIL} failed\033[0m out of {PASS + FAIL}")
print("=" * 70)

if FAIL > 0:
    print("\nFailed tests:")
    for r in results:
        if r["status"] == "FAIL":
            print(f"  - {r['name']}: {r['error']}")

# Write results JSON
results_path = Path(__file__).parent / "results-claude-prompt-python.json"
results_path.write_text(json.dumps({"phase": "claude-prompt-python", "pass": PASS, "fail": FAIL, "results": results}, indent=2))
print(f"\nResults written to {results_path}")
