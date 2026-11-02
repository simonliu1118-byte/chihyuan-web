-- Blacklist matching reads only rows sharing a contact number or LINE name (V0.9.66),
-- instead of the whole table on every order save and contact check.
CREATE INDEX idx_store_blacklist_phone ON store_blacklist(phone) WHERE phone<>'';
CREATE INDEX idx_store_blacklist_mobile ON store_blacklist(mobile) WHERE mobile<>'';
CREATE INDEX idx_store_blacklist_line ON store_blacklist(line_name) WHERE line_name<>'';
