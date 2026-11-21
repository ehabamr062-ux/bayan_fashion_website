-- ============================================================================
-- 🚀 BAYAN POS Fashion — Supabase PostgreSQL Performance Indexes (Phase 1)
-- ============================================================================
-- الغرض: منع Full Table Scan عند 100,000 - 120,000+ فاتورة وآلاف الأصناف
-- عبر فهرسة نمط المعرف (id text_pattern_ops)، كود المحل (raw_json->>'shop_id')،
-- وتواريخ المزامنة التفاضلية (updated_at / created_at / date_iso).
--
-- ⚠️ ملاحظة تشغيل مهمة في Supabase SQL Editor:
-- أوامر CREATE INDEX CONCURRENTLY يجب تنفيذها خارج Transaction Block (شغّل كل أمر
-- أو شغّل السكربت في Supabase SQL Editor مباشرة دون BEGIN/COMMIT).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) جدول الأصناف (products)
-- ----------------------------------------------------------------------------
-- تسريع البحث بالبادئة: products?id=like.SHOP_PROD_%
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_id_pattern
    ON public.products (id text_pattern_ops);

-- تسريع المزامنة التفاضلية (Delta Sync): products?updated_at=gt.<last_sync_at>
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_updated_at_desc
    ON public.products (updated_at DESC);

-- فهرس مركب لكود المحل داخل raw_json مع تاريخ آخر تحديث
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_shop_updated
    ON public.products ((raw_json->>'shop_id'), updated_at DESC);

-- تسريع البحث بالباركود
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_barcode
    ON public.products (barcode);

-- ----------------------------------------------------------------------------
-- 2) جدول الفواتير والحركات (transactions)
-- ----------------------------------------------------------------------------
-- تسريع البحث بالبادئة: transactions?id=like.SHOP_%
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_id_pattern
    ON public.transactions (id text_pattern_ops);

-- تسريع الترتيب الزمني والمزامنة التفاضلية بـ created_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_created_at_desc
    ON public.transactions (created_at DESC);

-- فهرس مركب لكود المحل + تاريخ الإنشاء (يخدم Range Pagination و Delta Sync)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_shop_created_desc
    ON public.transactions ((raw_json->>'shop_id'), created_at DESC);

-- فهرس مركب لكود المحل + تاريخ الفاتورة date_iso (يخدم فلاتر الفترات الزمنية)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_shop_date_iso_desc
    ON public.transactions ((raw_json->>'shop_id'), date_iso DESC);

-- تسريع مطابقة رقم الفاتورة ومنع التكرار
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_invoice_id
    ON public.transactions (invoice_id);

-- ----------------------------------------------------------------------------
-- 3) جدول تدقيق الخزينة وإعدادات المتجر (treasury_audit)
-- ----------------------------------------------------------------------------
-- تسريع البحث بالبادئة (CONFIG_DEVICE_PAIRING_ / CONFIG_CUSTOMERS_LIST_ / SHOP_VOID_)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_treasury_audit_id_pattern
    ON public.treasury_audit (id text_pattern_ops);

-- تسريع استعلامات الفئة والتاريخ (void_tx / pair_event / اقتران)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_treasury_audit_cat_date_desc
    ON public.treasury_audit (category, date DESC);

-- فهرس مركب لكود المحل داخل raw_json مع التاريخ
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_treasury_audit_shop_date_desc
    ON public.treasury_audit ((raw_json->>'shop_id'), date DESC);

-- ----------------------------------------------------------------------------
-- 4) تحديث إحصائيات مخطط الاستعلام (Query Planner Statistics)
-- ----------------------------------------------------------------------------
ANALYZE public.products;
ANALYZE public.transactions;
ANALYZE public.treasury_audit;
