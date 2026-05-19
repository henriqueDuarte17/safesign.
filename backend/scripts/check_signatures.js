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
  const res = await pool.query(
    `SELECT ds.id, ds.document_id, ds.signer_email, ds.status, ds.signature_hash, d.hash AS document_hash, d.data_url
     FROM document_signers ds
     LEFT JOIN documents d ON d.id = ds.document_id
     ORDER BY ds.document_id, ds.id`
  );
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
