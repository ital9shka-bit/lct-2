import pg from 'pg';
import { config } from './config.mjs';
export const pool = new pg.Pool({connectionString: config.databaseUrl, max: 12, statement_timeout: 30000});
export async function transaction(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function one(db, sql, values = []) { return (await db.query(sql, values)).rows[0] || null; }
export async function all(db, sql, values = []) { return (await db.query(sql, values)).rows; }
export async function audit(db, actor, action, objectId, metadata = {}) {
  await db.query('INSERT INTO audit_events(actor_id,action,object_id,metadata) VALUES($1,$2,$3,$4)', [actor,action,objectId,metadata]);
}
export async function job(db, kind, key, payload) {
  await db.query('INSERT INTO jobs(kind,dedupe_key,payload) VALUES($1,$2,$3) ON CONFLICT(dedupe_key) DO NOTHING', [kind,key,payload]);
}
