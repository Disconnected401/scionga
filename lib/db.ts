import { Client, Pool } from "pg";

const DEFAULT_DB_HOST = "5.189.160.120";
const DEFAULT_DB_NAME = "scionga";
const DEFAULT_DB_PORT = 5432;

const schemaSql = `
CREATE TABLE IF NOT EXISTS tabs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  tab_id INTEGER NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nowa notatka',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notes
ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Nowa notatka';
`;

type GlobalDbState = {
  sciongaPool?: Pool;
  sciongaPoolPromise?: Promise<Pool>;
};

const globalDb = globalThis as typeof globalThis & GlobalDbState;

function getDbConfig() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      database: process.env.PGDATABASE ?? DEFAULT_DB_NAME,
    };
  }

  const port = Number(process.env.PGPORT ?? DEFAULT_DB_PORT);
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;

  if (!user || !password) {
    throw new Error(
      "Brak konfiguracji PostgreSQL. Ustaw PGUSER i PGPASSWORD albo DATABASE_URL.",
    );
  }

  return {
    host: process.env.PGHOST ?? DEFAULT_DB_HOST,
    database: process.env.PGDATABASE ?? DEFAULT_DB_NAME,
    user,
    password,
    port: Number.isNaN(port) ? DEFAULT_DB_PORT : port,
  };
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function ensureDatabaseExists(): Promise<void> {
  const config = getDbConfig();

  if ("connectionString" in config) {
    // With DATABASE_URL we skip CREATE DATABASE flow and only ensure schema later.
    return;
  }

  const adminDatabase = process.env.PGADMIN_DATABASE ?? "postgres";
  const adminUser = process.env.PGADMIN_USER ?? config.user;
  const adminPassword = process.env.PGADMIN_PASSWORD ?? config.password;

  const adminClient = new Client({
    host: config.host,
    user: adminUser,
    password: adminPassword,
    port: config.port,
    database: adminDatabase,
  });

  await adminClient.connect();

  try {
    const existsResult = await adminClient.query<{ exists: number }>(
      "SELECT 1 AS exists FROM pg_database WHERE datname = $1",
      [config.database],
    );

    if (existsResult.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE ${quoteIdentifier(config.database)}`);
    }
  } finally {
    await adminClient.end();
  }
}

async function initializeDatabase(): Promise<Pool> {
  const config = getDbConfig();
  await ensureDatabaseExists();

  const pool =
    "connectionString" in config
      ? new Pool({
          connectionString: config.connectionString,
          max: 10,
        })
      : new Pool({
          host: config.host,
          database: config.database,
          user: config.user,
          password: config.password,
          port: config.port,
          max: 10,
        });

  await pool.query(schemaSql);

  return pool;
}

export async function getDbPool(): Promise<Pool> {
  if (globalDb.sciongaPool) {
    return globalDb.sciongaPool;
  }

  if (!globalDb.sciongaPoolPromise) {
    globalDb.sciongaPoolPromise = initializeDatabase();
  }

  globalDb.sciongaPool = await globalDb.sciongaPoolPromise;
  return globalDb.sciongaPool;
}
