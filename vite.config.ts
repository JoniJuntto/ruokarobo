import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  build: {
    target: 'es2022', chunkSizeWarningLimit: 1200,
    // two pages, one engine: each page's scripts pick its map (src/client/page.ts). The engine and three.js land in
    // chunks both pages share; a map's data and scenery only in its own page's
    rollupOptions: { input: { main: resolve(root, 'index.html'), helsinki: resolve(root, 'helsinki.html') } },
  },
  // other sessions keep whole checkouts under .claude/worktrees: their edits are not this server's business
  // bun run server (server/index.ts) listens on 47500: leaderboard under /api, rooms on /ws
  server: { proxy: { '/api': 'http://127.0.0.1:47500', '/ws': { target: 'ws://127.0.0.1:47500', ws: true } }, watch: { ignored: ['**/.claude/**', '**/brag-output/**', '**/dist/**'] } },
});
