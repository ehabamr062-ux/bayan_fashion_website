/**
 * =========================================================================
 * ☁️ BAYAN POS - SUPABASE CLOUD SYNC ENGINE (Standalone Modular Architecture)
 * =========================================================================
 * نظام المزامنة السحابية المستقل لنظام بيان POS عبر Supabase.
 * - يعمل في الخلفية بنظام هادئ وغير معطل لنقطة البيع (Non-Blocking Background Worker).
 * - متوافق 100% مع العمل دون إنترنت (Offline-First): يحفظ محلياً أولاً في SQLite.
 * - يرفع الفواتير، الأصناف، المخزون، وسجلات الخزينة فور توفر الإنترنت.
 * =========================================================================
 */

(function (window) {
    'use strict';

    const DEFAULT_CONFIG = {
        supabaseUrl: 'https://kxhhdskmpaiitsojwcgu.supabase.co',
        supabaseKey: 'sb_publishable_-4w34DQF7f2nsijk_xCuhg_NKWSHFoc',
        autoSyncEnabled: true,
        syncIntervalSeconds: 180
    };

    const BayanSupabaseSync = {
        isSyncing: false,
        isOnline: navigator.onLine,
        lastSyncTime: null,
        lastError: null,
        syncTimer: null,

        // 🔒 التحقق الحاسم من ترخيص المزامنة السحابية قبل أي اتصال بالسحابة
        _isAllowed: function () {
            if (typeof window.isCloudSyncAllowed === 'function') {
                return Boolean(window.isCloudSyncAllowed());
            }
            try {
                const plan = (typeof window.getBayanPlan === 'function') 
                    ? window.getBayanPlan() 
                    : (localStorage.getItem('bayan_current_plan') || '');
                if (!plan || plan.includes('مجانية') || plan.includes('تجريب')) return false;
                const isCloud = plan.includes('سحاب') || plan.includes('Cloud') || (localStorage.getItem('bayan_cloud_sync_licensed') === 'true');
                return Boolean(isCloud);
            } catch (e) {
                return false;
            }
        },

        // 🏪 استرجاع أو توليد معرّف المحل الفريد المستقر (Shop Isolation)
        getShopId: function () {
            let shopId = localStorage.getItem('bayan_shop_id');
            if (!shopId) {
                try {
                    const settings = JSON.parse(localStorage.getItem('pos_settings') || '{}');
                    if (settings.shopId) shopId = settings.shopId;
                } catch (e) {}
            }
            if (!shopId) {
                const randSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
                shopId = 'SHOP_' + randSuffix;
                localStorage.setItem('bayan_shop_id', shopId);
            }
            return shopId;
        },

        // 🔐 استرجاع أو توليد رمز الاقتران PIN الفريد لهذا المحل (Pairing PIN Isolation)
        getPairingPin: function () {
            let pin = localStorage.getItem('bayan_shop_pin');
            if (!pin) {
                pin = '2026';
                localStorage.setItem('bayan_shop_pin', pin);
            }
            return pin;
        },

        // ✏️ تعيين وتحديث رمز PIN الخاص بالمحل ورفعه للسحابة فوراً
        setPairingPin: function (newPin) {
            const clean = String(newPin || '').trim();
            if (clean && clean.length >= 4) {
                localStorage.setItem('bayan_shop_pin', clean);
                if (this._isAllowed()) {
                    this.syncPairingPin(clean).catch(() => {});
                }
                return true;
            }
            return false;
        },

        // ⚙️ استرجاع إعدادات المزامنة السحابية من التخزين المحلي
        getConfig: function () {
            let saved = {};
            try {
                saved = JSON.parse(localStorage.getItem('bayan_supabase_config') || '{}');
            } catch (e) {}
            return {
                supabaseUrl: (saved.supabaseUrl || DEFAULT_CONFIG.supabaseUrl).replace(/\/+$/, ''),
                supabaseKey: saved.supabaseKey || DEFAULT_CONFIG.supabaseKey,
                shopId: saved.shopId || this.getShopId(),
                autoSyncEnabled: saved.autoSyncEnabled !== undefined ? Boolean(saved.autoSyncEnabled) : DEFAULT_CONFIG.autoSyncEnabled,
                syncIntervalSeconds: parseInt(saved.syncIntervalSeconds, 10) || DEFAULT_CONFIG.syncIntervalSeconds
            };
        },

        // 💾 حفظ إعدادات المزامنة
        saveConfig: function (newConfig) {
            const current = this.getConfig();
            const merged = { ...current, ...newConfig };
            localStorage.setItem('bayan_supabase_config', JSON.stringify(merged));
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
                // فحص مسار جدول الأصناف أو مسار REST الأساسي للتأكد من الجداول
                let res = await fetch(`${cfg.supabaseUrl}/rest/v1/products?select=id&limit=1`, {
                    method: 'GET',
                    headers: this._getHeaders()
                });
                if (!res.ok) {
                    res = await fetch(`${cfg.supabaseUrl}/rest/v1/?limit=1`, {
                        method: 'GET',
                        headers: this._getHeaders()
                    });
                }
                if (res.ok || res.status === 200 || res.status === 204) {
                    this.isOnline = true;
                    return { success: true, message: 'تم الاتصال بسحابة Supabase بنجاح والجداول جاهزة 🟢' };
                } else {
                    const errTxt = await res.text();
                    return { success: false, message: `فشل الاتصال: رمز الاستجابة (${res.status})`, details: errTxt };
                }
            } catch (err) {
                return { success: false, message: 'تعذر الاتصال بالإنترنت أو بالسيرفر السحابي', error: err.message };
            }
        },

        // 📦 1. مزامنة الفواتير والمبيعات مع جدول transactions
        syncTransactions: async function () {
            const cfg = this.getConfig();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;

            const allTx = (typeof transactions !== 'undefined' && Array.isArray(transactions))
                ? transactions
                : (window.transactions || []);

            if (allTx.length === 0) return 0;

            // تحديد الفواتير التي تم إنشاؤها أو تعديلها منذ آخر مزامنة
            const lastSyncTs = parseInt(localStorage.getItem('bayan_sb_last_tx_time') || '0', 10);
            const shopId = cfg.shopId || this.getShopId();
            const toSend = allTx.slice(-150).map(t => {
                const localInvId = String(t.invoiceId || t.id || Math.random().toString(36).substring(2, 9));
                return {
                    id: `${shopId}_DESK_${localInvId}`,
                    invoice_id: localInvId,
                    date_iso: t.dateISO || t.date || new Date().toISOString(),
                    time: t.time || '',
                    type: t.type || 'مبيعات',
                    partner: t.partner || 'عميل نقدي',
                    total: parseFloat(t.total) || 0,
                    paid_amount: parseFloat(t.paidAmount) || 0,
                    remaining: parseFloat(t.remaining) || 0,
                    method: t.method || 'كاش',
                    cashier: t.cashier || 'المدير',
                    warehouse: t.warehouse || 'المخزن الرئيسي',
                    raw_json: { ...t, shop_id: shopId, invoiceId: localInvId }
                };
            });

            if (toSend.length === 0) return 0;

            const res = await fetch(`${cfg.supabaseUrl}/rest/v1/transactions?on_conflict=id`, {
                method: 'POST',
                headers: this._getHeaders(),
                body: JSON.stringify(toSend)
            });

            if (res.ok || res.status === 201 || res.status === 200) {
                localStorage.setItem('bayan_sb_last_tx_time', String(Date.now()));
                return toSend.length;
            } else {
                throw new Error(`خطأ في رفع الفواتير: ${res.status}`);
            }
        },

        // 👗 2. مزامنة الأصناف والمخزون مع جدول products
        syncProducts: async function () {
            const cfg = this.getConfig();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;

            const pList = (typeof productsDB !== 'undefined' && Array.isArray(productsDB))
                ? productsDB
                : (window.productsDB || []);

            if (pList.length === 0) return 0;

            const shopId = cfg.shopId || this.getShopId();
            const toSend = pList.map(p => {
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

            // إرسال على دفعات خفيفة لمنع استهلاك الشبكة (Batch of 100)
            const batch = toSend.slice(0, 100);
            const res = await fetch(`${cfg.supabaseUrl}/rest/v1/products?on_conflict=id`, {
                method: 'POST',
                headers: this._getHeaders(),
                body: JSON.stringify(batch)
            });

            if (!res.ok && res.status !== 201 && res.status !== 200) {
                throw new Error(`خطأ في رفع الأصناف: ${res.status}`);
            }

            // 📥 استيراد أي أصناف وموديلات جديدة تمت إضافتها من التابلت (الخاصة بهذا المحل فقط)
            try {
                const remoteRes = await fetch(`${cfg.supabaseUrl}/rest/v1/products?id=like.${encodeURIComponent(shopId)}_PROD_*&select=*`, {
                    headers: this._getHeaders()
                });
                if (remoteRes.ok) {
                    const remoteRows = await remoteRes.json();
                    const localIdSet = new Set(pList.map(p => String(p.id)));
                    const localBarcodeSet = new Set(pList.map(p => String(p.barcode || '')).filter(Boolean));
                    const newFromRemote = (remoteRows || []).filter(r => {
                        const rj = r.raw_json || {};
                        const rowShopId = rj.shop_id || (r.id.startsWith(shopId + '_') ? shopId : null);
                        if (rowShopId !== shopId) return false;

                        const rawLocalId = rj.localId || rj.id || r.id.replace(`${shopId}_PROD_`, '');
                        if (localIdSet.has(String(rawLocalId))) return false;
                        if (r.barcode && localBarcodeSet.has(String(r.barcode))) return false;
                        return true;
                    });

                    if (newFromRemote.length > 0) {
                        for (const remProd of newFromRemote) {
                            const raw = remProd.raw_json || {};
                            const numId = Number(raw.localId || raw.id || remProd.id.replace(`${shopId}_PROD_`, '')) || (Date.now() + Math.floor(Math.random() * 1000));
                            const mappedProd = {
                                id: numId,
                                name: remProd.name || raw.name || 'صنف جديد',
                                barcode: remProd.barcode || raw.barcode || String(numId),
                                category: remProd.category || raw.category || 'عام',
                                unit: remProd.unit || raw.unit || 'قطعة',
                                cost: parseFloat(remProd.cost || raw.cost || 0),
                                price: parseFloat(remProd.price || raw.price || 0),
                                wholesale: parseFloat(remProd.wholesale || raw.wholesale || 0),
                                stock: parseFloat(remProd.stock || raw.stock || 0),
                                variants: Array.isArray(raw.variants) ? raw.variants : [],
                                ...raw
                            };
                            pList.unshift(mappedProd);
                            if (window.sqliteManager && typeof window.sqliteManager.put === 'function') {
                                try { window.sqliteManager.put('products', mappedProd); } catch (e) {}
                            }
                        }
                        if (typeof renderProductsTable === 'function') renderProductsTable();
                        if (typeof updateDashboardStats === 'function') updateDashboardStats();
                        if (typeof showToast === 'function') {
                            showToast(`👗 تم استلام ${newFromRemote.length} صنف وموديل جديد مضاف من التابلت وحفظه بالمخزن بنجاح!`, 'info');
                        }
                    }
                }
            } catch (importErr) {
                console.warn('[SupabaseSync] Pull new products error:', importErr);
            }

            return batch.length;
        },

        // 💰 3. مزامنة حركات الخزينة والدرج مع جدول treasury_audit
        syncTreasuryAudit: async function () {
            const cfg = this.getConfig();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;

            const audits = (typeof treasuryAuditRecords !== 'undefined' && Array.isArray(treasuryAuditRecords))
                ? treasuryAuditRecords
                : (window.treasuryAuditRecords || []);

            if (audits.length === 0) return 0;

            const shopId = cfg.shopId || this.getShopId();
            const toSend = audits.slice(-20).map(a => {
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

            const res = await fetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
                method: 'POST',
                headers: this._getHeaders(),
                body: JSON.stringify(toSend)
            });

            if (res.ok || res.status === 201 || res.status === 200) {
                return toSend.length;
            } else {
                throw new Error(`خطأ في رفع الخزينة: ${res.status}`);
            }
        },

        // 📥 4. استقبال ومزامنة الفواتير الصادرة من التابلت والموبايل فورياً
        pullRemoteTransactions: async function () {
            const cfg = this.getConfig();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;

            try {
                const shopId = cfg.shopId || this.getShopId();
                // استعلام محدد لفواتير الموبايل الخاصة بهذا المحل حصراً
                const res = await fetch(`${cfg.supabaseUrl}/rest/v1/transactions?id=like.${encodeURIComponent(shopId)}_MOB*&order=created_at.desc&limit=50`, {
                    method: 'GET',
                    headers: this._getHeaders()
                });

                if (!res.ok) return 0;
                let remoteList = await res.json();
                if (!Array.isArray(remoteList)) remoteList = [];

                // إذا لم توجد فواتير بالبادئة الجديدة، نفحص كاحتياط فواتير MOB القديمة التي تحمل shop_id مطابق لنفس المحل
                if (remoteList.length === 0) {
                    const legacyRes = await fetch(`${cfg.supabaseUrl}/rest/v1/transactions?id=like.MOB-*&order=created_at.desc&limit=30`, {
                        method: 'GET',
                        headers: this._getHeaders()
                    });
                    if (legacyRes.ok) {
                        const legacyList = await legacyRes.json();
                        if (Array.isArray(legacyList)) {
                            remoteList = legacyList.filter(item => {
                                const r = item.raw_json || {};
                                return r.shop_id === shopId;
                            });
                        }
                    }
                }

                if (remoteList.length === 0) return 0;

                const localTx = (typeof transactions !== 'undefined' && Array.isArray(transactions))
                    ? transactions
                    : (window.transactions || []);

                const pList = (typeof productsDB !== 'undefined' && Array.isArray(productsDB))
                    ? productsDB
                    : (window.productsDB || []);

                const newTransactionRows = [];
                const modifiedProductsList = [];
                const affectedAccountsList = [];
                const cleanAr = (s) => String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');

                remoteList.forEach(item => {
                    const raw = item.raw_json || {};
                    // عزل تام 100%: حظر أي فاتورة لا تخص هذا المحل
                    const itemShopId = raw.shop_id || (item.id && item.id.startsWith(shopId + '_') ? shopId : null);
                    if (itemShopId !== shopId) return;

                    const invId = String(item.invoice_id || raw.invoiceId || item.id || '').replace(`${shopId}_`, '');
                    const alreadyExists = localTx.some(t => String(t.invoiceId || t.id || '') === invId);

                    if (!alreadyExists && invId) {
                        const baseNumId = (raw.numericId && Number.isInteger(Number(raw.numericId)))
                            ? Number(raw.numericId)
                            : (Date.now() + Math.floor(Math.random() * 1000));

                        const now = new Date();
                        const todayISO = now.toLocaleDateString('en-CA');
                        const nowTime = now.toLocaleTimeString('en-GB');
                        const nowFull = now.toLocaleString('ar-EG');
                        const total = parseFloat(item.total) || 0;
                        const paidAmount = parseFloat(item.paid_amount) || 0;
                        const remaining = parseFloat(item.remaining) || 0;
                        const partner = String(item.partner || 'عميل نقدي').trim();
                        const method = String(item.method || 'كاش').trim();
                        const warehouse = item.warehouse || 'المخزن الرئيسي';
                        const isCredit = (method === 'أجل' || remaining > 0.001);

                        const items = (Array.isArray(raw.items) && raw.items.length > 0)
                            ? raw.items
                            : [{ name: 'مبيعات موبايل', quantity: 1, price: total, total: total, size: '', color: '' }];

                        // إنشاء صفوف الفاتورة المتوافقة 100% مع هيكل جدول الفواتير في النظام الرئيسي
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
                                date: raw.date || nowFull,
                                dateISO: raw.dateISO || todayISO,
                                timeISO: raw.time || nowTime,
                                type: 'بيع 📤',
                                method: method,
                                product: it.name || 'صنف',
                                unit: it.unit || 'قطعة',
                                size: it.size || '',
                                color: it.color || '',
                                qty: itQty,
                                price: itPrice,
                                total: itTotal.toFixed(2),
                                profit: '0.00',
                                partner: partner,
                                user: item.cashier || 'تابلت',
                                warehouse: warehouse,
                                terminal: 'تابلت (B)',
                                terminalLetter: 'B',
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

                        // تنبيه النظام بتحديث رصيد العميل عبر الكاش المباشر دون المساس بالرصيد الافتتاحي
                        if (isCredit && partner && partner !== 'عميل نقدي') {
                            if (typeof window.invalidateAccountBalancesCache === 'function') {
                                window.invalidateAccountBalancesCache(partner);
                            }
                        }

                        // حسم المخزون محلياً للمقاسات والألوان للأصناف المباعة في الفاتورة الواردة
                        if (Array.isArray(raw.items) && raw.items.length > 0) {
                            raw.items.forEach(soldItem => {
                                const prod = pList.find(p => String(p.id) === String(soldItem.productId || soldItem.id) || (soldItem.barcode && p.barcode === soldItem.barcode));
                                if (prod) {
                                    const qty = parseFloat(soldItem.quantity || soldItem.qty || 1);
                                    const sSize = String(soldItem.size || '').trim().toLowerCase();
                                    const sColor = String(soldItem.color || '').trim().toLowerCase();
                                    const activeWH = item.warehouse || 'المخزن الرئيسي';

                                    if (Array.isArray(prod.variants) && prod.variants.length > 0) {
                                        const cleanV = (s) => String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
                                        const cSize = cleanV(sSize);
                                        const cColor = cleanV(sColor);
                                        const vMatch = prod.variants.find(v => 
                                            (!cSize || cleanV(v.size) === cSize) &&
                                            (!cColor || cleanV(v.color) === cColor)
                                        );
                                        if (vMatch) {
                                            vMatch.stock = Math.max(0, (parseFloat(vMatch.stock) || 0) - qty);
                                            if (!vMatch.warehouseStocks) vMatch.warehouseStocks = {};
                                            vMatch.warehouseStocks[activeWH] = Math.max(0, (parseFloat(vMatch.warehouseStocks[activeWH]) || 0) - qty);
                                        }
                                        prod.stock = prod.variants.reduce((sum, v) => sum + (parseFloat(v.stock) || 0), 0);
                                        if (!prod.warehouseStocks) prod.warehouseStocks = {};
                                        prod.warehouseStocks[activeWH] = prod.variants.reduce((sum, v) => {
                                            const vWh = (v.warehouseStocks && v.warehouseStocks[activeWH] !== undefined)
                                                ? parseFloat(v.warehouseStocks[activeWH])
                                                : (activeWH === 'المخزن الرئيسي' ? (parseFloat(v.stock) || 0) : 0);
                                            return sum + vWh;
                                        }, 0);
                                    } else {
                                        prod.stock = Math.max(0, (parseFloat(prod.stock || 0) - qty));
                                        if (!prod.warehouseStocks) prod.warehouseStocks = {};
                                        prod.warehouseStocks[activeWH] = Math.max(0, (parseFloat(prod.warehouseStocks[activeWH] || 0) - qty));
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
                    // 🩹 ترميم وتصحيح تلقائي لأي رصيد افتتاحي لعميل تم تعديله خطأ في السابق
                    const allAccountsList = (typeof accounts !== 'undefined' && Array.isArray(accounts)) ? accounts : (window.accounts || []);
                    allAccountsList.forEach(a => {
                        if (!a) return;
                        if (cleanAr(a.name) === cleanAr('طه') && (parseFloat(a.debit) === 400 || a.debit == '400') && (parseFloat(a.credit) === 70 || a.credit == '70')) {
                            a.debit = '0';
                            delete a.balance;
                            if (typeof db !== 'undefined' && db.accounts) {
                                db.accounts.put(a).catch(e => console.warn("Repair account err:", e));
                            }
                        }
                    });

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

                    if (typeof window.invalidateAccountBalancesCache === 'function') {
                        window.invalidateAccountBalancesCache();
                    }

                    if (typeof renderInvoicesTable === 'function') renderInvoicesTable();
                    if (typeof debouncedRenderInvoicesTable === 'function') debouncedRenderInvoicesTable(50);
                    if (typeof renderDailyReportTable === 'function') renderDailyReportTable();
                    if (typeof updateDashboardStats === 'function') updateDashboardStats();
                    if (typeof renderProductsTable === 'function') renderProductsTable();
                    if (typeof renderAccountsTable === 'function') renderAccountsTable();

                    if (typeof showToast === 'function') {
                        showToast(`📱 تم استلام فاتورة واردة من التابلت وتسجيلها بقسم الفواتير وحسم المخزون بنجاح!`, 'info');
                    }
                }

                // 🗑️ فحص أي فواتير تم حذفها أو إلغاؤها من التابلت واسترجاع المخزون محلياً
                try {
                    const voidRes = await fetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?id=like.${encodeURIComponent(shopId)}_VOID_*&category=eq.void_tx&order=created_at.desc&limit=20`, {
                        headers: this._getHeaders()
                    });
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
                                    if (Array.isArray(txToVoid.items) && txToVoid.items.length > 0) {
                                        txToVoid.items.forEach(soldItem => {
                                            const prod = pList.find(p => String(p.id) === String(soldItem.productId || soldItem.id) || (soldItem.barcode && p.barcode === soldItem.barcode));
                                            if (prod) {
                                                const qty = parseFloat(soldItem.quantity || soldItem.qty || 1);
                                                if (Array.isArray(prod.variants) && prod.variants.length > 0) {
                                                    const sSize = String(soldItem.size || '').trim().toLowerCase();
                                                    const sColor = String(soldItem.color || '').trim().toLowerCase();
                                                    const targetVariant = prod.variants.find(v => {
                                                        const vSize = String(v.size || '').trim().toLowerCase();
                                                        const vColor = String(v.color || '').trim().toLowerCase();
                                                        return (vSize === sSize || !sSize) && (vColor === sColor || !sColor);
                                                    });
                                                    if (targetVariant) {
                                                        targetVariant.stock = (parseFloat(targetVariant.stock || 0)) + qty;
                                                        if (targetVariant.quantity !== undefined) targetVariant.quantity = targetVariant.stock;
                                                    }
                                                }
                                                const sumVariants = Array.isArray(prod.variants) && prod.variants.length > 0
                                                    ? prod.variants.reduce((sum, v) => sum + (parseFloat(v.stock || v.quantity || 0)), 0)
                                                    : (parseFloat(prod.stock || prod.quantity || 0)) + qty;
                                                prod.stock = sumVariants;
                                                prod.quantity = sumVariants;
                                                if (!modifiedProductsList.some(mp => mp.id === prod.id)) {
                                                    modifiedProductsList.push(prod);
                                                }
                                            }
                                        });
                                    }
                                    localTx.splice(localIdx, 1);
                                    if (window.sqliteManager && typeof window.sqliteManager.run === 'function') {
                                        try { window.sqliteManager.run(`DELETE FROM transactions WHERE invoiceId = ? OR id = ?`, [voidInvId, txToVoid.id]); } catch(e){}
                                    }
                                    hasVoidChanges = true;
                                }
                            }
                            if (hasVoidChanges) {
                                if (typeof window.saveTransactionChanges === 'function') {
                                    await window.saveTransactionChanges({ modifiedProducts: modifiedProductsList });
                                }
                                if (typeof renderInvoicesTable === 'function') renderInvoicesTable();
                                if (typeof debouncedRenderInvoicesTable === 'function') debouncedRenderInvoicesTable(50);
                                if (typeof renderDailyReportTable === 'function') renderDailyReportTable();
                                if (typeof updateDashboardStats === 'function') updateDashboardStats();
                                if (typeof renderProductsTable === 'function') renderProductsTable();
                                if (typeof showToast === 'function') showToast('🔄 تم مزامنة إلغاء فاتورة من التابلت واسترجاع المخزون بنجاح', 'info');
                            }
                        }
                    }
                } catch (voidErr) {
                    console.warn('[SupabaseSync] Check voided transactions notice:', voidErr);
                }

                return newTransactionRows.length;
            } catch (err) {
                console.warn('[SupabaseSync] Pull remote transactions error:', err);
                return 0;
            }
        },

        // 🗑️ 4.1 حذف فاتورة من السحابة وإشعار كافة الأجهزة المتصلة بإلغائها فورياً
        deleteInvoiceFromCloud: async function (invoiceId, total = 0, warehouse = 'المخزن الرئيسي') {
            const cfg = this.getConfig();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey || !invoiceId) return false;
            try {
                const invStr = String(invoiceId).trim();
                const shopId = cfg.shopId || this.getShopId();

                // 1. حذف الفاتورة نهائياً من جدول transactions بالسحابة
                const scopedDeskId = `${shopId}_DESK_${invStr}`;
                const scopedMobId = `${shopId}_${invStr}`;

                await fetch(`${cfg.supabaseUrl}/rest/v1/transactions?id=in.(${encodeURIComponent(scopedDeskId)},${encodeURIComponent(scopedMobId)},${encodeURIComponent(invStr)})`, {
                    method: 'DELETE',
                    headers: this._getHeaders()
                }).catch(() => {});

                await fetch(`${cfg.supabaseUrl}/rest/v1/transactions?invoice_id=eq.${encodeURIComponent(invStr)}`, {
                    method: 'DELETE',
                    headers: this._getHeaders()
                }).catch(() => {});

                // 2. تسجيل حركة إبطال في جدول treasury_audit لإعلام جميع أجهزة التابلت والموبايل فوراً
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

                await fetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
                    method: 'POST',
                    headers: this._getHeaders(),
                    body: JSON.stringify(voidPayload)
                }).catch(() => {});

                // 3. رفع الأصناف المسترجعة لتحديث أرصدة المخازن فورياً بالسحابة
                await this.syncProducts().catch(() => {});

                // 4. رفع أرصدة الحسابات لتحديث رصيد العميل فورياً بالسحابة
                await this.syncCustomers().catch(() => {});

                return true;
            } catch (err) {
                console.warn('[SupabaseSync] Delete invoice from cloud notice:', err);
                return false;
            }
        },

        // 🔐 5. تسجيل رمز إقران الأجهزة المعتمد في السحابة مع عزل كل متجر
        syncPairingPin: async function (customPin = null) {
            const cfg = this.getConfig();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return;
            try {
                const shopId = cfg.shopId || this.getShopId();
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
                await fetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
                    method: 'POST',
                    headers: this._getHeaders(),
                    body: JSON.stringify(payload)
                });
            } catch (e) {}
        },

        // 👥 5.1 مزامنة قائمة العملاء والموردين مع السحابة لتمكين التابلت من استعراض كافة الحسابات والبيع
        syncCustomers: async function () {
            const cfg = this.getConfig();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;

            let accList = (typeof accounts !== 'undefined' && Array.isArray(accounts) && accounts.length > 0)
                ? accounts
                : (window.accounts || []);

            // فحص قاعدة البيانات المحلية كاحتياط لضمان قراءة كافة الحسابات
            if ((!accList || accList.length === 0) && typeof db !== 'undefined' && db.accounts) {
                try {
                    accList = await db.accounts.toArray();
                } catch (e) {}
            }

            if (!accList || accList.length === 0) return 0;

            const shopId = cfg.shopId || this.getShopId();

            // 📥 استيراد أي عملاء أو موردين جدد أضيفوا من التابلت الخاص بهذا المحل فقط
            try {
                const remoteRes = await fetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?id=eq.CONFIG_CUSTOMERS_LIST_${encodeURIComponent(shopId)}`, {
                    headers: this._getHeaders()
                });
                if (remoteRes.ok) {
                    const rows = await remoteRes.json();
                    const shopRow = (rows || [])[0];
                    if (shopRow && shopRow.raw_json) {
                        const remoteAccs = Array.isArray(shopRow.raw_json.accounts) 
                            ? shopRow.raw_json.accounts 
                            : (Array.isArray(shopRow.raw_json.customers) ? shopRow.raw_json.customers : []);
                        
                        const cleanArFn = (s) => String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
                        const localNames = new Set(accList.map(a => cleanArFn(a.name)));
                        const newFromMobile = remoteAccs.filter(ra => ra && ra.name && !localNames.has(cleanArFn(ra.name)));

                        if (newFromMobile.length > 0) {
                            for (const nAcc of newFromMobile) {
                                const newId = Number(nAcc.id) || (Date.now() + Math.floor(Math.random() * 1000));
                                const debitVal = nAcc.balance > 0 ? String(nAcc.balance) : '0';
                                const creditVal = nAcc.balance < 0 ? String(Math.abs(nAcc.balance)) : '0';
                                const toAdd = {
                                    id: newId,
                                    name: nAcc.name.trim(),
                                    code: nAcc.code || String(newId).slice(-4),
                                    type: nAcc.type || 'client',
                                    mobile: nAcc.mobile || '',
                                    address: nAcc.address || '',
                                    debit: debitVal,
                                    credit: creditVal,
                                    balance: nAcc.balance || 0
                                };
                                accList.push(toAdd);
                                if (window.db && window.db.accounts) {
                                    try { await window.db.accounts.put(toAdd); } catch(e){}
                                }
                            }
                            if (typeof renderAccountsTable === 'function') renderAccountsTable();
                            if (typeof showToast === 'function') {
                                showToast(`👥 تم استلام ${newFromMobile.length} حساب جديد مضاف من التابلت وحفظه بالحسابات بنجاح!`, 'info');
                            }
                        }
                    }
                }
            } catch (impErr) {
                console.warn('[SupabaseSync] Pull new accounts notice:', impErr);
            }

            // استخلاص كل الحسابات (عملاء وموردين) مع تحديد نوع الحساب وحساب الرصيد الحقيقي المعتمد
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
                        updatedAt: new Date().toISOString() 
                    }
                }
            ];

            const res = await fetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
                method: 'POST',
                headers: this._getHeaders(),
                body: JSON.stringify(payload)
            });

            if (res.ok || res.status === 201 || res.status === 200) {
                return allMappedAccounts.length;
            }
            return 0;
        },

        // 🏬 5.2 مزامنة قائمة المخازن المعتمدة مع السحابة لتمكين التابلت من استعراض مخازن اللابتوب الحقيقية
        syncWarehouses: async function () {
            const cfg = this.getConfig();
            if (!this._isAllowed() || !cfg.supabaseUrl || !cfg.supabaseKey) return 0;

            let whList = (typeof warehouses !== 'undefined' && Array.isArray(warehouses) && warehouses.length > 0)
                ? warehouses
                : (window.warehouses || []);

            if ((!whList || whList.length === 0) && typeof db !== 'undefined' && db.warehouses) {
                try {
                    whList = await db.warehouses.toArray();
                } catch (e) {}
            }

            if (!whList || whList.length === 0) {
                whList = [{ id: 1, name: 'المخزن الرئيسي' }];
            }

            const shopId = cfg.shopId || this.getShopId();
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
                await fetch(`${cfg.supabaseUrl}/rest/v1/treasury_audit?on_conflict=id`, {
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
            // فحص ترخيص المزامنة السحابية أولاً لمنع المزامنة لباقات الأوفلاين والنسخ التجريبية
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

            if (this.isSyncing) return { status: 'busy' };
            if (!navigator.onLine) {
                this.isOnline = false;
                this.updateUIStatus('offline');
                return { status: 'offline' };
            }

            this.isSyncing = true;
            this.updateUIStatus('syncing');

            try {
                // سحب فواتير الموبايل أولاً وخصمها من المخزن، ثم رفع الحركات والأصناف والعملاء والمخازن
                const remoteCount = await this.pullRemoteTransactions().catch(() => 0);
                const txCount = await this.syncTransactions().catch(() => 0);
                const pCount = await this.syncProducts().catch(() => 0);
                const auditCount = await this.syncTreasuryAudit().catch(() => 0);
                const custCount = await this.syncCustomers().catch(() => 0);
                const whCount = await this.syncWarehouses().catch(() => 0);

                this.lastSyncTime = new Date();
                this.lastError = null;
                this.isOnline = true;
                this.updateUIStatus('online', this.lastSyncTime);

                if (manual && typeof showToast === 'function') {
                    showToast(`☁️ تمت المزامنة مع Supabase بنجاح (فواتير: ${txCount} | أصناف: ${pCount} | عملاء: ${custCount} | وارد من التابلت: ${remoteCount})`, 'success');
                }

                return { success: true, txCount, pCount, auditCount, custCount, remoteCount };
            } catch (err) {
                this.lastError = err.message;
                this.updateUIStatus('error', null, err.message);
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
                return; // لا تشغيل للمؤقت إطلاقاً ما لم تكن الباقة سحابية مصرحة
            }
            const cfg = this.getConfig();
            if (cfg.autoSyncEnabled && cfg.supabaseUrl && cfg.supabaseKey) {
                const intervalMs = Math.max(120, cfg.syncIntervalSeconds || 180) * 1000;
                this.syncTimer = setInterval(() => {
                    this.runFullSync(false).catch(() => {});
                }, intervalMs);
            }
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
        init: function () {
            console.log('☁️ [SupabaseSync] Initializing Bayan Cloud Sync Engine...');

            // فحص فوري ومباشر للترخيص عند الإقلاع
            if (!this._isAllowed()) {
                console.log('🔒 [SupabaseSync] Cloud sync locked: Offline or Trial license tier.');
                this.updateUIStatus('locked');
            }

            // مستمعات الاتصال بالإنترنت
            window.addEventListener('online', () => {
                this.isOnline = true;
                if (!this._isAllowed()) {
                    this.updateUIStatus('locked');
                    return;
                }
                this.runFullSync(false).catch(() => {});
            });
            window.addEventListener('offline', () => {
                this.isOnline = false;
                if (!this._isAllowed()) {
                    this.updateUIStatus('locked');
                } else {
                    this.updateUIStatus('offline');
                }
            });

            // ربط خطاف الحفظ المحلي الهادئ: عند حفظ فاتورة محلية، نطلق مزامنة بعد ثانيتين بهدوء
            if (window.BayanNetworkHub) {
                const origOnDataSaved = window.BayanNetworkHub.onDataSaved;
                window.BayanNetworkHub.onDataSaved = () => {
                    if (typeof origOnDataSaved === 'function') origOnDataSaved();
                    if (!this._isAllowed()) {
                        return;
                    }
                    setTimeout(() => this.runFullSync(false).catch(() => {}), 2000);
                };
            }

            // فحص الترخيص وبدء المزامنة بعد ثوانٍ من فتح البرنامج
            setTimeout(() => {
                if (!this._isAllowed()) {
                    console.log('🔒 [SupabaseSync] Cloud sync locked for offline/trial license tier.');
                    this.updateUIStatus('locked');
                    return;
                }
                this.syncPairingPin();
                this.runFullSync(false).catch(() => {});
                this.restartSyncTimer();
            }, 3000);

            // تحديث بطاقة PIN ومعرف المحل وحالة الواجهة في شاشة الإعدادات
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
