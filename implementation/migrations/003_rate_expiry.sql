ALTER TABLE rate_buckets ADD COLUMN expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour';
CREATE INDEX rate_bucket_expiry ON rate_buckets(expires_at);
