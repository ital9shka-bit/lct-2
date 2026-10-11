CREATE TABLE oidc_login_states(
 state_hash text PRIMARY KEY,
 verifier text NOT NULL,
 nonce text NOT NULL,
 consent_version text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE TABLE auth_identities(
 issuer text NOT NULL,
 subject text NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(issuer,subject),
 UNIQUE(issuer,user_id)
);
ALTER TABLE sessions ADD COLUMN auth_provider text NOT NULL DEFAULT 'email';
ALTER TABLE sessions ADD COLUMN oidc_id_token text;
