#!/usr/bin/env bash
# run each atom's ORCA job in its folder, then export its orbitals to JSON
one() {
  el=$1
  cd "$el" || return
  if ! grep -q "ORCA TERMINATED NORMALLY" "$el.out" 2>/dev/null; then
    /c/ORCA_6.1.1/orca "$el.inp" > "$el.out" 2>&1
  fi
  /c/ORCA_6.1.1/orca_2json "$el.gbw" > /dev/null 2>&1
  echo "$el $(grep -c 'ORCA TERMINATED NORMALLY' $el.out) $(grep 'FINAL SINGLE POINT' $el.out | tail -1 | awk '{print $5}')"
}
export -f one
ls -d */ | tr -d / | xargs -P 4 -I{} bash -c 'one {}'
