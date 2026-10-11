ALTER TABLE attempts DROP CONSTRAINT attempts_target_grade_check;
ALTER TABLE attempts ADD CONSTRAINT attempts_target_grade_check CHECK(target_grade IN ('Junior','Middle','Senior'));
ALTER TABLE credentials DROP CONSTRAINT credentials_grade_check;
ALTER TABLE credentials ADD CONSTRAINT credentials_grade_check CHECK(grade IN ('Junior','Middle','Senior'));
ALTER TABLE credentials ADD COLUMN specialization text NOT NULL DEFAULT 'Backend';
UPDATE credentials c SET specialization=a.specialization FROM attempts a WHERE a.id=c.attempt_id;
CREATE INDEX credential_specialization_grade ON credentials(owner_id,specialization,grade);
