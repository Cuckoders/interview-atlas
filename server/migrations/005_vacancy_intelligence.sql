CREATE TABLE saved_vacancy_searches (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  query text CHECK (query IS NULL OR length(query) BETWEEN 1 AND 100),
  specialty text CHECK (specialty IS NULL OR specialty IN ('Frontend','Backend','Mobile','QA')),
  work_format text CHECK (work_format IS NULL OR work_format IN ('Удалённо','Гибрид','Офис')),
  notifications_enabled boolean NOT NULL DEFAULT false,
  interval_hours smallint NOT NULL DEFAULT 24 CHECK (interval_hours IN (6,24,168)),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX saved_vacancy_searches_user_updated_idx
  ON saved_vacancy_searches (user_id, updated_at DESC);

CREATE TABLE vacancy_alert_deliveries (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  search_id uuid NOT NULL REFERENCES saved_vacancy_searches(id) ON DELETE CASCADE,
  vacancy_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, search_id, vacancy_id)
);

CREATE INDEX vacancy_alert_deliveries_recent_idx
  ON vacancy_alert_deliveries (user_id, claimed_at DESC);

CREATE TABLE saved_vacancy_baselines (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  vacancy_id text NOT NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  fingerprint text NOT NULL CHECK (length(fingerprint) = 64),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, vacancy_id)
);

CREATE TABLE vacancy_preparation_plans (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  vacancy_id text NOT NULL,
  plan jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, vacancy_id)
);

CREATE INDEX vacancy_preparation_plans_user_updated_idx
  ON vacancy_preparation_plans (user_id, updated_at DESC);
