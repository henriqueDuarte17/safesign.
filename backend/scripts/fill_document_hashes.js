// backend/scripts/fill_document_hashes.js
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'user_admin',
  host: process.env.DB_HOST || 'db',
  database: process.env.POSTGRES_DB || 'safesign_db',
  password: process.env.POSTGRES_PASSWORD || 'password123',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
});

const AES_PASSPHRASE = process.env.AES_PASSPHRASE || 'chave-secreta-safesign';
const AES_SALT = process.env.AES_SALT || 'salt-sintra';
const CHAVE_MESTRA = crypto.scryptSync(AES_PASSPHRASE, AES_SALT, 32);

function decifrarBufferDeFicheiro(encBuffer) {
  const iv = encBuffer.subarray(0, 12);
  const tag = encBuffer.subarray(12, 28);
  const conteudoCifrado = encBuffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', CHAVE_MESTRA, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(conteudoCifrado), decipher.final()]);
}

async function run() {
  const res = await pool.query("SELECT id, data_url FROM documents WHERE hash IS NULL OR hash = ''");
  if (res.rowCount === 0) {
    console.log('Nenhum documento sem hash encontrado.');
    await pool.end();
    return;
  }

  console.log(`Encontrados ${res.rowCount} documentos sem hash. Processando...`);

  for (const row of res.rows) {
    const dataUrl = row.data_url || '';
    const filename = path.basename(dataUrl);
    const filePath = path.join(__dirname, '..', 'uploads', filename);

    try {
      if (!fs.existsSync(filePath)) {
        console.log(`Ficheiro não encontrado: ${filePath} (document_id=${row.id}). Pulando.`);
        continue;
      }

      const payload = fs.readFileSync(filePath);
      let plaintext;
      try {
        plaintext = decifrarBufferDeFicheiro(payload);
      } catch (e) {
        console.error(`Erro ao decifrar ficheiro ${filePath}:`, e.message || e);
        continue;
      }

      const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
      await pool.query('UPDATE documents SET hash = $1 WHERE id = $2', [hash, row.id]);
      console.log(`Hash atualizado para document_id=${row.id}`);
    } catch (e) {
      console.error(`Erro a processar document_id=${row.id}:`, e.message || e);
    }
  }

  await pool.end();
  console.log('Processo concluído.');
}

run().catch(err => {
  console.error('Erro geral:', err);
  process.exit(1);
});
