#!/usr/bin/env bash
CB=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04/callbacks.md
for i in $(seq 1 200); do
  sleep 10
  c55=$(grep -c "R7-codex55 DONE" "$CB" 2>/dev/null)
  csp=$(grep -c "R7-spark DONE" "$CB" 2>/dev/null)
  if [ "$c55" -ge 1 ] && [ "$csp" -ge 1 ]; then echo "BOTH codex R7 done"; exit 0; fi
  # also exit if both sessions idle (safety)
  p1=$(tmux capture-pane -t meet-codex -p 2>/dev/null); p2=$(tmux capture-pane -t meet-spark -p 2>/dev/null)
  a1=$(echo "$p1"|grep -ciE 'Working \(|esc to interrupt'); a2=$(echo "$p2"|grep -ciE 'Working \(|esc to interrupt')
  if [ "$a1" = 0 ] && [ "$a2" = 0 ] && [ "$i" -gt 3 ]; then echo "both codex idle (i=$i): c55=$c55 csp=$csp"; exit 0; fi
done
echo "cap"; exit 0
