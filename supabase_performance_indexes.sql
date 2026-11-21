-- ============================================================================
-- 🚀 BAYAN POS Fashion — Supabase PostgreSQL Performance Indexes
-- ============================================================================
-- الغرض: منع Full Table Scan عند 100,000 - 120,000+ فاتورة وآلاف الأصناف
-- عبر فهرسة نمط المعرف (id text_pattern_ops)، كود المحل (raw_json->>'shop_id')،
-- وتواريخ المزامنة التفاضلية (updated_at / created_at / date_iso).
--
-- ✅ جاهز للتشغيل المباشر دفعة واحدة داخل Supabase SQL Editor (بدون CONCURRENTLY)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) جدول الأصناف (products)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_id_pattern
    ON public.products (id text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_products_updated_at_desc
    ON public.products (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_shop_updated
    ON public.products ((raw_json->>'shop_id'), updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_barcode
    ON public.products (barcode);

-- ----------------------------------------------------------------------------
-- 2) جدول الفواتير والحركات (transactions)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_id_pattern
    ON public.transactions (id text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at_desc
    ON public.transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_shop_created_desc
    ON public.transactions ((raw_json->>'shop_id'), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_shop_date_iso_desc
    ON public.transactions ((raw_json->>'shop_id'), date_iso DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id
    ON public.transactions (invoice_id);

-- ----------------------------------------------------------------------------
-- 3) جدول تدقيق الخزينة وإعدادات المتجر (treasury_audit)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_treasury_audit_id_pattern
    ON public.treasury_audit (id text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_treasury_audit_cat_date_desc
    ON public.treasury_audit (category, date DESC);

CREATE INDEX IF NOT EXISTS idx_treasury_audit_shop_date_desc
    ON public.treasury_audit ((raw_json->>'shop_id'), date DESC);

-- ----------------------------------------------------------------------------
-- 4) تحديث إحصائيات مخطط الاستعلام (Query Planner Statistics)
-- ----------------------------------------------------------------------------
ANALYZE public.products;
ANALYZE public.transactions;
ANALYZE public.treasury_audit;
