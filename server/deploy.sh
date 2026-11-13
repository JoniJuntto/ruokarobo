#!/usr/bin/env bash
# Push the game and the leaderboard to the box. Run from the repo root: server/deploy.sh
set -euo pipefail

HOST=${HOST:-root@94.237.112.119}
WWW=/var/www/ruokarobo          # Caddy serves this on :8099
APP=/opt/ruokarobo-board        # the leaderboard service

scp -q index.html "$HOST:$WWW/index.html"
scp -q server/board.js "$HOST:$APP/board.js"
scp -q server/ruokarobo-board.service "$HOST:/etc/systemd/system/ruokarobo-board.service"

ssh "$HOST" 'systemctl daemon-reload && systemctl restart ruokarobo-board && sleep 1 && systemctl is-active ruokarobo-board'

echo "http://${HOST#*@}:8099/"
