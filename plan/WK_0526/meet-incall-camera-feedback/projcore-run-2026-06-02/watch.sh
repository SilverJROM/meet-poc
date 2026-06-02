#!/usr/bin/env bash
SESSION=meetapla
CB=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-incall-camera-feedback/projcore-run-2026-06-02/callbacks.md
BATCH="${1:-B1}"
idle=0
for i in $(seq 1 180); do
  sleep 10
  if grep -qE "\[projcore callback\] $BATCH " "$CB" 2>/dev/null; then
    echo "WATCHER-EXIT: $BATCH callback present:"; grep -E "\[projcore callback\] $BATCH " "$CB" | tail -1; exit 0
  fi
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null)
  if [ -z "$pane" ]; then echo "WATCHER-EXIT: session gone"; exit 0; fi
  if echo "$pane" | grep -qE 'STATUS: (PROPOSED|BLOCKED|NEEDS-INFO|NEEDS-CLARIFICATION|DONE)'; then
    echo "WATCHER-EXIT: status visible:"; echo "$pane" | grep -E 'STATUS: ' | tail -1; exit 0
  fi
  if echo "$pane" | grep -q 'esc to interrupt'; then idle=0; else idle=$((idle+1)); fi
  if [ "$idle" -ge 3 ]; then echo "WATCHER-EXIT: idle ${idle}x (awaiting projcore):"; echo "$pane" | tail -6; exit 0; fi
done
echo "WATCHER-EXIT: 30min cap"; exit 0
