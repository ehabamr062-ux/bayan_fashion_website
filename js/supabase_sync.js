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

        // 🔒 التحقق الحاسم من ترخيص المزامنة السحابية قبل أي اتصال بالسحابة (حظر قاطع وفوري لأي باقة بدون ترخيص سحابي صريح)
        _isAllowed: function () {
            try {
                if (typeof process !== 'undefined' && process.env && (process.env.BAYAN_TEST_MODE === '1' || process.env.BAYAN_TEST_DIR)) return false;
                if (typeof window !== 'undefined' && (window.__BAYAN_TEST_MODE__ || (window.location && window.location.search && window.location.search.includes('test-mode')))) return false;

                // 1. جلب الباقة الحالية
                const plan = (typeof window.getBayanPlan === 'function')
                    ? window.getBayanPlan()
                    : ((typeof getStore === 'function' ? getStore('bayan_current_plan') : null) || localStorage.getItem('bayan_current_plan') || '');

                // 2. حظر فوري وصارم لأي باقة أوفلاين أو تجريبية أو مجانية
                if (!plan || plan.includes('مجانية') || plan.includes('تجريب') || plan.includes('أوفلاين') || plan.toLowerCase().includes('offline')) {
                    return false;
                }

                // 3. المزامنة مغلقة افتراضياً (Return false) لأي باقة لا تتضمن صراحةً "سحابية" أو "Cloud"
                // حتى لو كانت الباقة "مدى الحياة" أو "سنوية"، ما لم يكن مفعلاً لها ترخيص سحابي صريح
                const isExplicitCloud = plan.includes('سحاب') || plan.includes('Cloud');
                const isExplicitCloudLicensed = (typeof getStore === 'function') && (getStore('bayan_cloud_sync_licensed') === 'true');
                if (!isExplicitCloud && !isExplicitCloudLicensed) {
                    return false;
                }

                // 4. فحص الصلاحيات المركزية الإضافية (سريان الاشتراك، فحص التلاعب بالوقت، الحظر عن بعد)
                if (typeof window.isCloudSyncAllowed === 'function') {
                    return Boolean(window.isCloudSyncAllowed());
                }

                return true;
            } catch (e) {
                return false;
            }
        },

        // 🛡️ دالة اتصال آمنة وذكية مزودة بـ AbortController ومهلة زمنية لمنع تجميد أو رمي أخطاء حمراء بالكونسول
        _safeFetch: async function (url, options = {}, timeoutMs = 15000) {
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
                    } else if (typeof showCustomAlert === 'function') {
                        showCustomAlert({ title: 'نسخ كود المحل', message: `📋 تم نسخ كود المحل السحابي:\n${id}` });
                    } else {
                        alert(`📋 تم نسخ كود المحل السحابي:\n${id}`);
                    }
                }).catch(() => {
                    if (typeof showCustomPrompt === 'function') {
                        showCustomPrompt({ title: 'كود المحل السحابي', message: 'انسخ كود المحل السحابي الخاص بهذا الجهاز:', defaultValue: id });
                    } else {
                        prompt('انسخ كود المحل السحابي الخاص بهذا الجهاز:', id);
                    }
                });
            } else {
                if (typeof showCustomPrompt === 'function') {
                    showCustomPrompt({ title: 'كود المحل السحابي', message: 'انسخ كود المحل السحابي الخاص بهذا الجهاز:', defaultValue: id });
                } else {
                    prompt('انسخ كود المحل السحابي الخاص بهذا الجهاز:', id);
                }
            }
        },

        // 🔗 نافذة تفاعلية لإدخال كود محل وربط هذا الجهاز بجهاز رئيسي آخر فوراً
        promptLinkShopId: async function () {
            const current = this.getShopId();
            const self = this;
            const handleInput = async (input) => {
                if (!input || !input.trim()) return;
                const clean = input.trim();
                if (clean === current) {
                    if (typeof showToast === 'function') showToast('ℹ️ هذا الجهاز مرتبط بالفعل بهذا الكود.', 'info');
                    return;
                }
                if (clean.length < 5) {
                    if (typeof showCustomAlert === 'function') {
                        showCustomAlert({ title: 'تنبيه', message: '⚠️ كود المحل غير صالح. يرجى التأكد من كتابة الكود بشكل صحيح.' });
                    } else {
                        alert('⚠️ كود المحل غير صالح. يرجى التأكد من كتابة الكود بشكل صحيح.');
                    }
                    return;
                }
                const doLink = async () => {
                    self.setShopId(clean);
                    if (typeof showToast === 'function') {
                        showToast(`🔗 تم ربط الجهاز بكود المحل (${clean}) بنجاح! جاري سحب البيانات كمرآة سحابية...`, 'success', 6000);
                    }
                    await self.runFullSync(true);
                };

                if (typeof showCustomAlert === 'function') {
                    showCustomAlert({
                        title: 'تأكيد الربط السحابي',
                        message: `هل أنت متأكد من ربط هذا الجهاز بكود المحل (${clean})؟\n\nسيتم توحيد قاعدة البيانات السحابية وسحب كافة أصناف وحسابات وفواتير المحل المرتبط فوراً.`,
                        type: 'question',
                        showCancel: true,
                        confirmText: 'نعم، اربط الآن',
                        cancelText: 'إلغاء',
                        onConfirm: doLink
                    });
                } else {
                    const confirmed = confirm(
                        `هل أنت متأكد من ربط هذا الجهاز بكود المحل (${clean})؟\n\nسيتم توحيد قاعدة البيانات السحابية وسحب كافة أصناف وحسابات وفواتير المحل المرتبط فوراً.`
                    );
                    if (confirmed) await doLink();
                }
            };

            if (typeof showCustomPrompt === 'function') {
                showCustomPrompt({
                    title: 'ربط الجهاز سحابياً',
                    message: `🔗 ربط هذا الجهاز بجهاز آخر كمرآة سحابية موحدة:\n\nأدخل كود المحل السحابي (Shop ID) الخاص بالجهاز الرئيسي:\n(يبدأ بـ SHOP_):`,
                    defaultValue: current,
                    onConfirm: handleInput
                });
            } else {
                const input = prompt(
                    `🔗 ربط هذا الجهاز بجهاز آخر كمرآة سحابية موحدة:\n\nأدخل كود المحل السحابي (Shop ID) الخاص بالجهاز الرئيسي:\n(يبدأ بـ SHOP_):`,
                    current
                );
                await handleInput(input);
            }
        },

        // 🔐 استرجاع أو توليد رمز الاقتران PIN الفريد (صلاحية 30 دقيقة + حد أقصى مرتان لكل كود)
        getPairingPin: function () {
            const now = Date.now();
            let meta = null;
            try {
                const rawMeta = (typeof getStore === 'function' ? getStore('bayan_shop_pin_meta') : null) || localStorage.getItem('bayan_shop_pin_meta');
                if (rawMeta) meta = JSON.parse(rawMeta);
            } catch (e) { }

            let pin = (typeof getStore === 'function' ? getStore('bayan_shop_pin') : null) || localStorage.getItem('bayan_shop_pin');
            const isExpired = !meta || !meta.expiresAt || now > Number(meta.expiresAt);
            const isExhausted = meta && Number(meta.usesCount || 0) >= Number(meta.maxUses || 2);

            if (!pin || pin === '2026' || isExpired || isExhausted) {
                pin = Math.floor(100000 + Math.random() * 900000).toString();
                meta = {
                    pin,
                    createdAt: now,
                    expiresAt: now + (30 * 60 * 1000),
                    usesCount: 0,
                    maxUses: 2
                };
                localStorage.setItem('bayan_shop_pin', pin);
                localStorage.setItem('bayan_shop_pin_meta', JSON.stringify(meta));
                if (typeof setStore === 'function') {
                    setStore('bayan_shop_pin', pin);
                    setStore('bayan_shop_pin_meta', JSON.stringify(meta));
                }
                console.log("🔐 [SupabaseSync] تم توليد رمز PIN جديد (صالح لـ 30 دقيقة / مرتين):", pin);
            }
            return pin;
        },

        regeneratePairingPin: function () {
            localStorage.removeItem('bayan_shop_pin_meta');
            if (typeof setStore === 'function') setStore('bayan_shop_pin_meta', '');
            const newPin = this.getPairingPin();
            this.syncPairingPin(newPin).catch(() => { });
            return newPin;
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

        addToSyncQueueBulk: async function (type, action, payloads) {
            if (!Array.isArray(payloads) || payloads.length === 0) return false;
            const ts = new Date().toISOString();
            const baseId = Date.now();
            const items = payloads.map((payload, idx) => ({
                id: baseId + idx,
                timestamp: ts,
                action: action || 'upsert',
                type: type || 'transaction',
                status: 'pending',
                raw_json: JSON.stringify(payload || {})
            }));

            // 1. إدراج دفعي داخل معاملة SQLite واحدة (Zero N+1)
            if (window.sqliteManager && window.sqliteManager.db) {
                try {
                    const insertAll = () => {
                        if (window.sqliteManager.nativeDb) {
                            const stmt = window.sqliteManager.nativeDb.prepare(
                                `INSERT INTO syncQueue (timestamp, action, type, status, raw_json) VALUES (?, ?, ?, ?, ?);`
                            );
                            for (const it of items) {
                                stmt.run(it.timestamp, it.action, it.type, it.status, it.raw_json);
                            }
                        } else {
                            for (const it of items) {
                                window.sqliteManager.db.run(
                                    `INSERT INTO syncQueue (timestamp, action, type, status, raw_json) VALUES (?, ?, ?, ?, ?);`,
                                    [it.timestamp, it.action, it.type, it.status, it.raw_json]
                                );
                            }
                        }
                    };
                    if (typeof window.sqliteManager.runInTransaction === 'function') {
                        window.sqliteManager.runInTransaction(insertAll);
                    } else {
                        insertAll();
                    }
                    if (typeof window.sqliteManager.schedulePersist === 'function') {
                        window.sqliteManager.schedulePersist(400);
                    }
                    return true;
                } catch (e) {
                    console.warn('[SupabaseSync] خطأ الإدراج الدفعي في طابور SQLite:', e.message);
                }
            }

            // 2. Dexie / DB Adapter bulkAdd
            if (window.db && window.db.syncQueue) {
                try {
                    if (typeof window.db.syncQueue.bulkAdd === 'function') {
                        await window.db.syncQueue.bulkAdd(items);
                        return true;
                    }
                } catch (e) { }
            }

            // 3. احتياطي فردي
            for (const p of payloads) {
                await this.addToSyncQueue(type, action, p);
            }
            return true;
        },

        removeSyncQueueItemsBulk: async function (ids) {
            if (!Array.isArray(ids) || ids.length === 0) return;
            const validIds = ids.filter(id => id !== undefined && id !== null);
            if (validIds.length === 0) return;

            if (window.sqliteManager && window.sqliteManager.db) {
                try {
                    const deleteAll = () => {
                        const CHUNK = 200;
                        for (let i = 0; i < validIds.length; i += CHUNK) {
                            const sub = validIds.slice(i, i + CHUNK);
                            const placeholders = sub.map(() => '?').join(',');
                            if (window.sqliteManager.nativeDb) {
                                window.sqliteManager.nativeDb.prepare(`DELETE FROM syncQueue WHERE id IN (${placeholders});`).run(...sub);
                            } else {
                                window.sqliteManager.db.run(`DELETE FROM syncQueue WHERE id IN (${placeholders});`, sub);
                            }
                        }
                    };
                    if (typeof window.sqliteManager.runInTransaction === 'function') {
                        window.sqliteManager.runInTransaction(deleteAll);
                    } else {
                        deleteAll();
                    }
                } catch (e) { }
            }

            if (window.db && window.db.syncQueue) {
                try {
                    if (typeof window.db.syncQueue.bulkDelete === 'function') {
                        await window.db.syncQueue.bulkDelete(validIds);
                    } else if (typeof window.db.syncQueue.delete === 'function') {
                        for (const id of validIds) await window.db.syncQueue.delete(id);
                    }
                } catch (e) { }
            }

            try {
                const idSet = new Set(validIds.map(String));
                let memQ = JSON.parse(localStorage.getItem('bayan_sync_queue_fallback') || '[]');
                if (Array.isArray(memQ) && memQ.length > 0) {
                    memQ = memQ.filter(i => !idSet.has(String(i.id)));
                    localStorage.setItem('bayan_sync_queue_fallback', JSON.stringify(memQ));
                }
            } catch (e) { }
        },

        _buildTransactionCloudRow: function (data, shopId) {
            if (!data) return null;
            if (data.id && data.invoice_id && data.raw_json) return data;

            const rows = Array.isArray(data) ? data : [data];
            const headRow = rows.find(r => r && r.isInvoiceHead) || rows[0];
            if (!headRow) return null;

            const localInvId = String(headRow.invoiceId || headRow.id || '')
                .replace(new RegExp(`^${shopId}_(DESK_|MOB_)?`, 'i'), '')
                .replace(/^#/, '')
                .trim();
            if (!localInvId) return null;

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
                unitFactor: parseFloat(r.unitFactor) || 1,
                size: r.size || r.selectedSize || '',
                color: r.color || r.selectedColor || '',
                barcode: r.barcode || r.code || '',
                code: r.code || r.barcode || '',
                discount: parseFloat(r.itemDiscount != null ? r.itemDiscount : (r.discount != null && !r.distributedDiscount ? r.discount : 0)) || 0,
                itemDiscount: parseFloat(r.itemDiscount != null ? r.itemDiscount : (r.discount != null && !r.distributedDiscount ? r.discount : 0)) || 0,
                distributedDiscount: parseFloat(r.distributedDiscount || 0) || 0,
                addition: parseFloat(r.addition != null ? r.addition : (r.extra != null ? r.extra : 0)) || 0,
                notes: r.notes || ''
            }));

            const calcTotal = rows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
            const grandTotal = (headRow.invoiceGrandTotal !== undefined && headRow.invoiceGrandTotal !== 0)
                ? parseFloat(headRow.invoiceGrandTotal)
                : (parseFloat(headRow.total) || calcTotal);

            return {
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
            };
        },

        _buildProductCloudRow: function (p, shopId) {
            if (!p) return null;
            if (p.id && String(p.id).startsWith(`${shopId}_PROD_`) && p.raw_json) return p;
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
        },

        removeSyncQueueItem: async function (id) {
            return this.removeSyncQueueItemsBulk(id ? [id] : []);
        },

        processSyncQueue: async function () {
            if (this._isProcessingQueue) return 0;
            if (!navigator.onLine || !this._isAllowed()) return 0;
            const cfg = this.getConfig();
            const shopId = cfg.shopId || this.getShopId();
            if (!this.isValidShopId(shopId)) return 0;

            this._isProcessingQueue = true;
            let processed = 0;
            const BATCH_SIZE = 100;
            const MAX_BATCHES_PER_RUN = 10; // حتى 1000 عنصر عبر 10 طلبات Batch فقط بدون N+1
            let hasMorePending = false;
            try {
                for (let batchIdx = 0; batchIdx < MAX_BATCHES_PER_RUN; batchIdx++) {
                    if (!navigator.onLine || !this._isAllowed()) break;
                    const queue = await this.getPendingSyncQueue(BATCH_SIZE);
                    if (!queue || queue.length === 0) break;

                    const invalidIds = [];
                    const txBatchMap = new Map();
                    const txQueueIds = [];
                    const prodBatchMap = new Map();
                    const prodQueueIds = [];
                    const voidItems = [];
                    const treasuryIds = [];

                    for (const qItem of queue) {
                        let data = null;
                        try {
                            data = typeof qItem.raw_json === 'string' ? JSON.parse(qItem.raw_json) : qItem.raw_json;
                        } catch (e) {
                            invalidIds.push(qItem.id);
                            continue;
                        }

                        if (qItem.type === 'transaction') {
                            const row = this._buildTransactionCloudRow(data, shopId);
                            if (row) {
                                txBatchMap.set(String(row.id), row);
                                txQueueIds.push(qItem.id);
                            } else {
                                invalidIds.push(qItem.id);
                            }
                        } else if (qItem.type === 'product') {
                            const row = this._buildProductCloudRow(data, shopId);
                            if (row) {
                                prodBatchMap.set(String(row.id), row);
                                prodQueueIds.push(qItem.id);
                            } else {
                                invalidIds.push(qItem.id);
                            }
                        } else if (qItem.type === 'void') {
                            voidItems.push({ id: qItem.id, data });
                        } else if (qItem.type === 'treasury') {
                            treasuryIds.push(qItem.id);
                        } else {
                            invalidIds.push(qItem.id);
                        }
                    }

                    const succeededIds = [...invalidIds];
                    let networkFailed = false;

                    // 1. Batch Upsert للفواتير (حتى 100 فاتورة في طلب HTTP واحد)
                    if (txBatchMap.size > 0) {
                        const txRows = Array.from(txBatchMap.values());
                        const res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/transactions?on_conflict=id`, {
                            method: 'POST',
                            headers: this._getHeaders(),
                            body: JSON.stringify(txRows)
                        });
                        if (res.ok || res.status === 201 || res.status === 200) {
                            succeededIds.push(...txQueueIds);
                            processed += txQueueIds.length;
                        } else {
                            networkFailed = true;
                        }
                    }

                    // 2. Batch Upsert للأصناف (حتى 100 صنف في طلب HTTP واحد)
                    if (!networkFailed && prodBatchMap.size > 0) {
                        const prodRows = Array.from(prodBatchMap.values());
                        const res = await this._safeFetch(`${cfg.supabaseUrl}/rest/v1/products?on_conflict=id`, {
                            method: 'POST',
                            headers: this._getHeaders(),
                            body: JSON.stringify(prodRows)
                        });
                        if (res.ok || res.status === 201 || res.status === 200) {
                            succeededIds.push(...prodQueueIds);
                            processed += prodQueueIds.length;
                        } else {
                            networkFailed = true;
                        }
                    }

                    // 3. تنفيذ عمليات الإلغاء (void)
                    if (!networkFailed && voidItems.length > 0) {
                        for (const v of voidItems) {
                            const ok = await this.deleteInvoiceFromCloud(v.data.invoiceId, v.data.total, v.data.warehouse);
                            if (ok) {
                                succeededIds.push(v.id);
                                processed++;
                            } else {
                                networkFailed = true;
                                break;
                            }
                        }
                    }

                    // 4. توحيد طلبات الخزينة المكررة في الدفعة لطلب واحد فقط
                    if (!networkFailed && treasuryIds.length > 0) {
                        const ok = await this.syncTreasuryAudit();
                        if (ok) {
                            succeededIds.push(...treasuryIds);
                            processed += treasuryIds.length;
                        } else {
                            networkFailed = true;
                        }
                    }

                    // حذف كافة العناصر الناجحة بعملية SQLite مجمّعة واحدة
                    if (succeededIds.length > 0) {
                        await this.removeSyncQueueItemsBulk(succeededIds);
                    }

                    if (networkFailed) break;
                    if (queue.length < BATCH_SIZE) break;
                    if (batchIdx === MAX_BATCHES_PER_RUN - 1) {
                        hasMorePending = true;
                    } else {
                        await new Promise(r => setTimeout(r, 100));
                    }
                }

                if (processed > 0 && window.sqliteManager && typeof window.sqliteManager.schedulePersist === 'function') {
                    window.sqliteManager.schedulePersist(400);
                }
            } catch (qErr) {
                console.warn('[SupabaseSync] خطأ أثناء تفريغ طابور المزامنة:', qErr.message);
            } finally {
                this._isProcessingQueue = false;
            }

            if (hasMorePending && navigator.onLine && this._isAllowed()) {
                setTimeout(() => { this.processSyncQueue().catch(() => { }); }, 1500);
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
                    unitFactor: parseFloat(r.unitFactor) || 1,
                    size: r.size || r.selectedSize || '',
                    color: r.color || r.selectedColor || '',
                    barcode: r.barcode || r.code || '',
                    code: r.code || r.barcode || '',
                    discount: parseFloat(r.itemDiscount != null ? r.itemDiscount : (r.discount != null && !r.distributedDiscount ? r.discount : 0)) || 0,
                    itemDiscount: parseFloat(r.itemDiscount != null ? r.itemDiscount : (r.discount != null && !r.distributedDiscount ? r.discount : 0)) || 0,
                    distributedDiscount: parseFloat(r.distributedDiscount || 0) || 0,
                    addition: parseFloat(r.addition != null ? r.addition : (r.extra != null ? r.extra : 0)) || 0,
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

            // بناء Map مسبقة لكافة أسطر الفواتير في تمريرة واحدة O(N) لتفادي التكرار التربيعي O(N^2)
            const shopPrefixRegex = new RegExp(`^${shopId}_(DESK_|MOB_)?`, 'i');
            const allTxByInvId = new Map();
            for (let i = 0; i < allTx.length; i++) {
                const row = allTx[i];
                if (!row) continue;
                const rInv = String(row.invoiceId || row.id || '').replace(shopPrefixRegex, '').replace(/^#/, '').trim();
                if (!rInv) continue;
                let list = allTxByInvId.get(rInv);
                if (!list) {
                    list = [];
                    allTxByInvId.set(rInv, list);
                }
                list.push(row);
            }

            // تجميع أسطر الفاتورة الواحدة في كائن موحد يضم مصفوفة items لمنع استبدال الأصناف في السحابة
            const groupedMap = new Map();
            targetTx.forEach(t => {
                if (!t) return;
                const localInvId = String(t.invoiceId || t.id || Math.random().toString(36).substring(2, 9))
                    .replace(shopPrefixRegex, '')
                    .replace(/^#/, '')
                    .trim();
                if (!groupedMap.has(localInvId)) {
                    const invoiceRows = allTxByInvId.get(localInvId);
                    groupedMap.set(localInvId, (invoiceRows && invoiceRows.length > 0) ? invoiceRows : [t]);
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
                    unitFactor: parseFloat(r.unitFactor) || 1,
                    size: r.size || r.selectedSize || '',
                    color: r.color || r.selectedColor || '',
                    barcode: r.barcode || r.code || '',
                    code: r.code || r.barcode || '',
                    discount: parseFloat(r.itemDiscount != null ? r.itemDiscount : (r.discount != null && !r.distributedDiscount ? r.discount : 0)) || 0,
                    itemDiscount: parseFloat(r.itemDiscount != null ? r.itemDiscount : (r.discount != null && !r.distributedDiscount ? r.discount : 0)) || 0,
                    distributedDiscount: parseFloat(r.distributedDiscount || 0) || 0,
                    addition: parseFloat(r.addition != null ? r.addition : (r.extra != null ? r.extra : 0)) || 0,
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
                    // في حال فشل الإرسال المباشر لأي دفعة، يتم إدراجها دفعة واحدة في طابور FIFO (بدون N+1)
                    await this.addToSyncQueueBulk('transaction', 'upsert', chunk);
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
                // ⚡ سحب الأصناف بتقسيم صفحات حقيقي (Range Pagination) لتفادي حد 1000 صف في Supabase
                const remoteRows = [];
                const PAGE_SIZE = 1000;
                const prodUrl = `${cfg.supabaseUrl}/rest/v1/products?id=like.${encodeURIComponent(shopId + '_PROD_%')}&select=*&order=id.asc`;
                for (let page = 0; page < 50; page++) {
                    const from = page * PAGE_SIZE;
                    const to = from + PAGE_SIZE - 1;
                    const pageHeaders = Object.assign({}, this._getHeaders(), {
                        'Range': `${from}-${to}`,
                        'Range-Unit': 'items'
                    });
                    const remoteRes = await this._safeFetch(prodUrl, { headers: pageHeaders });
                    if (remoteRes.status === 416 || !remoteRes.ok) break;
                    const batchRows = await remoteRes.json();
                    if (!Array.isArray(batchRows) || batchRows.length === 0) break;
                    remoteRows.push(...batchRows);
                    if (batchRows.length < PAGE_SIZE) break;
                }

                if (remoteRows.length > 0) {
                    // فهارس بحث فورية O(1) لمنع البحث الخطي O(R × P)
                    const pById = new Map();
                    const pByBarcode = new Map();
                    for (let idx = 0; idx < pList.length; idx++) {
                        const lp = pList[idx];
                        if (!lp) continue;
                        pById.set(String(lp.id), lp);
                        if (lp.barcode && String(lp.barcode).trim()) {
                            pByBarcode.set(String(lp.barcode).trim(), lp);
                        }
                    }

                    const productsToPersist = [];

                    for (const remProd of remoteRows) {
                        const rj = remProd.raw_json || {};
                        const rowShopId = rj.shop_id || (remProd.id.startsWith(shopId + '_') ? shopId : null);
                        if (rowShopId !== shopId) continue;

                        const rawLocalId = String(rj.localId || rj.id || remProd.id.replace(`${shopId}_PROD_`, ''));
                        const remBarcode = String(remProd.barcode || '').trim();

                        let localProd = pById.get(rawLocalId);
                        if (!localProd && remBarcode) {
                            localProd = pByBarcode.get(remBarcode);
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
                            pById.set(String(mappedProd.id), mappedProd);
                            if (mappedProd.barcode) pByBarcode.set(String(mappedProd.barcode).trim(), mappedProd);
                            prodFps.set(String(mappedProd.id), getProdFp(mappedProd));
                            productsToPersist.push(mappedProd);
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
                                if (rj && rj.warehouseStocks && typeof rj.warehouseStocks === 'object') {
                                    localProd.warehouseStocks = rj.warehouseStocks;
                                }
                                changed = true;
                            }
                            const remImg = remProd.image || rj.image || '';
                            if (remImg && remImg !== localProd.image) {
                                localProd.image = remImg;
                                changed = true;
                            }
                            if (!(isExplicitStockAdjustment && Math.abs((parseFloat(localProd.stock) || 0) - remStock) > 0.001) && rj && Array.isArray(rj.variants) && rj.variants.length > 0) {
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
                                productsToPersist.push(localProd);
                                prodFps.set(String(localProd.id), getProdFp(localProd));
                                hasUpdatedLocalProducts = true;
                                updatedLocalCount++;
                            }
                        }
                    }

                    // ⚡ حفظ كافة الأصناف المحدثة والجديدة في معاملة SQLite واحدة (Zero N+1)
                    if (productsToPersist.length > 0 && window.sqliteManager && typeof window.sqliteManager.put === 'function') {
                        const saveAllProds = () => {
                            for (const prodObj of productsToPersist) {
                                try { window.sqliteManager.put('products', prodObj); } catch (e) { }
                            }
                        };
                        if (typeof window.sqliteManager.runInTransaction === 'function') {
                            window.sqliteManager.runInTransaction(saveAllProds);
                        } else {
                            saveAllProds();
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

                // ⚡ فهرسة الذاكرة المحلية مرة واحدة O(N) + استعلام SQLite واحد مجمع لمنع N+1 تماماً
                const shopPrefixRe = new RegExp(`^${shopId}_(DESK_|MOB_)?`, 'i');
                const cleanInvId = (id) => String(id || '').replace(shopPrefixRe, '').replace(/^#/, '').trim();

                const localByInvId = new Map();
                const localByIdOrRemote = new Map();
                const localFingerprints = new Set();

                for (let idx = 0; idx < localTx.length; idx++) {
                    const t = localTx[idx];
                    if (!t) continue;
                    if (t.remoteId) localByIdOrRemote.set(String(t.remoteId), t);
                    if (t.id) localByIdOrRemote.set(String(t.id), t);
                    const tInv = cleanInvId(t.invoiceId || t.id);
                    if (tInv && !localByInvId.has(tInv)) localByInvId.set(tInv, t);

                    const tDate = t.dateISO || (t.date ? String(t.date).slice(0, 10) : '');
                    const tTotal = Math.round((parseFloat(t.invoiceGrandTotal || t.total) || 0) * 100);
                    if (tDate && tTotal > 0) {
                        const tPartner = String(t.partner || '').trim().toLowerCase();
                        const tType = String(t.type || '').trim();
                        localFingerprints.add(`${tDate}|${tTotal}|${tPartner}|${tType}`);
                    }
                }

                // استعلام SQLite واحد فقط لفحص كل معرفات الفواتير السحابية دفعة واحدة بدلاً من N استعلام
                const existingInDbSet = new Set();
                if (window.sqliteManager && window.sqliteManager.db) {
                    const lookupKeys = new Set();
                    for (const it of remoteList) {
                        if (!it) continue;
                        const raw = it.raw_json || {};
                        const cId = cleanInvId(it.invoice_id || raw.invoiceId || it.id);
                        if (cId) lookupKeys.add(cId);
                        if (it.id) lookupKeys.add(String(it.id));
                        if (it.invoice_id) lookupKeys.add(String(it.invoice_id));
                    }
                    const keyArr = Array.from(lookupKeys);
                    if (keyArr.length > 0) {
                        try {
                            const CHUNK = 200;
                            for (let ci = 0; ci < keyArr.length; ci += CHUNK) {
                                const sub = keyArr.slice(ci, ci + CHUNK);
                                const ph = sub.map(() => '?').join(',');
                                const sql = `SELECT invoiceId, id FROM transactions WHERE invoiceId IN (${ph}) OR id IN (${ph});`;
                                const params = [...sub, ...sub];
                                if (window.sqliteManager.nativeDb) {
                                    const dbRows = window.sqliteManager.nativeDb.prepare(sql).all(...params);
                                    for (const r of dbRows) {
                                        if (r.invoiceId) existingInDbSet.add(String(r.invoiceId));
                                        if (r.id) existingInDbSet.add(String(r.id));
                                    }
                                } else {
                                    const stmt = window.sqliteManager.db.prepare(sql);
                                    stmt.bind(params);
                                    while (stmt.step()) {
                                        const r = stmt.getAsObject();
                                        if (r.invoiceId) existingInDbSet.add(String(r.invoiceId));
                                        if (r.id) existingInDbSet.add(String(r.id));
                                    }
                                    stmt.free();
                                }
                            }
                        } catch (dbChkErr) { }
                    }
                }

                remoteList.forEach(item => {
                    const raw = item.raw_json || {};
                    const itemShopId = raw.shop_id || (item.id && item.id.startsWith(shopId + '_') ? shopId : null);
                    // 🔒 عزل المتاجر الصارم: رفض أي حركة لا تنتمي للمحل
                    if (itemShopId !== shopId || (raw.shop_id && raw.shop_id !== shopId)) return;

                    const invId = cleanInvId(item.invoice_id || raw.invoiceId || item.id);
                    if (!invId) return;

                    // 🔒 تخطي الحركات الصادرة من هذا الجهاز إذا كانت مسجلة بالفعل محلياً
                    const isDeskRemote = String(item.id).includes('_DESK_');
                    if (isDeskRemote && (raw.source === 'desktop' || raw.terminalLetter === 'D')) {
                        if (localByInvId.has(invId) || localByIdOrRemote.has(String(item.id))) return;
                    }

                    // 🛡️ فحص عدم التكرار الفوري O(1) بالذاكرة ونتائج استعلام SQLite المجمّع
                    const rDate = item.date_iso ? String(item.date_iso).slice(0, 10) : (raw.dateISO || (raw.date ? String(raw.date).slice(0, 10) : ''));
                    const rTotal = Math.round((parseFloat(item.total !== undefined ? item.total : raw.total) || 0) * 100);
                    const rPartner = String(item.partner || raw.partner || '').trim().toLowerCase();
                    const rType = String(item.type || raw.type || '').trim();
                    const fp = (rDate && rTotal > 0) ? `${rDate}|${rTotal}|${rPartner}|${rType}` : '';

                    const alreadyExistsInMemory = Boolean(
                        localByIdOrRemote.has(String(item.id)) ||
                        localByInvId.has(invId) ||
                        (item.invoice_id && localByInvId.has(cleanInvId(item.invoice_id))) ||
                        (fp && localFingerprints.has(fp))
                    );

                    const alreadyExistsInDB = Boolean(
                        existingInDbSet.has(invId) ||
                        existingInDbSet.has(String(item.id)) ||
                        (item.invoice_id && existingInDbSet.has(String(item.invoice_id)))
                    );

                    const alreadyExists = alreadyExistsInMemory || alreadyExistsInDB;
                    let isNewerRemoteRevision = false;
                    if (alreadyExists && invId) {
                        const remUpdatedAt = item.updated_at ? new Date(item.updated_at).getTime() : (raw.updatedAt ? new Date(raw.updatedAt).getTime() : 0);
                        const localMatch = localByInvId.get(invId) || localByIdOrRemote.get(String(item.id));
                        const localUpdatedAt = localMatch ? new Date(localMatch.updatedAt || localMatch.dateISO || 0).getTime() : 0;
                        if (remUpdatedAt > (localUpdatedAt + 2000)) {
                            isNewerRemoteRevision = true;
                            try {
                                if (typeof window.revertAndClearOldInvoice === 'function' && localMatch) {
                                    window.revertAndClearOldInvoice(invId, localMatch.type || 'بيع 📤');
                                }
                            } catch (revErr) { console.warn('[SupabaseSync] Revert old revision notice:', revErr); }
                        }
                    }

                    if ((!alreadyExists || isNewerRemoteRevision) && invId) {
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

                        // تجريد كائن الرأس من أي حقول تخص البند الفردي لضمان استقلالية كل سطر
                        const rawAdmin = { ...raw };
                        delete rawAdmin.id;
                        delete rawAdmin.product;
                        delete rawAdmin.productName;
                        delete rawAdmin.name;
                        delete rawAdmin.price;
                        delete rawAdmin.cost;
                        delete rawAdmin.costPrice;
                        delete rawAdmin.qty;
                        delete rawAdmin.quantity;
                        delete rawAdmin.size;
                        delete rawAdmin.color;
                        delete rawAdmin.total;
                        delete rawAdmin.discount;
                        delete rawAdmin.itemDiscount;
                        delete rawAdmin.addition;
                        delete rawAdmin.extra;
                        delete rawAdmin.barcode;
                        delete rawAdmin.code;
                        delete rawAdmin.productId;
                        delete rawAdmin.unit;
                        delete rawAdmin.unitFactor;
                        delete rawAdmin.items;

                        items.forEach((it, idx) => {
                            const isHead = (idx === 0);
                            const rowId = baseNumId + idx;
                            const itQty = parseFloat(it.quantity || it.qty || 1);
                            const itPrice = parseFloat(it.price || (it.total ? it.total / itQty : total));
                            const itTotal = parseFloat(it.total || (itPrice * itQty) || 0);

                            const itemProdId = it.productId || it.id || null;
                            const itemBarcode = it.barcode || it.code || '';
                            const itemSize = it.selectedSize || it.size || '';
                            const itemColor = it.selectedColor || it.color || '';
                            const itemUnit = it.selectedUnit ? (typeof it.selectedUnit === 'object' ? it.selectedUnit.unitName : it.selectedUnit) : (it.unit || 'قطعة');
                            const itemFactor = parseFloat(it.unitFactor) || 1;
                            const itemCost = parseFloat(it.cost || it.costPrice || 0) || 0;
                            const itemDiscount = parseFloat(it.discount || it.itemDiscount || 0) || 0;
                            const itemProfit = it.profit !== undefined ? parseFloat(it.profit) : (itTotal - (itemCost * itQty * itemFactor));

                            const row = {
                                ...rawAdmin,
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
                                productId: itemProdId,
                                barcode: itemBarcode,
                                code: itemBarcode,
                                product: it.name || it.product || it.productName || (isHead ? (raw.product || 'صنف') : 'صنف'),
                                unit: itemUnit,
                                unitFactor: itemFactor,
                                size: itemSize,
                                color: itemColor,
                                qty: itQty,
                                price: itPrice,
                                cost: itemCost,
                                discount: itemDiscount.toFixed(2),
                                total: itTotal.toFixed(2),
                                profit: isNaN(itemProfit) ? '0.00' : itemProfit.toFixed(2),
                                partner: partner,
                                user: cashierName,
                                warehouse: warehouse,
                                terminal: terminalDisplayName,
                                terminalLetter: terminalLetter,
                                paidAmount: isHead ? paidAmount : 0,
                                remaining: isHead ? remaining : 0,
                                deferred: isHead ? remaining : 0,
                                isInvoiceHead: isHead,
                                invoiceDiscount: isHead ? (parseFloat(raw.invoiceDiscount || 0) || 0) : 0,
                                invoiceDiscountType: isHead ? (raw.invoiceDiscountType || 'val') : 'val',
                                invoiceTax: isHead ? (parseFloat(raw.invoiceTax || 0) || 0) : 0,
                                invoiceTaxType: isHead ? (raw.invoiceTaxType || 'val') : 'val',
                                invoiceGrandTotal: isHead ? total : 0,
                                raw_items: raw.items || []
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

                // فحص إشعارات اقتران الأجهزة (PAIR_EVENT_) لعدّ استخدامات الكود وتدويره تلقائياً عند بلوغ الحد
                try {
                    const pairEvRes = await this._safeFetch(
                        `${cfg.supabaseUrl}/rest/v1/treasury_audit?id=like.PAIR_EVENT_${encodeURIComponent(shopId)}_*&category=eq.pair_event&order=created_at.desc&limit=10`,
                        { headers: this._getHeaders() }
                    );
                    if (pairEvRes && pairEvRes.ok) {
                        const pairEvRows = await pairEvRes.json();
                        if (Array.isArray(pairEvRows) && pairEvRows.length > 0) {
                            const seenEv = JSON.parse(localStorage.getItem('bayan_seen_pair_events') || '[]');
                            let meta = {};
                            try { meta = JSON.parse(localStorage.getItem('bayan_shop_pin_meta') || '{}'); } catch (_) { }
                            const currentPin = this.getPairingPin();
                            let rotated = false;
                            for (const ev of pairEvRows) {
                                if (!ev || !ev.id || seenEv.includes(ev.id)) continue;
                                seenEv.push(ev.id);
                                const usedPin = String(ev.raw_json?.usedPin || '').trim();
                                if (usedPin && usedPin === String(currentPin).trim()) {
                                    meta.usesCount = (parseInt(meta.usesCount || 0, 10) || 0) + 1;
                                    if (meta.usesCount >= (meta.maxUses || 2)) {
                                        rotated = true;
                                    }
                                }
                            }
                            localStorage.setItem('bayan_seen_pair_events', JSON.stringify(seenEv.slice(-30)));
                            localStorage.setItem('bayan_shop_pin_meta', JSON.stringify(meta));
                            if (rotated && typeof this.regeneratePairingPin === 'function') {
                                this.regeneratePairingPin();
                            }
                        }
                    }
                } catch (_) { }

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
            if (!this._isAllowed()) return;
            const cfg = this.getConfig();
            if (!cfg.supabaseUrl || !cfg.supabaseKey) return;
            const shopId = cfg.shopId || this.getShopId();
            if (!this.isValidShopId(shopId)) return;

            try {
                const pairingPin = customPin || this.getPairingPin();
                const sObj = (typeof settings !== 'undefined' && settings) ? settings : {};
                const shopName = cfg.shopName || sObj.shop_name || sObj.shopName || 'بَيَان فاشون';
                const rawLogo = sObj.shop_logo || sObj.shopLogo || sObj.logo || localStorage.getItem('bayan_shop_logo') || '';
                const safeLogo = (typeof rawLogo === 'string' && rawLogo.length <= 80000) ? rawLogo : '';
                let customPayMethods = [];
                try {
                    const pmRaw = sObj.paymentMethods || sObj.payment_methods || JSON.parse(localStorage.getItem('bayan_payment_methods') || '[]');
                    if (Array.isArray(pmRaw)) customPayMethods = pmRaw;
                } catch (_) { }
                const subEnd = sObj.subscription_end || cfg.subscriptionEnd || localStorage.getItem('bayan_cloud_sub_end') || '';
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
                            phone: sObj.shop_phone || sObj.phone || '',
                            address: sObj.shop_address || sObj.address || '',
                            receiptFooter: sObj.receipt_footer || sObj.receiptFooter || '',
                            taxRate: parseFloat(sObj.tax_rate || sObj.taxRate || 0) || 0,
                            currency: sObj.currency || 'ج.م',
                            shopLogo: safeLogo,
                            paymentMethods: customPayMethods,
                            subscription_end: subEnd,
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
            if (typeof this.renderPairingQrCode === 'function') this.renderPairingQrCode();
            return this.syncPairingPin(pin);
        },

        renderPairingQrCode: function () {
            const box = document.getElementById('supabaseSyncQrContainer');
            if (!box || typeof QRCode === 'undefined') return;
            const shopId = this.getShopId();
            const pin = this.getPairingPin();
            const payload = JSON.stringify({ bayan_sync: 1, shopId: shopId, password: String(pin || '') });
            box.innerHTML = '';
            try {
                new QRCode(box, { text: payload, width: 104, height: 104, colorDark: '#0f172a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
            } catch (_) { }
        },

        downloadPairingQrPng: function () {
            this.renderPairingQrCode();
            const box = document.getElementById('supabaseSyncQrContainer');
            if (!box) return;
            const canvas = box.querySelector('canvas');
            const img = box.querySelector('img');
            const dataUrl = canvas ? canvas.toDataURL('image/png') : (img ? img.src : '');
            if (!dataUrl) return;
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `bayan-sync-qr-${this.getShopId()}.png`;
            a.click();
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
                        const accByCleanName = new Map();
                        for (let idx = 0; idx < accList.length; idx++) {
                            const a = accList[idx];
                            if (a && a.name) accByCleanName.set(cleanArFn(a.name), a);
                        }

                        const accountsToPersist = [];
                        let accChanges = false;

                        for (const rAcc of remoteAccs) {
                            if (!rAcc || !rAcc.name) continue;
                            // 🛡️ حظر قاطع لمنع استيراد أي حساب تجريبي من السحابة نهائياً
                            if (typeof window.isDemoAccount === 'function' && window.isDemoAccount(rAcc.name, rAcc.code)) {
                                continue;
                            }
                            const key = cleanArFn(rAcc.name);
                            const existing = accByCleanName.get(key);
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
                                accByCleanName.set(key, toAdd);
                                accountsToPersist.push(toAdd);
                                accChanges = true;
                            } else {
                                // تحديث الهاتف أو العنوان أو الكود إذا كان أحدث بالسحابة
                                let updated = false;
                                if (rAcc.mobile && rAcc.mobile !== existing.mobile) { existing.mobile = rAcc.mobile; updated = true; }
                                if (rAcc.address && rAcc.address !== existing.address) { existing.address = rAcc.address; updated = true; }
                                if (rAcc.code && !existing.code) { existing.code = rAcc.code; updated = true; }
                                if (updated) {
                                    accountsToPersist.push(existing);
                                    accChanges = true;
                                }
                            }
                        }

                        // ⚡ حفظ كافة العملاء المضافين/المحدثين في معاملة مجمّعة واحدة (Zero N+1)
                        if (accountsToPersist.length > 0) {
                            if (window.sqliteManager && typeof window.sqliteManager.runInTransaction === 'function' && typeof window.sqliteManager.put === 'function') {
                                try {
                                    window.sqliteManager.runInTransaction(() => {
                                        for (const accObj of accountsToPersist) {
                                            window.sqliteManager.put('accounts', accObj);
                                        }
                                    });
                                } catch (e) { }
                            } else if (window.db && window.db.accounts) {
                                try {
                                    if (typeof window.db.accounts.bulkPut === 'function') {
                                        await window.db.accounts.bulkPut(accountsToPersist);
                                    } else {
                                        for (const accObj of accountsToPersist) {
                                            await window.db.accounts.put(accObj);
                                        }
                                    }
                                } catch (e) { }
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

            // تجهيز ورفع العملاء وبنود السندات المخصصة (مع استبعاد أي حسابات تجريبية نهائياً)
            const allMappedAccounts = accList
                .filter(a => a && a.name && (typeof window.isDemoAccount !== 'function' || !window.isDemoAccount(a.name, a.code)))
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
                    if (typeof showCustomAlert === 'function') {
                        showCustomAlert({ title: 'المزامنة السحابية', message: alertMsg });
                    } else if (typeof showToast === 'function') {
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
        updateUIStatus: async function (state, time = null, msg = '') {
            const badge = document.getElementById('supabaseSyncStatusBadge');
            const connText = document.getElementById('supabaseConnectionStatusText');
            const overviewBadge = document.getElementById('supabaseOverviewBadge');
            const activeContent = document.getElementById('supabaseCloudActiveContent');
            const lockedBanner = document.getElementById('supabaseCloudLockedBanner');

            const setCloudControlsLocked = (locked) => {
                if (activeContent) {
                    activeContent.style.display = locked ? 'none' : 'block';
                }
                if (lockedBanner) {
                    lockedBanner.style.display = locked ? 'block' : 'none';
                }
            };

            if (state === 'locked') {
                setCloudControlsLocked(true);
                const st = (typeof window.getCloudSyncStatus === 'function') ? window.getCloudSyncStatus() : {};
                const curShopId = this.getShopId();
                let badgeText = st.label || '🔒 غير مفعلة (باقة أوفلاين)';
                let descText = 'الباقة الحالية لا تشمل السحابة 🔒';
                if (st.reason === 'cloud_server_expired') {
                    badgeText = '⚠️ انتهى الاشتراك السحابي';
                    descText = 'انتهت صلاحية الاشتراك السحابي (يرجى التجديد) ⚠️';
                } else if (st.reason === 'clock_tampered') {
                    badgeText = '🔒 توقيت الجهاز غير مضبوط';
                    descText = 'توقيت الجهاز غير مضبوط — يرجى ضبط الساعة ⚠️';
                } else if (st.reason === 'blocked') {
                    badgeText = '🔒 محظور عن بُعد';
                    descText = 'تم إيقاف المزامنة لهذا الجهاز من الإدارة 🔒';
                } else if (st.allowed !== false && !this.isValidShopId(curShopId)) {
                    badgeText = '⚠️ معرّف المحل غير صالح';
                    descText = 'معرّف المحل غير صالح (يجب أن يبدأ بـ SHOP_) ⚠️';
                }

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

            if (state !== 'locked') {
                setCloudControlsLocked(false);
            }

            if (state === 'online') {
                if (typeof this.renderPairingQrCode === 'function') this.renderPairingQrCode();
                const tStr = time ? time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
                const curShopId = this.getShopId();
                const pendingQueue = (typeof this.getPendingSyncQueue === 'function') ? await this.getPendingSyncQueue(200) : [];
                const pendingCnt = Array.isArray(pendingQueue) ? pendingQueue.length : 0;
                const pendingLabel = pendingCnt > 0 ? ` | بانتظار: ${pendingCnt}` : '';
                if (badge) {
                    badge.innerHTML = `🟢 متصل ويعمل (${curShopId})${tStr ? ' - ' + tStr : ''}${pendingLabel}`;
                    badge.style.color = '#10b981';
                    badge.style.borderColor = '#a7f3d0';
                    badge.style.background = '#ffffff';
                }
                if (connText) {
                    connText.innerHTML = `متصل ويعمل (المحل: ${curShopId})${pendingLabel} 🟢`;
                    connText.style.color = '#059669';
                }
                if (overviewBadge) {
                    overviewBadge.innerHTML = `🟢 متصل (${curShopId})`;
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

        // ⚡ اشتراك لحظي عبر WebSocket (Supabase Realtime) لتحديث الأجهزة خلال 1-2 ثانية
        startRealtimeSubscription: function () {
            try {
                if (this._realtimeWs) {
                    try { this._realtimeWs.close(); } catch (_) { }
                    this._realtimeWs = null;
                }
                if (this._realtimeHb) {
                    clearInterval(this._realtimeHb);
                    this._realtimeHb = null;
                }
                const cfg = this.getConfig();
                const shopId = cfg.shopId || this.getShopId();
                if ((typeof navigator !== 'undefined' && navigator.onLine === false) || !this._isAllowed() || !this.isValidShopId(shopId) || !cfg.supabaseUrl || !cfg.supabaseKey || typeof WebSocket === 'undefined') {
                    return;
                }
                const wsUrl = cfg.supabaseUrl.replace(/^http/, 'ws') + `/realtime/v1/websocket?apikey=${encodeURIComponent(cfg.supabaseKey)}&vsn=1.0.0`;
                const ws = new WebSocket(wsUrl);
                this._realtimeWs = ws;
                ws.onopen = () => {
                    const joinPayload = (topic) => JSON.stringify({
                        topic,
                        event: 'phx_join',
                        payload: { config: { postgres_changes: [{ event: '*', schema: 'public', table: topic.split(':')[2] }] } },
                        ref: String(Date.now())
                    });
                    ws.send(joinPayload('realtime:public:transactions'));
                    ws.send(joinPayload('realtime:public:products'));
                    this._realtimeHb = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(Date.now()) }));
                        }
                    }, 25000);
                };
                ws.onmessage = (evt) => {
                    try {
                        const msg = JSON.parse(evt.data);
                        if (msg && msg.event === 'postgres_changes') {
                            const rec = msg.payload?.data?.record || msg.payload?.data?.old_record || {};
                            if (rec.id && !String(rec.id).startsWith(shopId)) return;
                            if (this._rtDebounce) clearTimeout(this._rtDebounce);
                            this._rtDebounce = setTimeout(() => {
                                if (!this._isPulling && navigator.onLine && this._isAllowed()) {
                                    this._isPulling = true;
                                    this.runFullSync(false).finally(() => { this._isPulling = false; });
                                }
                            }, 800);
                        }
                    } catch (_) { }
                };
            } catch (e) { console.warn('[SupabaseSync] Realtime notice:', e); }
        },

        // ⏱️ إدارة المؤقت التلقائي للمزامنة (احتياطي كل 12 ثانية مع قفل منع التداخل)
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
            this.startRealtimeSubscription();
            if (cfg.autoSyncEnabled && cfg.supabaseUrl && cfg.supabaseKey) {
                const intervalMs = Math.max(12, cfg.syncIntervalSeconds || 12) * 1000;
                this.syncTimer = setInterval(() => {
                    if (navigator.onLine && this._isAllowed() && !this._isPulling) {
                        this._isPulling = true;
                        this.runFullSync(false).catch(() => { }).finally(() => { this._isPulling = false; });
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
                                if (p) this.addToSyncQueue('product', 'upsert', { ...p, isStockAdjustment: true, isManualStockUpdate: true, updatedAt: p.updatedAt || new Date().toISOString() });
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
                if (this._isAllowed()) {
                    this.syncPairingPin().catch(() => { });
                }
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
