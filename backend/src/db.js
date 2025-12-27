const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

let pool;

function buildDatabaseUrlFromParts() {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT;
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!host || !name || !user) return null;

  const safeUser = encodeURIComponent(String(user));
  const safePass = password != null ? encodeURIComponent(String(password)) : '';
  const auth = safePass ? `${safeUser}:${safePass}` : safeUser;
  const p = port ? String(port) : '5432';
  return `postgres://${auth}@${host}:${p}/${name}`;
}

function getPool() {
  if (!pool) {
    // Prefer DB_* parts when present. Hosting UIs often generate a DATABASE_URL
    // that is not properly URL-encoded (e.g. passwords containing '@').
    const fromParts = buildDatabaseUrlFromParts();
    const connectionString = fromParts || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required (or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD)');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

async function initDb() {
  const p = getPool();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const maxAttempts = 15;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await p.query('SELECT 1;');
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      const delay = Math.min(1000 * attempt, 5000);
      console.warn(`[dashbo-backend] DB not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  if (lastErr) throw lastErr;

  await p.query(`
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ,
      all_day BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Optional tag on events (idempotent migration)
  await p.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS tag_id BIGINT;
  `);

  // Recurrence support (idempotent migrations)
  await p.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS recurrence_freq TEXT;
  `);

  await p.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS recurrence_interval INT NOT NULL DEFAULT 1;
  `);

  await p.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS recurrence_until TIMESTAMPTZ;
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_tag_id_fkey'
      ) THEN
        ALTER TABLE events
        ADD CONSTRAINT events_tag_id_fkey
        FOREIGN KEY (tag_id)
        REFERENCES tags(id)
        ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS events_start_at_idx ON events (start_at);
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS events_tag_id_idx ON events (tag_id);
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS persons (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, name)
    );
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'persons_user_id_fkey'
      ) THEN
        ALTER TABLE persons
        ADD CONSTRAINT persons_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Outlook (Microsoft Graph) per-user OAuth tokens (read-only)
  await p.query(`
    CREATE TABLE IF NOT EXISTS outlook_tokens (
      user_id BIGINT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      scope TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'outlook_tokens_user_id_fkey'
      ) THEN
        ALTER TABLE outlook_tokens
        ADD CONSTRAINT outlook_tokens_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS outlook_oauth_states (
      state TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'outlook_oauth_states_user_id_fkey'
      ) THEN
        ALTER TABLE outlook_oauth_states
        ADD CONSTRAINT outlook_oauth_states_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS outlook_oauth_states_user_id_idx ON outlook_oauth_states (user_id);
  `);

  // Bind events to user (family) and optionally to a person
  await p.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS user_id BIGINT;
  `);

  await p.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS person_id BIGINT;
  `);

  // Backfill existing events to first user (idempotent)
  await p.query(`
    UPDATE events
    SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
    WHERE user_id IS NULL;
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_user_id_fkey'
      ) THEN
        ALTER TABLE events
        ADD CONSTRAINT events_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_person_id_fkey'
      ) THEN
        ALTER TABLE events
        ADD CONSTRAINT events_person_id_fkey
        FOREIGN KEY (person_id)
        REFERENCES persons(id)
        ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS events_user_id_idx ON events (user_id);
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS persons_user_id_idx ON persons (user_id);
  `);

  // Optional bootstrap admin
  const bootstrapUser = process.env.ADMIN_USERNAME || process.env.BOOTSTRAP_ADMIN_USERNAME || process.env.BOOTSTRAP_USERNAME;
  const bootstrapName = process.env.BOOTSTRAP_ADMIN_NAME || bootstrapUser || 'Admin';
  const bootstrapEmail =
    process.env.BOOTSTRAP_ADMIN_EMAIL ||
    process.env.ADMIN_EMAIL ||
    (bootstrapUser ? `${bootstrapUser}@dashbo.local` : bootstrapName ? `${bootstrapName}@dashbo.local` : undefined);
  const bootstrapPassword =
    process.env.BOOTSTRAP_ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    process.env.BOOTSTRAP_PASSWORD;

  if (bootstrapEmail && bootstrapPassword) {
    const existing = await p.query('SELECT COUNT(*)::int AS c FROM users;');
    const count = existing.rows?.[0]?.c ?? 0;

    if (count === 0) {
      const passwordHash = await bcrypt.hash(bootstrapPassword, 10);
      await p.query(
        `
        INSERT INTO users (email, name, password_hash, is_admin)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (email) DO NOTHING;
        `,
        [bootstrapEmail.toLowerCase(), bootstrapName, passwordHash]
      );

      console.log('[dashbo-backend] bootstrapped admin user');
    }
  }
}

module.exports = { getPool, initDb };
