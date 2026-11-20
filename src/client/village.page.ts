// index.html's script: this page plays the village. See page.ts for how the engine picks this up.
import './style.css'; // here, not only in main.ts: a stylesheet the page's own script imports is linked from the HTML, so the title screen never shows unstyled
import { openPage } from './page';

openPage({ map: import('../sim/map/village').then(m => m.village), scenery: import('./village'),
           other: 'helsinki.html', best: 'ruokarobo-best', board: 'ruokarobo-board', worldwide: true,
           santa: 'Santa is bowling down the road. Stay off it!' });
void import('./main');
