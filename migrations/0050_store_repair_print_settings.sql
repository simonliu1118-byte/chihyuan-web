-- V0.10.16 售後維修: a free 備註 on each repair, and the print settings (user 2026-11-04): the printed repair slip's heading, contact lines and
-- notes, and the thermal 維修資訊卡's heading and footer, are entered by the store, never written into the public repository. One row, created on first save.
CREATE TABLE store_repair_print_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 title TEXT NOT NULL DEFAULT '' CHECK(length(title)<=30),
 contact TEXT NOT NULL DEFAULT '' CHECK(length(contact)<=150),
 notes TEXT NOT NULL DEFAULT '' CHECK(length(notes)<=500),
 card_title TEXT NOT NULL DEFAULT '' CHECK(length(card_title)<=30),
 card_footer TEXT NOT NULL DEFAULT '' CHECK(length(card_footer)<=300),
 version INTEGER NOT NULL CHECK(version>0),
 updated_at TEXT NOT NULL,
 updated_by INTEGER NOT NULL REFERENCES app_members(id)
);

-- 備註 on the repair slip (user 2026-11-04), separate from 配件備註.
ALTER TABLE store_repairs ADD COLUMN note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=300);
