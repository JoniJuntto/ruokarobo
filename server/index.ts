// Ruokarobo's one server process: the leaderboard over HTTP (board.ts) and the online rooms on the WebSocket
// path /ws (rooms.ts). It listens on localhost only; Caddy in front of it terminates TLS and proxies /api/* and
// /ws here (see deploy.sh). Run it with `bun server/index.ts`, or `bun run server` to restart on edits.
import { boardHttp } from './board';
import { MSG_MAX, close, message, newSock, open, type Sock } from './rooms';

export const server = Bun.serve<Sock>({
  hostname: '127.0.0.1',
  port: process.env.PORT ?? 47500,
  maxRequestBodySize: 16 * 1024, // nothing this server reads is bigger than a posted score
  fetch(req, server) {
    // behind Caddy the socket's own address is always localhost: the first forwarded-for entry is the player
    const who = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || server.requestIP(req)?.address || '?';
    if (new URL(req.url).pathname === '/ws') {
      if (server.upgrade(req, { data: newSock(who) })) return;
      return new Response('This is a WebSocket endpoint.', { status: 426 });
    }
    return boardHttp(req, who); // any other path, as board.js did: the game asks for /api/scores
  },
  websocket: {
    maxPayloadLength: MSG_MAX,       // of the message once inflated, so a compressed bomb is refused too
    perMessageDeflate: true,         // rooms.ts compresses snapshots
    idleTimeout: 30,                 // seconds; Bun pings before it gives up, so only dead sockets go
    backpressureLimit: 1024 * 1024,  // a socket that cannot keep up with its snapshots...
    closeOnBackpressureLimit: true,  // ...is dropped rather than buffered for
    open, message, close,
  },
  error(e) { console.error('request failed', e); return new Response(null, { status: 500 }); },
});
console.log(`leaderboard and rooms on ${server.hostname}:${server.port}`);
