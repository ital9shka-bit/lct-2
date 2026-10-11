CREATE TABLE vacancy_favorites(
 candidate_id uuid NOT NULL REFERENCES users(id),vacancy_id uuid NOT NULL REFERENCES vacancies(id),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(candidate_id,vacancy_id)
);
CREATE TABLE vacancy_preferences(
 candidate_id uuid PRIMARY KEY REFERENCES users(id),revision integer NOT NULL DEFAULT 1,
 filters jsonb NOT NULL DEFAULT '{"q":"","specialization":"","grade":"","work_mode":"","salary_floor":0,"skill":"","favorites_only":false,"sort":"newest"}'
);
ALTER TABLE applications DROP CONSTRAINT applications_state_check;
ALTER TABLE applications ADD CONSTRAINT applications_state_check CHECK(state IN('sent','viewed','reviewing','interview','rejected','withdrawn'));
CREATE TABLE application_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,application_id uuid NOT NULL REFERENCES applications(id),
 actor_id uuid NOT NULL REFERENCES users(id),actor_role text NOT NULL CHECK(actor_role IN('candidate','employer')),
 state text NOT NULL,message text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_events_history_idx ON application_events(application_id,id);
INSERT INTO application_events(application_id,actor_id,actor_role,state,created_at)
 SELECT id,candidate_id,'candidate','sent',created_at FROM applications;
INSERT INTO application_events(application_id,actor_id,actor_role,state,created_at)
 SELECT id,candidate_id,'candidate','withdrawn',updated_at FROM applications WHERE state='withdrawn';
