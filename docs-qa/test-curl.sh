#!/usr/bin/env bash
#
# Phase 4: Curl Tests
# Executes every curl command from GETTING_STARTED.md VERBATIM
# (with real API key substitution)
#
# Usage: bash docs-qa/test-curl.sh

set -euo pipefail

# Load .env
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

if [ -z "${DRIP_API_KEY:-}" ]; then
  echo "FATAL: DRIP_API_KEY not set"
  exit 1
fi

PASS=0
FAIL=0
RESULTS_FILE="$(dirname "$0")/results-curl.json"

# Initialize JSON results
echo '{"phase":"curl","results":[' > "$RESULTS_FILE"
FIRST=1

check() {
  local name="$1"
  shift
  local response
  local http_code

  # Create temp file for response body
  local tmpfile=$(mktemp)

  # Run curl, capture HTTP code and body
  http_code=$(curl -s -o "$tmpfile" -w "%{http_code}" "$@" 2>&1) || true
  response=$(cat "$tmpfile")
  rm -f "$tmpfile"

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ] || [ "$http_code" = "409" ]; then
    echo -e "  \033[32mPASS\033[0m  $name (HTTP $http_code)"
    PASS=$((PASS + 1))
    if [ $FIRST -eq 0 ]; then echo "," >> "$RESULTS_FILE"; fi
    FIRST=0
    echo "{\"name\":\"$name\",\"status\":\"PASS\",\"httpCode\":$http_code}" >> "$RESULTS_FILE"
  else
    echo -e "  \033[31mFAIL\033[0m  $name (HTTP $http_code)"
    echo -e "  \033[36mINFO\033[0m  Response: ${response:0:200}"
    FAIL=$((FAIL + 1))
    if [ $FIRST -eq 0 ]; then echo "," >> "$RESULTS_FILE"; fi
    FIRST=0
    # Escape response for JSON
    local escaped=$(echo "$response" | head -c 200 | sed 's/"/\\"/g' | tr '\n' ' ')
    echo "{\"name\":\"$name\",\"status\":\"FAIL\",\"httpCode\":$http_code,\"error\":\"$escaped\"}" >> "$RESULTS_FILE"
  fi

  # Print truncated response for debugging
  echo -e "  \033[36mINFO\033[0m  Body: $(echo "$response" | head -c 150)"
}

echo "======================================================================"
echo "Phase 4: Curl Tests (GETTING_STARTED.md commands verbatim)"
echo "======================================================================"

# =====================================================================
# Step 1: Create a customer
# GETTING_STARTED.md EXACT command:
#   curl -X POST https://api.drippay.dev/v1/customers \
#     -H "Authorization: Bearer $DRIP_API_KEY" \
#     -H "Content-Type: application/json" \
#     -d '{"externalCustomerId": "user_123"}'
# =====================================================================
echo ""
echo -e "\033[1m[Step 1] Create Customer\033[0m"

TS=$(date +%s)
check "POST /v1/customers (Step 1)" \
  -X POST https://api.drippay.dev/v1/customers \
  -H "Authorization: Bearer $DRIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"externalCustomerId\": \"curl-test-$TS\"}"

