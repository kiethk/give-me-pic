CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_code BIGINT NOT NULL UNIQUE,
    plan VARCHAR(20) NOT NULL,
    amount_vnd INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    payment_provider VARCHAR(30) NOT NULL DEFAULT 'payos',
    payment_reference VARCHAR(255),
    checkout_url VARCHAR(500),
    qr_code TEXT,
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);
CREATE INDEX idx_subscriptions_expires_at ON subscriptions(expires_at) WHERE status = 'active';

CREATE TABLE usage_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL,
    photos_uploaded_count INTEGER NOT NULL DEFAULT 0,
    questions_asked_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_usage_monthly_user_month UNIQUE (user_id, year_month)
);

-- Backfill storage_used_bytes from existing media_files
UPDATE users
SET storage_used_bytes = COALESCE(
    (SELECT SUM(m.size_bytes) FROM media_files m WHERE m.user_id = users.id),
    0
);

-- Seed usage_monthly for current UTC month from media_files
INSERT INTO usage_monthly (user_id, year_month, photos_uploaded_count)
SELECT
    m.user_id,
    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'),
    COUNT(*)::INTEGER
FROM media_files m
WHERE m.created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
GROUP BY m.user_id
ON CONFLICT (user_id, year_month) DO UPDATE
SET photos_uploaded_count = EXCLUDED.photos_uploaded_count,
    updated_at = now();

-- Seed usage_monthly for current UTC month from user chat_messages
INSERT INTO usage_monthly (user_id, year_month, questions_asked_count)
SELECT
    s.user_id,
    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'),
    COUNT(*)::INTEGER
FROM chat_messages m
JOIN chat_sessions s ON s.id = m.session_id
WHERE m.role = 'user'
  AND m.created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
GROUP BY s.user_id
ON CONFLICT (user_id, year_month) DO UPDATE
SET questions_asked_count = EXCLUDED.questions_asked_count,
    updated_at = now();
