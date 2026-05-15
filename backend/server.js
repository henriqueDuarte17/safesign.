const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configuração da ligação à base de dados via Docker Compose
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'user_admin',
  host: process.env.DB_HOST || 'db',
  database: process.env.POSTGRES_DB || 'safesign_db',
  password: process.env.POSTGRES_PASSWORD || 'password123',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
});

// Rota de teste para ver se o backend está vivo
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'Backend Online', db_time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: 'Erro na ligação à DB', error: err.message });
  }
});

// Rota para Registar um Utilizador (POST)
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e password são obrigatórios.' });
  }

  try {
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING name, email',
      [name, email, password]
    );
    res.status(201).json({ message: 'Utilizador criado!', user: newUser.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: 'Este email já está registado.' });
    } else {
      res.status(500).json({ error: 'Erro no servidor: ' + err.message });
    }
  }
});

// Rota de login para autenticar o utilizador
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password são obrigatórios.' });
  }

  try {
    const result = await pool.query(
      'SELECT name, email, password FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0 || result.rows[0].password !== password) {
      return res.status(401).json({ error: 'Email ou password incorretos.' });
    }

    res.json({ message: 'Autenticado', user: { name: result.rows[0].name, email: result.rows[0].email } });
  } catch (err) {
    res.status(500).json({ error: 'Erro no servidor: ' + err.message });
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});