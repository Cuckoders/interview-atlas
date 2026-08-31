CREATE TABLE preparation_profiles (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  specialty text NOT NULL CHECK (specialty IN ('Frontend','Backend','Mobile','QA')),
  level text NOT NULL CHECK (level IN ('Junior','Middle','Senior')),
  target_date date NOT NULL,
  target_companies text[] NOT NULL DEFAULT '{}',
  sessions_per_week smallint NOT NULL CHECK (sessions_per_week BETWEEN 1 AND 7),
  session_minutes smallint NOT NULL CHECK (session_minutes BETWEEN 15 AND 120),
  reminders_enabled boolean NOT NULL DEFAULT false,
  reminder_hour smallint NOT NULL CHECK (reminder_hour BETWEEN 0 AND 23),
  reminder_minute smallint NOT NULL CHECK (reminder_minute BETWEEN 0 AND 59),
  quiet_start_minute smallint NOT NULL CHECK (quiet_start_minute BETWEEN 0 AND 1439),
  quiet_end_minute smallint NOT NULL CHECK (quiet_end_minute BETWEEN 0 AND 1439),
  timezone text NOT NULL,
  diagnostic_completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_skill_mastery (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  skill_key text NOT NULL,
  skill_label text NOT NULL,
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  repetition_count integer NOT NULL DEFAULT 0 CHECK (repetition_count >= 0),
  interval_days integer NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  next_review_at date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_key)
);

CREATE INDEX user_skill_mastery_due_idx ON user_skill_mastery (user_id, next_review_at, score);

CREATE TABLE current_preparation_plans (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  period_start date NOT NULL,
  period_end date NOT NULL,
  generated_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN ('onboarding','diagnostic','actual_progress','manual','new_period')),
  sessions jsonb NOT NULL CHECK (jsonb_typeof(sessions) = 'array')
);

CREATE TABLE preparation_actions (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  action_id text NOT NULL,
  session_id text NOT NULL,
  quality text NOT NULL CHECK (quality IN ('hard','good','easy')),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action_id)
);
