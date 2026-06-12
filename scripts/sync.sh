#!/bin/bash
# REI-App-Data auto-sync — runs daily, re-scrapes, pushes any changes. Safe: keeps good data on parse failure.
cd "$HOME/REI-App-Data" || exit 1
export PATH=/usr/local/bin:/usr/bin:/bin
LOG="$HOME/REI-App-Data/sync.log"
echo "=== $(date) sync start ===" >> "$LOG"
git pull --quiet origin main >> "$LOG" 2>&1
node scripts/normalize.mjs >> "$LOG" 2>&1
if ! git diff --quiet; then
  git add -A
  git commit -q -m "auto-sync: refresh REI data $(date +%Y-%m-%d)" >> "$LOG" 2>&1
  git push --quiet origin main >> "$LOG" 2>&1
  echo "pushed changes" >> "$LOG"
else
  echo "no changes" >> "$LOG"
fi