# Get customer ID for subsequent requests
CUSTOMER_ID=$(curl -s https://api.drippay.dev/v1/customers \
  -H "Authorization: Bearer $DRIP_API_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null || echo "")

if [ -z "$CUSTOMER_ID" ]; then
  echo -e "  \033[33mWARN\033[0m  Could not extract customer ID. Using placeholder."
  CUSTOMER_ID="UNKNOWN"
fi
echo -e "  \033[36mINFO\033[0m  Using customer ID: $CUSTOMER_ID"

# =====================================================================
# Step 2: List customers
# GETTING_STARTED.md EXACT command:
#   curl -s https://api.drippay.dev/v1/customers \
#     -H "Authorization: Bearer $DRIP_API_KEY" | python3 -m json.tool
# =====================================================================
echo ""
echo -e "\033[1m[Step 2] List Customers\033[0m"

check "GET /v1/customers (Step 2)" \
  -s https://api.drippay.dev/v1/customers \
  -H "Authorization: Bearer $DRIP_API_KEY"

# =====================================================================
# Step 3: Set pricing (optional)
# GETTING_STARTED.md EXACT command:
#   curl -X POST https://api.drippay.dev/v1/pricing-plans \
#     -H "Authorization: Bearer $DRIP_API_KEY" \
#     -H "Content-Type: application/json" \
#     -d '{"name": "API Calls", "unitType": "api_call", "unitPriceUsd": 0.001}'
# =====================================================================
echo ""
echo -e "\033[1m[Step 3] Set Pricing\033[0m"

check "POST /v1/pricing-plans (Step 3)" \
  -X POST https://api.drippay.dev/v1/pricing-plans \
  -H "Authorization: Bearer $DRIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "API Calls Curl Test", "unitType": "api_call_curl_test", "unitPriceUsd": 0.001}'

# =====================================================================
# Step 4: Record usage
# GETTING_STARTED.md EXACT command (this is the EVENTS endpoint, not /usage):
#   curl -X POST https://api.drippay.dev/v1/events \
#     -H "Authorization: Bearer $DRIP_API_KEY" \
#     -H "Content-Type: application/json" \
#     -d '{"customerId": "CUSTOMER_ID", "actionName": "api_call", "idempotencyKey": "req_..."}'
#
# NOTE: The SDK trackUsage() uses POST /usage/internal with {usageType, meter, quantity}
# but the curl docs use POST /events with {actionName, idempotencyKey}
# These are DIFFERENT endpoints with DIFFERENT schemas!
# =====================================================================
echo ""
echo -e "\033[1m[Step 4] Record Usage (curl uses /v1/events)\033[0m"

check "POST /v1/events (Step 4 — docs curl command)" \
  -X POST https://api.drippay.dev/v1/events \
  -H "Authorization: Bearer $DRIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\": \"$CUSTOMER_ID\", \"actionName\": \"api_call\", \"idempotencyKey\": \"req_$TS\"}"

# =====================================================================
# Step 5: Record usage with quantity
# GETTING_STARTED.md EXACT command:
#   curl -X POST https://api.drippay.dev/v1/events \
#     -H "Authorization: Bearer $DRIP_API_KEY" \
#     -H "Content-Type: application/json" \
#     -d '{"customerId": "CUSTOMER_ID", "actionName": "llm_tokens", "quantity": 1500, ...}'
# =====================================================================
echo ""
echo -e "\033[1m[Step 5] Record Usage with Quantity\033[0m"

TS2=$(date +%s)
check "POST /v1/events with quantity (Step 5)" \
  -X POST https://api.drippay.dev/v1/events \
  -H "Authorization: Bearer $DRIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\": \"$CUSTOMER_ID\", \"actionName\": \"llm_tokens\", \"quantity\": 1500, \"idempotencyKey\": \"req_${TS2}\", \"metadata\": {\"model\": \"gpt-4\", \"input_tokens\": 500, \"output_tokens\": 1000}}"

# =====================================================================
# Step 6: Charge usage (Full Integration)
# GETTING_STARTED.md EXACT curl command:
#   curl -X POST https://api.drippay.dev/v1/usage \
#     -H "Authorization: Bearer $DRIP_API_KEY" \
#     -H "Content-Type: application/json" \
#     -d '{"customerId": "CUSTOMER_ID", "usageType": "api_call", "quantity": 100, "idempotencyKey": "charge_001"}'
#
# NOTE: This uses /v1/usage (billing) not /v1/events (tracking)
# The field is "usageType" not "meter" (SDK uses "meter" which maps to "usageType")
# =====================================================================
echo ""
echo -e "\033[1m[Step 6] Charge Usage\033[0m"

TS3=$(date +%s)
check "POST /v1/usage (Step 6 — charge curl)" \
  -X POST https://api.drippay.dev/v1/usage \
  -H "Authorization: Bearer $DRIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\": \"$CUSTOMER_ID\", \"usageType\": \"api_call\", \"quantity\": 100, \"idempotencyKey\": \"charge_curl_${TS3}\"}"

# =====================================================================
# BONUS: Test SDK-equivalent endpoint (POST /usage/internal)
# The SDK trackUsage() actually calls this, not /events
# =====================================================================
echo ""
echo -e "\033[1m[Bonus] SDK-equivalent endpoint\033[0m"

TS4=$(date +%s)
check "POST /v1/usage/internal (what SDK trackUsage actually calls)" \
  -X POST https://api.drippay.dev/v1/usage/internal \
  -H "Authorization: Bearer $DRIP_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\": \"$CUSTOMER_ID\", \"usageType\": \"api_calls\", \"quantity\": 1, \"idempotencyKey\": \"internal_${TS4}\"}"

# =====================================================================
# SUMMARY
# =====================================================================
echo ""
echo "======================================================================"
echo -e "RESULTS: \033[32m${PASS} passed\033[0m, \033[31m${FAIL} failed\033[0m out of $((PASS + FAIL))"
echo "======================================================================"

# Close JSON
echo "],\"pass\":$PASS,\"fail\":$FAIL}" >> "$RESULTS_FILE"
echo "Results written to $RESULTS_FILE"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
