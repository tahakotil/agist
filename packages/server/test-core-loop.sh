#!/usr/bin/env bash
# test-core-loop.sh — Integration test for the Agist backend core loop
# Usage: bash test-core-loop.sh
# Requires: curl, python3 (for JSON parsing), server running on http://localhost:4400

BASE="http://localhost:4400"
PASS=0
FAIL=0

green() { echo "  PASS: $*"; }
red()   { echo "  FAIL: $*"; }
info()  { echo "       $*"; }

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    green "$label"
    PASS=$((PASS + 1))
  else
    red "$label — expected '$expected', got '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_empty() {
  local label="$1" value="$2"
  if [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "None" ]; then
    green "$label"
    PASS=$((PASS + 1))
  else
    red "$label — value is empty or null"
    FAIL=$((FAIL + 1))
  fi
}

# JSON helper using python3
json_get() {
  local json="$1" key="$2"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$(echo "$key" | sed "s/\./']['/g; s/^/['/; s/$/']/"))" 2>/dev/null || echo "null"
}

json_len() {
  local json="$1" key="$2"
  echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['$key']))" 2>/dev/null || echo "0"
}

echo "========================================"
echo " Agist Backend Core Loop Integration Test"
echo "========================================"
echo ""

# ─── 1. Health ────────────────────────────────────────────────────────────────
echo "── 1. Health ──"
HEALTH=$(curl -sf "$BASE/api/health")
STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)
DB=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['db'])" 2>/dev/null)
assert_eq "GET /api/health → status:ok" "$STATUS" "ok"
assert_eq "GET /api/health → db:ok"     "$DB"     "ok"
echo ""

# ─── 2. Companies ─────────────────────────────────────────────────────────────
echo "── 2. Companies ──"
COMPANY=$(curl -sf -X POST "$BASE/api/companies" \
  -H "Content-Type: application/json" \
  -d '{"name":"CI Test Corp","description":"Integration test"}')
COMPANY_ID=$(echo "$COMPANY" | python3 -c "import sys,json; print(json.load(sys.stdin)['company']['id'])" 2>/dev/null)
COMPANY_NAME=$(echo "$COMPANY" | python3 -c "import sys,json; print(json.load(sys.stdin)['company']['name'])" 2>/dev/null)
assert_not_empty "POST /api/companies → id"   "$COMPANY_ID"
assert_eq "POST /api/companies → name" "$COMPANY_NAME" "CI Test Corp"

LIST_COMPANIES=$(curl -sf "$BASE/api/companies")
COUNT=$(echo "$LIST_COMPANIES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['companies']))" 2>/dev/null || echo 0)
GTE1=$([ "$COUNT" -ge 1 ] && echo yes || echo no)
assert_eq "GET /api/companies → count >= 1" "$GTE1" "yes"
info "Company ID: $COMPANY_ID"
echo ""

# ─── 3. Agents ────────────────────────────────────────────────────────────────
echo "── 3. Agents ──"

# Standard role
AGENT=$(curl -sf -X POST "$BASE/api/companies/$COMPANY_ID/agents" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-worker","role":"worker","model":"claude-haiku-4-5-20251001","title":"CI Worker"}')
AGENT_ID=$(echo "$AGENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['agent']['id'])" 2>/dev/null)
AGENT_ROLE=$(echo "$AGENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['agent']['role'])" 2>/dev/null)
AGENT_STATUS=$(echo "$AGENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['agent']['status'])" 2>/dev/null)
assert_not_empty "POST /api/companies/:id/agents → id"      "$AGENT_ID"
assert_eq        "POST /api/companies/:id/agents → role"    "$AGENT_ROLE"   "worker"
assert_eq        "POST /api/companies/:id/agents → status"  "$AGENT_STATUS" "idle"

# Free-form roles (all should work without enum restriction)
for ROLE in monitoring development seo marketing content research sales devops general; do
  RESP=$(curl -sf -X POST "$BASE/api/companies/$COMPANY_ID/agents" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${ROLE}-agent\",\"role\":\"${ROLE}\",\"model\":\"claude-haiku-4-5-20251001\",\"title\":\"${ROLE} agent\"}" 2>/dev/null)
  GOT_ROLE=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['agent']['role'])" 2>/dev/null || echo "ERROR")
  assert_eq "POST agent role='$ROLE'" "$GOT_ROLE" "$ROLE"
done

# List agents
LIST_AGENTS=$(curl -sf "$BASE/api/companies/$COMPANY_ID/agents")
AGENT_COUNT=$(echo "$LIST_AGENTS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['agents']))" 2>/dev/null || echo 0)
GTE10=$([ "$AGENT_COUNT" -ge 10 ] && echo yes || echo no)
assert_eq "GET /api/companies/:id/agents → count >= 10" "$GTE10" "yes"

