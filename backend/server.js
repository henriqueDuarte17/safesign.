const multer = require('multer');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const crypto = require('crypto'); // Módulo criptográfico nativo do Node.js [Alto Nível]
require('dotenv').config();

// FUNÇÕES CRIPTOGRÁFICAS PEDAGÓGICAS 
// [RESUMO/HASH]: Cria o SHA-256 do ficheiro para garantir a integridade [Requisito Obrigatório]
function calcularHashFicheiro(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

// [CIFRA SIMÉTRICA]: Aplica AES-256-GCM para proteger o ficheiro armazenado no disco
const AES_PASSPHRASE = process.env.AES_PASSPHRASE || 'chave-secreta-safesign';
const AES_SALT = process.env.AES_SALT || 'salt-sintra';
const CHAVE_MESTRA = crypto.scryptSync(AES_PASSPHRASE, AES_SALT, 32);

function cifrarFicheiro(filePath) {
    const conteudo = fs.readFileSync(filePath);
    const iv = crypto.randomBytes(12); // Vetor de Inicialização único (IV)
    const cipher = crypto.createCipheriv('aes-256-gcm', CHAVE_MESTRA, iv);
    
    const cifrado = Buffer.concat([cipher.update(conteudo), cipher.final()]);
    const tagAutenticacao = cipher.getAuthTag(); // Garante a integridade da cifra

    // Grava no disco a estrutura compactada: [IV (12B)] + [TAG (16B)] + [Conteúdo Cifrado]
    const payloadFinal = Buffer.concat([iv, tagAutenticacao, cifrado]);
    fs.writeFileSync(filePath, payloadFinal);
}

// [DECIFRA SIMÉTRICA]: Lê a estrutura do disco e recupera o ficheiro original em memória
function decifrarFicheiro(filePath) {
    const payloadBuffer = fs.readFileSync(filePath);
    
    const iv = payloadBuffer.subarray(0, 12);
    const tagAutenticacao = payloadBuffer.subarray(12, 28);
    const conteudoCifrado = payloadBuffer.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', CHAVE_MESTRA, iv);
    decipher.setAuthTag(tagAutenticacao);

    return Buffer.concat([decipher.update(conteudoCifrado), decipher.final()]);
}

// [CIFRA ASSIMÉTRICA]: Gera chaves RSA de 2048 bits seguindo as recomendações teóricas
function gerarParChavesRSA() {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048, 
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
}

// =========================================================================
// CONFIGURAÇÃO E ROTAS DO EXPRESS (PRESERVANDO O SEU CÓDIGO BASE)
// =========================================================================
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'user_admin',
  host: process.env.DB_HOST || 'db',
  database: process.env.POSTGRES_DB || 'safesign_db',
  password: process.env.POSTGRES_PASSWORD || 'password123',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
});

// ROTA DE STATUS
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'Backend Online', db_time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'Erro na ligação à DB', error: err.message });
  }
});

