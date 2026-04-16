import Fastify from 'fastify';

const PORT = 3000;
const HOST = '127.0.0.1';

const app = Fastify({ logger: true });

app.get('/api/weather', async () => {
  return {
    scaffold: true,
    message: 'Task 1 stub. Real data arrives in Task 5.',
  };
});

app.listen({ port: PORT, host: HOST })
  .then(() => app.log.info(`WxDeck backend listening on http://${HOST}:${PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
