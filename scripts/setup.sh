#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
docker run --rm --user "$(id -u):$(id -g)" \
  --volume "$repo_root:/workspace" --workdir /workspace \
  node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 \
  node implementation/deploy/init-env.mjs "$@"
