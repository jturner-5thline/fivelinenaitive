import postgres from 'postgres';
const sql = postgres({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: 'require' as any, max: 1 });
const text = (await Bun.file('/tmp/merge_t2.sql').text()).replace(/^BEGIN;\s*/m,'').replace(/COMMIT;\s*$/m,'');
await sql.begin(async (tx) => { await tx.unsafe(text); });
console.log('done');
await sql.end();