# Get single agent
SINGLE=$(curl -sf "$BASE/api/agents/$AGENT_ID")
GOT_NAME=$(echo "$SINGLE" | python3 -c "import sys,json; print(json.load(sys.stdin)['agent']['name'])" 2>/dev/null)
assert_eq "GET /api/agents/:id → name" "$GOT_NAME" "ci-worker"

info "Agent ID: $AGENT_ID"
echo ""

# ─── 4. Wake / Run cycle ──────────────────────────────────────────────────────
echo "── 4. Wake → Run cycle ──"

# Wake with explicit prompt
WAKE=$(curl -sf -X POST "$BASE/api/agents/$AGENT_ID/wake" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Reply with a single word: PONG"}')
RUN_ID=$(echo "$WAKE" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['id'])" 2>/dev/null)
RUN_INIT_STATUS=$(echo "$WAKE" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['status'])" 2>/dev/null)
assert_not_empty "POST /api/agents/:id/wake → runId" "$RUN_ID"
assert_eq "POST /api/agents/:id/wake → status=queued" "$RUN_INIT_STATUS" "queued"
info "Run ID: $RUN_ID"

# Agent should be running or idle (check quickly)
AGENT_NOW=$(curl -sf "$BASE/api/agents/$AGENT_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['agent']['status'])" 2>/dev/null)
VALID=$([ "$AGENT_NOW" = "running" ] || [ "$AGENT_NOW" = "idle" ] && echo yes || echo no)
assert_eq "Agent status is running or idle after wake" "$VALID" "yes"

# Double-wake should 409 if still running
if [ "$AGENT_NOW" = "running" ]; then
  DOUBLE_WAKE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/agents/$AGENT_ID/wake" \
    -H "Content-Type: application/json")
  assert_eq "Double wake returns 409" "$DOUBLE_WAKE_CODE" "409"
fi

echo "   Waiting for run to complete (up to 30s)..."
FINAL_STATUS="unknown"
for i in 1 2 3 4 5 6; do
  sleep 5
  RUN_RESULT=$(curl -sf "$BASE/api/runs/$RUN_ID")
  FINAL_STATUS=$(echo "$RUN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['status'])" 2>/dev/null)
  if [ "$FINAL_STATUS" = "success" ] || [ "$FINAL_STATUS" = "failed" ]; then
    break
  fi
done

assert_eq "Run completes with status=success" "$FINAL_STATUS" "success"

EXIT_CODE=$(echo "$RUN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['exitCode'])" 2>/dev/null)
TOKEN_IN=$(echo "$RUN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['tokenInput'])" 2>/dev/null || echo 0)
TOKEN_OUT=$(echo "$RUN_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['tokenOutput'])" 2>/dev/null || echo 0)
assert_eq "Run exitCode=0" "$EXIT_CODE" "0"
assert_eq "Run tokenInput > 0" "$([ "$TOKEN_IN" -gt 0 ] && echo yes || echo no)" "yes"
assert_eq "Run tokenOutput > 0" "$([ "$TOKEN_OUT" -gt 0 ] && echo yes || echo no)" "yes"

# Agent returns to idle after run
AGENT_AFTER=$(curl -sf "$BASE/api/agents/$AGENT_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['agent']['status'])" 2>/dev/null)
assert_eq "Agent returns to idle after run" "$AGENT_AFTER" "idle"
info "Tokens: input=$TOKEN_IN output=$TOKEN_OUT"
echo ""

# ─── 5. Runs endpoints ────────────────────────────────────────────────────────
echo "── 5. Runs endpoints ──"

RECENT=$(curl -sf "$BASE/api/runs/recent")
RECENT_COUNT=$(echo "$RECENT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['runs']))" 2>/dev/null || echo 0)
assert_eq "GET /api/runs/recent → count >= 1" "$([ "$RECENT_COUNT" -ge 1 ] && echo yes || echo no)" "yes"

SINGLE_RUN=$(curl -sf "$BASE/api/runs/$RUN_ID")
SINGLE_RUN_ID=$(echo "$SINGLE_RUN" | python3 -c "import sys,json; print(json.load(sys.stdin)['run']['id'])" 2>/dev/null)
assert_eq "GET /api/runs/:id → correct id" "$SINGLE_RUN_ID" "$RUN_ID"

AGENT_RUNS=$(curl -sf "$BASE/api/agents/$AGENT_ID/runs")
AGENT_RUN_COUNT=$(echo "$AGENT_RUNS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['runs']))" 2>/dev/null || echo 0)
assert_eq "GET /api/agents/:id/runs → count >= 1" "$([ "$AGENT_RUN_COUNT" -ge 1 ] && echo yes || echo no)" "yes"
echo ""

# ─── Summary ──────────────────────────────────────────────────────────────────
echo "========================================"
echo " Results: $PASS passed, $FAIL failed"
echo "========================================"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
