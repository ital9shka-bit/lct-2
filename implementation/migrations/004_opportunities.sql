CREATE TABLE demo_fixture_versions(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE vacancies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),need_id uuid NOT NULL REFERENCES needs(id),
 data jsonb NOT NULL,state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','published','archived')),
 revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,need_id)
);
CREATE INDEX vacancies_public_idx ON vacancies(state,created_at DESC);
CREATE TABLE applications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vacancy_id uuid NOT NULL REFERENCES vacancies(id),candidate_id uuid NOT NULL REFERENCES users(id),
 state text NOT NULL DEFAULT 'sent' CHECK(state IN('sent','withdrawn')),cover_letter text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(vacancy_id,candidate_id)
);
CREATE INDEX applications_candidate_idx ON applications(candidate_id,created_at DESC);
