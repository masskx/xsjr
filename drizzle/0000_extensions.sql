-- Extensions required by later migrations (citext columns, trigram title index).
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
