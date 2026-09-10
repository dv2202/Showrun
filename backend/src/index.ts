import { buildApp } from './api/app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp({ config });

const close = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);

await app.listen({ host: config.HOST, port: config.PORT });
