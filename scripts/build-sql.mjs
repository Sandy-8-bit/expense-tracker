import { readdir, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../supabase/', import.meta.url);
const files = (await readdir(new URL('migrations/', root)))
  .filter((name) => name.endsWith('.sql'))
  .sort();
const sql = await Promise.all(
  files.map(
    async (name) => `-- ${name}\n${await readFile(new URL(`migrations/${name}`, root), 'utf8')}`,
  ),
);
await writeFile(
  new URL('setup.sql', root),
  `-- ClearLedger: fresh database setup. Apply once, in a development project first.\nBEGIN;\n${sql.join('\n\n')}\nCOMMIT;\n`,
);
console.log(`Bundled ${files.length} migrations into supabase/setup.sql`);
