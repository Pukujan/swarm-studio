#!/usr/bin/env bash
# The checks CI runs on every pull request, and you can run before pushing:
# every file parses, every engine module loads (so a wrong import fails here,
# not mid-build), the Python plugin compiles, and the server starts and answers.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "· no tracked symlinks"
# `hermes plugins install` copies the clone and refuses a symlink it cannot read,
# so a tracked symlink (like a local node_modules link) breaks every install.
links=$(git ls-files -s | awk '$1 == "120000" {print $4}')
if [ -n "$links" ]; then echo "tracked symlinks break the plugin install: $links"; exit 1; fi

echo "· syntax"
for f in $(git ls-files '*.mjs' '*.js' | grep -v '^dyad/\|^gameskills/'); do node --check "$f"; done

echo "· engine modules load"
for f in engine/*.mjs; do node --input-type=module -e "await import('./$f')"; done

echo "· engine tests"
node --test tests/*.test.mjs

echo "· python"
python3 -m py_compile $(git ls-files '*.py' | grep -v '^dyad/')
python3 -m unittest discover -s tests -q

echo "· server starts"
tmp=$(mktemp -d)
port=4391
SWARM_RUNS_DIR=$tmp/runs SWARM_DATA_DIR=$tmp/data SWARM_OUTPUT_DIR=$tmp/out SWARM_TOKEN=ci node server/server.mjs --port $port > $tmp/server.log 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true; rm -rf "$tmp"' EXIT
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:$port/ && break; sleep 0.5; done
# a reply is read in full before it is searched (grep -q stopping early would fail curl under pipefail)
get() { curl -sf -H 'x-swarm-token: ci' "http://127.0.0.1:$port$1" > "$tmp/reply" || { cat "$tmp/server.log"; echo "$1 did not answer"; exit 1; }; }
has() { grep -q "$1" "$tmp/reply" || { echo "unexpected reply: $(head -c 300 "$tmp/reply")"; exit 1; }; }
curl -sf http://127.0.0.1:$port/ > "$tmp/reply"; has '<title>Swarm Studio'
get /api/state; has '"working"'
get /api/runs
get /api/game; has '"questions"'
get /api/meshy; has '"ready"'; has '"credits":35'
get /api/intake; has '"showcases"'; has '"game"'; has '"plan"'
# plan before spend (spec 21): a plan is free; a lock at a stale price and a build before the lock are refused
curl -sf -H 'x-swarm-token: ci' -H 'content-type: application/json' -d '{"idea":"Check, a test game","answers":{"size":"2"}}' http://127.0.0.1:$port/api/plans > "$tmp/reply"; has '"credits"'
plan_id=$(sed -E 's/^\{"id":"(p-[a-z0-9]+)".*/\1/' "$tmp/reply")
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'x-swarm-token: ci' -d '{"credits":1}' http://127.0.0.1:$port/api/plans/$plan_id/lock)" = 402 ] || { echo 'a stale price locked the plan'; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'x-swarm-token: ci' -d '{}' http://127.0.0.1:$port/api/plans/$plan_id/build)" = 409 ] || { echo 'an unlocked plan started a build'; exit 1; }
curl -sf -H 'x-swarm-token: ci' http://127.0.0.1:$port/api/plans/$plan_id/brief > "$tmp/reply"; has 'Art at close-ups'
get /api/packs; has '"events"'
# the Setup sheet (spec 6): with no model key the test fails without a call, and the pictures pick is kept
get /api/setup; has '"seen":false'; has '"pictures"'
curl -sf -H 'x-swarm-token: ci' -d '{"seen":true,"pictures":"drawn"}' http://127.0.0.1:$port/api/setup > "$tmp/reply"; has '"seen":true'; has '"mode":"drawn"'
curl -sf -H 'x-swarm-token: ci' -d '{}' http://127.0.0.1:$port/api/setup/models > "$tmp/reply"; has '"ok":false'
get /api/library/packs; has '"packs"'
get '/api/library?q=boots'; has '"results"'
curl -sf http://127.0.0.1:$port/wall > "$tmp/reply"; has '<title>Swarm Wall'; grep -q '__SWARM_TOKEN__' "$tmp/reply" && { echo 'the wall has no token'; exit 1; }
get /api/auto; has '"state"'
# without the token the API refuses
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$port/api/runs)" != 200 ] || { echo 'the API answered without a token'; exit 1; }

echo "· hosted studio starts"
hport=4392
SWARM_DATA_DIR=$tmp/hosted PORT=$hport HOSTED_BASE=/studio/app node server/hosted.mjs > $tmp/hosted.log 2>&1 &
hpid=$!
trap 'kill $pid $hpid 2>/dev/null || true; rm -rf "$tmp"' EXIT
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:$hport/healthz && break; sleep 0.5; done
curl -sf http://127.0.0.1:$hport/healthz > "$tmp/reply" || { cat "$tmp/hosted.log"; echo 'hosted /healthz did not answer'; exit 1; }; has '"ok":true'
curl -sf http://127.0.0.1:$hport/ > "$tmp/reply"; has '<title>Swarm Studio'; has '"hosted"'
curl -sf http://127.0.0.1:$hport/studio/app/api/intake > "$tmp/reply"; has '"showcases"'
# a build needs a guest (and a model key): refused, never started
curl -s -X POST -H 'content-type: application/json' -d '{"brief":"a bakery site with an order form"}' http://127.0.0.1:$hport/api/run > "$tmp/reply"; has '"error"'
echo "all checks passed"
