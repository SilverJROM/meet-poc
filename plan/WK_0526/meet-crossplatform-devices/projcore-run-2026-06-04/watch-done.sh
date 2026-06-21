#!/usr/bin/env bash
SESSION=meet-codex
CB=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04/callbacks.md
TAG="${1:-ARCH0}"
idle=0
for i in $(seq 1 200); do
  sleep 10
  if grep -qE "\[projcore callback\] $TAG (DONE|BLOCKED|NEEDS)" "$CB" 2>/dev/null; then
    echo "EXIT: $TAG terminal:"; grep -E "\[projcore callback\] $TAG (DONE|BLOCKED|NEEDS)" "$CB" | tail -1; exit 0
  fi
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null); [ -z "$pane" ] && { echo "gone"; exit 0; }
  if echo "$pane" | grep -qiE 'Working \(|esc to interrupt'; then idle=0; else idle=$((idle+1)); fi
  if [ "$idle" -ge 4 ]; then echo "EXIT: idle:"; echo "$pane"|tail -6; exit 0; fi
done
echo cap; exit 0
