#!/usr/bin/env bash
SESSION=meet-codex
CB=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04/callbacks.md
TAG="${1:-R1}"
idle=0
for i in $(seq 1 180); do
  sleep 10
  if grep -qE "\[projcore callback\] $TAG (DONE|BLOCKED|NEEDS)" "$CB" 2>/dev/null; then
    echo "WATCHER-EXIT: $TAG callback:"; grep -E "\[projcore callback\] $TAG " "$CB" | tail -1; exit 0
  fi
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null)
  if [ -z "$pane" ]; then echo "WATCHER-EXIT: session gone"; exit 0; fi
  if echo "$pane" | grep -qiE 'Working \(|esc to interrupt'; then idle=0; else idle=$((idle+1)); fi
  if [ "$idle" -ge 4 ]; then echo "WATCHER-EXIT: codex idle ${idle}x:"; echo "$pane" | tail -8; exit 0; fi
done
echo "WATCHER-EXIT: 30min cap"; exit 0