// REGISTO: Agora gera e grava automaticamente o par de chaves assimétricas na DB
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const { publicKey, privateKey } = gerarParChavesRSA();

    const newUser = await pool.query(
      'INSERT INTO users (name, email, password, public_key, private_key) VALUES ($1, $2, $3, $4, $5) RETURNING name, email',
      [name, email, password, publicKey, privateKey]
    );
    res.status(201).json({ message: 'Utilizador criado com chaves RSA!', user: newUser.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.code === '23505' ? 'Email já registado' : err.message });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT name, email, password FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0 || result.rows[0].password !== password) {
      return res.status(401).json({ error: 'Email ou password incorretos.' });
    }
    res.json({ message: 'Autenticado', user: { name: result.rows[0].name, email: result.rows[0].email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LISTAR DOCUMENTOS
app.get('/api/documents/:email?', async (req, res) => {
  const email = (req.params.email || req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email do utilizador é obrigatório.' });
  }
  try {
    const result = await pool.query(
      `SELECT d.*,
              COALESCE(json_agg(
                json_build_object(
                  'email', s.signer_email,
                  'status', s.status,
                  'signed_at', s.signed_at,
                  'signature_hash', s.signature_hash
                )
              ) FILTER (WHERE s.id IS NOT NULL), '[]') AS signers
       FROM documents d
       LEFT JOIN document_signers s ON d.id = s.document_id
       WHERE d.user_email = $1 OR s.signer_email = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC`,
      [email]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DOWNLOAD SEGURO: Interceta o ficheiro, decifra em memória e envia de forma limpa ao browser
app.get('/uploads/:filename', async (req, res) => {
    const targetPath = path.join(__dirname, 'uploads', req.params.filename);
    if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ error: 'Ficheiro não encontrado.' });
    }
    try {
        const ficheiroDecifrado = decifrarFicheiro(targetPath);
        res.setHeader('Content-Type', 'application/pdf'); 
        res.send(ficheiroDecifrado);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao decifrar o documento.', details: err.message });
    }
});

// UPLOAD: Calcula o hash de integridade e cifra o ficheiro antes de o guardar no disco
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  const { name, category, user_email, signers } = req.body;
  const fileName = req.file ? req.file.filename : null;
  const size = req.file ? req.file.size : 0;

  if (!fileName) {
    return res.status(400).json({ error: 'Nenhum ficheiro foi recebido.' });
  }

  const localFilePath = path.join(__dirname, 'uploads', fileName);

  try {
    // 1. Integridade: Calcula o hash SHA-256 local
    const serverCalculatedHash = calcularHashFicheiro(localFilePath);

    // 2. Confidencialidade: Cifra o documento com AES
    cifrarFicheiro(localFilePath);

    // Inserir os metadados na base de dados
    const result = await pool.query(
      'INSERT INTO documents (user_email, name, category, original_name, size_bytes, data_url, hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [user_email, name, category, fileName, size, `/uploads/${fileName}`, serverCalculatedHash]
    );
    
    const newDoc = result.rows[0];
    const docId = newDoc.id;

    // Processamento de signatários
    if (signers) {
      let signersArray = [];
      try {
        signersArray = typeof signers === 'string' ? JSON.parse(signers) : signers;
      } catch (e) {
        if (typeof signers === 'string' && signers.includes('@')) {
          signersArray = signers.split(',').map(e => e.trim());
        }
      }
      if (!Array.isArray(signersArray)) signersArray = [signersArray];

      signersArray = signersArray
        .map(email => String(email).trim().toLowerCase())
        .filter(email => email.includes('@'))
        .filter((email, index, self) => self.indexOf(email) === index);

      const ownerEmail = String(user_email).trim().toLowerCase();

      // Tentar gerar assinatura do proprietário se a chave privada estiver disponível
      let ownerSignatureHex = null;
      try {
        const keyRes = await pool.query('SELECT private_key FROM users WHERE email = $1', [ownerEmail]);
        if (keyRes.rowCount > 0 && keyRes.rows[0].private_key) {
          const privateKeyPem = keyRes.rows[0].private_key;
          try {
            const sign = crypto.createSign('RSA-SHA256');
            sign.update(serverCalculatedHash);
            sign.end();
            ownerSignatureHex = sign.sign({
              key: privateKeyPem,
              padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
              saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_LENGTH
            }, 'hex');
          } catch (e) {
            console.error('Erro a gerar assinatura do proprietário:', e.message || e);
          }
        }
      } catch (e) {
        console.error('Erro a ler chave privada do proprietário:', e.message || e);
      }

      const insertOwnerSigned = async () => {
        if (ownerSignatureHex) {
          await pool.query(
            'INSERT INTO document_signers (document_id, signer_email, status, signed_at, signature_hash) VALUES ($1, $2, $3, $4, $5)',
            [docId, ownerEmail, 'signed', new Date(), ownerSignatureHex]
          );
        } else {
          await pool.query(
            'INSERT INTO document_signers (document_id, signer_email, status, signed_at) VALUES ($1, $2, $3, $4)',
            [docId, ownerEmail, 'signed', new Date()]
          );
        }
      };

      if (!signersArray.includes(ownerEmail)) {
        await insertOwnerSigned();
      } else {
        await insertOwnerSigned();
        signersArray = signersArray.filter(e => e !== ownerEmail);
      }

      if (signersArray.length > 0) {
        for (const signerEmail of signersArray) {
          await pool.query(
            'INSERT INTO document_signers (document_id, signer_email, status) VALUES ($1, $2, $3)',
            [docId, signerEmail, 'pending']
          );
        }
      }
    } else {
      const ownerEmail = String(user_email).trim().toLowerCase();
      let ownerSignatureHex = null;

      try {
        const keyRes = await pool.query('SELECT private_key FROM users WHERE email = $1', [ownerEmail]);
        if (keyRes.rowCount > 0 && keyRes.rows[0].private_key) {
          const privateKeyPem = keyRes.rows[0].private_key;
          const sign = crypto.createSign('RSA-SHA256');
          sign.update(serverCalculatedHash);
          sign.end();
          ownerSignatureHex = sign.sign({
            key: privateKeyPem,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_LENGTH
          }, 'hex');
        }
      } catch (e) {
        console.error('Erro ao gerar assinatura do proprietário no upload:', e.message || e);
      }

      if (ownerSignatureHex) {
        await pool.query(
          'INSERT INTO document_signers (document_id, signer_email, status, signed_at, signature_hash) VALUES ($1, $2, $3, $4, $5)',
          [docId, ownerEmail, 'signed', new Date(), ownerSignatureHex]
        );
      } else {
        await pool.query(
          'INSERT INTO document_signers (document_id, signer_email, status, signed_at) VALUES ($1, $2, $3, $4)',
          [docId, ownerEmail, 'signed', new Date()]
        );
      }
    }

    res.status(201).json(newDoc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ELIMINAR DOCUMENTO
app.delete('/api/documents/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Documento eliminado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ASSINAR DOCUMENTO: Gera a assinatura digital RSA-PSS baseada no hash do PDF
app.patch('/api/documents/:id/sign', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email do signatário é obrigatório.' });
  }

  try {
    // 1. Procurar a chave privada do utilizador e o hash do documento
    const userResult = await pool.query('SELECT private_key FROM users WHERE email = $1', [email]);
    const docResult = await pool.query('SELECT hash, data_url FROM documents WHERE id = $1', [req.params.id]);

    if (userResult.rowCount === 0 || docResult.rowCount === 0) {
        return res.status(404).json({ error: 'Utilizador ou documento não encontrado.' });
    }

    const privateKeyPem = userResult.rows[0].private_key;
    if (!privateKeyPem) {
      return res.status(400).json({ error: 'Chave privada do utilizador não encontrada.' });
    }

    let docHash = docResult.rows[0].hash;
    const dataUrl = docResult.rows[0].data_url;

    if (!docHash || docHash.trim() === '') {
      if (!dataUrl) {
        return res.status(400).json({ error: 'Hash do documento ausente e caminho não disponível.' });
      }
      const documentPath = path.join(__dirname, 'uploads', path.basename(dataUrl));
      if (!fs.existsSync(documentPath)) {
        return res.status(404).json({ error: 'Ficheiro do documento não encontrado para gerar hash.' });
      }
      const decrypted = decifrarFicheiro(documentPath);
      docHash = crypto.createHash('sha256').update(decrypted).digest('hex');
      await pool.query('UPDATE documents SET hash = $1 WHERE id = $2', [docHash, req.params.id]);
    }

    // 2. Criar a Assinatura Digital RSA-PSS (Conceito dado na aula do Iscte)
    const assinar = crypto.createSign('RSA-SHA256');
    assinar.update(docHash);
    assinar.end();
    
    const assinaturaDigitalHex = assinar.sign({
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING, // Padding PSS recomendado pelo professor
        saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_LENGTH
    }, 'hex');

    const now = new Date();
    
    // 3. Atualizar o estado e guardar o hash da assinatura na coluna que criámos no Passo 1
    const signerUpdate = await pool.query(
      "UPDATE document_signers SET status = 'signed', signed_at = $1, signature_hash = $2 WHERE document_id = $3 AND LOWER(signer_email) = $4 RETURNING *",
      [now, assinaturaDigitalHex, req.params.id, email]
    );

    if (signerUpdate.rowCount === 0) {
      return res.status(404).json({ error: 'Signatário não encontrado para este documento.' });
    }

    const pending = await pool.query(
      "SELECT COUNT(*) AS pending_count FROM document_signers WHERE document_id = $1 AND status <> 'signed'",
      [req.params.id]
    );
    const pendingCount = parseInt(pending.rows[0].pending_count, 10);

    if (pendingCount === 0) {
      await pool.query(
        "UPDATE documents SET status = 'signed', signed_at = $1 WHERE id = $2",
        [now, req.params.id]
      );
    }

    res.json({ 
        message: 'Documento assinado digitalmente com sucesso!', 
        signedAt: now, 
        pendingSigners: pendingCount,
        signature: assinaturaDigitalHex 
    });
  } catch (err) {
    console.error('Erro ao assinar documento:', err);
    res.status(500).json({ error: err.message });
  }
});

// VERIFICAÇÃO DE ASSINATURA RSA-PSS
app.post('/api/documents/:id/verify-signature', async (req, res) => {
  const signerEmail = String(req.body.signer_email || '').trim().toLowerCase();
  if (!signerEmail) {
    return res.status(400).json({ error: 'Email do signatário é obrigatório.' });
  }

  try {
    const signerResult = await pool.query(
      'SELECT signature_hash FROM document_signers WHERE document_id = $1 AND LOWER(signer_email) = $2',
      [req.params.id, signerEmail]
    );
    const docResult = await pool.query('SELECT hash FROM documents WHERE id = $1', [req.params.id]);
    const userResult = await pool.query('SELECT public_key FROM users WHERE LOWER(email) = $1', [signerEmail]);

    if (signerResult.rowCount === 0 || docResult.rowCount === 0 || userResult.rowCount === 0) {
      return res.status(404).json({ error: 'Documento, signatário ou chave pública não encontrado.' });
    }

    const assinaturaDigitalHex = signerResult.rows[0].signature_hash;
    const docHash = docResult.rows[0].hash;
    const publicKeyPem = userResult.rows[0].public_key;

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(docHash);
    verify.end();

    const isValid = verify.verify({
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_LENGTH
    }, Buffer.from(assinaturaDigitalHex, 'hex'));

    res.json({ valid: isValid, signature: assinaturaDigitalHex });
  } catch (err) {
    console.error('Erro ao verificar assinatura:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, () => {
  console.log(`✓ Servidor SafeSign Criptográfico a correr na porta ${PORT}`);
});