import postgres from 'postgres';
const sql = postgres({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: 'require' as any });
const text = await Bun.file('/tmp/merge_t2.sql').text();
await sql.unsafe(text);
console.log('done');
await sql.end();
