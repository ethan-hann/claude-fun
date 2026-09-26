#!/bin/bash
# usage: run_all.sh <outdir>  (runs every playthrough on the current dist build, checks each outcome)
cd "$(dirname "$0")/.."
OUT=$1; mkdir -p $OUT
declare -A WANT=(
  [island_a]='\[landing\].*"ok":true'
  [island_a2]='\[to_bloom\].*"ok":true'
  [island_b]='\[to_bloom\].*"ok":true'
  [island_c]='\[to_bloom\].*"ok":true'
  [island_d]='\[to_bloom\].*"ok":true'
  [island_e]='\[to_bloom\].*"ok":true'
  [island_f]='\[to_bloom\].*"ok":true'
  [island_g]='\[credits\].*"state":"credits"'
  [bridges]='\[arrive_5\].*"key":"g_heart"'
)
for t in island_a island_a2 island_b island_c island_d island_e island_f island_g bridges; do
  timeout 900 node tools/play.mjs tests/$t.mjs $OUT/$t "manual" 1280 720 > $OUT/$t.log 2>&1
  code=$?
  if grep -qE "${WANT[$t]}" $OUT/$t.log && ! grep -q "pageerror.*Error" $OUT/$t.log; then echo "PASS $t"; else echo "FAIL $t (exit $code)"; grep -E "pageerror|ERROR" $OUT/$t.log | head -3; fi
done
