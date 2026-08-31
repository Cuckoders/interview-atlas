CREATE TABLE app_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 254),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 80),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  access_token_hash text NOT NULL UNIQUE CHECK (length(access_token_hash) = 64),
  refresh_token_hash text NOT NULL UNIQUE CHECK (length(refresh_token_hash) = 64),
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  device_name text NOT NULL CHECK (length(device_name) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX user_sessions_user_expiry_idx ON user_sessions (user_id, refresh_expires_at DESC);

CREATE TABLE user_sync_state (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  specialty text NOT NULL DEFAULT 'Frontend' CHECK (specialty IN ('Frontend','Backend','Mobile','QA')),
  saved_question_ids text[] NOT NULL DEFAULT '{}',
  saved_vacancy_ids text[] NOT NULL DEFAULT '{}',
  completed_task_ids text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_sync_actions (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  action_id text NOT NULL CHECK (length(action_id) BETWEEN 8 AND 100),
  action_type text NOT NULL CHECK (action_type IN ('set_specialty','set_question_saved','set_vacancy_saved','set_task_completed')),
  target_id text,
  value jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action_id)
);

CREATE INDEX user_sync_actions_received_idx ON user_sync_actions (user_id, received_at DESC);
