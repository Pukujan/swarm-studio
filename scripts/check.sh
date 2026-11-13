#!/usr/bin/env bash
# The checks CI runs on every pull request, and you can run before pushing:
# every file parses, every engine module loads (so a wrong import fails here,
# not mid-build), the Python plugin compiles, and the server starts and answers.
set -euo pipefail
cd "$(dirname "$0")/.."
# Git Bash on Windows rewrites env values that look like Unix paths (HOSTED_BASE=/studio/app became
# C:/Program Files/Git/studio/app): leave this one as written
export MSYS2_ENV_CONV_EXCL=HOSTED_BASE

echo "· no tracked symlinks"
# `hermes plugins install` copies the clone and refuses a symlink it cannot read,
# so a tracked symlink (like a local node_modules link) breaks every install.
links=$(git ls-files -s | awk '$1 == "120000" {print $4}')
if [ -n "$links" ]; then echo "tracked symlinks break the plugin install: $links"; exit 1; fi

echo "· syntax"
for f in $(git ls-files '*.mjs' '*.js' | grep -v '^dyad/\|^gameskills/'); do node --check "$f"; done

echo "· type-check ratchet"
# lines of code (not blank, comment or import lines) in web files without // @ts-check on their first line
# (tsconfig.json; CI runs the type check itself with tools/dev). Counted in lines, not files, so splitting a
# file (web/canvas/) neither helps nor hurts. The cap only goes down: type a file, then lower it.
cap=4861
untyped=$(for f in $(git ls-files 'web/*.js' | grep -v '^web/vendor/'); do head -1 "$f" | grep -q '^// @ts-check' || echo "$f"; done)
n=$(for f in $untyped; do cat "$f"; done | grep -cvE '^[[:space:]]*(//|$|import )' || true)
if [ "$n" -gt "$cap" ]; then echo "$n untyped lines of web code, over the cap of $cap; start new files with // @ts-check. Untyped files:"; echo "$untyped"; exit 1; fi
if [ "$n" -lt "$cap" ]; then echo "  $n untyped lines, under the cap of $cap: lower cap= in scripts/check.sh to $n"; fi

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
# the next UI (docs/decisions/0013-react-ui-coexists.md): one document from the committed ui/dist/, the token put in now
curl -sf http://127.0.0.1:$port/next/ > "$tmp/reply"; has '<title>Swarm Studio'; has '<div id="root">'; has 'window.SWARM = {"token":"ci"'
grep -q '="/next/assets/' "$tmp/reply" && { echo '/next/ loads a file instead of carrying it'; exit 1; }
get /api/state; has '"working"'
get /api/runs
get /api/game; has '"questions"'
get /api/meshy; has '"ready"'; has '"credits":35'
get /api/intake; has '"showcases"'; has '"game"'; has '"plan"'; has '"guides"'; has '"starters"'
# plan before spend (spec 21): a plan is free; a lock at a stale price and a build before the lock are refused
curl -sf -H 'x-swarm-token: ci' -H 'content-type: application/json' -d '{"idea":"Check, a 3D test game","answers":{"size":"2"}}' http://127.0.0.1:$port/api/plans > "$tmp/reply"; has '"credits"'
plan_id=$(sed -E 's/^\{"id":"(p-[a-z0-9]+)".*/\1/' "$tmp/reply")
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'x-swarm-token: ci' -d '{"credits":1}' http://127.0.0.1:$port/api/plans/$plan_id/lock)" = 402 ] || { echo 'a stale price locked the plan'; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'x-swarm-token: ci' -d '{}' http://127.0.0.1:$port/api/plans/$plan_id/build)" = 409 ] || { echo 'an unlocked plan started a build'; exit 1; }
curl -sf -H 'x-swarm-token: ci' http://127.0.0.1:$port/api/plans/$plan_id/brief > "$tmp/reply"; has 'Art at close-ups'
# Stop with nothing running answers what it stopped: nothing
curl -sf -H 'x-swarm-token: ci' -H 'content-type: application/json' -d '{}' http://127.0.0.1:$port/api/stop > "$tmp/reply"; has '"stopped":\[\]'
get /api/packs; has '"events"'
# talk first (engine/talkplan.mjs): the owner's "don't build yet" brief is a talk, never a build
curl -sf -H 'x-swarm-token: ci' -d '{"kind":"app","text":"full stack saas app for ticket booking, do u wanna grill me first? Accounts: Email sign-in. dont build yet lets talk about specifications, i need an air booking api or something?"}' http://127.0.0.1:$port/api/discuss/read > "$tmp/reply"; has '"intent":"talk"'
# the plan is a conversation (spec 27): the ants idea asks about Godot first and cannot lock yet
curl -sf -H 'x-swarm-token: ci' -d '{"kind":"game","said":"a tiny game called army of ants , rts game in godots"}' http://127.0.0.1:$port/api/talk > "$tmp/reply"; has '"id":"c-'; has 'Army of Ants: a tiny real-time strategy'
chat_id=$(grep -oE '"id":"c-[0-9a-f]{10}"' "$tmp/reply" | head -1 | cut -d'"' -f4)
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'x-swarm-token: ci' -d '{}' http://127.0.0.1:$port/api/talk/$chat_id/lock)" = 409 ] || { echo 'an open spec locked'; exit 1; }
# the Setup sheet (spec 6): with no model key the test fails without a call, and the pictures pick is kept
get /api/setup; has '"seen":false'; has '"pictures"'; has '"account":{"connected":false'
curl -sf -H 'x-swarm-token: ci' -d '{"seen":true,"pictures":"drawn"}' http://127.0.0.1:$port/api/setup > "$tmp/reply"; has '"seen":true'; has '"mode":"drawn"'
curl -sf -H 'x-swarm-token: ci' -d '{}' http://127.0.0.1:$port/api/setup/models > "$tmp/reply"; has '"ok":false'
# Setup › Parts: whether each key is set (never its value) and which local programs are found
get /api/setup/parts; has '"keys":{"SWARM_STUDIO_API_KEY":'; has '"renderer":'
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
