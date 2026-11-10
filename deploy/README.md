# Deploying the hosted studio

The plugin itself runs on each person's computer inside Hermes. This folder is only for the **hosted studio**
(`server/hosted.mjs`, [spec 13](../docs/specs/13-hosted-studio.md)): a small guest version at
https://swarm.design-bakery.com/studio/app/.

- Komodo `[[repo]]` `swarm-studio` keeps a clone of `main` in `~/apps/swarm-studio` on the VPS, and the action
  `swarm-studio-deploy-on-push` pulls it every 3 minutes and deploys the `swarm-studio` stack when the running image
  isn't that commit (pukujan-lab-2/server-management `komodo/resources/swarm-studio.toml`).
- The stack's pre-deploy, [`vps/autodeploy.sh`](vps/autodeploy.sh), builds `swarm-studio:<sha12>` from
  [`Dockerfile.hosted`](../Dockerfile.hosted), swaps `swarm-studio-web` to it, waits for `/healthz` and rolls back if
  it fails.
- [`vps/docker-compose.vps.yml`](vps/docker-compose.vps.yml): container `swarm-studio-web`, port 8080 inside, host
  `127.0.0.1:18096`, on `study-os_edge`. There is no DNS or tunnel route of its own: `swarm-feed-web` forwards
  `/studio/app/**` to `swarm-studio-web:8080` (swarm-feed `server/utils/studio-proxy.ts`). Runs and the day's
  spend live in the volume `swarm-studio-data`.

To deploy, merge to `main`. Never copy code to the VPS by hand.

## Environment

Keys are in `/home/ubuntu/apps/swarm-studio.env` on the VPS, never in the repo or the image. Names only:

- `SWARM_API_KEY` (required): the model key (InferHub). Without it the studio stays closed.
- `SWARM_BASE_URL` (default `https://api.inferhub.dev/v1`), `SWARM_PLANNER_MODEL`, `SWARM_WORKER_MODEL`
  (default `cb/deepseek-v4.1-flash`).
- Limits, all optional: `HOSTED_GUEST_BUILDS`, `HOSTED_IP_BUILDS`, `HOSTED_CONCURRENT`, `HOSTED_AGENTS`,
  `HOSTED_PAGES`, `HOSTED_SECTIONS`, `HOSTED_PROMPT_CHARS`, `HOSTED_RPM`, `HOSTED_GUEST_POSTS`, `HOSTED_DAILY_USD`
  (defaults in spec 13).
- Set by the compose file: `HOSTED_BASE`, `HOSTED_PUBLIC_URL`, `SWARM_FEED_INTERNAL_URL`, `SWARM_DATA_DIR`.

## Check an image locally

```bash
docker build -f Dockerfile.hosted -t swarm-studio:local .
docker run --rm -p 18096:8080 -e HOSTED_BASE= -e HOSTED_PUBLIC_URL=http://127.0.0.1:18096 swarm-studio:local
```
