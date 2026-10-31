/**
 * =========================================================================
 * ☁️ BAYAN POS - SUPABASE CLOUD SYNC ENGINE (Standalone Modular Architecture)
 * =========================================================================
 * نظام المزامنة السحابية المستقل لنظام بيان POS عبر Supabase.
 * - يعمل في الخلفية بنظام هادئ وغير معطل لنقطة البيع (Non-Blocking Background Worker).
 * - متوافق 100% مع العمل دون إنترنت (Offline-First): يحفظ محلياً أولاً في SQLite.
 * - يرفع الفواتير، الأصناف، المخزون، وسجلات الخزينة فور توفر الإنترنت.
 * - يدعم المزامنة ثنائية الاتجاه الحقيقية بين أجهزة الكمبيوتر والتابلت.
 * =========================================================================
 */

(function (window) {
    'use strict';

    const DEFAULT_CONFIG = {
        supabaseUrl: 'https://kxhhdskmpaiitsojwcgu.supabase.co',
        supabaseKey: 'sb_publishable_-4w34DQF7f2nsijk_xCuhg_NKWSHFoc',
        autoSyncEnabled: true,
        syncIntervalSeconds: 15
    };

    const BayanSupabaseSync = {
        isSyncing: false,
        isOnline: navigator.onLine,
        lastSyncTime: null,
        lastError: null,
        syncTimer: null,
        _isProcessingQueue: false,

        // 🔒 التحقق الصارم من صحة وعزل كود المحل (Strict Shop Isolation Validator)
        isValidShopId: function (id) {
            if (!id || typeof id !== 'string') return false;
            const clean = id.trim().replace(/[^A-Za-z0-9_]/g, '');
            return clean.startsWith('SHOP_') && clean !== 'SHOP_DEFAULT' && clean.length >= 10;
        },

        // 🔒 التحقق الحاسم من ترخيص المزامنة السحابية قبل أي اتصال بالسحابة
        _isAllowed: function () {
            if (typeof window.isCloudSyncAllowed === 'function') {
                return Boolean(window.isCloudSyncAllowed());
            }
            try {
                const isDev = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') || !window.electronAPI;
                const isExplicitCloudLicensed = (typeof getStore === 'function') && (getStore('bayan_cloud_sync_licensed') === 'true');
                if (isExplicitCloudLicensed || isDev) {
                    return true;
                }

                const plan = (typeof window.getBayanPlan === 'function')
                    ? window.getBayanPlan()
                    : (localStorage.getItem('bayan_current_plan') || '');
                if (!plan || plan.includes('مجانية') || plan.includes('تجريب') || plan.includes('أوفلاين') || plan.toLowerCase().includes('offline')) return false;
                const isCloud = plan.includes('سحاب') || plan.includes('Cloud');
                return Boolean(isCloud);
            } catch (e) {
                return false;
            }
        },

        // 🛡️ دالة اتصال آمنة وذكية مزودة بـ AbortController ومهلة زمنية لمنع تجميد أو رمي أخطاء حمراء بالكونسول
        _safeFetch: async function (url, options = {}, timeoutMs = 8000) {
            if (!navigator.onLine) {
                return {
                    ok: false,
                    status: 0,
                    statusText: 'Offline',
                    json: async () => [],
                    text: async () => 'offline'
                };
            }
            const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            let timeoutId = null;
            if (controller) {
                timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            }
            try {
                const opt = controller ? { ...options, signal: controller.signal } : options;
                const res = await fetch(url, opt);
                if (timeoutId) clearTimeout(timeoutId);
                return res;
            } catch (err) {
                if (timeoutId) clearTimeout(timeoutId);
                return {
                    ok: false,
                    status: 0,
                    statusText: err.message || 'NetworkError',
                    json: async () => [],
                    text: async () => err.message || ''
                };
            }
        },

        // 🏪 استرجاع أو تثبيت معرّف المحل الفريد المستقر والمحمي من التغير (Shop Isolation & Lock)
        getShopId: function () {
            let shopId = (typeof getStore === 'function' ? getStore('bayan_shop_id') : null) || localStorage.getItem('bayan_shop_id');
            if (!shopId) {
                try {
                    const settings = (typeof getStore === 'function')
                        ? JSON.parse(getStore('pos_settings') || '{}')
                        : JSON.parse(localStorage.getItem('pos_settings') || '{}');
                    if (settings.shopId) shopId = settings.shopId;
                } catch (e) { }
            }

            // 🔒 حظر إعادة التوليد العشوائي: إذا لم يتوفر بعد ولم تكتمل تهيئة الـ Store، لا نولد فوراً بل ننتظر
            if (!shopId) {
                if (typeof window !== 'undefined' && !window._appStoreInitialized && typeof localStorage !== 'undefined') {
                    const cachedLocal = localStorage.getItem('bayan_shop_id');
                    if (cachedLocal) shopId = cachedLocal;
                }
            }

            // تطهير المعرف والتحقق من صلاحه
            if (shopId) {
                shopId = String(shopId).trim().replace(/[^A-Za-z0-9_]/g, '');
                if (!shopId.startsWith('SHOP_') || shopId === 'SHOP_DEFAULT' || shopId.length < 10) {
                    shopId = null;
                }
            }

            // توليد لمرة واحدة فقط عند أول تثبيت في تاريخ البرنامج
            if (!shopId) {
                const randPart = (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID().replace(/-/g, '').substring(0, 10).toUpperCase()
                    : (Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 6)).toUpperCase();
                shopId = 'SHOP_' + randPart;
                localStorage.setItem('bayan_shop_id', shopId);
                if (typeof setStore === 'function') setStore('bayan_shop_id', shopId);
                try {
                    const curSettings = JSON.parse((typeof getStore === 'function' ? getStore('pos_settings') : null) || localStorage.getItem('pos_settings') || '{}');
                    curSettings.shopId = shopId;
                    if (typeof setStore === 'function') setStore('pos_settings', JSON.stringify(curSettings));
                } catch (e) { }
                console.log("🔒 [SupabaseSync] تم توليد وتثبيت كود المحل السحابي الدائم لأول مرة:", shopId);
            }
            return shopId;
        },

        // ✏️ تعيين وتوحيد كود المحل السحابي (Shop ID) لربط جهازين معاً كمرآة واحدة بأمان تام
        setShopId: function (newId) {
            const clean = String(newId || '').trim().replace(/[^A-Za-z0-9_]/g, '');
            if (!clean || clean.length < 5) return false;
            const finalId = clean.startsWith('SHOP_') ? clean : ('SHOP_' + clean);
            if (!this.isValidShopId(finalId)) {
                console.warn('[SupabaseSync] كود المحل غير صالح:', finalId);
                return false;
            }
            localStorage.setItem('bayan_shop_id', finalId);
            if (typeof setStore === 'function') {
                setStore('bayan_shop_id', finalId);
            }
            try {
                const curSettings = JSON.parse((typeof getStore === 'function' ? getStore('pos_settings') : null) || localStorage.getItem('pos_settings') || '{}');
                curSettings.shopId = finalId;
                if (typeof setStore === 'function') setStore('pos_settings', JSON.stringify(curSettings));
            } catch (e) { }
            try {
                const cfg = this.getConfig();
                cfg.shopId = finalId;
                this.saveConfig(cfg);
            } catch (e) { }

            // تصفير طوابع المزامنة السابقة لفرض سحب شامل وتحديث كامل للبيانات
            localStorage.removeItem('bayan_sb_last_tx_time');
            localStorage.removeItem('bayan_sb_last_prod_sync_time');
            if (window._bayan_synced_prod_fps) window._bayan_synced_prod_fps.clear();

            const badge = document.getElementById('supabaseShopIdBadge');
            if (badge) badge.textContent = finalId;

            // رفع السجل الإقراني فوراً بالمعرف الجديد
            this.syncPairingPin().catch(() => { });

            return finalId;
        },

        // 📋 نسخ كود المحل السحابي إلى الحافظة
        copyShopId: function () {
            const id = this.getShopId();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(id).then(() => {
                    if (typeof showToast === 'function') {
                        showToast(`📋 تم نسخ كود المحل السحابي (${id}) بنجاح!`, 'success');
                    } else {
                        alert(`📋 تم نسخ كود المحل السحابي:\n${id}`);
                    }
                }).catch(() => {
                    prompt('انسخ كود المحل السحابي الخاص بهذا الجهاز:', id);
                });
            } else {
                prompt('انسخ كود المحل السحابي الخاص بهذا الجهاز:', id);
            }
        },

        // 🔗 نافذة تفاعلية لإدخال كود محل وربط هذا الجهاز بجهاز رئيسي آخر فوراً
        promptLinkShopId: async function () {
            const current = this.getShopId();
            const input = prompt(
                `🔗 ربط هذا الجهاز بجهاز آخر كمرآة سحابية موحدة:\n\nأدخل كود المحل السحابي (Shop ID) الخاص بالجهاز الرئيسي:\n(يبدأ بـ SHOP_):`,
                current
            );
            if (!input || !input.trim()) return;
            const clean = input.trim();
            if (clean === current) {
                if (typeof showToast === 'function') showToast('ℹ️ هذا الجهاز مرتبط بالفعل بهذا الكود.', 'info');
                return;
            }
            if (clean.length < 5) {
                alert('⚠️ كود المحل غير صالح. يرجى التأكد من كتابة الكود بشكل صحيح.');
                return;
            }
            const confirmed = confirm(
                `هل أنت متأكد من ربط هذا الجهاز بكود المحل (${clean})؟\n\nسيتم توحيد قاعدة البيانات السحابية وسحب كافة أصناف وحسابات وفواتير المحل المرتبط فوراً.`
            );
            if (!confirmed) return;

            this.setShopId(clean);
            if (typeof showToast === 'function') {
                showToast(`🔗 تم ربط الجهاز بكود المحل (${clean}) بنجاح! جاري سحب البيانات كمرآة سحابية...`, 'success', 6000);
            }
            await this.runFullSync(true);
        },

        // 🔐 استرجاع أو توليد رمز الاقتران PIN الفريد لهذا المحل (منع الـ 2026 الافتراضية وحفظه في SQLite)
        getPairingPin: function () {
            let pin = (typeof getStore === 'function' ? getStore('bayan_shop_pin') : null) || localStorage.getItem('bayan_shop_pin');
            if (!pin || pin === '2026') {
                // توليد رمز PIN عشوائي فريد مكون من 6 أرقام يمنع تداخل المتاجر نهائياً
                pin = Math.floor(100000 + Math.random() * 900000).toString();
                localStorage.setItem('bayan_shop_pin', pin);
                if (typeof setStore === 'function') setStore('bayan_shop_pin', pin);
                console.log("🔐 [SupabaseSync] تم توليد رمز PIN فريد للمحل:", pin);
            }
            return pin;
        },

        // ✏️ تعيين وتحديث رمز PIN الخاص بالمحل وحفظه في SQLite والسحابة
        setPairingPin: function (newPin) {
            const clean = String(newPin || '').trim();
            if (clean && clean.length >= 4) {
                localStorage.setItem('bayan_shop_pin', clean);
                if (typeof setStore === 'function') setStore('bayan_shop_pin', clean);
                this.syncPairingPin(clean).catch(() => { });
                return true;
            }
            return false;
        },

        // ⚙️ استرجاع إعدادات المزامنة السحابية من SQLite والتخزين المحلي
        getConfig: function () {
            let saved = {};
            try {
                const rawCfg = (typeof getStore === 'function' ? getStore('bayan_supabase_config') : null) || localStorage.getItem('bayan_supabase_config');
                saved = JSON.parse(rawCfg || '{}');
            } catch (e) { }
            return {
                supabaseUrl: (saved.supabaseUrl || DEFAULT_CONFIG.supabaseUrl).replace(/\/+$/, ''),
                supabaseKey: saved.supabaseKey || DEFAULT_CONFIG.supabaseKey,
                shopId: saved.shopId || this.getShopId(),
                autoSyncEnabled: saved.autoSyncEnabled !== undefined ? Boolean(saved.autoSyncEnabled) : DEFAULT_CONFIG.autoSyncEnabled,
                syncIntervalSeconds: parseInt(saved.syncIntervalSeconds, 10) || 45
            };
        },

        // 💾 حفظ إعدادات المزامنة في SQLite و localStorage
        saveConfig: function (newConfig) {
            const current = this.getConfig();
            const merged = { ...current, ...newConfig };
            const jsonStr = JSON.stringify(merged);
            localStorage.setItem('bayan_supabase_config', jsonStr);
            if (typeof setStore === 'function') setStore('bayan_supabase_config', jsonStr);
            this.restartSyncTimer();
            return merged;
        },

        // 📡 ترويسات الطلبات السحابية لـ Supabase REST API
        _getHeaders: function () {
            const cfg = this.getConfig();
            return {
                'apikey': cfg.supabaseKey,
                'Authorization': `Bearer ${cfg.supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            };
        },

        // ⚡ اختبار الاتصال بمشروع Supabase السحابي
        testConnection: async function () {
            // فحص ترخيص المزامنة السحابية أولاً
            if (!this._isAllowed()) {
                const st = (typeof window.getCloudSyncStatus === 'function') ? window.getCloudSyncStatus() : {};
                const reasonMsg = (st.reason === 'cloud_server_expired')
                    ? '⚠️ انتهت صلاحية السيرفر السحابي الخاص بك. يرجى تجديد الاشتراك السحابي لمواصلة المزامنة.'
                    : '🔒 خدمة المزامنة السحابية غير مفعلة في باقتك الحالية (مقتصرة على باقات المزامنة السحابية). باقتك الحالية ترخيص محلي أوفلاين.';
                return { success: false, message: reasonMsg, locked: true };
            }

            const cfg = this.getConfig();
            if (!cfg.supabaseUrl || !cfg.supabaseKey) {
                return { success: false, message: 'بيانات رابط المشروع أو المفتاح غير مكتملة' };
            }
            try {
                let res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/products?select=id&limit=1`, {
                    method: 'GET',
                    headers: this._getHeaders()
                });
                if (!res.ok) {
                    res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/?limit=1`, {
                        method: 'GET',
                        headers: this._getHeaders()
                    });
                }
                if (res.ok || res.status === 200 || res.status === 204) {
                    this.isOnline = true;
                    return { success: true, message: 'تم الاتصال بسحابة Supabase بنجاح والجداول جاهزة 🟢' };
                } else {
                    const errTxt = await res.text();
                    return { success: false, message: `تعذر الاتصال بالسيرفر السحابي: (${res.statusText || res.status || 'أوفلاين'})`, details: errTxt };
                }
            } catch (err) {
                return { success: false, message: 'تعذر الاتصال بالإنترنت أو بالسيرفر السحابي', error: err.message };
            }
        },

        // =========================================================================
        // 📦 نظام طابور المزامنة المحلي التسلسلي (Local Sync Queue - FIFO Engine)
        // =========================================================================
        // يضمن عدم ضياع أي فاتورة أو حركة مالية أثناء انقطاع الإنترنت،
        // حيث تحفظ الحركات أوفلاين محلياً فوراً، وترفع بالتسلسل الزمني الدقيق عند توفر الاتصال.
        addToSyncQueue: async function (type, action, data) {
            if (!data) return false;
            const timestamp = new Date().toISOString();
            const cleanAction = action || 'upsert';
            const cleanType = type || 'transaction';
            const rawJson = (typeof data === 'object') ? JSON.stringify(data) : String(data);
            const item = {
                timestamp,
                action: cleanAction,
                type: cleanType,
                status: 'pending',
                raw_json: rawJson
            };

            // 1. الحفظ الفوري المباشر في محرك SQLite إذا كان متاحاً
            if (window.sqliteManager && window.sqliteManager.db) {
                try {
                    window.sqliteManager.db.run(
                        `INSERT INTO syncQueue (timestamp, action, type, status, raw_json) VALUES (?, ?, ?, 'pending', ?);`,
                        [timestamp, cleanAction, cleanType, rawJson]
                    );
                    if (typeof window.sqliteManager.schedulePersist === 'function') {
                        window.sqliteManager.schedulePersist(400);
                    }
                    return true;
                } catch (e) {
                    console.warn('[SupabaseSync] خطأ إضافة لطابور SQLite:', e.message);
                }
            }

            // 2. الحفظ في طبقة Dexie / DB Adapter
            if (window.db && window.db.syncQueue && typeof window.db.syncQueue.put === 'function') {
                try {
                    await window.db.syncQueue.put(item);
                    return true;
                } catch (e) { }
            }

            // 3. تخزين احتياطي محلي في localStorage
            try {
                const memQ = JSON.parse(localStorage.getItem('bayan_sync_queue_fallback') || '[]');
                item.id = Date.now() + Math.floor(Math.random() * 1000);
                memQ.push(item);
                if (memQ.length > 500) memQ.splice(0, memQ.length - 500);
                localStorage.setItem('bayan_sync_queue_fallback', JSON.stringify(memQ));
                return true;
            } catch (e) { }

            return false;
        },

        getPendingSyncQueue: async function (limit = 50) {
            // 1. القراءة من محرك SQLite
            if (window.sqliteManager && window.sqliteManager.db) {
                try {
                    let rows = [];
                    if (window.sqliteManager.nativeDb) {
                        rows = window.sqliteManager.nativeDb.prepare(
                            `SELECT id, timestamp, action, type, status, raw_json FROM syncQueue WHERE status = 'pending' ORDER BY id ASC LIMIT ?;`
                        ).all(limit);
                    } else {
                        const stmt = window.sqliteManager.db.prepare(
                            `SELECT id, timestamp, action, type, status, raw_json FROM syncQueue WHERE status = 'pending' ORDER BY id ASC LIMIT ?;`
                        );
                        stmt.bind([limit]);
                        while (stmt.step()) {
                            rows.push(stmt.getAsObject());
                        }
                        stmt.free();
                    }
                    if (rows && rows.length > 0) return rows;
                } catch (e) {
                    console.warn('[SupabaseSync] خطأ قراءة طابور SQLite:', e.message);
                }
            }

            // 2. القراءة من محرك Dexie / DB Adapter
            if (window.db && window.db.syncQueue && typeof window.db.syncQueue.where === 'function') {
                try {
                    const dexRows = await window.db.syncQueue.where('status').equals('pending').limit(limit).toArray();
                    if (dexRows && dexRows.length > 0) return dexRows;
                } catch (e) { }
            }

            // 3. القراءة من الاحتياطي المحلي
            try {
                const memQ = JSON.parse(localStorage.getItem('bayan_sync_queue_fallback') || '[]');
                return memQ.filter(i => i && i.status === 'pending').slice(0, limit);
            } catch (e) {
                return [];
            }
        },

        removeSyncQueueItem: async function (id) {
            if (!id) return;
            if (window.sqliteManager && window.sqliteManager.db) {
                try {
                    window.sqliteManager.db.run(`DELETE FROM syncQueue WHERE id = ?;`, [id]);
                } catch (e) { }
            }
            if (window.db && window.db.syncQueue && typeof window.db.syncQueue.delete === 'function') {
                try {
                    await window.db.syncQueue.delete(id);
                } catch (e) { }
            }
            try {
                let memQ = JSON.parse(localStorage.getItem('bayan_sync_queue_fallback') || '[]');
                memQ = memQ.filter(i => String(i.id) !== String(id));
                localStorage.setItem('bayan_sync_queue_fallback', JSON.stringify(memQ));
            } catch (e) { }
        },

        processSyncQueue: async function () {
            if (this._isProcessingQueue) return 0;
            if (!navigator.onLine || !this._isAllowed()) return 0;
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this.isValidShopId(shopId)) return 0;

            this._isProcessingQueue = true;
            let processed = 0;
            try {
                const queue = await this.getPendingSyncQueue(50);
                if (!queue || queue.length === 0) return 0;

                for (const qItem of queue) {
                    let data = null;
                    try {
                        data = typeof qItem.raw_json === 'string' ? JSON.parse(qItem.raw_json) : qItem.raw_json;
                    } catch (e) {
                        // تالف: حذفه لتفادي تعليق الطابور
                        await this.removeSyncQueueItem(qItem.id);
                        continue;
                    }

                    let success = false;
                    if (qItem.type === 'transaction') {
                        success = await this._pushSingleTransactionData(data, shopId, cfg);
                    } else if (qItem.type === 'product') {
                        success = await this._pushSingleProductData(data, shopId, cfg);
                    } else if (qItem.type === 'void') {
                        success = await this.deleteInvoiceFromCloud(data.invoiceId, data.total, data.warehouse);
                    } else if (qItem.type === 'treasury') {
                        success = await this.syncTreasuryAudit();
                    }

                    if (success) {
                        await this.removeSyncQueueItem(qItem.id);
                        processed++;
                    } else {
                        // توقف فوري عند أول خطأ شبكة للحفاظ على الترتيب الصارم FIFO
                        break;
                    }
                }
            } catch (qErr) {
                console.warn('[SupabaseSync] خطأ أثناء تفريغ طابور المزامنة:', qErr.message);
            } finally {
                this._isProcessingQueue = false;
            }
            return processed;
        },

        _pushSingleTransactionData: async function (data, shopId, cfg) {
            try {
                if (!data) return false;
                // إذا كانت البيانات مجهزة مسبقاً بصيغة جدول transactions في Supabase
                if (data.id && data.invoice_id && data.raw_json) {
                    const res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/transactions?on_conflict=id`, {
                        method: 'POST',
                        headers: this._getHeaders(),
                        body: JSON.stringify([data])
                    });
                    return Boolean(res.ok || res.status === 201 || res.status === 200);
                }

                const rows = Array.isArray(data) ? data : (data.itemsList ? [data] : [data]);
                const headRow = rows.find(r => r && r.isInvoiceHead) || rows[0];
                if (!headRow) return false;

                const localInvId = String(headRow.invoiceId || headRow.id || '')
                    .replace(new RegExp(`^${shopId}_(DESK_|MOB_)?`, 'i'), '')
                    .replace(/^#/, '')
                    .trim();
                if (!localInvId) return false;

                const isVoucher = (headRow.type || '').includes('قبض') || (headRow.type || '').includes('صرف');
                const itemsList = rows.map(r => ({
                    productId: r.productId || r.id || '',
                    id: r.productId || r.id || '',
                    name: r.product || r.name || (isVoucher ? headRow.type : 'صنف'),
                    product: r.product || r.name || (isVoucher ? headRow.type : 'صنف'),
                    quantity: parseFloat(r.qty !== undefined ? r.qty : (r.quantity || 1)),
                    qty: parseFloat(r.qty !== undefined ? r.qty : (r.quantity || 1)),
                    price: parseFloat(r.price || 0),
                    total: parseFloat(r.total || 0),
                    cost: parseFloat(r.cost || 0),
                    profit: parseFloat(r.profit || 0),
                    unit: r.unit || 'قطعة',
                    size: r.size || r.selectedSize || '',
                    color: r.color || r.selectedColor || '',
                    barcode: r.barcode || '',
                    notes: r.notes || ''
                }));

                const calcTotal = rows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
                const grandTotal = (headRow.invoiceGrandTotal !== undefined && headRow.invoiceGrandTotal !== 0)
                    ? parseFloat(headRow.invoiceGrandTotal)
                    : (parseFloat(headRow.total) || calcTotal);

                const payload = [{
                    id: `${shopId}_DESK_${localInvId}`,
                    invoice_id: localInvId,
                    date_iso: headRow.dateISO || headRow.date || new Date().toISOString(),
                    time: headRow.time || headRow.timeISO || '',
                    type: headRow.type || 'مبيعات',
                    partner: headRow.partner || 'عميل نقدي',
                    total: grandTotal,
                    paid_amount: parseFloat(headRow.paidAmount !== undefined ? headRow.paidAmount : (headRow.isInvoiceHead ? grandTotal : 0)) || 0,
                    remaining: parseFloat(headRow.remaining !== undefined ? headRow.remaining : 0) || 0,
                    method: headRow.method || 'كاش',
                    cashier: headRow.cashier || headRow.user || 'المدير',
                    warehouse: headRow.warehouse || 'المخزن الرئيسي',
                    raw_json: {
                        ...headRow,
                        items: itemsList,
                        shop_id: shopId,
                        invoiceId: localInvId,
                        total: grandTotal,
                        invoiceGrandTotal: grandTotal,
                        voucherCategory: headRow.voucherCategory || headRow.category || null,
                        source: 'desktop',
                        terminalLetter: 'D'
                    }
                }];

                const res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/transactions?on_conflict=id`, {
                    method: 'POST',
                    headers: this._getHeaders(),
                    body: JSON.stringify(payload)
                });

                return Boolean(res.ok || res.status === 201 || res.status === 200);
            } catch (e) {
                return false;
            }
        },

        _pushSingleProductData: async function (p, shopId, cfg) {
            try {
                if (!p) return false;
                const localProdId = String(p.id || p.barcode || Math.random().toString(36).substring(2, 9));
                const payload = [{
                    id: `${shopId}_PROD_${localProdId}`,
                    name: p.name || 'صنف',
                    barcode: p.barcode || '',
                    category: p.category || 'عام',
                    unit: p.unit || 'قطعة',
                    cost: parseFloat(p.cost) || 0,
                    price: parseFloat(p.price) || 0,
                    wholesale: parseFloat(p.wholesale) || 0,
                    stock: parseFloat(p.stock) || 0,
                    raw_json: { ...p, localId: p.id, shop_id: shopId },
                    updated_at: new Date().toISOString()
                }];
                const res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/products?on_conflict=id`, {
                    method: 'POST',
                    headers: this._getHeaders(),
                    body: JSON.stringify(payload)
                });
                return Boolean(res.ok || res.status === 201 || res.status === 200);
            } catch (e) {
                return false;
            }
        },

        // 📦 1. مزامنة الفواتير والمبيعات والحركات مع جدول transactions
        syncTransactions: async function () {
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;
            if (!this.isValidShopId(shopId)) return 0;

            // تفريغ طابور العمليات المعلقة أولاً بالترتيب الزمني FIFO
            await this.processSyncQueue().catch(() => { });

            const allTx = (typeof transactions !== 'undefined' && Array.isArray(transactions))
                ? transactions
                : (window.transactions || []);

            if (allTx.length === 0) return 0;

            const lastSyncTs = parseInt(localStorage.getItem('bayan_sb_last_tx_time') || '0', 10);

            // رفع الفواتير والحركات المعدلة/الجديدة
            let targetTx = allTx;
            if (lastSyncTs > 0) {
                targetTx = allTx.filter(t => {
                    if (!t) return false;
                    const tTime = t.updatedAt || t.timestamp || (t.dateISO ? new Date(t.dateISO).getTime() : 0);
                    return !tTime || tTime >= (lastSyncTs - 60000); // بهامش أمان دقيقة
                });
                if (targetTx.length === 0) {
                    targetTx = allTx.slice(-150);
                }
            } else {
                targetTx = allTx.slice(-500);
            }

            // تجميع أسطر الفاتورة الواحدة في كائن موحد يضم مصفوفة items لمنع استبدال الأصناف في السحابة
            const groupedMap = new Map();
            targetTx.forEach(t => {
                if (!t) return;
                const localInvId = String(t.invoiceId || t.id || Math.random().toString(36).substring(2, 9))
                    .replace(new RegExp(`^${shopId}_(DESK_|MOB_)?`, 'i'), '')
                    .replace(/^#/, '')
                    .trim();
                if (!groupedMap.has(localInvId)) {
                    const invoiceRows = allTx.filter(row => {
                        if (!row) return false;
                        const rInv = String(row.invoiceId || row.id || '').replace(new RegExp(`^${shopId}_(DESK_|MOB_)?`, 'i'), '').replace(/^#/, '').trim();
                        return rInv === localInvId;
                    });
                    groupedMap.set(localInvId, invoiceRows.length > 0 ? invoiceRows : [t]);
                }
            });

            const toSend = [];
            groupedMap.forEach((rows, localInvId) => {
                const headRow = rows.find(r => r.isInvoiceHead) || rows[0];
                const isVoucher = (headRow.type || '').includes('قبض') || (headRow.type || '').includes('صرف');

                const itemsList = rows.map(r => ({
                    productId: r.productId || r.id || '',
                    id: r.productId || r.id || '',
                    name: r.product || r.name || (isVoucher ? headRow.type : 'صنف'),
                    product: r.product || r.name || (isVoucher ? headRow.type : 'صنف'),
                    quantity: parseFloat(r.qty !== undefined ? r.qty : (r.quantity || 1)),
                    qty: parseFloat(r.qty !== undefined ? r.qty : (r.quantity || 1)),
                    price: parseFloat(r.price || 0),
                    total: parseFloat(r.total || 0),
                    cost: parseFloat(r.cost || 0),
                    profit: parseFloat(r.profit || 0),
                    unit: r.unit || 'قطعة',
                    size: r.size || r.selectedSize || '',
                    color: r.color || r.selectedColor || '',
                    barcode: r.barcode || '',
                    notes: r.notes || ''
                }));

                const calcTotal = rows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
                const grandTotal = (headRow.invoiceGrandTotal !== undefined && headRow.invoiceGrandTotal !== 0)
                    ? parseFloat(headRow.invoiceGrandTotal)
                    : (parseFloat(headRow.total) || calcTotal);

                toSend.push({
                    id: `${shopId}_DESK_${localInvId}`,
                    invoice_id: localInvId,
                    date_iso: headRow.dateISO || headRow.date || new Date().toISOString(),
                    time: headRow.time || headRow.timeISO || '',
                    type: headRow.type || 'مبيعات',
                    partner: headRow.partner || 'عميل نقدي',
                    total: grandTotal,
                    paid_amount: parseFloat(headRow.paidAmount !== undefined ? headRow.paidAmount : (headRow.isInvoiceHead ? grandTotal : 0)) || 0,
                    remaining: parseFloat(headRow.remaining !== undefined ? headRow.remaining : 0) || 0,
                    method: headRow.method || 'كاش',
                    cashier: headRow.cashier || headRow.user || 'المدير',
                    warehouse: headRow.warehouse || 'المخزن الرئيسي',
                    raw_json: {
                        ...headRow,
                        items: itemsList,
                        shop_id: shopId,
                        invoiceId: localInvId,
                        total: grandTotal,
                        invoiceGrandTotal: grandTotal,
                        voucherCategory: headRow.voucherCategory || headRow.category || null,
                        source: 'desktop',
                        terminalLetter: 'D'
                    }
                });
            });

            if (toSend.length === 0) return 0;

            const CHUNK_SIZE = 100;
            let totalSent = 0;
            for (let i = 0; i < toSend.length; i += CHUNK_SIZE) {
                const chunk = toSend.slice(i, i + CHUNK_SIZE);
                const res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/transactions?on_conflict=id`, {
                    method: 'POST',
                    headers: this._getHeaders(),
                    body: JSON.stringify(chunk)
                });

                if (res.ok || res.status === 201 || res.status === 200) {
                    totalSent += chunk.length;
                } else {
                    // في حال فشل الإرسال المباشر لأي دفعة، يتم إدراجها فوراً في طابور FIFO للحفاظ عليها
                    for (const item of chunk) {
                        await this.addToSyncQueue('transaction', 'upsert', item);
                    }
                }

                if (i + CHUNK_SIZE < toSend.length) {
                    await new Promise(r => setTimeout(r, 60));
                }
            }

            localStorage.setItem('bayan_sb_last_tx_time', String(Date.now()));
            return totalSent;
        },

        // 👗 2. مزامنة الأصناف والمخزون ذكية وعالية الأداء (Delta Fingerprint Engine)
        syncProducts: async function (forceAll = false) {
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;
            if (!this.isValidShopId(shopId)) return 0;

            const pList = (typeof productsDB !== 'undefined' && Array.isArray(productsDB))
                ? productsDB
                : (window.productsDB || []);

            if (pList.length === 0) return 0;

            const prodFps = window._bayan_synced_prod_fps || (window._bayan_synced_prod_fps = new Map());

            // دالة استخراج بصمة خفيفة وسريعة للصنف لمقارنة التغييرات
            const getProdFp = (p) => {
                const vStr = (p.variants && Array.isArray(p.variants)) ? p.variants.map(v => `${v.size}:${v.color}:${v.stock}`).join(';') : '';
                return `${p.price}|${p.cost}|${p.stock}|${p.wholesale}|${p.name}|${p.barcode}|${vStr}`;
            };

            // تحديد الأصناف المطلوب رفعها: الكل عند المزامنة اليدوية الشاملة، أو المعدلة فقط بالدورة التلقائية
            let toSendList = pList;
            if (!forceAll && prodFps.size > 0) {
                toSendList = pList.filter(p => prodFps.get(String(p.id)) !== getProdFp(p));
            }

            let totalSent = 0;
            if (toSendList.length > 0) {
                const toSend = toSendList.map(p => {
                    const localProdId = String(p.id || p.barcode || Math.random().toString(36).substring(2, 9));
                    return {
                        id: `${shopId}_PROD_${localProdId}`,
                        name: p.name || 'صنف',
                        barcode: p.barcode || '',
                        category: p.category || 'عام',
                        unit: p.unit || 'قطعة',
                        cost: parseFloat(p.cost) || 0,
                        price: parseFloat(p.price) || 0,
                        wholesale: parseFloat(p.wholesale) || 0,
                        stock: parseFloat(p.stock) || 0,
                        raw_json: { ...p, localId: p.id, shop_id: shopId },
                        updated_at: new Date().toISOString()
                    };
                });

                const CHUNK_SIZE = 100;
                for (let i = 0; i < toSend.length; i += CHUNK_SIZE) {
                    const batch = toSend.slice(i, i + CHUNK_SIZE);
                    const res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/products?on_conflict=id`, {
                        method: 'POST',
                        headers: this._getHeaders(),
                        body: JSON.stringify(batch)
                    });

                    if (res.ok || res.status === 201 || res.status === 200) {
                        totalSent += batch.length;
                        // تحديث بصمات الأصناف المرفوعة بنجاح
                        batch.forEach(b => {
                            const rawId = b.raw_json ? String(b.raw_json.localId) : '';
                            const pItem = pList.find(p => String(p.id) === rawId);
                            if (pItem) prodFps.set(String(pItem.id), getProdFp(pItem));
                        });
                    }

                    if (i + CHUNK_SIZE < toSend.length) {
                        await new Promise(r => setTimeout(r, 60));
                    }
                }
                localStorage.setItem('bayan_sb_last_prod_sync_time', String(Date.now()));
            }

            // 📥 استيراد وتحديث الأصناف (Pull & Apply Updates)
            let hasUpdatedLocalProducts = false;
            let newImportedCount = 0;
            let updatedLocalCount = 0;

            try {
                const remoteRes = await this._safeFetch(
                    `${cfg.supabaseUrl}/rest/v1/products?id=like.${encodeURIComponent(shopId)}_PROD_*&select=*`,
                    { headers: this._getHeaders() }
                );

                if (remoteRes.ok) {
                    const remoteRows = await remoteRes.json();
                    if (Array.isArray(remoteRows) && remoteRows.length > 0) {
                        for (const remProd of remoteRows) {
                            const rj = remProd.raw_json || {};
                            const rowShopId = rj.shop_id || (remProd.id.startsWith(shopId + '_') ? shopId : null);
                            if (rowShopId !== shopId) continue;

                            const rawLocalId = String(rj.localId || rj.id || remProd.id.replace(`${shopId}_PROD_`, ''));
                            const remBarcode = String(remProd.barcode || '').trim();

                            let localProd = pList.find(p => String(p.id) === rawLocalId);
                            if (!localProd && remBarcode) {
                                localProd = pList.find(p => p.barcode && String(p.barcode).trim() === remBarcode);
                            }

                            // أ) صنف جديد غير موجود محلياً: إضافة فورية
                            if (!localProd) {
                                const numId = Number(rawLocalId) || (Date.now() + Math.floor(Math.random() * 1000));
                                const mappedProd = {
                                    id: numId,
                                    name: remProd.name || rj.name || 'صنف جديد',
                                    barcode: remProd.barcode || rj.barcode || String(numId),
                                    category: remProd.category || rj.category || 'عام',
                                    unit: remProd.unit || rj.unit || 'قطعة',
                                    cost: parseFloat(remProd.cost || rj.cost || 0),
                                    price: parseFloat(remProd.price || rj.price || 0),
                                    wholesale: parseFloat(remProd.wholesale || rj.wholesale || 0),
                                    stock: parseFloat(remProd.stock || rj.stock || 0),
                                    variants: Array.isArray(rj.variants) ? rj.variants : [],
                                    ...rj
                                };
                                pList.unshift(mappedProd);
                                prodFps.set(String(mappedProd.id), getProdFp(mappedProd));
                                if (window.sqliteManager && typeof window.sqliteManager.put === 'function') {
                                    try { window.sqliteManager.put('products', mappedProd); } catch (e) { }
                                }
                                hasUpdatedLocalProducts = true;
                                newImportedCount++;
                            }
                            // ب) صنف موجود محلياً: فحص وتحديث بياناته الأساسية مع حماية رصيد المخزن من التضارب والدبلرة
                            else {
                                const remPrice = parseFloat(remProd.price || 0);
                                const remCost = parseFloat(remProd.cost || 0);
                                const remStock = parseFloat(remProd.stock || 0);
                                const remWholesale = parseFloat(remProd.wholesale || 0);
                                const remName = remProd.name || localProd.name;

                                let changed = false;
                                if (localProd.name !== remName && remName) { localProd.name = remName; changed = true; }
                                if (Math.abs((parseFloat(localProd.price) || 0) - remPrice) > 0.001 && remPrice > 0) { localProd.price = remPrice; changed = true; }
                                if (Math.abs((parseFloat(localProd.cost) || 0) - remCost) > 0.001) { localProd.cost = remCost; changed = true; }
                                if (Math.abs((parseFloat(localProd.wholesale) || 0) - remWholesale) > 0.001) { localProd.wholesale = remWholesale; changed = true; }

                                // 🛡️ حماية المخزون من التضارب (Stock Protection & Anti-Overwrite):
                                // لا يتم استبدال رصيد المخزن عشوائياً إذا كانت المبيعات تخصم عبر pullRemoteTransactions،
                                // بل يتم تطبيق رصيد السحابة فقط في حالة التسويات الجردية المعتمدة الصريحة
                                const remUpdatedAt = remProd.updated_at ? new Date(remProd.updated_at).getTime() : 0;
                                const localUpdatedAt = localProd.updatedAt ? new Date(localProd.updatedAt).getTime() : 0;
                                const isExplicitStockAdjustment = Boolean(
                                    rj.isStockAdjustment ||
                                    rj.isInventoryAudit ||
                                    (remUpdatedAt > (localUpdatedAt + 60000) && rj.isManualStockUpdate)
                                );

                                if (isExplicitStockAdjustment && Math.abs((parseFloat(localProd.stock) || 0) - remStock) > 0.001) {
                                    localProd.stock = remStock;
                                    if (rj && Array.isArray(rj.variants) && rj.variants.length > 0) {
                                        localProd.variants = rj.variants;
                                    }
                                    changed = true;
                                } else if (rj && Array.isArray(rj.variants) && rj.variants.length > 0) {
                                    // دمج التشكيلات الجديدة فقط إن وجدت دون تغيير أرصدة التشكيلات المحلية الحالية
                                    if (!Array.isArray(localProd.variants) || localProd.variants.length === 0) {
                                        localProd.variants = rj.variants;
                                        changed = true;
                                    } else {
                                        const cleanV = (s) => String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
                                        rj.variants.forEach(rv => {
                                            const rvSize = cleanV(rv.size);
                                            const rvColor = cleanV(rv.color);
                                            const exists = localProd.variants.some(lv => cleanV(lv.size) === rvSize && cleanV(lv.color) === rvColor);
                                            if (!exists) {
                                                localProd.variants.push(rv);
                                                changed = true;
                                            }
                                        });
                                    }
                                }

                                if (changed) {
                                    localProd.updatedAt = remProd.updated_at || new Date().toISOString();
                                    if (window.sqliteManager && typeof window.sqliteManager.put === 'function') {
                                        try { window.sqliteManager.put('products', localProd); } catch (e) { }
                                    }
                                    prodFps.set(String(localProd.id), getProdFp(localProd));
                                    hasUpdatedLocalProducts = true;
                                    updatedLocalCount++;
                                }
                            }
                        }

                        if (hasUpdatedLocalProducts) {
                            if (typeof renderProductsTable === 'function') renderProductsTable();
                            if (typeof updateDashboardStats === 'function') updateDashboardStats();
                            if (typeof showToast === 'function' && (newImportedCount > 0 || updatedLocalCount > 0)) {
                                showToast(`👗 مزامنة الأصناف: تم استلام (${newImportedCount}) جديد وتحديث (${updatedLocalCount}) صنف بنجاح!`, 'info');
                            }
                        }
                    }
                }
            } catch (importErr) {
                // تجاهل أخطاء الشبكة بهدوء دون تعطيل البرنامج
            }

            return totalSent;
        },

        // 💰 3. مزامنة حركات الخزينة والدرج مع جدول treasury_audit
        syncTreasuryAudit: async function () {
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;
            if (!this.isValidShopId(shopId)) return 0;

            const audits = (typeof treasuryAuditRecords !== 'undefined' && Array.isArray(treasuryAuditRecords))
                ? treasuryAuditRecords
                : (window.treasuryAuditRecords || []);

            if (audits.length === 0) return 0;

            const toSend = audits.slice(-25).map(a => {
                const rawAuditId = String(a.id || `${a.date}_${a.category}_${a.amount}_${Math.random()}`);
                return {
                    id: `${shopId}_AUDIT_${rawAuditId}`,
                    date: a.date || new Date().toISOString(),
                    category: a.category || 'إيداع',
                    amount: parseFloat(a.amount) || 0,
                    user_name: a.user || a.userName || 'المدير',
                    warehouse: a.warehouse || 'المخزن الرئيسي',
                    raw_json: { ...a, shop_id: shopId }
                };
            });

            const res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
                method: 'POST',
                headers: this._getHeaders(),
                body: JSON.stringify(toSend)
            });

            return (res.ok || res.status === 201 || res.status === 200) ? toSend.length : 0;
        },

        // 📥 4. سحب ومزامنة الحركات السحابية ثنائية الاتجاه لكافة أجهزة المتجر (_MOB_ و _DESK_)
        pullRemoteTransactions: async function () {
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;
            if (!this.isValidShopId(shopId)) return 0;

            try {
                // استعلام شامل لكافة حركات المتجر الصادرة من أي تابلت أو كمبيوتر كاشير آخر
                const res = await this._safeFetch(
                    `${cfg.supabaseUrl}/rest/v1/transactions?id=like.${encodeURIComponent(shopId)}_*&order=created_at.desc&limit=100`,
                    { method: 'GET', headers: this._getHeaders() }
                );

                if (!res.ok) return 0;
                let remoteList = await res.json();
                if (!Array.isArray(remoteList) || remoteList.length === 0) return 0;

                const localTx = (typeof transactions !== 'undefined' && Array.isArray(transactions))
                    ? transactions
                    : (window.transactions || []);

                const pList = (typeof productsDB !== 'undefined' && Array.isArray(productsDB))
                    ? productsDB
                    : (window.productsDB || []);

                const newTransactionRows = [];
                const modifiedProductsList = [];
                const affectedAccountsList = [];

                remoteList.forEach(item => {
                    const raw = item.raw_json || {};
                    const itemShopId = raw.shop_id || (item.id && item.id.startsWith(shopId + '_') ? shopId : null);
                    // 🔒 عزل المتاجر الصارم: رفض أي حركة لا تنتمي للمحل
                    if (itemShopId !== shopId || (raw.shop_id && raw.shop_id !== shopId)) return;

                    // استخراج معرف الفاتورة النظيف ومقارنته بالمحلي
                    const cleanInvId = (id) => String(id || '')
                        .replace(new RegExp(`^${shopId}_(DESK_|MOB_)?`, 'i'), '')
                        .replace(/^#/, '')
                        .trim();

                    const invId = cleanInvId(item.invoice_id || raw.invoiceId || item.id);
                    if (!invId) return;

                    // 🔒 تخطي الحركات الصادرة من هذا الجهاز إذا كانت مسجلة بالفعل محلياً
                    const isDeskRemote = String(item.id).includes('_DESK_');
                    if (isDeskRemote && (raw.source === 'desktop' || raw.terminalLetter === 'D')) {
                        const isOwnTx = localTx.some(t => {
                            const tInv = cleanInvId(t.invoiceId || t.id);
                            return tInv === invId || (t.id && String(t.id) === String(item.id));
                        });
                        if (isOwnTx) return;
                    }

                    // 🛡️ فحص عدم التكرار المتقدم (Multi-Layer De-Duplication)
                    // 1. الفحص في الذاكرة الحية (مع تطابق البصمة المالية)
                    const alreadyExistsInMemory = localTx.some(t => {
                        if (!t) return false;
                        if (t.remoteId && String(t.remoteId) === String(item.id)) return true;
                        if (t.id && String(t.id) === String(item.id)) return true;

                        const tInv = cleanInvId(t.invoiceId || t.id);
                        if (tInv && tInv === invId) return true;
                        if (item.invoice_id && cleanInvId(item.invoice_id) === tInv) return true;

                        // مطابقة البصمة المالية (Financial Fingerprint Matching)
                        const tDate = t.dateISO || (t.date ? String(t.date).slice(0, 10) : '');
                        const rDate = item.date_iso ? String(item.date_iso).slice(0, 10) : (raw.dateISO || (raw.date ? String(raw.date).slice(0, 10) : ''));
                        const tTotal = Math.round((parseFloat(t.invoiceGrandTotal || t.total) || 0) * 100);
                        const rTotal = Math.round((parseFloat(item.total !== undefined ? item.total : raw.total) || 0) * 100);
                        const tPartner = String(t.partner || '').trim().toLowerCase();
                        const rPartner = String(item.partner || raw.partner || '').trim().toLowerCase();
                        const tType = String(t.type || '').trim();
                        const rType = String(item.type || raw.type || '').trim();

                        if (tDate && rDate && tDate === rDate && tTotal === rTotal && tTotal > 0 && tPartner === rPartner && tType === rType) {
                            return true;
                        }
                        return false;
                    });

                    // 2. الفحص المباشر في قاعدة بيانات SQLite لتفادي أي فواتير غير محملة في الذاكرة
                    let alreadyExistsInDB = false;
                    if (!alreadyExistsInMemory && window.sqliteManager && window.sqliteManager.db) {
                        try {
                            if (window.sqliteManager.nativeDb) {
                                const row = window.sqliteManager.nativeDb.prepare(
                                    `SELECT 1 FROM transactions WHERE invoiceId = ? OR id = ? OR invoiceId = ? LIMIT 1;`
                                ).get(invId, item.id, item.invoice_id || '');
                                if (row) alreadyExistsInDB = true;
                            } else {
                                const stmt = window.sqliteManager.db.prepare(
                                    `SELECT 1 FROM transactions WHERE invoiceId = ? OR id = ? OR invoiceId = ? LIMIT 1;`
                                );
                                stmt.bind([invId, item.id, item.invoice_id || '']);
                                if (stmt.step()) alreadyExistsInDB = true;
                                stmt.free();
                            }
                        } catch (dbChkErr) { }
                    }

                    const alreadyExists = alreadyExistsInMemory || alreadyExistsInDB;

                    if (!alreadyExists && invId) {
                        const baseNumId = (raw.numericId && Number.isInteger(Number(raw.numericId)))
                            ? Number(raw.numericId)
                            : (Date.now() + Math.floor(Math.random() * 1000));

                        const now = new Date();
                        const todayISO = now.toLocaleDateString('en-CA');
                        const nowTime = now.toLocaleTimeString('en-GB');
                        const nowFull = now.toLocaleString('ar-EG');
                        const total = parseFloat(item.total !== undefined ? item.total : raw.total) || 0;
                        const paidAmount = parseFloat(item.paid_amount !== undefined ? item.paid_amount : raw.paidAmount) || 0;
                        const remaining = parseFloat(item.remaining !== undefined ? item.remaining : raw.remaining) || 0;
                        const partner = String(item.partner || raw.partner || 'عميل نقدي').trim();
                        const method = String(item.method || raw.method || 'كاش').trim();
                        const warehouse = item.warehouse || raw.warehouse || 'المخزن الرئيسي';
                        const isCredit = (method === 'أجل' || remaining > 0.001);

                        // الحفاظ الدقيق على نوع الحركة الأصلي (بيع، شراء، قبض، صرف، مرتجع) وبند السند
                        const actualType = raw.type || item.type || 'بيع 📤';
                        const actualVoucherCat = raw.voucherCategory || item.voucherCategory || raw.category || null;
                        const isDeskRemote = item.id.includes('_DESK_');
                        const terminalDisplayName = raw.terminal || (isDeskRemote ? 'كاشير فرعي 💻' : 'تابلت (B) 📱');
                        const terminalLetter = raw.terminalLetter || (isDeskRemote ? 'D' : 'B');
                        const cashierName = raw.user || item.cashier || (isDeskRemote ? 'كاشير فرعي' : 'تابلت');

                        const isVoucher = actualType.includes('قبض') || actualType.includes('صرف');
                        const items = (Array.isArray(raw.items) && raw.items.length > 0)
                            ? raw.items
                            : [{
                                name: raw.product || (isVoucher ? (actualType.includes('قبض') ? 'سند قبض' : 'سند صرف') : 'حركة سحابية'),
                                quantity: 1,
                                price: total,
                                total: total,
                                size: '',
                                color: ''
                            }];

                        items.forEach((it, idx) => {
                            const isHead = (idx === 0);
                            const rowId = baseNumId + idx;
                            const itQty = parseFloat(it.quantity || it.qty || 1);
                            const itPrice = parseFloat(it.price || (it.total ? it.total / itQty : total));
                            const itTotal = parseFloat(it.total || (itPrice * itQty) || 0);

                            const row = {
                                id: rowId,
                                numericId: rowId,
                                invoiceId: invId,
                                remoteId: item.id,
                                syncedFromRemote: true,
                                stockApplied: true,
                                date: raw.date || nowFull,
                                dateISO: raw.dateISO || todayISO,
                                timeISO: raw.time || nowTime,
                                type: actualType,
                                voucherCategory: actualVoucherCat,
                                method: method,
                                product: it.name || raw.product || 'صنف',
                                unit: it.unit || 'قطعة',
                                size: it.size || '',
                                color: it.color || '',
                                qty: itQty,
                                price: itPrice,
                                total: itTotal.toFixed(2),
                                profit: raw.profit || '0.00',
                                partner: partner,
                                user: cashierName,
                                warehouse: warehouse,
                                terminal: terminalDisplayName,
                                terminalLetter: terminalLetter,
                                paidAmount: isHead ? paidAmount : 0,
                                remaining: isHead ? remaining : 0,
                                deferred: isHead ? remaining : 0,
                                isInvoiceHead: isHead,
                                invoiceGrandTotal: isHead ? total : 0,
                                raw_items: raw.items || [],
                                ...raw
                            };

                            localTx.unshift(row);
                            newTransactionRows.push(row);
                        });

                        // تحديث رصيد الحساب الآجل
                        if (isCredit && partner && partner !== 'عميل نقدي' && partner !== 'جهة غير محددة') {
                            if (typeof window.invalidateAccountBalancesCache === 'function') {
                                window.invalidateAccountBalancesCache(partner);
                            }
                        }

                        // حسم/إضافة المخزون فقط لعمليات البيع والشراء والمرتجعات (دون سندات الصرف والقبض)
                        if (!isVoucher && Array.isArray(raw.items) && raw.items.length > 0) {
                            raw.items.forEach(soldItem => {
                                const prod = pList.find(p => String(p.id) === String(soldItem.productId || soldItem.id) || (soldItem.barcode && p.barcode === soldItem.barcode));
                                if (prod) {
                                    const qty = parseFloat(soldItem.quantity || soldItem.qty || 1);
                                    const isAdjustment = actualType.includes('تسوية') || actualType.includes('جرد');
                                    const isAddition = actualType.includes('شراء') || actualType.includes('مرتجع بيع');
                                    // في التسويات المخزنية تكون الكمية مسجلة بالفعل بالفارق (+ للزيادة، - للعجز)
                                    const factor = isAdjustment ? 1 : (isAddition ? 1 : -1);
                                    const delta = factor * qty;
                                    const sSize = String(soldItem.size || '').trim().toLowerCase();
                                    const sColor = String(soldItem.color || '').trim().toLowerCase();
                                    const activeWH = item.warehouse || raw.warehouse || 'المخزن الرئيسي';

                                    // 👗 تطبيق الحركة المخزنية عبر محرك FashionStockEngine المركزي لحماية المقاسات والألوان
                                    if (window.FashionStockEngine && typeof window.FashionStockEngine.applyMovement === 'function') {
                                        window.FashionStockEngine.applyMovement({
                                            product: prod,
                                            variantRef: {
                                                size: soldItem.size || soldItem.selectedSize || '',
                                                color: soldItem.color || soldItem.selectedColor || '',
                                                barcode: soldItem.barcode || ''
                                            },
                                            qtyDelta: delta,
                                            warehouseName: activeWH,
                                            allowCreateVariant: Boolean(isAddition)
                                        });
                                    } else {

                                        if (Array.isArray(prod.variants) && prod.variants.length > 0) {
                                            const cleanV = (s) => String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
                                            const cSize = cleanV(sSize);
                                            const cColor = cleanV(sColor);
                                            const vMatch = prod.variants.find(v =>
                                                (!cSize || cleanV(v.size) === cSize) &&
                                                (!cColor || cleanV(v.color) === cColor)
                                            );
                                            if (vMatch) {
                                                vMatch.stock = Math.max(0, (parseFloat(vMatch.stock) || 0) + delta);
                                                if (!vMatch.warehouseStocks) vMatch.warehouseStocks = {};
                                                vMatch.warehouseStocks[activeWH] = Math.max(0, (parseFloat(vMatch.warehouseStocks[activeWH]) || 0) + delta);
                                            }
                                        }
                                        prod.stock = Math.max(0, parseFloat(prod.stock || 0) + delta);
                                        if (!prod.warehouseStocks) prod.warehouseStocks = {};
                                        prod.warehouseStocks[activeWH] = Math.max(0, parseFloat(prod.warehouseStocks[activeWH] || 0) + delta);
                                    }

                                    if (!modifiedProductsList.some(mp => mp.id === prod.id)) {
                                        modifiedProductsList.push(prod);
                                    }
                                }
                            });
                        }
                    }
                });

                if (newTransactionRows.length > 0) {
                    if (typeof window.invalidateAccountBalancesCache === 'function') {
                        window.invalidateAccountBalancesCache();
                    }

                    if (typeof window.saveTransactionChanges === 'function') {
                        await window.saveTransactionChanges({
                            newTransactions: newTransactionRows,
                            modifiedProducts: modifiedProductsList,
                            modifiedAccounts: affectedAccountsList
                        });
                    } else if (typeof saveData === 'function') {
                        await saveData();
                    }

                    if (typeof renderInvoicesTable === 'function') renderInvoicesTable();
                    if (typeof debouncedRenderInvoicesTable === 'function') debouncedRenderInvoicesTable(50);
                    if (typeof renderDailyReportTable === 'function') renderDailyReportTable();
                    if (typeof updateDashboardStats === 'function') updateDashboardStats();
                    if (typeof renderProductsTable === 'function') renderProductsTable();
                    if (typeof renderAccountsTable === 'function') renderAccountsTable();

                    if (typeof showToast === 'function') {
                        showToast(`☁️ تم استلام (${newTransactionRows.length}) حركة جديدة من السحابة وتسجيلها بنجاح!`, 'info');
                    }
                }

                // فحص أي حركات ملغاة (void_tx)
                try {
                    const voidRes = await this._safeFetch(
                        `${cfg.supabaseUrl}/rest/v1/treasury_audit?id=like.${encodeURIComponent(shopId)}_VOID_*&category=eq.void_tx&order=created_at.desc&limit=20`,
                        { headers: this._getHeaders() }
                    );
                    if (voidRes.ok) {
                        const voidRows = await voidRes.json();
                        if (Array.isArray(voidRows) && voidRows.length > 0) {
                            let hasVoidChanges = false;
                            for (const vRow of voidRows) {
                                const rawV = vRow.raw_json || {};
                                const rowShopId = rawV.shop_id || (vRow.id && vRow.id.startsWith(shopId + '_') ? shopId : null);
                                if (rowShopId !== shopId) continue;

                                const voidInvId = String(rawV.invoiceId || vRow.id.replace(`${shopId}_VOID_`, '').replace('VOID_', ''));
                                const localIdx = localTx.findIndex(t => String(t.invoiceId || t.id || '') === voidInvId);
                                if (localIdx !== -1) {
                                    const txToVoid = localTx[localIdx];
                                    localTx.splice(localIdx, 1);
                                    if (window.sqliteManager && typeof window.sqliteManager.run === 'function') {
                                        try { window.sqliteManager.run(`DELETE FROM transactions WHERE invoiceId = ? OR id = ?`, [voidInvId, txToVoid.id]); } catch (e) { }
                                    }
                                    hasVoidChanges = true;
                                }
                            }
                            if (hasVoidChanges) {
                                if (typeof renderInvoicesTable === 'function') renderInvoicesTable();
                                if (typeof renderDailyReportTable === 'function') renderDailyReportTable();
                                if (typeof updateDashboardStats === 'function') updateDashboardStats();
                            }
                        }
                    }
                } catch (voidErr) { }

                return newTransactionRows.length;
            } catch (err) {
                return 0;
            }
        },

        // 🗑️ 4.1 حذف حركة من السحابة وإشعار كافة الأجهزة بإلغائها
        deleteInvoiceFromCloud: async function (invoiceId, total = 0, warehouse = 'المخزن الرئيسي') {
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey || !invoiceId) return false;
            if (!this.isValidShopId(shopId)) return false;

            try {
                const invStr = String(invoiceId).trim();

                const scopedDeskId = `${shopId}_DESK_${invStr}`;
                const scopedMobId = `${shopId}_${invStr}`;

                await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/transactions?id=in.(${encodeURIComponent(scopedDeskId)},${encodeURIComponent(scopedMobId)})`, {
                    method: 'DELETE',
                    headers: this._getHeaders()
                });

                await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/transactions?invoice_id=eq.${encodeURIComponent(invStr)}&id=like.${encodeURIComponent(shopId)}_*`, {
                    method: 'DELETE',
                    headers: this._getHeaders()
                });

                const voidPayload = [{
                    id: `${shopId}_VOID_${invStr}`,
                    date: new Date().toISOString(),
                    category: 'void_tx',
                    amount: parseFloat(total || 0),
                    user_name: 'الكمبيوتر الرئيسي',
                    warehouse: warehouse || 'المخزن الرئيسي',
                    raw_json: {
                        invoiceId: invStr,
                        shop_id: shopId,
                        warehouse: warehouse,
                        source: 'desktop',
                        voidedAt: new Date().toISOString()
                    }
                }];

                await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
                    method: 'POST',
                    headers: this._getHeaders(),
                    body: JSON.stringify(voidPayload)
                });

                return true;
            } catch (err) {
                return false;
            }
        },

        // 🔐 5. تسجيل رمز إقران الأجهزة المعتمد في السحابة
        syncPairingPin: async function (customPin = null) {
            const cfg = this.getConfig();
            if (!cfg.supabaseUrl || !cfg.supabaseKey) return;
            const shopId = cfg.shopId || this.getShopId();
            if (!this.isValidShopId(shopId)) return;

            try {
                const pairingPin = customPin || this.getPairingPin();
                const shopName = cfg.shopName || (typeof settings !== 'undefined' ? (settings.shop_name || settings.shopName) : '') || 'بَيَان فاشون';
                const payload = [
                    {
                        id: `CONFIG_DEVICE_PAIRING_${shopId}`,
                        date: new Date().toISOString(),
                        category: 'اقتران',
                        amount: 0,
                        user_name: 'المدير',
                        warehouse: 'المخزن الرئيسي',
                        raw_json: {
                            shopId: shopId,
                            shopName: shopName,
                            pairingPin: String(pairingPin).trim(),
                            updatedAt: new Date().toISOString()
                        }
                    }
                ];
                await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
                    method: 'POST',
                    headers: this._getHeaders(),
                    body: JSON.stringify(payload)
                });
            } catch (e) { }
        },

        // اسم مرادف لدعم استدعاء رفع كود الاقتران ومعرف المحل
        uploadPairingPinToCloud: async function (pin = null) {
            return this.syncPairingPin(pin);
        },

        // 👥 5.1 مزامنة العملاء والموردين وبنود الصرف والقبض المخصصة
        syncCustomers: async function () {
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;
            if (!this.isValidShopId(shopId)) return 0;

            let accList = (typeof accounts !== 'undefined' && Array.isArray(accounts) && accounts.length > 0)
                ? accounts
                : (window.accounts || []);

            if ((!accList || accList.length === 0) && typeof db !== 'undefined' && db.accounts) {
                try {
                    accList = await db.accounts.toArray();
                } catch (e) { }
            }

            if (!accList || accList.length === 0) return 0;

            // 📥 استيراد وتحديث العملاء وبنود الصرف/القبض المخصصة من السحابة
            try {
                const remoteRes = await this._safeFetch(
                    `${cfg.supabaseUrl}/rest/v1/treasury_audit?id=eq.CONFIG_CUSTOMERS_LIST_${encodeURIComponent(shopId)}`,
                    { headers: this._getHeaders() }
                );
                if (remoteRes.ok) {
                    const rows = await remoteRes.json();
                    const shopRow = (rows || [])[0];
                    if (shopRow && shopRow.raw_json) {
                        const remoteAccs = Array.isArray(shopRow.raw_json.accounts)
                            ? shopRow.raw_json.accounts
                            : (Array.isArray(shopRow.raw_json.customers) ? shopRow.raw_json.customers : []);

                        const cleanArFn = (s) => String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
                        let accChanges = false;

                        for (const rAcc of remoteAccs) {
                            if (!rAcc || !rAcc.name) continue;
                            const existing = accList.find(a => cleanArFn(a.name) === cleanArFn(rAcc.name));
                            if (!existing) {
                                const newId = Number(rAcc.id) || (Date.now() + Math.floor(Math.random() * 1000));
                                const toAdd = {
                                    id: newId,
                                    name: rAcc.name.trim(),
                                    code: rAcc.code || String(newId).slice(-4),
                                    type: rAcc.type || 'client',
                                    mobile: rAcc.mobile || '',
                                    address: rAcc.address || '',
                                    debit: rAcc.balance > 0 ? String(rAcc.balance) : '0',
                                    credit: rAcc.balance < 0 ? String(Math.abs(rAcc.balance)) : '0',
                                    balance: rAcc.balance || 0
                                };
                                accList.push(toAdd);
                                if (window.db && window.db.accounts) {
                                    try { await window.db.accounts.put(toAdd); } catch (e) { }
                                }
                                accChanges = true;
                            } else {
                                // تحديث الهاتف أو العنوان أو الكود إذا كان أحدث بالسحابة
                                let updated = false;
                                if (rAcc.mobile && rAcc.mobile !== existing.mobile) { existing.mobile = rAcc.mobile; updated = true; }
                                if (rAcc.address && rAcc.address !== existing.address) { existing.address = rAcc.address; updated = true; }
                                if (rAcc.code && !existing.code) { existing.code = rAcc.code; updated = true; }
                                if (updated) {
                                    if (window.db && window.db.accounts) {
                                        try { await window.db.accounts.put(existing); } catch (e) { }
                                    }
                                    accChanges = true;
                                }
                            }
                        }

                        // مزامنة ودمج بنود الصرف والقبض المخصصة تلقائياً بين الأجهزة
                        if (Array.isArray(shopRow.raw_json.customReceiptCategories) && shopRow.raw_json.customReceiptCategories.length > 0) {
                            const curRec = (typeof getCustomVoucherCategories === 'function') ? getCustomVoucherCategories('receipt') : [];
                            const mergedRec = Array.from(new Set([...curRec, ...shopRow.raw_json.customReceiptCategories]));
                            if (mergedRec.length > curRec.length) {
                                if (typeof saveCustomVoucherCategoriesList === 'function') {
                                    saveCustomVoucherCategoriesList('receipt', mergedRec);
                                } else {
                                    localStorage.setItem('bayan_custom_voucher_categories_receipt', JSON.stringify(mergedRec));
                                }
                                if (typeof loadCustomVoucherCategories === 'function') loadCustomVoucherCategories('receipt');
                            }
                        }

                        if (Array.isArray(shopRow.raw_json.customDisburseCategories) && shopRow.raw_json.customDisburseCategories.length > 0) {
                            const curDisb = (typeof getCustomVoucherCategories === 'function') ? getCustomVoucherCategories('disburse') : [];
                            const mergedDisb = Array.from(new Set([...curDisb, ...shopRow.raw_json.customDisburseCategories]));
                            if (mergedDisb.length > curDisb.length) {
                                if (typeof saveCustomVoucherCategoriesList === 'function') {
                                    saveCustomVoucherCategoriesList('disburse', mergedDisb);
                                } else {
                                    localStorage.setItem('bayan_custom_voucher_categories_disburse', JSON.stringify(mergedDisb));
                                }
                                if (typeof loadCustomVoucherCategories === 'function') loadCustomVoucherCategories('disburse');
                            }
                        }

                        if (accChanges) {
                            if (typeof renderAccountsTable === 'function') renderAccountsTable();
                            if (typeof window.invalidateAccountBalancesCache === 'function') window.invalidateAccountBalancesCache();
                        }
                    }
                }
            } catch (impErr) { }

            // تجهيز ورفع العملاء وبنود السندات المخصصة
            const allMappedAccounts = accList
                .filter(a => a && a.name)
                .map(a => {
                    const tp = String(a.type || '').toLowerCase();
                    const isSupp = (tp === 'supplier' || tp.includes('مورد'));
                    const bal = (typeof getAccountBalance === 'function' && a.name)
                        ? getAccountBalance(a.name)
                        : ((parseFloat(a.debit) || 0) - (parseFloat(a.credit) || 0));
                    return {
                        id: a.id,
                        name: String(a.name).trim(),
                        code: String(a.code || ''),
                        type: isSupp ? 'supplier' : 'client',
                        typeLabel: isSupp ? 'مورد' : 'عميل',
                        mobile: String(a.mobile || a.phone || a.landline || ''),
                        address: String(a.address || ''),
                        balance: bal
                    };
                });

            const customRecCats = (typeof getCustomVoucherCategories === 'function')
                ? getCustomVoucherCategories('receipt')
                : JSON.parse(localStorage.getItem('bayan_custom_voucher_categories_receipt') || '[]');
            const customDisbCats = (typeof getCustomVoucherCategories === 'function')
                ? getCustomVoucherCategories('disburse')
                : JSON.parse(localStorage.getItem('bayan_custom_voucher_categories_disburse') || '[]');

            const payload = [
                {
                    id: `CONFIG_CUSTOMERS_LIST_${shopId}`,
                    date: new Date().toISOString(),
                    category: 'customers',
                    amount: allMappedAccounts.length,
                    user_name: 'المدير',
                    warehouse: 'المخزن الرئيسي',
                    raw_json: {
                        shop_id: shopId,
                        customers: allMappedAccounts,
                        accounts: allMappedAccounts,
                        customReceiptCategories: customRecCats,
                        customDisburseCategories: customDisbCats,
                        updatedAt: new Date().toISOString()
                    }
                }
            ];

            const res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
                method: 'POST',
                headers: this._getHeaders(),
                body: JSON.stringify(payload)
            });

            return (res.ok || res.status === 201 || res.status === 200) ? allMappedAccounts.length : 0;
        },

        // 🏬 5.2 مزامنة قائمة المخازن المعتمدة مع السحابة
        syncWarehouses: async function () {
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;
            if (!this.isValidShopId(shopId)) return 0;

            let whList = (typeof warehouses !== 'undefined' && Array.isArray(warehouses) && warehouses.length > 0)
                ? warehouses
                : (window.warehouses || []);

            if ((!whList || whList.length === 0) && typeof db !== 'undefined' && db.warehouses) {
                try {
                    whList = await db.warehouses.toArray();
                } catch (e) { }
            }

            if (!whList || whList.length === 0) {
                whList = [{ id: 1, name: 'المخزن الرئيسي' }];
            }

            const mappedWhs = whList.map(w => ({
                id: w.id || w.name,
                name: (w.name || 'المخزن الرئيسي').trim(),
                address: w.address || ''
            }));

            const payload = [
                {
                    id: `CONFIG_WAREHOUSES_LIST_${shopId}`,
                    date: new Date().toISOString(),
                    category: 'warehouses',
                    amount: mappedWhs.length,
                    user_name: 'المدير',
                    warehouse: 'المخزن الرئيسي',
                    raw_json: {
                        shop_id: shopId,
                        warehouses: mappedWhs,
                        updatedAt: new Date().toISOString()
                    }
                }
            ];

            try {
                await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
                    method: 'POST',
                    headers: this._getHeaders(),
                    body: JSON.stringify(payload)
                });
                return mappedWhs.length;
            } catch (e) {
                return 0;
            }
        },

        // 🔄 6. المشغل الرئيسي للمزامنة الدورية الهادئة (Master Sync Runner)
        runFullSync: async function (manual = false) {
            if (!this._isAllowed()) {
                this.updateUIStatus('locked');
                if (manual) {
                    const st = (typeof window.getCloudSyncStatus === 'function') ? window.getCloudSyncStatus() : {};
                    let alertMsg = '🔒 خدمة المزامنة السحابية غير مفعلة في باقتك الحالية!\n\n';
                    if (st.reason === 'cloud_server_expired') {
                        alertMsg += 'انتهت صلاحية السيرفر السحابي الخاص بك. يرجى تجديد اشتراك السيرفر السحابي لمواصلة المزامنة.';
                    } else if (st.reason === 'trial') {
                        alertMsg += 'أنت تستخدم النسخة التجريبية المجانية. ميزة المزامنة السحابية متوفرة في باقات الاشتراك السحابي.';
                    } else {
                        alertMsg += 'باقتك الحالية ترخيص محلي (أوفلاين). للترقية إلى باقات المزامنة السحابية وربط التابلت والفروع، تفضل بزيارة نافذة الاشتراكات.';
                    }
                    if (typeof showToast === 'function') {
                        showToast(alertMsg.replace(/\n\n/g, ' - '), 'warning');
                    } else {
                        alert(alertMsg);
                    }
                }
                return { status: 'locked', message: 'Cloud sync not licensed' };
            }

            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this.isValidShopId(shopId)) {
                console.warn('[SupabaseSync] إلغاء المزامنة: Shop ID غير صالح:', shopId);
                return { status: 'invalid_shop', message: 'Shop ID غير صالح' };
            }

            if (this.isSyncing) return { status: 'busy' };
            if (!navigator.onLine) {
                this.isOnline = false;
                this.updateUIStatus('offline');
                return { status: 'offline' };
            }

            this.isSyncing = true;
            this.updateUIStatus('syncing');

            try {
                // 1. تفريغ طابور المزامنة المحلي التسلسلي أولاً لرفع أي فواتير معلقة أوفلاين (FIFO Queue Drain)
                const queueCount = await this.processSyncQueue().catch(() => 0);
                // 2. سحب فواتير وحركات الأجهزة الأخرى أولاً وخصمها من المخزن، ثم رفع الحركات والأصناف والعملاء والمخازن
                const remoteCount = await this.pullRemoteTransactions().catch(() => 0);
                const txCount = await this.syncTransactions().catch(() => 0);
                const pCount = await this.syncProducts(manual).catch(() => 0);
                const auditCount = await this.syncTreasuryAudit().catch(() => 0);
                const custCount = await this.syncCustomers().catch(() => 0);
                const whCount = await this.syncWarehouses().catch(() => 0);

                this.lastSyncTime = new Date();
                this.lastError = null;
                this.isOnline = true;
                this.updateUIStatus('online', this.lastSyncTime);

                if (manual && typeof showToast === 'function') {
                    showToast(`☁️ تمت المزامنة السحابية بنجاح (فواتير: ${txCount} | أصناف: ${pCount} | عملاء: ${custCount} | حركات واردة: ${remoteCount})`, 'success');
                }

                return { success: true, txCount, pCount, auditCount, custCount, remoteCount };
            } catch (err) {
                this.lastError = err.message || '';
                const isFetchFail = err.message && (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed to fetch'));
                if (isFetchFail) {
                    this.updateUIStatus('offline_server');
                } else {
                    this.updateUIStatus('error', null, err.message);
                }
                return { success: false, error: err.message };
            } finally {
                this.isSyncing = false;
            }
        },

        // 🖥️ تحديث حالة الاتصال في الواجهة إن وجدت
        updateUIStatus: function (state, time = null, msg = '') {
            const badge = document.getElementById('supabaseSyncStatusBadge');
            const connText = document.getElementById('supabaseConnectionStatusText');
            const overviewBadge = document.getElementById('supabaseOverviewBadge');

            if (state === 'locked') {
                const st = (typeof window.getCloudSyncStatus === 'function') ? window.getCloudSyncStatus() : {};
                const isServerExpired = (st.reason === 'cloud_server_expired');
                const badgeText = isServerExpired ? '⚠️ سيرفر سحابي منتهي' : '🔒 غير مفعلة (باقة أوفلاين)';
                const descText = isServerExpired
                    ? 'انتهت صلاحية السيرفر السحابي (يرجى التجديد) ⚠️'
                    : 'غير مفعلة (مقتصرة على باقات المزامنة السحابية) 🔒';

                if (badge) {
                    badge.innerHTML = badgeText;
                    badge.style.color = '#d97706';
                    badge.style.borderColor = '#fcd34d';
                    badge.style.background = '#fffbeb';
                }
                if (connText) {
                    connText.innerHTML = descText;
                    connText.style.color = '#d97706';
                }
                if (overviewBadge) {
                    overviewBadge.innerHTML = badgeText;
                    overviewBadge.style.color = '#d97706';
                    overviewBadge.style.borderColor = '#fcd34d';
                    overviewBadge.style.background = '#fffbeb';
                }
                return;
            }

            if (state === 'online') {
                const tStr = time ? time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
                if (badge) {
                    badge.innerHTML = `🟢 سحابي نشط (${tStr})`;
                    badge.style.color = '#10b981';
                    badge.style.borderColor = '#a7f3d0';
                    badge.style.background = '#ffffff';
                }
                if (connText) {
                    connText.innerHTML = 'متصل ومؤمن ومشفر 🟢';
                    connText.style.color = '#059669';
                }
                if (overviewBadge) {
                    overviewBadge.innerHTML = '🟢 سحابي نشط';
                    overviewBadge.style.color = '#047857';
                    overviewBadge.style.borderColor = '#a7f3d0';
                    overviewBadge.style.background = '#ecfdf5';
                }
            } else if (state === 'syncing') {
                if (badge) {
                    badge.innerHTML = `🔄 جاري المزامنة...`;
                    badge.style.color = '#38bdf8';
                    badge.style.borderColor = '#bae6fd';
                    badge.style.background = '#ffffff';
                }
            } else if (state === 'offline') {
                if (badge) {
                    badge.innerHTML = `⚪ أوفلاين (في انتظار الإنترنت)`;
                    badge.style.color = '#94a3b8';
                    badge.style.borderColor = '#cbd5e1';
                    badge.style.background = '#ffffff';
                }
                if (connText) {
                    connText.innerHTML = 'في انتظار الاتصال بالإنترنت ⚪';
                    connText.style.color = '#64748b';
                }
            } else if (state === 'offline_server') {
                if (badge) {
                    badge.innerHTML = `⚠️ السيرفر غير متاح حالياً (يعمل أوفلاين)`;
                    badge.style.color = '#d97706';
                    badge.style.borderColor = '#fcd34d';
                    badge.style.background = '#fffbeb';
                }
                if (connText) {
                    connText.innerHTML = 'السيرفر السحابي غير متاح حالياً (النظام يعمل محلياً أوفلاين 100%) ⚠️';
                    connText.style.color = '#d97706';
                }
            } else if (state === 'error') {
                if (badge) {
                    badge.innerHTML = `⚠️ تنبيه في الاتصال`;
                    badge.style.color = '#f87171';
                    badge.style.borderColor = '#fca5a5';
                    badge.style.background = '#ffffff';
                }
                if (connText) {
                    connText.innerHTML = 'حدث خطأ أثناء الاتصال بالسيرفر السحابي ⚠️';
                    connText.style.color = '#dc2626';
                }
            }
        },

        // ⏱️ إدارة المؤقت التلقائي للمزامنة
        restartSyncTimer: function () {
            if (this.syncTimer) clearInterval(this.syncTimer);
            if (!this._isAllowed()) {
                return;
            }
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this.isValidShopId(shopId)) {
                return;
            }
            if (cfg.autoSyncEnabled && cfg.supabaseUrl && cfg.supabaseKey) {
                // ترشيد دورة الفحص الدوري الكامل إلى 45-60 ثانية مع بقاء الرفع الفوري عبر onDeltaSaved
                const intervalMs = Math.max(45, cfg.syncIntervalSeconds || 45) * 1000;
                this.syncTimer = setInterval(() => {
                    if (navigator.onLine && this._isAllowed()) {
                        this.runFullSync(false).catch(() => { });
                    }
                }, intervalMs);
                if (window._bayanActiveIntervals) window._bayanActiveIntervals.push(this.syncTimer);
            }
        },

        // 🛑 إيقاف وفصل مؤقت المزامنة السحابية بسلام عند إغلاق التطبيق
        disconnect: function () {
            if (this.syncTimer) {
                clearInterval(this.syncTimer);
                this.syncTimer = null;
            }
            this._isSyncing = false;
            console.log('☁️ [SupabaseSync] Disconnected successfully for shutdown.');
        },

        // 🛡️ إعادة فحص الترخيص فوراً وتحديث الواجهة والمؤقت
        refreshLicenseStatus: function () {
            const isAllowed = this._isAllowed();
            if (!isAllowed) {
                if (this.syncTimer) clearInterval(this.syncTimer);
                this.updateUIStatus('locked');
            } else {
                this.updateUIStatus(this.isOnline ? 'online' : 'offline', this.lastSyncTime);
                this.restartSyncTimer();
            }
        },

        // 🚀 تهيئة النظام عند إقلاع الواجهة
        init: async function () {
            console.log('☁️ [SupabaseSync] Initializing Bayan Cloud Sync Engine...');

            // التأكد من اكتمال تحميل AppStore من SQLite قبل المزامنة لتفادي الـ Race Condition
            if (!window._appStoreInitialized && typeof window.initAppStore === 'function') {
                try {
                    await window.initAppStore();
                } catch (e) {
                    console.warn('[SupabaseSync] Waiting for AppStore init...', e);
                }
            }

            if (!this._isAllowed()) {
                console.log('🔒 [SupabaseSync] Cloud sync locked: Offline or Trial license tier.');
                this.updateUIStatus('locked');
            }

            window.addEventListener('online', () => {
                this.isOnline = true;
                if (!this._isAllowed()) {
                    this.updateUIStatus('locked');
                    return;
                }
                this.runFullSync(false).catch(() => { });
            });
            window.addEventListener('offline', () => {
                this.isOnline = false;
                if (!this._isAllowed()) {
                    this.updateUIStatus('locked');
                } else {
                    this.updateUIStatus('offline');
                }
            });

            if (window.BayanNetworkHub) {
                const origOnDataSaved = window.BayanNetworkHub.onDataSaved;
                window.BayanNetworkHub.onDataSaved = () => {
                    if (typeof origOnDataSaved === 'function') origOnDataSaved();
                    if (!this._isAllowed()) {
                        return;
                    }
                    setTimeout(() => this.runFullSync(false).catch(() => { }), 1500);
                };

                const origOnDeltaSaved = window.BayanNetworkHub.onDeltaSaved;
                window.BayanNetworkHub.onDeltaSaved = (deltaData) => {
                    if (typeof origOnDeltaSaved === 'function') origOnDeltaSaved(deltaData);
                    if (!this._isAllowed()) {
                        return;
                    }
                    // 📦 إدراج الفواتير والحركات والأصناف في طابور المزامنة FIFO فوراً لحمايتها من الانقطاع
                    if (deltaData) {
                        const newTxs = deltaData.newTransactions || [];
                        const modTxs = deltaData.modifiedTransactions || [];
                        const allTxs = newTxs.concat(modTxs);
                        if (allTxs.length > 0) {
                            allTxs.forEach(t => {
                                if (t) this.addToSyncQueue('transaction', 'upsert', t);
                            });
                        }
                        if (Array.isArray(deltaData.modifiedProducts) && deltaData.modifiedProducts.length > 0) {
                            deltaData.modifiedProducts.forEach(p => {
                                if (p) this.addToSyncQueue('product', 'upsert', p);
                            });
                        }
                    }
                    // ⚡ رفع فوري ولحظي في الخلفية لأي فاتورة أو حركة أو صنف يتم حفظه
                    setTimeout(() => {
                        this.processSyncQueue().catch(() => { });
                        this.runFullSync(false).catch(() => { });
                    }, 500);
                };
            }

            setTimeout(() => {
                // رفع كود الاقتران ومعرف المحل للسحابة دائماً لتمكين اقتران التابلت والموبايل فوراً
                this.syncPairingPin().catch(() => { });
                if (!this._isAllowed()) {
                    console.log('🔒 [SupabaseSync] Cloud sync locked for offline/trial license tier.');
                    this.updateUIStatus('locked');
                    return;
                }
                this.runFullSync(false).catch(() => { });
                this.restartSyncTimer();
            }, 3000);

            setTimeout(() => {
                const pinBadge = document.getElementById('supabasePairingPinCode');
                if (pinBadge) pinBadge.textContent = this.getPairingPin();
                const shopBadge = document.getElementById('supabaseShopIdBadge');
                if (shopBadge) shopBadge.textContent = this.getShopId();
                if (!this._isAllowed()) {
                    this.updateUIStatus('locked');
                }
            }, 800);
        }
    };

    window.BayanSupabaseSync = BayanSupabaseSync;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => BayanSupabaseSync.init());
    } else {
        BayanSupabaseSync.init();
    }
})(window);
