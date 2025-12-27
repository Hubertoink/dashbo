require('dotenv').config();

const { createApp } = require('./app');
const { initDb } = require('./db');

const port = Number(process.env.PORT || 3000);

async function main() {
  await initDb();

  const app = createApp();
  app.listen(port, () => {
    console.log(`[dashbo-backend] listening on :${port}`);
  });
}

main().catch((err) => {
  console.error('[dashbo-backend] fatal', err);
  process.exit(1);
});
