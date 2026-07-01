-- Full-text search generated columns + GIN indexes for direct and group messages (B219)
ALTER TABLE "DirectMessage" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
ALTER TABLE "GroupMessage" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX idx_direct_message_search ON "DirectMessage" USING GIN ("searchVector");
CREATE INDEX idx_group_message_search ON "GroupMessage" USING GIN ("searchVector");
