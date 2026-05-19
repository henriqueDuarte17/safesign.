const multer = require('multer');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

// 1. CONFIGURAÇÃO DE UPLOADS
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// 2. CONFIGURAÇÃO DO EXPRESS
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Servir ficheiros estáticos para que o browser possa abrir os documentos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 3. LIGAÇÃO À BASE DE DADOS
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'user_admin',
  host: process.env.DB_HOST || 'db',
  database: process.env.POSTGRES_DB || 'safesign_db',
  password: process.env.POSTGRES_PASSWORD || 'password123',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
});

// 4. ROTAS DE STATUS E AUTENTICAÇÃO
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'Backend Online', db_time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'Erro na ligação à DB', error: err.message });
  }
});

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING name, email',
      [name, email, password]
    );
    res.status(201).json({ message: 'Utilizador criado!', user: newUser.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.code === '23505' ? 'Email já registado' : err.message });
  }
});

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

// 5. ROTAS DE DOCUMENTOS (O que faltava!)

// Listar documentos de um utilizador (GET) - suporta ?email= e /api/documents/:email
app.get('/api/documents/:email?', async (req, res) => {
  const email = req.params.email || req.query.email;
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
                  'signed_at', s.signed_at
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

// Upload de novo documento (POST) - ATUALIZADO PARA GRAVAR SIGNATÁRIOS
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  // 1. Logs para ver o que chega do frontend no terminal do Docker
  console.log("=== NOVO UPLOAD DETETADO ===");
  console.log("Campos de texto recebidos (req.body):", req.body);
  console.log("Ficheiro recebido (req.file):", req.file);

  const { name, category, user_email, hash, signers } = req.body;
  const fileName = req.file ? req.file.filename : null;
  const size = req.file ? req.file.size : 0;

  if (!fileName) {
    return res.status(400).json({ error: 'Nenhum ficheiro foi recebido pelo servidor.' });
  }

  try {
    // 2. Inserir o documento principal
    const result = await pool.query(
      'INSERT INTO documents (user_email, name, category, original_name, size_bytes, data_url, hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [user_email, name, category, fileName, size, `/uploads/${fileName}`, hash]
    );
    
    const newDoc = result.rows[0];
    const docId = newDoc.id;
    console.log(`Documento guardado na tabela 'documents' com o ID: ${docId}`);

    // 3. Processar os signatários com segurança máxima
    if (signers) {
      let signersArray = [];
      
      // Se vier como string JSON (enviado pelo FormData), fazemos o parse
      try {
        signersArray = typeof signers === 'string' ? JSON.parse(signers) : signers;
      } catch (e) {
        console.log("Aviso: O campo signers não era uma string JSON válida, a tentar ler como texto direto.");
        if (typeof signers === 'string' && signers.includes('@')) {
          signersArray = signers.split(',').map(e => e.trim());
        }
      }

      if (!Array.isArray(signersArray)) {
        signersArray = [signersArray];
      }

      // Normalizar e validar emails
      signersArray = signersArray
        .map(email => String(email).trim())
        .filter(email => email.includes('@'))
        .map(email => email.toLowerCase())
        .filter((email, index, self) => self.indexOf(email) === index);

      console.log("Signatários processados para inserção:", signersArray);

      // Garantir que o proprietário do documento está presente como signatário
      const ownerEmail = String(user_email).trim().toLowerCase();
      if (!signersArray.includes(ownerEmail)) {
        // Inserimos o proprietário como já assinado (assumindo que ao carregar ele aprovou)
        console.log(`Inserindo proprietário ${ownerEmail} como assinante com estado 'signed' para o documento ${docId}`);
        await pool.query(
          'INSERT INTO document_signers (document_id, signer_email, status, signed_at) VALUES ($1, $2, $3, $4)',
          [docId, ownerEmail, 'signed', new Date()]
        );
      } else {
        // Se o proprietário foi incluído inadvertidamente na lista de signatários, marcá-lo como assinado
        console.log(`Proprietário ${ownerEmail} estava na lista de signatários; marcando como 'signed'.`);
        await pool.query(
          "INSERT INTO document_signers (document_id, signer_email, status, signed_at) VALUES ($1, $2, $3, $4)",
          [docId, ownerEmail, 'signed', new Date()]
        );
        // Remover o proprietário da lista pública de inserção posterior
        signersArray = signersArray.filter(e => e !== ownerEmail);
      }

      // Inserir os restantes signatários como 'pending'
      if (signersArray.length > 0) {
        for (const signerEmail of signersArray) {
          console.log(`A tentar inserir o signatário: ${signerEmail} para o documento ${docId}`);
          await pool.query(
            'INSERT INTO document_signers (document_id, signer_email, status) VALUES ($1, $2, $3)',
            [docId, signerEmail, 'pending']
          );
        }
        console.log("Todos os signatários foram registados com sucesso no PostgreSQL!");
      } else {
        console.log("Nenhum signatário válido foi encontrado no array (apenas o proprietário foi registado).");
      }
    } else {
      // Se não vierem signatários, pelo menos registar o proprietário como 'signed'
      const ownerEmail = String(user_email).trim().toLowerCase();
      console.log(`Nenhum signatário fornecido. Inserindo proprietário ${ownerEmail} como 'signed'.`);
      await pool.query(
        'INSERT INTO document_signers (document_id, signer_email, status, signed_at) VALUES ($1, $2, $3, $4)',
        [docId, ownerEmail, 'signed', new Date()]
      );
    }

    res.status(201).json(newDoc);
  } catch (err) {
    console.error("ERRO CRÍTICO NO POSTGRESQL:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Eliminar documento (DELETE)
app.delete('/api/documents/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Documento eliminado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assinar documento (PATCH)
app.patch('/api/documents/:id/sign', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email do signatário é obrigatório.' });
  }

  try {
    const now = new Date();
    const signerUpdate = await pool.query(
      "UPDATE document_signers SET status = 'signed', signed_at = $1 WHERE document_id = $2 AND signer_email = $3 RETURNING *",
      [now, req.params.id, email]
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

    res.json({ message: 'Documento assinado!', signedAt: now, pendingSigners: pendingCount });
  } catch (err) {
    console.error('Erro ao assinar documento:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. INICIAR SERVIDOR (Sempre no fim do ficheiro)
const PORT = parseInt(process.env.PORT || '5000', 10);
console.log('Rotas registadas:', app._router.stack.filter(r => r.route).map(r => `${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`));
app.listen(PORT, () => {
  console.log(`✓ Servidor SafeSign a correr na porta ${PORT}`);
});