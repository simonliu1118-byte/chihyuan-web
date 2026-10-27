-- V0.9.43 (user 2026-10-28): 修改廠商 gets a 註記, up to 300 characters, several lines allowed.
ALTER TABLE ordering_sources ADD COLUMN note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300);
