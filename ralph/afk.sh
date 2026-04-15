#!/bin/bash
set -eo pipefail

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <plan-and-prd> <iterations>"
  exit 1
fi

npx tsx ./.sandcastle/main.ts "$1" "$2"