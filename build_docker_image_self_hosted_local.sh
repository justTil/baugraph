#!/usr/bin/env bash
#
# build_docker_image_self_hosted_local.sh — build the self-hosted image for
# your local machine's architecture only, loaded into the local docker
# daemon so you can run/test it before doing a full multi-arch build+push
# with build_docker_image_self_hosted.sh.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

VERSION=$(cat version.txt)
IMAGE="baugraph"

docker buildx build \
  --build-arg SELF_HOSTED=true \
  -t "$IMAGE:$VERSION" \
  --load \
  .
