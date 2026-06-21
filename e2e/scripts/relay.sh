#!/usr/bin/env bash
# relay.sh — clean wrapper for driving Peer2-codex on creepy-mini via the JohnnyOne relay.
# Avoids node -e quoting hell. Reads the key from .env (never echoes it).
#
# Usage:
#   relay.sh send "<message to Peer2-codex>"     # send a task/command; prints RelayChatResponse
#   relay.sh send-file <path>                     # send the contents of a file as the message
#   relay.sh poll [N]                             # print last N (default 3) messages (role + time + text)
#   relay.sh last                                 # print just the latest assistant message (full)
#   relay.sh node                                 # print node liveness (lastHeartbeatAt)
#
# Session is the live Peer2-codex codex session. Override with RELAY_SESSION env.

set -euo pipefail
ROOT="/home/agjrom/websites/meet-poc"
# shellcheck disable=SC1091
set -a; . "$ROOT/.env"; set +a
GQL="https://johnnyone.peer2-353.workers.dev/graphql"
SESSION="${RELAY_SESSION:-872d483d-d986-4a3d-9486-eb59a600a55d}"

gql() {
  # $1 = JSON body (already built)
  curl -s -X POST "$GQL" \
    -H "Authorization: Bearer $PEER2_MACHINE" \
    -H "Content-Type: application/json" \
    -d "$1"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  send)
    MSG="${1:-}"
    BODY="$(MSG="$MSG" SESSION="$SESSION" python3 -c '
import json,os
print(json.dumps({
 "query":"mutation($i:RelayChatMessageInput!){ sendRelayChatMessage(input:$i){ __typename } }",
 "variables":{"i":{"sessionId":os.environ["SESSION"],"content":os.environ["MSG"],"provider":"codex","model":os.environ.get("RELAY_MODEL","gpt-5.5")}}
}))')"
    gql "$BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("SENT" if d.get("data",{}).get("sendRelayChatMessage") else "ERROR: "+json.dumps(d)[:300])'
    ;;
  send-file)
    MSG="$(cat "${1:?path}")"
    RELAY_SESSION="$SESSION" "$0" send "$MSG"
    ;;
  poll)
    N="${1:-3}"
    BODY="$(SESSION="$SESSION" python3 -c 'import json,os;print(json.dumps({"query":"{ listAiMessages(sessionId:\""+os.environ["SESSION"]+"\"){ role content createdAt } }"}))')"
    gql "$BODY" | N="$N" python3 -c '
import json,sys,os
d=json.load(sys.stdin)["data"]["listAiMessages"]
for m in d[-int(os.environ["N"]):]:
    c=" ".join((m["content"] or "").split())
    print("["+m["role"]+"] "+str(m["createdAt"])+": "+c[:400])'
    ;;
  last)
    BODY="$(SESSION="$SESSION" python3 -c 'import json,os;print(json.dumps({"query":"{ listAiMessages(sessionId:\""+os.environ["SESSION"]+"\"){ role content createdAt } }"}))')"
    gql "$BODY" | python3 -c '
import json,sys
d=json.load(sys.stdin)["data"]["listAiMessages"]
a=[m for m in d if m["role"]=="assistant"]
print((" ".join((a[-1]["content"] or "").split())) if a else "(no assistant msg)")'
    ;;
  node)
    gql '{"query":"{ listDesktopNodes { hostname status lastHeartbeatAt } }"}' | python3 -c 'import json,sys; n=json.load(sys.stdin)["data"]["listDesktopNodes"]; print(n[0] if n else "NO NODE")'
    ;;
  *)
    echo "usage: relay.sh send <msg> | send-file <path> | poll [N] | last | node" >&2; exit 2;;
esac
