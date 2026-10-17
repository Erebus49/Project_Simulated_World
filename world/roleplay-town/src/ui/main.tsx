import { createRoot } from 'react-dom/client';
import Dashboard from './Dashboard.js';
import PixelRoleplay from './PixelRoleplay.js';
import InvestigationApp from './InvestigationApp.js';
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(params.has('debug') ? <Dashboard/> : params.has('town') ? <PixelRoleplay/> : <InvestigationApp/>);
