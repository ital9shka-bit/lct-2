import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pool, transaction } from './db.mjs';
for (const file of (await readdir(new URL('../migrations/',import.meta.url))).sort()) {
  await transaction(async db => {
    await db.query("SELECT pg_advisory_xact_lock(8450800)");
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    if (!(await db.query('SELECT 1 FROM schema_migrations WHERE version=$1',[file])).rowCount) {
      await db.query(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
      await db.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);
      console.log('Applied',file);
    }
  });
}
for (const file of ['professional.json','cognitive.json','cognitive-demo.json','archive/frontend-0.1.0.json','archive/backend-senior-0.1.0.json','archive/frontend-0.2.0.json','archive/backend-senior-0.2.0.json','professional-demo.json','extended-frontend.json','extended-backend.json']) {
  const text = await readFile(new URL('../private/'+file,import.meta.url),'utf8');
  const data = JSON.parse(text), checksum = createHash('sha256').update(text).digest('hex');
  const version = data.bank_version || data.version;
  await pool.query('INSERT INTO bank_versions(version,data,checksum) VALUES($1,$2,$3) ON CONFLICT(version) DO NOTHING',[version,data,checksum]);
  const stored = (await pool.query('SELECT checksum FROM bank_versions WHERE version=$1',[version])).rows[0];
  if (stored.checksum !== checksum) throw new Error('Bank version collision: '+version);
}
await pool.end();
