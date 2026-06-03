#!/usr/bin/env bash
SESSION=meet-codex
idle=0
for i in $(seq 1 120); do
  sleep 10
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null)
  if [ -z "$pane" ]; then echo "EXIT: session gone"; exit 0; fi
  if echo "$pane" | grep -qiE 'Working \(|esc to interrupt'; then idle=0; else idle=$((idle+1)); fi
  if [ "$idle" -ge 3 ]; then echo "EXIT: codex idle ${idle}x (settled). Tail:"; echo "$pane" | tail -8; exit 0; fi
done
echo "EXIT: 20min cap"; exit 0
