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
      password_hash TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      email_verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Invitation flow: allow users without a password_hash until they accept the invite.
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'password_hash'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
      END IF;
    END $$;
  `);

  // Older installations: add email_verified_at if missing
  await p.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
  `);

  // Calendars (aka families / tenants)
  await p.query(`
    CREATE TABLE IF NOT EXISTS calendars (
      id BIGSERIAL PRIMARY KEY,
      name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Bind users to a calendar (idempotent migrations)
  await p.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;
  `);

  await p.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT;
  `);

  // Backfill missing calendars for existing users (idempotent)
  // Each existing user gets their own calendar to preserve today's behavior.
  await p.query('BEGIN;');
  try {
    const missing = await p.query('SELECT id, name, is_admin FROM users WHERE calendar_id IS NULL ORDER BY id ASC;');
    for (const row of missing.rows) {
      const userId = Number(row.id);
      const name = row.name ? String(row.name) : null;
      const isAdmin = Boolean(row.is_admin);
      const cal = await p.query('INSERT INTO calendars (name) VALUES ($1) RETURNING id;', [name]);
      const calendarId = Number(cal.rows[0].id);
      const role = isAdmin ? 'admin' : 'member';
      await p.query('UPDATE users SET calendar_id = $2, role = COALESCE(role, $3) WHERE id = $1;', [userId, calendarId, role]);
    }

    // Ensure role is present for existing users
    await p.query(
      `
      UPDATE users
      SET role = CASE WHEN is_admin THEN 'admin' ELSE 'member' END
      WHERE role IS NULL;
      `
    );

    await p.query('COMMIT;');
  } catch (e) {
    await p.query('ROLLBACK;');
    throw e;
  }

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_calendar_id_fkey'
      ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_calendar_id_fkey
        FOREIGN KEY (calendar_id)
        REFERENCES calendars(id)
        ON DELETE RESTRICT;
      END IF;
    END $$;
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS users_calendar_id_idx ON users (calendar_id);
  `);

  // Tags: bind to user (idempotent migrations) - users table must exist first
  await p.query(`
    ALTER TABLE tags
    ADD COLUMN IF NOT EXISTS user_id BIGINT;
  `);

  // Tags: bind to calendar (families)
  await p.query(`
    ALTER TABLE tags
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;
  `);

  // Backfill existing tags to first user (idempotent)
  await p.query(`
    UPDATE tags
    SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
    WHERE user_id IS NULL;
  `);

  // Backfill calendar_id from user_id (idempotent)
  await p.query(`
    UPDATE tags t
    SET calendar_id = u.calendar_id
    FROM users u
    WHERE t.calendar_id IS NULL AND t.user_id = u.id;
  `);

  // Replace old unique(name) with unique(user_id, name)
  await p.query(`
    ALTER TABLE tags
    DROP CONSTRAINT IF EXISTS tags_name_key;
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tags_user_id_name_key'
      ) THEN
        ALTER TABLE tags
        ADD CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name);
      END IF;
    END $$;
  `);

  // Transition uniqueness to calendar scope (safe because each user currently has their own calendar)
  await p.query('ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_user_id_name_key;');

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tags_calendar_id_name_key'
      ) THEN
        ALTER TABLE tags
        ADD CONSTRAINT tags_calendar_id_name_key UNIQUE (calendar_id, name);
      END IF;
    END $$;
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tags_user_id_fkey'
      ) THEN
        ALTER TABLE tags
        ADD CONSTRAINT tags_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  // Calendar data must not be deleted when a user is deleted; drop the user FK if present.
  await p.query('ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_user_id_fkey;');

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tags_calendar_id_fkey'
      ) THEN
        ALTER TABLE tags
        ADD CONSTRAINT tags_calendar_id_fkey
        FOREIGN KEY (calendar_id)
        REFERENCES calendars(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query('CREATE INDEX IF NOT EXISTS tags_calendar_id_idx ON tags (calendar_id);');

  await p.query(`
    CREATE INDEX IF NOT EXISTS tags_user_id_idx ON tags (user_id);
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

  // Persons: bind to calendar (families)
  await p.query(`
    ALTER TABLE persons
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;
  `);

  // Backfill calendar_id from user_id (idempotent)
  await p.query(`
    UPDATE persons p
    SET calendar_id = u.calendar_id
    FROM users u
    WHERE p.calendar_id IS NULL AND p.user_id = u.id;
  `);

  // Transition uniqueness to calendar scope
  await p.query('ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_user_id_name_key;');
  await p.query('ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_user_id_fkey;');
  await p.query('ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_user_id_name_key;');

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'persons_calendar_id_name_key'
      ) THEN
        ALTER TABLE persons
        ADD CONSTRAINT persons_calendar_id_name_key UNIQUE (calendar_id, name);
      END IF;
    END $$;
  `);

  // Drop the user FK if present (avoid cascading calendar data on user deletion)
  await p.query('ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_user_id_fkey;');

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'persons_calendar_id_fkey'
      ) THEN
        ALTER TABLE persons
        ADD CONSTRAINT persons_calendar_id_fkey
        FOREIGN KEY (calendar_id)
        REFERENCES calendars(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query('CREATE INDEX IF NOT EXISTS persons_calendar_id_idx ON persons (calendar_id);');

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

  // Ensure the old constraint is removed (calendar-scoped)
  await p.query('ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_user_id_fkey;');

  await p.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Per-user settings (background/weather/toggles, etc.)
  await p.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id BIGINT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, key)
    );
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_user_id_fkey'
      ) THEN
        ALTER TABLE user_settings
        ADD CONSTRAINT user_settings_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS user_settings_user_id_idx ON user_settings (user_id);
  `);

  // Auth tokens (email verification, password reset)
  await p.query(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      kind TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      meta JSONB
    );
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'auth_tokens_user_id_fkey'
      ) THEN
        ALTER TABLE auth_tokens
        ADD CONSTRAINT auth_tokens_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query('CREATE UNIQUE INDEX IF NOT EXISTS auth_tokens_token_hash_uq ON auth_tokens (token_hash);');
  await p.query('CREATE INDEX IF NOT EXISTS auth_tokens_user_kind_idx ON auth_tokens (user_id, kind);');
  await p.query('CREATE INDEX IF NOT EXISTS auth_tokens_expires_idx ON auth_tokens (expires_at);');

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

  // Outlook (Microsoft Graph) multi-account connections (read-only calendars)
  await p.query(`
    CREATE TABLE IF NOT EXISTS outlook_connections (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      outlook_user_id TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      color TEXT NOT NULL DEFAULT 'cyan',
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      scope TEXT,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, outlook_user_id)
    );
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'outlook_connections_user_id_fkey'
      ) THEN
        ALTER TABLE outlook_connections
        ADD CONSTRAINT outlook_connections_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS outlook_connections_user_id_idx ON outlook_connections (user_id);
  `);

  // Bind events to user (family) and optionally to a person
  await p.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS user_id BIGINT;
  `);

  // Events: bind to calendar (families)
  await p.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;
  `);

  await p.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS person_id BIGINT;
  `);

  // Many-to-many event ↔ persons (idempotent migration)
  await p.query(`
    CREATE TABLE IF NOT EXISTS event_persons (
      event_id BIGINT NOT NULL,
      person_id BIGINT NOT NULL,
      PRIMARY KEY (event_id, person_id)
    );
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'event_persons_event_id_fkey'
      ) THEN
        ALTER TABLE event_persons
        ADD CONSTRAINT event_persons_event_id_fkey
        FOREIGN KEY (event_id)
        REFERENCES events(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'event_persons_person_id_fkey'
      ) THEN
        ALTER TABLE event_persons
        ADD CONSTRAINT event_persons_person_id_fkey
        FOREIGN KEY (person_id)
        REFERENCES persons(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS event_persons_event_id_idx ON event_persons (event_id);
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS event_persons_person_id_idx ON event_persons (person_id);
  `);

  // Backfill existing events to first user (idempotent)
  await p.query(`
    UPDATE events
    SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
    WHERE user_id IS NULL;
  `);

  // Backfill calendar_id from user_id (idempotent)
  await p.query(`
    UPDATE events e
    SET calendar_id = u.calendar_id
    FROM users u
    WHERE e.calendar_id IS NULL AND e.user_id = u.id;
  `);

  // Backfill legacy single-person events into join table (idempotent)
  await p.query(`
    INSERT INTO event_persons (event_id, person_id)
    SELECT e.id, e.person_id
    FROM events e
    WHERE e.person_id IS NOT NULL
    ON CONFLICT DO NOTHING;
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

  // Drop the user FK if present (avoid cascading calendar data on user deletion)
  await p.query('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_user_id_fkey;');

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'events_calendar_id_fkey'
      ) THEN
        ALTER TABLE events
        ADD CONSTRAINT events_calendar_id_fkey
        FOREIGN KEY (calendar_id)
        REFERENCES calendars(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query('CREATE INDEX IF NOT EXISTS events_calendar_id_idx ON events (calendar_id);');

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

  // Scribble notes (handwritten family notes)
  await p.query(`
    CREATE TABLE IF NOT EXISTS scribbles (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      calendar_id BIGINT,
      image_data TEXT NOT NULL,
      author_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      pinned BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  // Ensure calendar_id exists for older installations where scribbles pre-dated calendars
  await p.query(`
    ALTER TABLE scribbles
    ADD COLUMN IF NOT EXISTS calendar_id BIGINT;
  `);

  // Backfill calendar_id for existing scribbles (idempotent)
  await p.query(`
    UPDATE scribbles s
    SET calendar_id = u.calendar_id
    FROM users u
    WHERE s.calendar_id IS NULL AND s.user_id = u.id;
  `);

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'scribbles_user_id_fkey'
      ) THEN
        ALTER TABLE scribbles
        ADD CONSTRAINT scribbles_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  // Drop the user FK if present (avoid cascading calendar data on user deletion)
  await p.query('ALTER TABLE scribbles DROP CONSTRAINT IF EXISTS scribbles_user_id_fkey;');

  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'scribbles_calendar_id_fkey'
      ) THEN
        ALTER TABLE scribbles
        ADD CONSTRAINT scribbles_calendar_id_fkey
        FOREIGN KEY (calendar_id)
        REFERENCES calendars(id)
        ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await p.query('CREATE INDEX IF NOT EXISTS scribbles_calendar_id_idx ON scribbles (calendar_id);');

  await p.query(`
    CREATE INDEX IF NOT EXISTS scribbles_user_id_idx ON scribbles (user_id);
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS scribbles_created_at_idx ON scribbles (created_at DESC);
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
