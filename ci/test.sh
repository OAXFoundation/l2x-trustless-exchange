#!/usr/bin/env nix-shell
#! nix-shell -i bash --pure --keep NPM_STORE_PREFIX ../shell.nix

# trap ERR: https://stackoverflow.com/a/35800451
set -eExo pipefail

trap 'kill $(jobs -p)' EXIT

install-deps

pnpm run check-format

# This is a clean copy on the CI but we need a .env file to run.
cp .env.example .env

runGethPrivate.sh &

# Crazy bash feature.
while ! timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/8545"; do
  echo "Waiting for geth..."
  sleep 1
done

pnpm test
