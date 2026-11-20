#!/usr/bin/env bash
# Build the game and its server and push both to the box.
# Run from the repo root: server/deploy.sh
#
# What Caddy on the box must do for api.ruokarobo.com (this script does not touch Caddy):
#   - /api/*  -> 127.0.0.1:47500   the leaderboard, as today
#   - /ws     -> 127.0.0.1:47500   the online rooms, a WebSocket. reverse_proxy passes the upgrade through by
#                                  itself and sets X-Forwarded-For, which the server's per-address limits read
#   - the old /peerjs route (PeerJS signaling on its own port) can go
#   e.g.  api.ruokarobo.com {
#           reverse_proxy /api/* 127.0.0.1:47500
#           reverse_proxy /ws    127.0.0.1:47500
#         }
#   The box serves many other sites: `caddy validate` before `systemctl reload caddy`.
#
# Restarting the service ends every online game in flight (rooms live in memory). Scores are on disk and stay.
set -euo pipefail

HOST=${HOST:-root@94.237.112.119}
WWW=/var/www/ruokarobo          # Caddy serves this on ruokarobo.com (and robo.huikaton.online, :8099)
APP=/opt/ruokarobo-board        # the server: leaderboard + online rooms, one bundled file
BUN=/usr/local/bin/bun          # where ruokarobo-board.service expects bun

# The server runs on Bun. Installing a runtime on a shared box is a decision, not a deploy step: stop and say so.
ssh "$HOST" "[ -x $BUN ]" || {
  echo "deploy: no bun at $BUN on $HOST." >&2
  echo "Install it there by hand first (a release binary from https://github.com/oven-sh/bun/releases, copied to $BUN)," >&2
  echo "then run this again. Nothing was changed on the box." >&2
  exit 1
}

bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build          # dist/: the game
bun run build:server   # server/build/server.js

# ponytail: copies over what is there, so old hashed files pile up in $WWW/assets. Clear them by hand once in a while.
scp -qr dist/. "$HOST:$WWW/"
ssh "$HOST" "mkdir -p $APP"
scp -q server/build/server.js "$HOST:$APP/server.js"
scp -q server/ruokarobo-board.service "$HOST:/etc/systemd/system/"

# PeerJS signaling is gone: games run on the server now
ssh "$HOST" "systemctl disable -q --now ruokarobo-peer 2>/dev/null || true
  systemctl daemon-reload && systemctl enable -q ruokarobo-board && systemctl restart ruokarobo-board && sleep 1 &&
  systemctl is-active ruokarobo-board && curl -fsS -o /dev/null http://127.0.0.1:47500/api/scores && echo 'server answers'"

# Left over from the PeerJS days, harmless, and not this script's to remove. By hand, when convenient:
#   rm /etc/systemd/system/ruokarobo-peer.service && systemctl daemon-reload && rm -r /opt/ruokarobo-peer $APP/board.js
#   systemctl disable --now coturn && apt-get remove coturn      # the TURN relay; /etc/turnserver.conf goes with it
#   ufw delete allow 3478 && ufw delete allow 49160:49260/udp    # and the same ports in any cloud firewall
#   the /peerjs route in the Caddyfile

echo "https://ruokarobo.com/"
