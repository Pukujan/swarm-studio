#!/usr/bin/env bash
# Deploy the checkout's commit to the VPS. Komodo's swarm-studio stack runs this as its pre-deploy
# (pukujan-lab-2/server-management komodo/resources/swarm-studio.toml), after its [[repo]] has pulled main
# into ~/apps/swarm-studio (the repo is private, so the host itself has no GitHub access).
#
# Builds the commit as swarm-studio:<12-char sha>, swaps swarm-studio-web to it, waits for its health check and puts
# the previous image back if that fails. Exits early when the running image is already that commit. Either way it
# writes deploy/vps/.env, which compose reads by itself, so Komodo's `compose up` afterwards resolves the same image
# and changes nothing.
# A commit that failed is remembered in .deploy-failed and not retried every 3 minutes; delete that file to retry it.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$DEPLOY_DIR/../.." && pwd)"
COMPOSE=(docker compose -f "$DEPLOY_DIR/docker-compose.vps.yml")

write_image() { printf 'SWARM_STUDIO_IMAGE=%s\n' "$1" > "$DEPLOY_DIR/.env"; }

# The clone is root's (Komodo's agent runs git as root), so safe.directory lets any user read it
SHA="$(git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" rev-parse HEAD)"
TAG="swarm-studio:${SHA:0:12}"
RUNNING="$(docker inspect swarm-studio-web --format '{{.Config.Image}}' 2>/dev/null || true)"

if [ "$RUNNING" = "$TAG" ]; then
  echo "swarm-studio-web already runs $TAG"
  write_image "$TAG"
  exit 0
fi

if [ "$(cat "$DEPLOY_DIR/.deploy-failed" 2>/dev/null)" = "$SHA" ]; then
  echo "${SHA:0:12} failed to deploy before; keeping ${RUNNING:-nothing} (delete deploy/vps/.deploy-failed to retry)"
  write_image "${RUNNING:-$TAG}"
  exit 0
fi

echo "main is ${SHA:0:12}, running ${RUNNING:-nothing}: deploying"
SWARM_STUDIO_IMAGE="$TAG" "${COMPOSE[@]}" build web
# A failed up falls through to the health check and the rollback, so it never leaves the site down
SWARM_STUDIO_IMAGE="$TAG" "${COMPOSE[@]}" up -d web || echo "starting swarm-studio-web on $TAG failed" >&2

for _ in $(seq 1 30); do
  STATUS="$(docker inspect swarm-studio-web --format '{{.State.Health.Status}}' 2>/dev/null || true)"
  if [ "$STATUS" = "healthy" ]; then
    write_image "$TAG"
    rm -f "$DEPLOY_DIR/.deploy-failed"
    echo "deployed $TAG"
    exit 0
  fi
  sleep 5
done

echo "$SHA" > "$DEPLOY_DIR/.deploy-failed"
echo "swarm-studio-web did not become healthy on $TAG (last status: ${STATUS:-none})" >&2
if [ -n "$RUNNING" ]; then
  echo "rolling back to $RUNNING" >&2
  SWARM_STUDIO_IMAGE="$RUNNING" "${COMPOSE[@]}" up -d web || echo "rollback of swarm-studio-web failed" >&2
  write_image "$RUNNING"
fi
exit 1
