ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN provider VARCHAR(50) NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN provider_id VARCHAR(255);

CREATE INDEX idx_users_provider ON users(provider, provider_id);
