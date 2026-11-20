// helsinki.html's script: this page plays central Helsinki. See page.ts for how the engine picks this up.
// Its best run and leaderboard are kept apart from the village's, and stay on this device: the worldwide board is the village's.
import './style.css'; // here, not only in main.ts: a stylesheet the page's own script imports is linked from the HTML, so the title screen never shows unstyled
import { openPage } from './page';

openPage({ map: import('../sim/map/helsinki').then(m => m.helsinki), scenery: import('./helsinki'),
           other: './', best: 'ruokarobo-hki-best', board: 'ruokarobo-hki-board', worldwide: false,
           santa: 'Santa is bowling down the streets. Stay off them!' });
void import('./main');
