#!/usr/bin/env bash
set -euxo pipefail

# Check if docker is installed
if ! [ -x "$(command -v docker)" ]; then
  echo 'Error: docker command not found. Please install docker v18 or later.' >&2
  exit 1
fi

# Cleanup previous
docker tag oax/server old 2> /dev/null || true
docker rmi oax/server:latest 2> /dev/null || true # keeps the image because of the second tag
rm -r build/docker/ 2> /dev/null || true

# Create version
mkdir -p build/docker/public
git describe --match=NeVeRmAtCh --always --abbrev=40 --dirty > build/docker/public/HEAD

# Copy files
rsync -av Dockerfile build/docker/
rsync -av package.json build/docker/
rsync -av nixpkgs.json build/docker/
rsync -av shell.nix build/docker/
rsync -av build/contracts/IERC20.abi build/docker/contracts/
rsync -av build/contracts/ERC20.abi build/docker/contracts/
rsync -av build/contracts/Mediator.abi build/docker/contracts/
rsync -av --include "*/" --include "*.js" --exclude "*" "build/dist/config/" "build/docker/config/"
rsync -av --include "*/" --include "*.js" --exclude "*" "build/dist/src/" "build/docker/src/"
touch -a build/docker/.env
touch -a build/docker/.contract_build_root

docker build -t oax/server build/docker/
