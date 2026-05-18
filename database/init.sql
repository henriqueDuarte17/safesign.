-- Criar tabela de utilizadores
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password TEXT NOT NULL
);

-- Criar tabela de documentos
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(100) REFERENCES users(email),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50),
    original_name VARCHAR(255),
    file_type VARCHAR(20),
    size_bytes BIGINT,
    status VARCHAR(20) DEFAULT 'pending',
    data_url TEXT,
    hash VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_signers (
    id SERIAL PRIMARY KEY,
    document_id INT REFERENCES documents(id) ON DELETE CASCADE,
    signer_email VARCHAR(100) REFERENCES users(email),
    status VARCHAR(20) DEFAULT 'pending',
    signed_at VARCHAR(50)
);