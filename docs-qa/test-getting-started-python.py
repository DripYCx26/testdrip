"""
Phase 3: GETTING_STARTED.md Test — Python

Tests Steps 1-9 from GETTING_STARTED.md using the EXACT singleton style
documented there: from drip import drip

Usage: python docs-qa/test-getting-started-python.py
"""
import os
import sys
import json
import time
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
print("Phase 3: GETTING_STARTED.md Test — Python (Singleton Style)")
print("=" * 70)

# =====================================================================
# Step 0: Load environment
# GETTING_STARTED.md says: export DRIP_API_KEY="sk_live_YOUR_KEY_HERE"
# It also says: pip install drip-sdk
# It does NOT mention python-dotenv for .env file loading
# =====================================================================
print("\n\033[1m[Step 0] API Key Setup\033[0m")

def test_env():
    key = os.environ.get("DRIP_API_KEY")
    if not key:
        info("DRIP_API_KEY not in env — loading .env manually")
        env_path = Path(__file__).parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip()
        key = os.environ.get("DRIP_API_KEY")
    if not key:
        raise RuntimeError("DRIP_API_KEY still not set after loading .env")
    info(f"Key prefix: {key[:8]}...")
    return key

check("DRIP_API_KEY available", test_env)

# =====================================================================
# GETTING_STARTED.md Step 1:
#   from drip import drip
#   customer = drip.create_customer(external_customer_id="user_123")
#   print(f"Customer ID: {customer.id}")
# =====================================================================
print("\n\033[1m[Step 1] Create Customer (singleton)\033[0m")

drip_client = None
customer_id = None

def test_singleton_import():
    global drip_client
    from drip import drip as d
    drip_client = d
    info(f"Singleton imported: {type(drip_client)}")
    return d

check("from drip import drip (GETTING_STARTED singleton style)", test_singleton_import)

if not drip_client:
    print("\nFATAL: Could not import drip singleton.")
    sys.exit(1)

customer = None

def test_create_customer():
    global customer, customer_id
    ts = int(time.time())
    customer = drip_client.create_customer(external_customer_id=f"gs-py-{ts}")
    print(f"  \033[36mINFO\033[0m  Customer ID: {customer.id}")
    customer_id = customer.id
    return customer

check("drip.create_customer (GETTING_STARTED Step 1)", test_create_customer)

if not customer_id:
    print("\nFATAL: Could not create customer.")
    sys.exit(1)

# =====================================================================
# GETTING_STARTED.md Step 2:
#   customers = drip.list_customers()
#   for c in customers.data:
#       print(f"{c.id}  {c.external_customer_id}  {c.status}")
# =====================================================================
print("\n\033[1m[Step 2] List Customers (singleton)\033[0m")

def test_list_customers():
    customers = drip_client.list_customers()
    info(f"Found {len(customers.data)} customers")
    if customers.data:
        c = customers.data[0]
        # Test the exact attribute names from docs
        info(f"First: {c.id}  {c.external_customer_id}  {c.status}")
    return customers

check("drip.list_customers (GETTING_STARTED Step 2)", test_list_customers)

# =====================================================================
# GETTING_STARTED.md Step 4:
#   result = drip.track_usage(
#       customer_id="CUSTOMER_ID",
#       meter="api_calls",
#       quantity=1,
#       idempotency_key=f"req_{int(time.time())}",
#   )
#   print(result.usage_event_id)
# =====================================================================
print("\n\033[1m[Step 4] Record Usage (singleton)\033[0m")

def test_track_usage():
    result = drip_client.track_usage(
        customer_id=customer_id,
        meter="api_calls",
        quantity=1,
        idempotency_key=f"req_{int(time.time())}",
    )
    # Docs say: print(result.usage_event_id)
    if hasattr(result, "usage_event_id"):
        info(f"result.usage_event_id = {result.usage_event_id}")
    else:
        info(f"WARNING: result has no .usage_event_id attribute. Available: {dir(result)}")
    return result

check("drip.track_usage (GETTING_STARTED Step 4)", test_track_usage)

