import fs from 'fs';
import path from 'path';
import { getDb } from './connection';

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.resolve(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all()
      .map((r: any) => r.name)
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    console.log(`[migrate] applied ${file}`);
  }
}
