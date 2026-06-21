#!/usr/bin/env bash
CB=/home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04/callbacks.md
for i in $(seq 1 220); do
  sleep 10
  a=$(grep -c "R11-codex55 DONE" "$CB"); b=$(grep -c "R11-gpt54 DONE" "$CB"); c=$(grep -c "R11-spark DONE" "$CB")
  if [ "$a" -ge 1 ] && [ "$b" -ge 1 ] && [ "$c" -ge 1 ]; then echo "R11 codex trio done"; exit 0; fi
  idle=0; for s in meet-codex meet-54 meet-spark; do p=$(tmux capture-pane -t $s -p 2>/dev/null); echo "$p"|grep -qiE 'Working \(|esc to interrupt' || idle=$((idle+1)); done
  if [ "$idle" -ge 3 ] && [ "$i" -gt 5 ]; then echo "R11 codex trio idle (a=$a b=$b c=$c)"; exit 0; fi
done
echo cap; exit 0