# =====================================================================
# GETTING_STARTED.md Step 5:
#   drip.track_usage(
#       customer_id="CUSTOMER_ID",
#       meter="llm_tokens",
#       quantity=1500,
#       metadata={"model": "gpt-4", "input_tokens": 500, "output_tokens": 1000},
#   )
# =====================================================================
print("\n\033[1m[Step 5] Record Usage with Quantity (singleton)\033[0m")

def test_track_usage_quantity():
    drip_client.track_usage(
        customer_id=customer_id,
        meter="llm_tokens",
        quantity=1500,
        metadata={"model": "gpt-4", "input_tokens": 500, "output_tokens": 1000},
    )
    info("track_usage with quantity succeeded")

check("drip.track_usage with quantity & metadata (GETTING_STARTED Step 5)", test_track_usage_quantity)

# =====================================================================
# GETTING_STARTED.md Full Integration Step 5:
#   result = drip.track_usage(
#       customer_id=customer.id,
#       meter="api_calls",
#       quantity=1,
#       idempotency_key="track_001",
#       metadata={"endpoint": "/v1/generate"},
#   )
#   print(result.usage_event_id)
# =====================================================================
print("\n\033[1m[Full Step 5] Track Usage with idempotency + metadata\033[0m")

def test_full_track():
    result = drip_client.track_usage(
        customer_id=customer_id,
        meter="api_calls",
        quantity=1,
        idempotency_key="track_001",
        metadata={"endpoint": "/v1/generate"},
    )
    if hasattr(result, "usage_event_id"):
        info(f"result.usage_event_id = {result.usage_event_id}")
    return result

check("drip.track_usage full step 5 style", test_full_track)

# =====================================================================
# GETTING_STARTED.md Full Integration Step 6:
#   charge = drip.charge(
#       customer_id=customer.id,
#       meter="api_calls",
#       quantity=100,
#       idempotency_key="charge_001",
#   )
#   print(charge.charge.amount_usdc)
# =====================================================================
print("\n\033[1m[Full Step 6] Charge Usage\033[0m")

def test_charge():
    charge = drip_client.charge(
        customer_id=customer_id,
        meter="api_calls",
        quantity=100,
        idempotency_key=f"charge_{int(time.time())}",
    )
    info(f"charge = {charge}")
    # Docs say: print(charge.charge.amount_usdc)
    if hasattr(charge, "charge") and charge.charge:
        info(f"charge.charge.amount_usdc = {charge.charge.amount_usdc}")
    else:
        info("WARNING: charge.charge is missing — docs say to access charge.charge.amount_usdc")
    return charge

check("drip.charge (GETTING_STARTED Step 6)", test_charge)

# =====================================================================
# GETTING_STARTED.md Full Integration Step 9: Error Handling
#   from drip import DripError  (implied by Node docs, Python equivalent)
# =====================================================================
print("\n\033[1m[Full Step 9] Error Handling\033[0m")

def test_error_handling():
    from drip import DripError
    try:
        drip_client.charge(
            customer_id="nonexistent-customer-99999",
            meter="api_calls",
            quantity=1,
        )
        raise RuntimeError("Should have raised an error")
    except DripError as e:
        info(f"DripError caught: code={getattr(e, 'code', 'N/A')} message={e}")
        return True
    except RuntimeError:
        raise
    except Exception as e:
        info(f"Non-DripError caught: {type(e).__name__}: {e}")
        return True

check("DripError on bad customer (GETTING_STARTED Step 9)", test_error_handling)

# =====================================================================
# CROSS-CHECK: singleton vs class
# =====================================================================
print("\n\033[1m[Cross-Check] Singleton vs Class\033[0m")

def test_singleton_vs_class():
    from drip import Drip
    class_client = Drip()
    singleton_result = drip_client.list_customers()
    class_result = class_client.list_customers()
    info(f"Singleton count: {singleton_result.count}, Class count: {class_result.count}")
    if singleton_result.count != class_result.count:
        raise RuntimeError(f"Counts differ: {singleton_result.count} vs {class_result.count}")

check("Singleton and class produce same results", test_singleton_vs_class)

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

results_path = Path(__file__).parent / "results-getting-started-python.json"
results_path.write_text(json.dumps({"phase": "getting-started-python", "pass": PASS, "fail": FAIL, "results": results}, indent=2))
print(f"\nResults written to {results_path}")
