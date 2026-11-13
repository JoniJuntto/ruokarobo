// Ruokarobo multiplayer signaling. Browsers only use this to find each other; the game itself
// then runs peer-to-peer over WebRTC. Caddy proxies /peerjs here, websockets included.
'use strict';
const { PeerServer } = require('peer');
PeerServer({ host: '127.0.0.1', port: Number(process.env.PORT) || 47501, path: '/peerjs', proxied: true });
