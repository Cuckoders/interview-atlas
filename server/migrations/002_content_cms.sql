CREATE TABLE IF NOT EXISTS content_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('question', 'task', 'video', 'track')),
  specialty text NOT NULL CHECK (specialty IN ('Frontend', 'Backend', 'Mobile', 'QA')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  version bigint NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'review', 'published', 'archived')),
  title text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  source_label text NOT NULL,
  source_url text,
  next_review_at timestamptz NOT NULL,
  editor text NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, version)
);

CREATE TABLE IF NOT EXISTS content_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  revision_id bigint NOT NULL REFERENCES content_revisions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS content_one_published_revision_idx
  ON content_revisions (item_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS content_public_feed_idx
  ON content_revisions (published_at DESC, item_id DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS content_items_type_specialty_idx
  ON content_items (content_type, specialty, id);
CREATE INDEX IF NOT EXISTS content_revisions_latest_idx
  ON content_revisions (item_id, version DESC);
CREATE INDEX IF NOT EXISTS content_review_queue_idx
  ON content_revisions (status, updated_at DESC) WHERE status IN ('draft', 'review');
CREATE INDEX IF NOT EXISTS content_events_item_history_idx
  ON content_events (item_id, created_at DESC);
