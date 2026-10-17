import { resolve } from 'node:path';
import { createApp } from './app';
import { Store } from './store';

const port = Number(process.env.PORT || 8787);
const store = new Store(resolve(process.env.DATA_DIR || '.data', 'fogbound.sqlite'));
const server = createApp(store).listen(port, '127.0.0.1', () => console.log(`雾港纪事 API · http://localhost:${port} · 本地存档已就绪`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
