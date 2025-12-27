require('dotenv').config();

const { createApp } = require('./app');
const { initDb } = require('./db');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

async function main() {
  await initDb();

  const app = createApp();
  app.listen(port, host, () => {
    console.log(`[dashbo-backend] listening on ${host}:${port}`);
  });
}

main().catch((err) => {
  console.error('[dashbo-backend] fatal', err);
  process.exit(1);
});
