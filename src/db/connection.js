import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', err => console.error('DB pool error:', err));

// Mismo esquema que ecom-loom — queries directamente comparables
export const db = new Kysely({ dialect: new PostgresDialect({ pool }) });
