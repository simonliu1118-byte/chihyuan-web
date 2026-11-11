-- 自訂中國貨分「商品」「書籍」兩個區塊（使用者 2026-11-11）。區段代碼依來源種類解讀：
-- 自訂中國貨的 '' 是商品、'OTHER' 是書籍（沿用 ordering_lines.section 既有 CHECK，不重建表）。
-- 既有資料：規格欄填了「出版社／作者」的列就是書籍（正式站 25 列，全在草稿）；其餘留在商品。
UPDATE ordering_lines SET section = 'OTHER'
 WHERE spec <> ''
   AND section = ''
   AND order_id IN (SELECT o.id FROM ordering_orders o JOIN ordering_sources s ON s.id = o.source_id WHERE s.kind = 'CN_CUSTOM');
