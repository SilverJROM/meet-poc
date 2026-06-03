#!/usr/bin/env bash
SESSION=meet-codex
CB=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-host-audio-recovery/projcore-run-2026-06-03/callbacks.md
BATCH="${1:-batch-1}"
idle=0
for i in $(seq 1 180); do
  sleep 10
  if grep -qE "\[projcore callback\] $BATCH (DONE|BLOCKED|NEEDS)" "$CB" 2>/dev/null; then
    echo "WATCHER-EXIT: $BATCH callback:"; grep -E "\[projcore callback\] $BATCH (DONE|BLOCKED|NEEDS)" "$CB" | tail -1; exit 0
  fi
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null)
  if [ -z "$pane" ]; then echo "WATCHER-EXIT: session gone"; exit 0; fi
  if echo "$pane" | grep -qE 'STATUS: (BLOCKED|NEEDS-INFO|NEEDS-CLARIFICATION|DONE)'; then
    echo "WATCHER-EXIT: status:"; echo "$pane" | grep -E 'STATUS: ' | tail -1; exit 0
  fi
  # codex idle: prompt visible without active spinner — heuristic on 'Esc to interrupt' absence
  if echo "$pane" | grep -qiE 'esc to interrupt|working|thinking|tool'; then idle=0; else idle=$((idle+1)); fi
  if [ "$idle" -ge 4 ]; then echo "WATCHER-EXIT: codex idle ${idle}x:"; echo "$pane" | tail -6; exit 0; fi
done
echo "WATCHER-EXIT: 30min cap"; exit 0
