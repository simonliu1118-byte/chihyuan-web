-- 自訂中國貨分「商品」「書籍」兩個區塊（使用者 2026-11-11）。區段代碼依來源種類解讀：
-- 自訂中國貨的 '' 是商品、'OTHER' 是書籍（沿用 ordering_lines.section 既有 CHECK，不重建表）。
-- 書籍的規格拆成「出版社」「作者」兩欄；商品照舊用規格。
ALTER TABLE ordering_lines ADD COLUMN publisher TEXT NOT NULL DEFAULT '' CHECK (length(publisher) <= 200);
ALTER TABLE ordering_lines ADD COLUMN author TEXT NOT NULL DEFAULT '' CHECK (length(author) <= 200);
-- 既有資料：規格填了「出版社/作者」的自訂中國貨列就是書籍（正式站 25 列，全在草稿）；
-- 第一個「/」之前是出版社、之後是作者，沒有「/」就整段當出版社。其餘留在商品。
UPDATE ordering_lines
   SET section = 'OTHER',
       publisher = trim(CASE WHEN instr(spec, '/') > 0 THEN substr(spec, 1, instr(spec, '/') - 1) ELSE spec END),
       author = trim(CASE WHEN instr(spec, '/') > 0 THEN substr(spec, instr(spec, '/') + 1) ELSE '' END),
       spec = ''
 WHERE spec <> ''
   AND section = ''
   AND order_id IN (SELECT o.id FROM ordering_orders o JOIN ordering_sources s ON s.id = o.source_id WHERE s.kind = 'CN_CUSTOM');
