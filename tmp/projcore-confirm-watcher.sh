#!/bin/bash
# projcore §2.8 v3+ pane-confirmation watcher
# Scans tmux pane every 30s for confirmation prompts AND callbacks.md for STATUS lines.
# Exits on EITHER trigger so /projcore can respond.
TMUX_SESSION="${1:-lkvcdx-39}"
CALLBACKS_FILE="${2:-/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/callbacks.md}"
MATCH_BATCH="${3:-v2-batch-8}"
LAST_CONFIRM_FINGERPRINT=""
CYCLE=0
while true; do
  CYCLE=$((CYCLE + 1))
  PANE=$(tmux capture-pane -p -t "$TMUX_SESSION" 2>/dev/null | tail -50)
  if echo "$PANE" | grep -qE "Would you like to run|Press enter to confirm|Yes, proceed|Allow this command|Approve this action|y/n\?"; then
    # Capture full pane for fingerprint to detect "same prompt twice"
    FINGERPRINT=$(echo "$PANE" | grep -A 2 -E "Would you like to run|Press enter to confirm" | md5sum | cut -d' ' -f1)
    if [ "$FINGERPRINT" = "$LAST_CONFIRM_FINGERPRINT" ]; then
      # Same prompt as last cycle — confirmed stalled
      echo "---CONFIRM PROMPT STALLED (2 consecutive captures)---"
      echo "Cycle: $CYCLE  Time: $(date)"
      echo "$PANE" | tail -25
      exit 1
    fi
    LAST_CONFIRM_FINGERPRINT="$FINGERPRINT"
    echo "---CONFIRM PROMPT DETECTED (first cycle)---"
    echo "$PANE" | tail -25
    exit 1
  fi
  if grep -q "$MATCH_BATCH" "$CALLBACKS_FILE" 2>/dev/null; then
    echo "---CALLBACK LANDED ($MATCH_BATCH)---"
    tail -5 "$CALLBACKS_FILE"
    exit 0
  fi
  sleep 30
done
