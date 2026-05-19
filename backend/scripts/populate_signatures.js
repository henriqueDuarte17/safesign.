// backend/scripts/populate_signatures.js
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const AES_PASSPHRASE = process.env.AES_PASSPHRASE || 'chave-secreta-safesign';
const AES_SALT = process.env.AES_SALT || 'salt-sintra';
const CHAVE_MESTRA = crypto.scryptSync(AES_PASSPHRASE, AES_SALT, 32);

function decifrarFicheiro(filePath) {
  const payloadBuffer = fs.readFileSync(filePath);
  const iv = payloadBuffer.subarray(0, 12);
  const tagAutenticacao = payloadBuffer.subarray(12, 28);
  const conteudoCifrado = payloadBuffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', CHAVE_MESTRA, iv);
  decipher.setAuthTag(tagAutenticacao);
  return Buffer.concat([decipher.update(conteudoCifrado), decipher.final()]);
}

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'user_admin',
  host: process.env.DB_HOST || 'db',
  database: process.env.POSTGRES_DB || 'safesign_db',
  password: process.env.POSTGRES_PASSWORD || 'password123',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
});

async function run() {
  const res = await pool.query(
    `SELECT ds.id AS signer_id, ds.document_id, ds.signer_email, d.hash AS doc_hash, d.data_url, u.private_key
     FROM document_signers ds
     JOIN documents d ON d.id = ds.document_id
     LEFT JOIN users u ON LOWER(u.email) = LOWER(ds.signer_email)
     WHERE ds.status = 'signed' AND (ds.signature_hash IS NULL OR ds.signature_hash = '')`
  );

  if (res.rowCount === 0) {
    console.log('Nenhuma assinatura em falta encontrada.');
    await pool.end();
    return;
  }

  console.log(`Encontradas ${res.rowCount} assinaturas em falta. Processando...`);

  for (const row of res.rows) {
    if (!row.private_key) {
      console.log(`Sem chave privada para ${row.signer_email}, pulando (signer_id=${row.signer_id}).`);
      continue;
    }

    let docHash = row.doc_hash;
    if (!docHash || docHash.trim() === '') {
      if (!row.data_url) {
        console.log(`Documento sem hash e sem caminho para signer_id=${row.signer_id}, pulando.`);
        continue;
      }

      const filePath = path.join(__dirname, '..', 'uploads', path.basename(row.data_url));
      if (!fs.existsSync(filePath)) {
        console.log(`Ficheiro não encontrado para signer_id=${row.signer_id} em ${filePath}, pulando.`);
        continue;
      }

      try {
        const decrypted = decifrarFicheiro(filePath);
        docHash = crypto.createHash('sha256').update(decrypted).digest('hex');
        await pool.query('UPDATE documents SET hash = $1 WHERE id = $2', [docHash, row.document_id]);
        console.log(`Hash calculado e atualizado para document_id=${row.document_id}.`);
      } catch (e) {
        console.error(`Erro ao calcular hash para signer_id=${row.signer_id}:`, e.message || e);
        continue;
      }
    }

    try {
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(docHash);
      sign.end();
      const signatureHex = sign.sign({
        key: row.private_key,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_LENGTH
      }, 'hex');

      await pool.query('UPDATE document_signers SET signature_hash = $1 WHERE id = $2', [signatureHex, row.signer_id]);
      console.log(`Assinatura atualizada para signer_id=${row.signer_id} (${row.signer_email}).`);
    } catch (e) {
      console.error(`Erro ao gerar/guardar assinatura para signer_id=${row.signer_id}:`, e.message || e);
    }
  }

  await pool.end();
  console.log('Processo concluído.');
}

run().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
