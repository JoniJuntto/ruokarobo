#!/usr/bin/env bash
# Push the game, the leaderboard and the multiplayer signaling server to the box.
# Run from the repo root: server/deploy.sh
set -euo pipefail

HOST=${HOST:-root@94.237.112.119}
WWW=/var/www/ruokarobo          # Caddy serves this on ruokarobo.com (and robo.huikaton.online, :8099)
APP=/opt/ruokarobo-board        # the leaderboard service
PEER=/opt/ruokarobo-peer        # PeerJS signaling; `npm i peer@1.0.2` lives in node_modules there

scp -q index.html "$HOST:$WWW/index.html"
scp -q server/board.js "$HOST:$APP/board.js"
scp -q server/peer.js "$HOST:$PEER/peer.js"
scp -q server/ruokarobo-board.service server/ruokarobo-peer.service "$HOST:/etc/systemd/system/"

ssh "$HOST" "[ -d $PEER/node_modules/peer ] || (cd $PEER && npm i --omit=dev --no-audit --no-fund peer@1.0.2)
  systemctl daemon-reload && systemctl enable -q ruokarobo-peer &&
  systemctl restart ruokarobo-board ruokarobo-peer && sleep 1 && systemctl is-active ruokarobo-board ruokarobo-peer"

echo "https://ruokarobo.com/"
