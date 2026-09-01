CREATE TABLE learning_video_progress (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  content_version integer NOT NULL CHECK (content_version > 0),
  position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  completed boolean NOT NULL DEFAULT false,
  best_quiz_score smallint CHECK (best_quiz_score IS NULL OR best_quiz_score BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

CREATE TABLE learning_quiz_attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  content_version integer NOT NULL CHECK (content_version > 0),
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  correct_count smallint NOT NULL CHECK (correct_count >= 0),
  total_count smallint NOT NULL CHECK (total_count > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX learning_quiz_attempts_user_video_idx
  ON learning_quiz_attempts (user_id, video_id, created_at DESC);

CREATE TABLE learning_task_submissions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  content_version integer NOT NULL CHECK (content_version > 0),
  language text NOT NULL CHECK (language IN ('javascript')),
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 12000),
  passed_count smallint NOT NULL CHECK (passed_count >= 0),
  total_count smallint NOT NULL CHECK (total_count > 0),
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX learning_task_submissions_user_task_idx
  ON learning_task_submissions (user_id, task_id, created_at DESC);

CREATE TABLE learning_simulations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  specialty text NOT NULL CHECK (specialty IN ('Frontend','Backend','Mobile','QA')),
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 300 AND 3600),
  status text NOT NULL CHECK (status IN ('active','finished')),
  prompts jsonb NOT NULL CHECK (jsonb_typeof(prompts) = 'array'),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(answers) = 'array'),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX learning_simulations_user_updated_idx
  ON learning_simulations (user_id, updated_at DESC);
