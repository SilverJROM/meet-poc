#!/usr/bin/env bash
# projcore watcher for B1: exits (re-invoking projcore) when /lead is idle-awaiting
# (PROPOSED handshake or done) or writes a callback. Detached background use.
SESSION=meetapla
CB=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-audio-playout/projcore-run-2026-06-01/callbacks.md
idle=0
for i in $(seq 1 180); do   # ~30 min @ 10s
  sleep 10
  # callback file hit (DONE/BLOCKED/NEEDS) — highest priority
  if grep -qE '\[projcore callback\] B1 ' "$CB" 2>/dev/null; then
    echo "WATCHER-EXIT: B1 callback present:"
    grep -E '\[projcore callback\] B1 ' "$CB" | tail -1
    exit 0
  fi
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null)
  if [ -z "$pane" ]; then echo "WATCHER-EXIT: session $SESSION gone"; exit 0; fi
  # explicit terminal statuses in the pane
  if echo "$pane" | grep -qE 'STATUS: (PROPOSED|BLOCKED|NEEDS-INFO|NEEDS-CLARIFICATION|DONE)'; then
    echo "WATCHER-EXIT: status line visible:"; echo "$pane" | grep -E 'STATUS: ' | tail -1; exit 0
  fi
  # idle detection: no "esc to interrupt" => not actively processing
  if echo "$pane" | grep -q 'esc to interrupt'; then idle=0; else idle=$((idle+1)); fi
  if [ "$idle" -ge 3 ]; then
    echo "WATCHER-EXIT: /lead idle ${idle}x (awaiting projcore). Pane tail:"
    echo "$pane" | tail -6
    exit 0
  fi
done
echo "WATCHER-EXIT: 30min cap reached without terminal signal"
exit 0
