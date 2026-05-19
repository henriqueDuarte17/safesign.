// backend/scripts/generate_keys.js
const { Pool } = require('pg');
const crypto = require('crypto');
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
    "SELECT id, email FROM users WHERE public_key IS NULL OR public_key = '' OR private_key IS NULL OR private_key = ''"
  );

  if (res.rowCount === 0) {
    console.log('Nenhum utilizador a actualizar.');
    await pool.end();
    return;
  }

  console.log(`Encontrados ${res.rowCount} utilizador(es) sem chaves. Gerando...`);

  for (const row of res.rows) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    await pool.query(
      'UPDATE users SET public_key = $1, private_key = $2 WHERE id = $3',
      [publicKey, privateKey, row.id]
    );

    console.log(`Chaves geradas e guardadas para ${row.email}`);
  }

  await pool.end();
  console.log('Processo concluído.');
}

run().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
