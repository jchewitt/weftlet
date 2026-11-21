#!/usr/bin/env bash
set -eu
# The filesystem cap applies only to this disposable mount. The study tree is read-only.
image='gradle:8.10.2-jdk21@sha256:963d59f7f22767da4efbcf46b661361b61af5fb88b0309da1071c4234c647eba'
docker run --rm --network none --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$PWD,dst=/study,readonly" \
  --mount "type=bind,src=$(command -v node),dst=/usr/local/bin/node,readonly" \
  --tmpfs /weftlet-capacity-fixture:rw,nosuid,nodev,noexec,size=16m,mode=1777 \
  --workdir /study -e WEFTLET_SNAPSHOT_FORMAT=brotli-v1 --entrypoint node \
  "$image" --import tsx scripts/storage-study/full-volume.ts
