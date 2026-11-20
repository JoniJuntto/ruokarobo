// Where the server (server/index.ts) is: the leaderboard over HTTP and the online rooms on a WebSocket.
// Production: every copy of the game (ruokarobo.com, the old huikaton host) shares the one server, so the URLs
// are absolute. Dev (`bun run dev`): same-origin paths that vite.config.ts proxies to `bun run server` on this
// machine, so a dev run never posts to the real leaderboard or opens rooms on the real server.
// ponytail: `vite preview` serves the production build, so it talks to production too.
const DEV = import.meta.env.DEV, HOST = 'api.ruokarobo.com';
export const SCORES_URL = DEV ? '/api/scores' : `https://${HOST}/api/scores`;
export const TIMES_URL = DEV ? '/api/times' : `https://${HOST}/api/times`;
export const WS_URL = DEV ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws` : `wss://${HOST}/ws`;
