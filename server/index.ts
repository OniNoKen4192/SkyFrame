import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { CONFIG } from './config';
import { registerRoutes } from './routes';
import { startUpdateScheduler } from './updates/update-check';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = resolve(__dirname, '../dist/client');

async function main() {
  const app = Fastify({ logger: { level: 'info' } });

  if (CONFIG.debug.injectTiers.length > 0) {
    console.log(
      `[debug] SKYFRAME_DEBUG_TIERS active: ${CONFIG.debug.injectTiers.join(',')}` +
      ` — synthetic alerts will replace NWS fetch`,
    );
  }

  if (CONFIG.updateCheckEnabled) {
    startUpdateScheduler();
    app.log.info('Update check enabled — will query GitHub at startup and local midnight');
  }

  await registerRoutes(app);

  // Serve built client assets in production. In dev, Vite serves them on 5173
  // and proxies /api to this server, so this path doesn't get hit.
  if (existsSync(CLIENT_DIST)) {
    await app.register(fastifyStatic, {
      root: CLIENT_DIST,
      prefix: '/',
    });
  } else {
    app.log.warn('dist/client not built yet. Run `npm run build` for production serving.');
  }

  await app.listen({ port: CONFIG.server.port, host: CONFIG.server.host });
  app.log.info(`SkyFrame listening on http://${CONFIG.server.host}:${CONFIG.server.port}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
