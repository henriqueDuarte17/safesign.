// backend/scripts/check_documents.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'user_admin',
  host: process.env.DB_HOST || 'db',
  database: process.env.POSTGRES_DB || 'safesign_db',
  password: process.env.POSTGRES_PASSWORD || 'password123',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
});

async function run() {
  const res = await pool.query('SELECT id, original_name, data_url, hash FROM documents ORDER BY id');
  console.log('Documents:');
  for (const r of res.rows) {
    console.log(r);
  }
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
