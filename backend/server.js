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

// Listar documentos de um utilizador (GET) por query string
app.get('/api/documents', async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).json({ error: 'Email do utilizador é obrigatório.' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE user_email = $1 ORDER BY created_at DESC',
      [email]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/documents/:email(*)', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE user_email = $1 ORDER BY created_at DESC',
      [req.params.email]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload de novo documento (POST)
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  const { name, category, user_email, hash } = req.body;
  const fileName = req.file.filename;
  const size = req.file.size;

  try {
    const result = await pool.query(
      'INSERT INTO documents (user_email, name, category, original_name, size_bytes, data_url, hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [user_email, name, category, fileName, size, `/uploads/${fileName}`, hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
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
  try {
    const now = new Date().toLocaleString('pt-PT');
    await pool.query(
      "UPDATE documents SET status = 'signed', signed_at = $1 WHERE id = $2",
      [now, req.params.id]
    );
    res.json({ message: 'Documento assinado!', signedAt: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. INICIAR SERVIDOR (Sempre no fim do ficheiro)
const PORT = parseInt(process.env.PORT || '3000', 10);
console.log('Rotas registadas:', app._router.stack.filter(r => r.route).map(r => `${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`));
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});