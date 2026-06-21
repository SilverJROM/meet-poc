#!/usr/bin/env bash
SESSION=meet-codex
idle=0
for i in $(seq 1 60); do
  sleep 8
  pane=$(tmux capture-pane -t "$SESSION" -p 2>/dev/null)
  [ -z "$pane" ] && { echo "EXIT gone"; exit 0; }
  if echo "$pane" | grep -qiE 'Working \(|esc to interrupt'; then idle=0; else idle=$((idle+1)); fi
  if [ "$idle" -ge 3 ]; then echo "EXIT idle"; exit 0; fi
done
echo "EXIT cap"; exit 0
