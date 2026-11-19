-- Membership tiers named after the Chinese academic indexing ladder. Ranks leave gaps so a
-- future top-journal tier can be inserted above SCI without renumbering.
INSERT INTO "tiers" ("code", "rank", "label_zh") VALUES
  ('FREE', 0,  '免费'),
  ('EI',   10, 'EI 会员'),
  ('SCI',  20, 'SCI 会员')
ON CONFLICT ("code") DO NOTHING;
