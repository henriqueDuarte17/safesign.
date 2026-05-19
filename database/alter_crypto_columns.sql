-- Atualiza o schema existente sem recriar o banco
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_key TEXT,
  ADD COLUMN IF NOT EXISTS private_key TEXT;

ALTER TABLE document_signers
  DROP CONSTRAINT IF EXISTS document_signers_signer_email_fkey;

ALTER TABLE document_signers
  ALTER COLUMN signer_email TYPE VARCHAR(100),
  ADD COLUMN IF NOT EXISTS signature_hash TEXT;
