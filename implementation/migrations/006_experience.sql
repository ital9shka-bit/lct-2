CREATE TABLE experience_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid UNIQUE NOT NULL REFERENCES users(id),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','submitted','in_review','needs_info','verified','partially_verified','not_verified','deferred','no_experience')),
 resume_state text, revision int NOT NULL DEFAULT 1, version int NOT NULL DEFAULT 1,
 entries jsonb NOT NULL DEFAULT '[]', decision jsonb, assigned_to uuid REFERENCES users(id),
 submitted_at timestamptz, reviewed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE experience_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, case_id uuid NOT NULL REFERENCES experience_cases(id),
 actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, state text NOT NULL,
 version int NOT NULL, snapshot jsonb NOT NULL, message text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX experience_queue ON experience_cases(state,submitted_at);
CREATE INDEX experience_history ON experience_events(case_id,id);
ALTER TABLE attempts ADD COLUMN assigned_reviewer uuid REFERENCES users(id);
ALTER TABLE review_decisions ADD COLUMN previous_result jsonb;
