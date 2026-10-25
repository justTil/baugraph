#!/usr/bin/env bash
#
# build_docker_image_self_hosted.sh — build & push the self-hosted image
# as a single multi-arch (amd64 + arm64) manifest to Docker Hub.
#
# A multi-arch manifest only exists in a registry, not the local docker
# daemon, so this always pushes. Run `docker login` first.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

VERSION=$(cat version.txt)
IMAGE="docker.io/justtil/baugraph"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg SELF_HOSTED=true \
  -t "$IMAGE:$VERSION" \
  -t "$IMAGE:latest" \
  --push \
  .
