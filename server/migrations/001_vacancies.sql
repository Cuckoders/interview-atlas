CREATE TABLE IF NOT EXISTS vacancy_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  base_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vacancies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id text NOT NULL UNIQUE,
  source_id bigint NOT NULL REFERENCES vacancy_sources(id),
  external_id text NOT NULL,
  canonical_url text NOT NULL UNIQUE,
  title text NOT NULL,
  company text NOT NULL,
  location text NOT NULL,
  work_format text NOT NULL CHECK (work_format IN ('Удалённо', 'Гибрид', 'Офис')),
  salary text,
  level text NOT NULL,
  specialty text NOT NULL CHECK (specialty IN ('Frontend', 'Backend', 'Mobile', 'QA')),
  skills text[] NOT NULL DEFAULT '{}',
  description text NOT NULL,
  published_at timestamptz NOT NULL,
  collected_at timestamptz NOT NULL,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (source_id, external_id)
);

CREATE TABLE IF NOT EXISTS vacancy_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vacancy_id bigint NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  UNIQUE (vacancy_id, payload_hash)
);

CREATE INDEX IF NOT EXISTS vacancies_feed_idx
  ON vacancies (specialty, published_at DESC, public_id DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS vacancies_work_format_feed_idx
  ON vacancies (work_format, published_at DESC, public_id DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS vacancy_snapshots_history_idx
  ON vacancy_snapshots (vacancy_id, fetched_at DESC);
