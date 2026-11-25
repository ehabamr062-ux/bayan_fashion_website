/**
 * =========================================================================
 * 🛒 BAYAN POS FASHION — ONLINE ORDERS MODULE (Firebase Firestore Live)
 * =========================================================================
 * قسم «طلبات الأونلاين» المربوط لحظياً بمتجر بيان للأزياء (bayan_fashion_store)
 * - اتصال صامت بـ Firebase Firestore على المسار: shops/{shopId}/orders
 * - صمود كامل أوفلاين (بدون أخطاء مزعجة + كاش محلي للعرض)
 * - تنبيه صوتي + Toast + شارة عداد حية عند وصول طلبات جديدة
 * - مطابقة ذكية للأصناف والمقاسات والألوان مع FashionStockEngine
 * - خياران للتحويل: فتح جاهز في شاشة الكاشير (POS) أو حفظ فاتورة مباشرة
 * =========================================================================
 */

(function (window) {
    'use strict';

    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyDpj0lpvZ5zObBrsgCqX6Si8Gd5IHLA-Og",
        authDomain: "bayan-fashion-live.firebaseapp.com",
        projectId: "bayan-fashion-live",
        storageBucket: "bayan-fashion-live.firebasestorage.app",
        messagingSenderId: "459605231616",
        appId: "1:459605231616:web:6e720d9e1e969a3e7bf0e5",
        measurementId: "G-J9SH3PXS2S"
    };

    const STATUS_META = {
        'new': { label: 'جديد', icon: '🆕', bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
        'pending': { label: 'جديد', icon: '🆕', bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
        'processing': { label: 'قيد التجهيز', icon: '📦', bg: '#e0f2fe', color: '#0369a1', border: '#38bdf8' },
        'shipped': { label: 'تم الشحن', icon: '🚚', bg: '#ede9fe', color: '#6d28d9', border: '#a78bfa' },
        'confirmed': { label: 'تم التحويل لفاتورة', icon: '✅', bg: '#dcfce7', color: '#166534', border: '#22c55e' },
        'delivered': { label: 'تم التسليم', icon: '🎉', bg: '#dcfce7', color: '#166534', border: '#22c55e' },
        'cancelled': { label: 'ملغي', icon: '❌', bg: '#fee2e2', color: '#991b1b', border: '#f87171' }
    };

    const BayanOnlineOrders = {
        orders: [],
        isConnected: false,
        _unsubscribe: null,
        _initialLoaded: false,
        _knownIds: new Set(),
        _sdkLoading: false,
        _firestore: null,
        currentStatusFilter: 'all',
        currentSearchQuery: '',

        getShopId() {
            try {
                if (window.BayanSupabaseSync && typeof window.BayanSupabaseSync.getShopId === 'function') {
                    const id = window.BayanSupabaseSync.getShopId();
                    if (id) return id;
                }
                const stored = (typeof getStore === 'function' ? getStore('bayan_shop_id') : null)
                    || (typeof localStorage !== 'undefined' ? localStorage.getItem('bayan_shop_id') : null);
                if (stored && String(stored).trim().length >= 3) return String(stored).trim();
            } catch (_) { }
            return 'SHOP_DEMO';
        },

        getStoreUrl() {
            const shopId = this.getShopId();
            const customBase = (typeof getStore === 'function' ? getStore('bayan_online_store_url') : null) || '';
            if (customBase && /^https?:\/\//i.test(customBase.trim())) {
                const sep = customBase.includes('?') ? '&' : '?';
                return `${customBase.trim()}${sep}shop=${encodeURIComponent(shopId)}`;
            }
            return `https://ehabamr062-ux.github.io/bayan-fashion-store/?shop=${encodeURIComponent(shopId)}`;
        },

        getAdminUrl() {
            const shopId = this.getShopId();
            return `https://ehabamr062-ux.github.io/bayan-fashion-store/admin.html?shop=${encodeURIComponent(shopId)}`;
        },

        openAdminPanel() {
            const url = this.getAdminUrl();
            try { window.open(url, '_blank', 'noopener'); } catch (_) { }
        },

        _esc(str) {
            if (typeof escapeHtml === 'function') return escapeHtml(str);
            return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        },

        _playNewOrderBeep() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                const now = ctx.currentTime;
                [880, 1174.66].forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + idx * 0.14);
                    gain.gain.setValueAtTime(0.001, now + idx * 0.14);
                    gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.14 + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.22);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + idx * 0.14);
                    osc.stop(now + idx * 0.14 + 0.24);
                });
                setTimeout(() => { try { ctx.close(); } catch (_) { } }, 600);
            } catch (_) { }
        },

        _loadCachedOrders() {
            try {
                const raw = (typeof getStore === 'function' ? getStore('bayan_cached_online_orders') : null)
                    || (typeof localStorage !== 'undefined' ? localStorage.getItem('bayan_cached_online_orders') : null);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        this.orders = parsed;
                        parsed.forEach(o => { if (o && (o.firestoreId || o.id)) this._knownIds.add(String(o.firestoreId || o.id)); });
                    }
                }
            } catch (_) { }
        },

        _saveCachedOrders() {
            try {
                const trimmed = this.orders.slice(0, 200);
                const str = JSON.stringify(trimmed);
                if (typeof setStore === 'function') setStore('bayan_cached_online_orders', str);
                else if (typeof localStorage !== 'undefined') localStorage.setItem('bayan_cached_online_orders', str);
            } catch (_) { }
        },

        _loadScript(src) {
            return new Promise((resolve, reject) => {
                if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
                const s = document.createElement('script');
                s.src = src;
                s.async = true;
                s.onload = () => resolve(true);
                s.onerror = () => reject(new Error('Failed to load ' + src));
                document.head.appendChild(s);
            });
        },

        async _ensureFirebaseReady() {
            if (this._firestore) return this._firestore;
            if (!navigator.onLine) {
                this._setConnectionState(false);
                return null;
            }
            if (this._sdkLoading) return null;
            this._sdkLoading = true;
            try {
                if (typeof window.firebase === 'undefined' || !window.firebase.firestore) {
                    await this._loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
                    await this._loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
                }
                if (typeof window.firebase !== 'undefined') {
                    let app = window.firebase.apps.find(a => a.name === 'bayanOnlineStore');
                    if (!app) {
                        app = window.firebase.initializeApp(FIREBASE_CONFIG, 'bayanOnlineStore');
                    }
                    this._firestore = app.firestore();
                    return this._firestore;
                }
            } catch (_) {
                this._setConnectionState(false);
            } finally {
                this._sdkLoading = false;
            }
            return null;
        },

        _setConnectionState(online) {
            this.isConnected = Boolean(online);
            const pill = document.getElementById('onlineOrdersStatusPill');
            if (pill) {
                pill.innerHTML = this.isConnected
                    ? '<span style="background:#dcfce7; color:#166534; border:1px solid #86efac; padding:4px 12px; border-radius:999px; font-size:0.8rem; font-weight:900;">متصل بالمتجر 🟢</span>'
                    : '<span style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:4px 12px; border-radius:999px; font-size:0.8rem; font-weight:900;">غير متصل 🔴</span>';
            }
        },

        _updateBadges() {
            const newCount = this.orders.filter(o => o && (o.status === 'new' || o.status === 'pending' || !o.status)).length;
            ['onlineOrdersHeaderBadge', 'onlineOrdersTileBadge'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (newCount > 0) {
                    el.textContent = newCount > 99 ? '99+' : String(newCount);
                    el.style.display = 'inline-flex';
                } else {
                    el.style.display = 'none';
                }
            });
        },

        async startListening() {
            this._ensureMachineId().catch(() => { });
            this._loadCachedOrders();
            this._updateBadges();

            if (!navigator.onLine) {
                this._setConnectionState(false);
                return;
            }
            const db = await this._ensureFirebaseReady();
            if (!db) {
                this._setConnectionState(false);
                return;
            }

            if (this._unsubscribe) {
                try { this._unsubscribe(); } catch (_) { }
                this._unsubscribe = null;
            }

            const shopId = this.getShopId();
            const colRef = db.collection('shops').doc(shopId).collection('orders');

            try {
                this._unsubscribe = colRef.onSnapshot(
                    (snapshot) => {
                        this._setConnectionState(true);
                        const list = [];
                        let newlyArrived = 0;

                        snapshot.forEach(doc => {
                            const data = doc.data() || {};
                            const orderObj = { firestoreId: doc.id, ...data };
                            list.push(orderObj);
                            const key = String(doc.id);
                            if (this._initialLoaded && !this._knownIds.has(key) && (orderObj.status === 'new' || orderObj.status === 'pending' || !orderObj.status)) {
                                newlyArrived++;
                            }
                            this._knownIds.add(key);
                        });

                        list.sort((a, b) => {
                            const ta = new Date(a.date || (a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : 0)).getTime() || 0;
                            const tb = new Date(b.date || (b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : 0)).getTime() || 0;
                            return tb - ta;
                        });

                        const totalOrdersCount = list.length;
                        list.forEach((o, idx) => {
                            const seq = totalOrdersCount - idx;
                            o.seqId = o.orderNumber || (/^\d+$/.test(String(o.id || '')) ? o.id : seq);
                        });

                        this.orders = list;
                        this._initialLoaded = true;
                        this._saveCachedOrders();
                        this._updateBadges();

                        if (newlyArrived > 0) {
                            this._playNewOrderBeep();
                            if (typeof showToast === 'function') {
                                showToast(`🛒 وصل ${newlyArrived} طلب أونلاين جديد من المتجر الإلكتروني!`, 'success', 6000);
                            }
                            const latest = list[0] || {};
                            this.reportOnlineStoreActivity('new_order', {
                                newlyArrived,
                                lastOrderNo: latest.seqId || latest.orderNumber || latest.id || '-',
                                lastOrderCustomer: latest.customerName || '-',
                                lastOrderTotal: parseFloat(latest.grandTotal) || 0
                            });
                        } else if (list.length > 0 || localStorage.getItem('bayan_store_trial_start') || localStorage.getItem('bayan_store_vip_unlocked') === '1') {
                            this.checkDailyTelemetryHeartbeat();
                        }

                        const sec = document.getElementById('online-orders-section');
                        if (sec && !sec.classList.contains('hidden')) {
                            this.renderTable();
                        }
                    },
                    () => {
                        this._setConnectionState(false);
                    }
                );
            } catch (_) {
                this._setConnectionState(false);
            }
        },

        // 🔍 مطابقة ذكية للصنف والمقاس واللون مع productsDB و FashionStockEngine
        matchOrderItemToPOS(item) {
            const list = (typeof productsDB !== 'undefined' && Array.isArray(productsDB)) ? productsDB : (window.productsDB || []);
            const activeWH = ((typeof currentUser !== 'undefined' && currentUser && currentUser.warehouseName) ? currentUser.warehouseName : 'المخزن الرئيسي').trim();
            let product = null;

            // 1. pos_id
            if (item.pos_id) {
                product = list.find(p => p && !p.isDeleted && String(p.id) === String(item.pos_id));
            }
            // 2. barcode
            if (!product && item.barcode) {
                const bc = String(item.barcode).trim().toLowerCase();
                product = list.find(p => p && !p.isDeleted && (
                    String(p.barcode || '').trim().toLowerCase() === bc ||
                    (Array.isArray(p.variants) && p.variants.some(v => String(v.barcode || '').trim().toLowerCase() === bc))
                ));
            }
            // 3. code
            if (!product && item.code) {
                const cd = String(item.code).trim().toLowerCase();
                product = list.find(p => p && !p.isDeleted && String(p.code || '').trim().toLowerCase() === cd);
            }
            // 4. الاسم المطابق
            if (!product && item.name) {
                const norm = (typeof normalizeSearchQuery === 'function') ? normalizeSearchQuery(item.name) : String(item.name).trim().toLowerCase();
                product = list.find(p => p && !p.isDeleted && ((typeof normalizeSearchQuery === 'function' ? normalizeSearchQuery(p.name) : String(p.name || '').trim().toLowerCase()) === norm));
            }

            if (!product) {
                return { matched: false, product: null, variant: null, availableStock: 0, enoughStock: false };
            }

            let variant = null;
            let availableStock = 0;
            if (Array.isArray(product.variants) && product.variants.length > 0 && window.FashionStockEngine) {
                variant = window.FashionStockEngine.findVariant(product, { size: item.size || '', color: item.color || '', barcode: item.barcode || '' });
                availableStock = variant
                    ? (window.FashionStockEngine.getVariantStock(variant, activeWH) || window.FashionStockEngine.getVariantStock(variant, 'all'))
                    : (window.FashionStockEngine.getProductStock(product, activeWH) || window.FashionStockEngine.getProductStock(product, 'all'));
            } else if (window.FashionStockEngine) {
                availableStock = window.FashionStockEngine.getProductStock(product, activeWH) || window.FashionStockEngine.getProductStock(product, 'all');
            }
            if (!availableStock) {
                availableStock = parseFloat(product.stock ?? product.qty) || 0;
            }

            const reqQty = parseFloat(item.qty) || 1;
            return {
                matched: true,
                product,
                variant,
                availableStock,
                enoughStock: availableStock >= reqQty
            };
        },

        getUsageStats() {
            const DAYS_MAX = 7;
            const ORDERS_MAX = 10;
            let isVip = false;
            let vipCode = '';
            let trialStartTs = 0;
            try {
                vipCode = localStorage.getItem('bayan_store_vip_code')
                    || (typeof getStore === 'function' ? (getStore('bayan_store_vip_code') || '') : '');
                const cachedHw = this._getSyncMachineId();
                isVip = Boolean(vipCode && cachedHw && this.verifyOnlineVipCode(vipCode, this.getShopId(), cachedHw));
                trialStartTs = Number(localStorage.getItem('bayan_store_trial_start') || 0);
            } catch (_) { }

            const hasStarted = isVip || trialStartTs > 0 || this.orders.length > 0;
            const daysUsedExact = trialStartTs > 0 ? Math.max(0, (Date.now() - trialStartTs) / (1000 * 60 * 60 * 24)) : 0;
            const daysUsed = trialStartTs > 0 ? Math.floor(daysUsedExact) : 0;
            const daysRemaining = isVip ? null : (trialStartTs > 0 ? Math.max(0, Math.ceil(DAYS_MAX - daysUsedExact)) : DAYS_MAX);

            const ordersUsed = Array.isArray(this.orders) ? this.orders.length : 0;
            const ordersRemaining = isVip ? null : Math.max(0, ORDERS_MAX - ordersUsed);

            let confirmedOrders = 0;
            let totalSales = 0;
            if (Array.isArray(this.orders)) {
                this.orders.forEach(o => {
                    if (!o) return;
                    const st = o.status || 'new';
                    if (st === 'confirmed' || st === 'delivered' || o.posInvoiceNo) confirmedOrders++;
                    if (st !== 'cancelled') totalSales += (parseFloat(o.grandTotal) || 0);
                });
            }

            const prodList = (typeof productsDB !== 'undefined' && Array.isArray(productsDB)) ? productsDB : (window.productsDB || []);
            let totalProductsCount = 0;
            let publishedProductsCount = 0;
            for (let i = 0; i < prodList.length; i++) {
                const p = prodList[i];
                if (p && !p.isDeleted) {
                    totalProductsCount++;
                    if (p.showInStore === true) publishedProductsCount++;
                }
            }

            const isUnlocked = isVip || (!trialStartTs) || (daysUsedExact <= DAYS_MAX && ordersUsed < ORDERS_MAX);
            const statusLabel = isVip
                ? '👑 باقة VIP مفعّلة بالكامل'
                : (!hasStarted
                    ? '⚪ لم تبدأ بعد'
                    : (isUnlocked ? '🎁 فترة تجريبية نشطة' : '🔒 انتهت الفترة التجريبية'));

            return {
                hasStarted,
                isVip,
                vipCode: vipCode || '',
                isUnlocked,
                statusLabel,
                trialStartTs,
                trialStartDateStr: trialStartTs ? new Date(trialStartTs).toLocaleDateString('ar-EG') : 'لم تبدأ',
                daysMax: DAYS_MAX,
                daysUsed,
                daysRemaining,
                ordersMax: ORDERS_MAX,
                ordersUsed,
                ordersRemaining,
                confirmedOrders,
                totalSales: Number(totalSales.toFixed(2)),
                publishedProductsCount,
                totalProductsCount
            };
        },

        async collectMerchantProfile() {
            const readField = (id, storeKey) => {
                try {
                    const el = document.getElementById(id);
                    if (el && el.value && String(el.value).trim()) return String(el.value).trim();
                } catch (_) { }
                try {
                    if (typeof getStore === 'function') {
                        const v = getStore(storeKey || id);
                        if (v && String(v).trim()) return String(v).trim();
                    }
                } catch (_) { }
                return '';
            };

            let machineId = 'UNKNOWN-HWID';
            try {
                if (typeof getUniqueHWID === 'function') machineId = await getUniqueHWID();
                else if (typeof getMachineId === 'function') machineId = getMachineId();
                else {
                    const el = document.getElementById('displayMachineId');
                    if (el && el.innerText) machineId = el.innerText.trim();
                }
            } catch (_) { }

            const shopName = readField('shopName', 'shopName') || 'غير مسمى';
            const shopAddress = readField('shopAddress', 'shopAddress') || 'غير محدد';
            const phones = [
                readField('shopPhone1', 'shopPhone1'),
                readField('shopPhone2', 'shopPhone2'),
                readField('shopPhone3', 'shopPhone3'),
                readField('shopPhone4', 'shopPhone4')
            ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);

            const userName = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) ? String(currentUser.name).trim() : 'المدير';
            const userRole = (typeof currentUser !== 'undefined' && currentUser && currentUser.role) ? String(currentUser.role).trim() : '';

            let plan = 'النسخة المجانية';
            try {
                if (typeof window.getBayanPlan === 'function') plan = window.getBayanPlan();
            } catch (_) { }

            let installDate = '---';
            try {
                const rawInst = typeof getStore === 'function' ? getStore('bayan_install_date') : '';
                if (rawInst) installDate = new Date(rawInst).toLocaleDateString('ar-EG');
            } catch (_) { }

            return {
                shopName,
                shopAddress,
                phones: phones.length ? phones.join(' / ') : 'غير مسجل',
                userName,
                userRole,
                shopId: this.getShopId(),
                storeUrl: this.getStoreUrl(),
                machineId,
                plan,
                appVersion: window.APP_VERSION || window.appVersion || '5.1.7',
                installDate
            };
        },

        async reportOnlineStoreActivity(eventType = 'update', extra = {}) {
            try {
                if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
                if (typeof window !== 'undefined' && window.__BAYAN_TEST_MODE__) return false;

                const stats = this.getUsageStats();
                const profile = await this.collectMerchantProfile();

                // 1. حفظ ملخص المحل في Firestore كسجل دائم لمتابعة كل المحلات المشغّلة للخاصية
                try {
                    const db = await this._ensureFirebaseReady();
                    if (db && profile.shopId) {
                        db.collection('shops').doc(profile.shopId).collection('meta').doc('telemetry').set({
                            shopId: profile.shopId,
                            shopName: profile.shopName,
                            shopAddress: profile.shopAddress,
                            phones: profile.phones,
                            userName: profile.userName,
                            machineId: profile.machineId,
                            plan: profile.plan,
                            appVersion: profile.appVersion,
                            storeUrl: profile.storeUrl,
                            ...stats,
                            lastEvent: eventType,
                            lastActiveISO: new Date().toISOString()
                        }, { merge: true }).catch(() => { });
                    }
                } catch (_) { }

                // 2. إرسال التقرير التفصيلي لبوت تليجرام المطور عبر TelegramDevNotify
                if (!window.TelegramDevNotify || typeof window.TelegramDevNotify.send !== 'function') return false;

                const eventTitles = {
                    first_use: '🆕 <b>محل جديد بدأ استخدام خاصية طلبات الأونلاين!</b>',
                    vip_activated: '👑 <b>تم تفعيل باقة المتجر الأونلاين (VIP)!</b>',
                    trial_expired: '🔒 <b>انتهت الفترة التجريبية للأونلاين — جاهز للاشتراك!</b>',
                    new_order: '🛒 <b>وصل طلب أونلاين جديد لأحد المحلات!</b>',
                    order_converted: '🧾 <b>تم تحويل طلب أونلاين إلى فاتورة POS!</b>',
                    products_synced: '🚀 <b>محل نشر/زامن أصناف على المتجر الإلكتروني!</b>',
                    daily_heartbeat: '📊 <b>متابعة يومية — حالة استخدام طلبات الأونلاين</b>'
                };
                const header = eventTitles[eventType] || '📡 <b>تحديث نشاط طلبات الأونلاين</b>';

                const daysLine = stats.isVip
                    ? 'غير محدود (مفعّل VIP مدى الحياة)'
                    : `استخدم <b>${stats.daysUsed}</b> من <b>${stats.daysMax}</b> يوم — المتبقي: <b>${stats.daysRemaining} يوم</b> (بدأ: ${this._esc(stats.trialStartDateStr)})`;
                const ordersLine = stats.isVip
                    ? `<b>${stats.ordersUsed}</b> طلب (غير محدود • المحوّل لفاتورة: ${stats.confirmedOrders})`
                    : `استخدم <b>${stats.ordersUsed}</b> من <b>${stats.ordersMax}</b> طلب — المتبقي: <b>${stats.ordersRemaining} طلب</b> (المحوّل لفاتورة: ${stats.confirmedOrders})`;

                let extraBlock = '';
                if (eventType === 'vip_activated' && extra.code) {
                    extraBlock = `\n🔑 <b>كود التفعيل:</b> <code>${this._esc(extra.code)}</code>`;
                } else if (eventType === 'new_order') {
                    extraBlock = `\n📦 <b>آخر طلب:</b> #${this._esc(extra.lastOrderNo || '-')} | العميل: ${this._esc(extra.lastOrderCustomer || '-')} | القيمة: <b>${(parseFloat(extra.lastOrderTotal) || 0).toFixed(2)} ج.م</b>`;
                } else if (eventType === 'order_converted') {
                    extraBlock = `\n🧾 <b>رقم الطلب:</b> #${this._esc(extra.orderNo || '-')} ⬅️ <b>فاتورة POS:</b> #${this._esc(extra.posInvoiceNo || '-')}`;
                } else if (eventType === 'products_synced') {
                    extraBlock = `\n📤 <b>الأصناف المزامنة الآن:</b> <b>${extra.syncedCount || 0}</b> صنف`;
                }

                const msg = `${header}\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `🏢 <b>المحل:</b> ${this._esc(profile.shopName)}\n` +
                    `👤 <b>المستخدم:</b> ${this._esc(profile.userName)}${profile.userRole ? ' (' + this._esc(profile.userRole) + ')' : ''}\n` +
                    `📱 <b>التليفون:</b> <code>${this._esc(profile.phones)}</code>\n` +
                    `📍 <b>العنوان:</b> ${this._esc(profile.shopAddress)}\n` +
                    `🆔 <b>كود المتجر:</b> <code>${this._esc(profile.shopId)}</code>\n` +
                    `💻 <b>معرّف الجهاز:</b> <code>${this._esc(profile.machineId)}</code>\n` +
                    `📦 <b>الباقة والإصدار:</b> ${this._esc(profile.plan)} | v${this._esc(profile.appVersion)}\n` +
                    `🌐 <b>رابط المتجر:</b> ${this._esc(profile.storeUrl)}\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `📌 <b>حالة الأونلاين:</b> ${stats.statusLabel}` +
                    (stats.vipCode ? ` (<code>${this._esc(stats.vipCode)}</code>)` : '') + `\n` +
                    `📅 <b>الأيام:</b> ${daysLine}\n` +
                    `🛒 <b>الطلبات:</b> ${ordersLine}\n` +
                    `💰 <b>إجمالي مبيعات الأونلاين:</b> <b>${stats.totalSales.toFixed(2)} ج.م</b>\n` +
                    `🛍️ <b>الأصناف المنشورة:</b> <b>${stats.publishedProductsCount}</b> من إجمالي ${stats.totalProductsCount} صنف` +
                    `${extraBlock}\n` +
                    `🕒 <b>الوقت:</b> ${new Date().toLocaleString('ar-EG')}`;

                const throttleMap = {
                    first_use: 0,
                    vip_activated: 0,
                    trial_expired: 12 * 60 * 60 * 1000,
                    new_order: 5000,
                    order_converted: 15000,
                    products_synced: 15 * 60 * 1000,
                    daily_heartbeat: 23 * 60 * 60 * 1000
                };
                const minInterval = throttleMap[eventType] != null ? throttleMap[eventType] : 60000;

                return await window.TelegramDevNotify.send(msg, {
                    type: `online_store_${eventType}`,
                    minInterval
                });
            } catch (_) {
                return false;
            }
        },

        checkDailyTelemetryHeartbeat() {
            try {
                if (!navigator.onLine) return;
                const last = Number(localStorage.getItem('bayan_oo_tg_last_daily') || 0);
                const now = Date.now();
                if (now - last >= 24 * 60 * 60 * 1000) {
                    localStorage.setItem('bayan_oo_tg_last_daily', String(now));
                    this.reportOnlineStoreActivity('daily_heartbeat');
                }
            } catch (_) { }
        },

        // =========================================================================
        // 🔐 نظام التشفير والتحقق الصارم لكود باقة الأونلاين (HWID + ShopID + XZCV)
        // =========================================================================
        _cachedMachineId: '',

        _sha256HexSync(str) {
            const utf8 = unescape(encodeURIComponent(String(str || '')));
            const bytes = [];
            for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
            const bitLen = bytes.length * 8;
            bytes.push(0x80);
            while ((bytes.length % 64) !== 56) bytes.push(0);
            for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

            const K = [
                0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
                0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
                0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
                0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
                0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
                0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
                0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
            ];
            let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
            const rotr = (n, x) => (x >>> n) | (x << (32 - n));
            const W = new Array(64);

            for (let i = 0; i < bytes.length; i += 64) {
                for (let t = 0; t < 16; t++) {
                    W[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3];
                }
                for (let t = 16; t < 64; t++) {
                    const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
                    const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
                    W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
                }
                let [a, b, c, d, e, f, g, h] = H;
                for (let t = 0; t < 64; t++) {
                    const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
                    const ch = (e & f) ^ ((~e) & g);
                    const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
                    const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
                    const maj = (a & b) ^ (a & c) ^ (b & c);
                    const temp2 = (S0 + maj) | 0;
                    h = g; g = f; f = e; e = (d + temp1) | 0;
                    d = c; c = b; b = a; a = (temp1 + temp2) | 0;
                }
                H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
            }
            return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
        },

        _getSyncMachineId() {
            if (this._cachedMachineId) return this._cachedMachineId;
            try {
                if (typeof getMachineId === 'function') {
                    const m = String(getMachineId() || '').trim();
                    if (m) return m;
                }
            } catch (_) { }
            try {
                const cached = localStorage.getItem('bayan_online_cached_hwid');
                if (cached && cached.trim()) return cached.trim();
            } catch (_) { }
            try {
                const el = document.getElementById('displayMachineId');
                if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
            } catch (_) { }
            return '';
        },

        async _ensureMachineId() {
            try {
                let mId = '';
                if (typeof getUniqueHWID === 'function') mId = String(await getUniqueHWID() || '').trim();
                else if (typeof getMachineId === 'function') mId = String(getMachineId() || '').trim();
                else {
                    const el = document.getElementById('displayMachineId');
                    if (el && el.innerText) mId = el.innerText.trim();
                }
                if (mId) {
                    this._cachedMachineId = mId;
                    try { localStorage.setItem('bayan_online_cached_hwid', mId); } catch (_) { }
                    return mId;
                }
            } catch (_) { }
            return this._getSyncMachineId();
        },

        computeExpectedOnlineVipCode(shopId, machineId) {
            const SECRET = 'XZCV';
            const sClean = String(shopId || '').trim().toUpperCase();
            const mClean = String(machineId || '').trim().toUpperCase();
            if (!sClean || !mClean) return '';

            const mParts = mClean.split(/[-_\s]+/).filter(Boolean);
            const sParts = sClean.split(/[-_\s]+/).filter(Boolean);
            const maxParts = Math.max(mParts.length, sParts.length);
            const partMixArr = [];
            for (let i = 0; i < maxParts; i++) {
                if (mParts[i]) partMixArr.push(mParts[i]);
                partMixArr.push(SECRET);
                if (sParts[maxParts - 1 - i]) partMixArr.push(sParts[maxParts - 1 - i]);
            }
            const sRev = sClean.split('').reverse().join('');
            const maxChars = Math.max(mClean.length, sRev.length);
            let charMix = '';
            for (let i = 0; i < maxChars; i++) {
                if (i < mClean.length) charMix += mClean[i];
                if (i < sRev.length) charMix += sRev[i];
                charMix += SECRET[i % SECRET.length];
            }

            const raw1 = `BAYAN|PRO|${SECRET}|${partMixArr.join('#')}|${charMix}|${SECRET}|${mClean}|${sClean}`;
            const h1 = this._sha256HexSync(raw1);
            const h2 = this._sha256HexSync(`${SECRET}:${h1}:${sClean}:${mClean}:${SECRET}`);
            const token20 = h2.slice(0, 20).toUpperCase();
            return `BAYAN-PRO-${token20.slice(0, 5)}-${token20.slice(5, 10)}-${token20.slice(10, 15)}-${token20.slice(15, 20)}`;
        },

        verifyOnlineVipCode(inputCode, shopId, machineId) {
            const raw = String(inputCode || '').trim().toUpperCase();
            if (!raw) return false;
            const normIn = raw.replace(/[^A-Z0-9]/g, '');
            if (!normIn.startsWith('BAYANPRO') || normIn.length !== 28) return false;
            const expected = this.computeExpectedOnlineVipCode(shopId, machineId);
            if (!expected) return false;
            const normExp = expected.replace(/[^A-Z0-9]/g, '');
            return normIn === normExp;
        },

        isStoreUnlocked() {
            try {
                const savedCode = localStorage.getItem('bayan_store_vip_code')
                    || (typeof getStore === 'function' ? (getStore('bayan_store_vip_code') || '') : '');
                const cachedHw = this._getSyncMachineId();
                if (savedCode && cachedHw && this.verifyOnlineVipCode(savedCode, this.getShopId(), cachedHw)) {
                    return true;
                }
                const startTs = Number(localStorage.getItem('bayan_store_trial_start') || 0);
                if (!startTs) {
                    localStorage.setItem('bayan_store_trial_start', String(Date.now()));
                    return true;
                }
                const daysUsed = (Date.now() - startTs) / (1000 * 60 * 60 * 24);
                return daysUsed <= 7 && this.orders.length < 10;
            } catch (_) { return true; }
        },

        async activateStoreVip() {
            const old = document.getElementById('bayanStoreVipModal');
            if (old) old.remove();
            const shopId = this.getShopId();
            const machineId = await this._ensureMachineId();

            const modal = document.createElement('div');
            modal.id = 'bayanStoreVipModal';
            modal.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.78); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:16px; direction:rtl; font-family:Cairo,sans-serif;';
            modal.innerHTML = `
                <div style="background:#fff; border-radius:18px; width:470px; max-width:95vw; padding:24px; box-shadow:0 25px 60px rgba(0,0,0,0.4); text-align:center;">
                    <div style="font-size:2.3rem; margin-bottom:4px;">🔐</div>
                    <h3 style="margin:0 0 6px; font-size:1.18rem; font-weight:900; color:#0f172a;">تفعيل باقة المتجر الإلكتروني الدائمة</h3>
                    <p style="margin:0 0 12px; font-size:0.83rem; color:#475569; font-weight:700; line-height:1.6;">أرسل بيانات المتجر والجهاز التالية للإدارة لاستلام كود التفعيل المشفّر الخاص بجهازك فقط:</p>
                    <div style="background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:12px; padding:10px 12px; margin-bottom:12px; text-align:right; font-size:0.82rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="color:#64748b; font-weight:800;">🏪 كود المتجر:</span>
                            <code style="background:#e2e8f0; color:#0f172a; padding:2px 8px; border-radius:6px; font-weight:900; direction:ltr;">${this._esc(shopId)}</code>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="color:#64748b; font-weight:800;">💻 معرّف الجهاز:</span>
                            <code style="background:#e2e8f0; color:#0f172a; padding:2px 8px; border-radius:6px; font-weight:900; direction:ltr;">${this._esc(machineId || '---')}</code>
                        </div>
                        <button type="button" id="bayanStoreCopyIdsBtn" style="width:100%; background:#0284c7; color:#fff; border:none; padding:7px 12px; border-radius:8px; font-weight:800; font-size:0.8rem; cursor:pointer; font-family:Cairo,sans-serif;">📋 نسخ بيانات المتجر والجهاز لإرسالها للإدارة</button>
                    </div>
                    <input type="text" id="bayanStoreVipCodeInput" placeholder="BAYAN-PRO-XXXXX-XXXXX-XXXXX-XXXXX" dir="ltr" style="width:100%; padding:11px 12px; border:2px solid #cbd5e1; border-radius:12px; font-size:0.9rem; font-weight:900; text-align:center; text-transform:uppercase; outline:none; box-sizing:border-box; margin-bottom:10px; font-family:monospace;">
                    <div id="bayanStoreVipErr" style="display:none; color:#dc2626; font-size:0.82rem; font-weight:800; margin-bottom:10px;">❌ كود التفعيل غير صحيح أو لا يطابق هذا الجهاز والمتجر!</div>
                    <div style="display:flex; gap:10px; margin-top:6px;">
                        <button type="button" id="bayanStoreVipConfirmBtn" style="flex:1.4; background:#16a34a; color:#fff; border:none; padding:11px 16px; border-radius:12px; font-weight:900; font-size:0.95rem; cursor:pointer; font-family:Cairo,sans-serif;">✅ تفعيل الباقة الآن</button>
                        <button type="button" onclick="document.getElementById('bayanStoreVipModal').remove()" style="flex:1; background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:11px 14px; border-radius:12px; font-weight:800; font-size:0.9rem; cursor:pointer; font-family:Cairo,sans-serif;">إلغاء</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);

            const copyBtn = document.getElementById('bayanStoreCopyIdsBtn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    const txt = `كود المتجر (Shop ID): ${shopId}\nمعرّف الجهاز (HWID): ${machineId}`;
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(txt).then(() => {
                            if (typeof showToast === 'function') showToast('📋 تم نسخ كود المتجر ومعرّف الجهاز بنجاح!', 'success');
                        }).catch(() => { });
                    }
                };
            }

            const inp = document.getElementById('bayanStoreVipCodeInput');
            const err = document.getElementById('bayanStoreVipErr');
            const doActivate = () => {
                const clean = String(inp?.value || '').trim().toUpperCase();
                if (this.verifyOnlineVipCode(clean, shopId, machineId)) {
                    const canonicalCode = this.computeExpectedOnlineVipCode(shopId, machineId);
                    localStorage.setItem('bayan_store_vip_unlocked', '1');
                    localStorage.setItem('bayan_store_vip_code', canonicalCode);
                    if (typeof setStore === 'function') {
                        setStore('bayan_store_vip_unlocked', '1');
                        setStore('bayan_store_vip_code', canonicalCode);
                    }
                    modal.remove();
                    if (typeof showToast === 'function') showToast('🎉 تم تفعيل باقة المتجر الإلكتروني الدائمة بنجاح!', 'success');
                    this.reportOnlineStoreActivity('vip_activated', { code: canonicalCode });
                    const sec = document.getElementById('online-orders-section');
                    if (sec) { sec.dataset.initialized = ''; this.renderSectionShell(); this.renderTable(); }
                } else {
                    if (err) err.style.display = 'block';
                    if (inp) inp.focus();
                }
            };
            document.getElementById('bayanStoreVipConfirmBtn').onclick = doActivate;
            if (inp) {
                inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doActivate(); });
                setTimeout(() => inp.focus(), 50);
            }
        },

        getShopLogoSrc() {
            try {
                const hdr = document.getElementById('headerLogo');
                if (hdr && hdr.src && (hdr.src.startsWith('data:image') || (hdr.style.display !== 'none' && !hdr.src.endsWith('/')))) {
                    return hdr.src;
                }
                if (typeof getStore === 'function') {
                    const s = getStore('shopLogo') || getStore('bayan_shop_logo');
                    if (s && String(s).trim()) return String(s).trim();
                }
                const ls = localStorage.getItem('shopLogo') || localStorage.getItem('bayan_shop_logo');
                if (ls && String(ls).trim()) return String(ls).trim();
                const prev = document.getElementById('settingsLogoPreview');
                if (prev && prev.style && prev.style.backgroundImage && prev.style.backgroundImage.includes('url(')) {
                    const m = prev.style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
                    if (m && m[1]) return m[1];
                }
            } catch (_) { }
            return '';
        },

        _buildMerchantProfileCardHtml(usageStats, shopId) {
            const isPro = Boolean(usageStats && usageStats.isVip);
            const logoSrc = this.getShopLogoSrc();
            let shopName = 'متجر بَيَان';
            try {
                const el = document.getElementById('shopName');
                if (el && el.value && el.value.trim()) shopName = el.value.trim();
                else if (typeof getStore === 'function' && getStore('shopName')) shopName = String(getStore('shopName')).trim();
            } catch (_) { }

            const ringStyle = isPro
                ? 'padding:3px; background:linear-gradient(135deg,#3b82f6 0%,#60a5fa 35%,#c4b5fd 65%,#2563eb 100%); box-shadow:0 0 16px rgba(59,130,246,0.75);'
                : 'padding:2.5px; background:#94a3b8; box-shadow:none;';

            const avatarInner = logoSrc
                ? `<img id="onlineOrdersProfileAvatarImg" src="${this._esc(logoSrc)}" alt="Logo" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; background:#ffffff;">`
                : `<div id="onlineOrdersProfileAvatarImg" style="width:100%; height:100%; border-radius:50%; background:linear-gradient(135deg,#064e3b,#047857); display:flex; align-items:center; justify-content:center; font-size:1.45rem;">🏪</div>`;

            const tierPill = isPro
                ? `<span style="display:inline-flex; align-items:center; justify-content:center; padding:2px 14px; border-radius:999px; font-size:0.76rem; font-weight:900; letter-spacing:0.4px; color:#ffffff; background:radial-gradient(ellipse at 50% 100%, #60a5fa 0%, #1d4ed8 58%, #1e3a8a 100%); border:1px solid rgba(147,197,253,0.85); box-shadow:0 2px 10px rgba(59,130,246,0.55); font-family:system-ui,Cairo,sans-serif;">Pro</span>`
                : `<span style="display:inline-flex; align-items:center; justify-content:center; padding:2px 12px; border-radius:999px; font-size:0.73rem; font-weight:800; letter-spacing:0.3px; color:#f1f5f9; background:rgba(100,116,139,0.85); border:1px solid rgba(203,213,225,0.65); font-family:system-ui,Cairo,sans-serif;" dir="ltr">Free Plan</span>`;

            return `
                <div id="onlineOrdersMerchantProfileCard" ${isPro ? 'title="حساب Pro مفعّل بالكامل"' : 'onclick="BayanOnlineOrders.activateStoreVip()" title="اضغط للترقية إلى حساب Pro"'} style="display:flex; align-items:center; gap:12px; background:linear-gradient(135deg,#065f46 0%,#047857 55%,#059669 100%); color:#ffffff; padding:10px 16px; border-radius:20px; border:1.5px solid ${isPro ? 'rgba(96,165,250,0.75)' : 'rgba(167,243,208,0.4)'}; box-shadow:${isPro ? '0 8px 22px rgba(4,120,87,0.32), 0 0 14px rgba(59,130,246,0.35)' : '0 6px 16px rgba(4,120,87,0.24)'}; min-width:220px; flex-shrink:0; ${isPro ? '' : 'cursor:pointer;'}">
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px; flex:1; min-width:0;">
                        <div style="font-size:0.96rem; font-weight:900; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:165px;">${this._esc(shopName)}</div>
                        <div style="font-size:0.72rem; color:#d1fae5; font-family:monospace; direction:ltr; opacity:0.9;">${this._esc(shopId)}</div>
                        <div style="margin-top:2px;">${tierPill}</div>
                    </div>
                    <div style="width:54px; height:54px; border-radius:50%; ${ringStyle} flex-shrink:0; box-sizing:border-box;">
                        <div style="width:100%; height:100%; border-radius:50%; overflow:hidden; background:#ffffff; border:2px solid #065f46; box-sizing:border-box;">
                            ${avatarInner}
                        </div>
                    </div>
                </div>
            `;
        },

        refreshProfileBadge() {
            const card = document.getElementById('onlineOrdersMerchantProfileCard');
            if (!card || !card.parentElement) return;
            const usageStats = this.getUsageStats();
            const shopId = this.getShopId();
            const tmp = document.createElement('div');
            tmp.innerHTML = this._buildMerchantProfileCardHtml(usageStats, shopId).trim();
            if (tmp.firstElementChild) {
                card.replaceWith(tmp.firstElementChild);
            }
        },

        renderSectionShell() {
            const sec = document.getElementById('online-orders-section');
            if (!sec || sec.dataset.initialized === '1') return;
            sec.dataset.initialized = '1';

            if (!this.isStoreUnlocked()) {
                try {
                    const lastExp = Number(localStorage.getItem('bayan_oo_tg_last_expired') || 0);
                    if (Date.now() - lastExp >= 12 * 60 * 60 * 1000) {
                        localStorage.setItem('bayan_oo_tg_last_expired', String(Date.now()));
                        this.reportOnlineStoreActivity('trial_expired');
                    }
                } catch (_) { }
                sec.innerHTML = `
                    <div class="products-panel" style="width:100%; min-height:70vh; background:#f8fafc; border-radius:16px; border:1.5px solid #e2e8f0; padding:32px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:14px;">
                        <div style="font-size:3rem;">🔒</div>
                        <h2 style="margin:0; font-size:1.4rem; font-weight:900; color:#0f172a;">انتهت الفترة التجريبية لباقة المتجر الإلكتروني</h2>
                        <p style="margin:0; color:#475569; max-width:460px; font-weight:700; line-height:1.7;">للاستمرار في استقبال طلبات الأونلاين ومزامنة الأصناف مع متجرك الإلكتروني، يرجى إدخال كود التفعيل الخاص بك.</p>
                        <button type="button" onclick="BayanOnlineOrders.activateStoreVip()" style="background:#059669; color:white; border:none; padding:12px 26px; border-radius:12px; font-weight:900; font-size:1rem; cursor:pointer; font-family:'Cairo',sans-serif;">🔑 إدخال كود التفعيل الآن</button>
                    </div>`;
                return;
            }

            try {
                if (!localStorage.getItem('bayan_oo_tg_first_use')) {
                    localStorage.setItem('bayan_oo_tg_first_use', String(Date.now()));
                    this.reportOnlineStoreActivity('first_use');
                }
            } catch (_) { }

            const storeUrl = this._esc(this.getStoreUrl());
            const shopId = this._esc(this.getShopId());
            const usageStats = this.getUsageStats();
            const trialPillText = `🎁 تجريبي (متبقي ${usageStats.daysRemaining} يوم / ${usageStats.ordersRemaining} طلب) • 🔑 تفعيل الباقة`;
            const profileCardHtml = this._buildMerchantProfileCardHtml(usageStats, this.getShopId());

            sec.innerHTML = `
                <div class="products-panel" style="width:100%; min-height:85vh; background:#f8fafc; border-radius:16px; border:1.5px solid #e2e8f0; padding:16px; display:flex; flex-direction:column; gap:14px;">
                    <!-- الشريط العلوي ورابط المتجر وبطاقة هوية المحل Pro / عادي -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; background:white; padding:14px 18px; border-radius:14px; border:1.5px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                        <div style="display:flex; flex-direction:column; gap:10px; flex:1; min-width:300px;">
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                <h2 style="margin:0; font-size:1.2rem; font-weight:900; color:#0f172a;">🛒 طلبات المتجر الإلكتروني (الأونلاين)</h2>
                                <span style="background:linear-gradient(135deg,#f97316,#ea580c); color:white; padding:3px 10px; border-radius:999px; font-size:0.74rem; font-weight:900;">NEW • جديد</span>
                                <span id="onlineOrdersStatusPill"></span>
                                <span style="background:#f1f5f9; color:#334155; padding:4px 10px; border-radius:8px; font-size:0.78rem; font-weight:800; font-family:monospace;">كود المحل: ${shopId}</span>
                                ${usageStats.isVip
                    ? '<span style="background:#dcfce7; color:#166534; border:1px solid #86efac; padding:3px 10px; border-radius:999px; font-size:0.76rem; font-weight:900;">👑 باقة المتجر مفعّلة بالكامل</span>'
                    : `<button type="button" onclick="BayanOnlineOrders.activateStoreVip()" style="background:#fef3c7; color:#92400e; border:1px solid #f59e0b; padding:3px 10px; border-radius:999px; font-size:0.76rem; font-weight:900; cursor:pointer; font-family:Cairo,sans-serif;" title="اضغط لإدخال كود التفعيل الدائم">${trialPillText}</button>`}
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                <input type="text" id="onlineStoreUrlInput" value="${storeUrl}" readonly style="width:270px; max-width:100%; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; font-size:0.78rem; font-family:monospace; color:#334155;" dir="ltr">
                                <button type="button" onclick="BayanOnlineOrders.copyStoreUrl()" style="background:#0284c7; color:white; border:none; padding:8px 13px; border-radius:8px; font-weight:800; font-size:0.81rem; cursor:pointer; font-family:'Cairo',sans-serif;">📋 نسخ رابط المتجر</button>
                                <button type="button" onclick="BayanOnlineOrders.openStorePreview()" style="background:#0f172a; color:white; border:none; padding:8px 13px; border-radius:8px; font-weight:800; font-size:0.81rem; cursor:pointer; font-family:'Cairo',sans-serif;">🌐 فتح المتجر</button>
                                <button type="button" onclick="BayanOnlineOrders.openAdminPanel()" style="background:#7c3aed; color:white; border:none; padding:8px 13px; border-radius:8px; font-weight:800; font-size:0.81rem; cursor:pointer; font-family:'Cairo',sans-serif;">⚙️ لوحة تحكم المتجر</button>
                                <button type="button" onclick="BayanOnlineOrders.publishAllProductsToStore()" style="background:#ea580c; color:white; border:none; padding:8px 13px; border-radius:8px; font-weight:800; font-size:0.81rem; cursor:pointer; font-family:'Cairo',sans-serif;">🚀 نشر كل الأصناف</button>
                                <button type="button" onclick="BayanOnlineOrders.syncAllPublishedProducts()" style="background:#059669; color:white; border:none; padding:8px 13px; border-radius:8px; font-weight:800; font-size:0.81rem; cursor:pointer; font-family:'Cairo',sans-serif;">📤 مزامنة المنشور</button>
                                <button type="button" onclick="BayanOnlineOrders.clearCloudStoreData()" style="background:#dc2626; color:white; border:none; padding:8px 12px; border-radius:8px; font-weight:800; font-size:0.81rem; cursor:pointer; font-family:'Cairo',sans-serif;" title="حذف البيانات المرفوعة على المتجر الإلكتروني السحابي فقط بدون لمس بيانات بَيَان المحلية">🗑️ تفريغ السحابة</button>
                                <button type="button" onclick="BayanOnlineOrders.startListening()" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:8px 11px; border-radius:8px; font-weight:800; font-size:0.81rem; cursor:pointer; font-family:'Cairo',sans-serif;">🔄 تحديث</button>
                            </div>
                        </div>
                        ${profileCardHtml}
                    </div>

                    <!-- كروت الملخص -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:12px;">
                        <div style="background:linear-gradient(135deg,#f97316,#ea580c); color:white; padding:14px; border-radius:12px; text-align:center; box-shadow:0 4px 12px rgba(249,115,22,0.25);">
                            <div style="font-size:0.8rem; font-weight:800; opacity:0.95;">🆕 طلبات جديدة</div>
                            <div id="ooStatNew" style="font-size:1.5rem; font-weight:900; margin-top:4px;">0</div>
                        </div>
                        <div style="background:linear-gradient(135deg,#0284c7,#0369a1); color:white; padding:14px; border-radius:12px; text-align:center; box-shadow:0 4px 12px rgba(2,132,199,0.25);">
                            <div style="font-size:0.8rem; font-weight:800; opacity:0.95;">📦 قيد التجهيز</div>
                            <div id="ooStatProcessing" style="font-size:1.5rem; font-weight:900; margin-top:4px;">0</div>
                        </div>
                        <div style="background:linear-gradient(135deg,#059669,#047857); color:white; padding:14px; border-radius:12px; text-align:center; box-shadow:0 4px 12px rgba(5,150,105,0.25);">
                            <div style="font-size:0.8rem; font-weight:800; opacity:0.95;">✅ تم التحويل لفاتورة</div>
                            <div id="ooStatConfirmed" style="font-size:1.5rem; font-weight:900; margin-top:4px;">0</div>
                        </div>
                        <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9); color:white; padding:14px; border-radius:12px; text-align:center; box-shadow:0 4px 12px rgba(124,58,237,0.25);">
                            <div style="font-size:0.8rem; font-weight:800; opacity:0.95;">💰 إجمالي مبيعات الأونلاين</div>
                            <div id="ooStatTotal" style="font-size:1.4rem; font-weight:900; margin-top:4px;">0.00 ج.م</div>
                        </div>
                    </div>

                    <!-- شريط البحث والفلاتر -->
                    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; background:white; padding:12px 16px; border-radius:12px; border:1px solid #e2e8f0;">
                        <input type="text" id="ooSearchInput" placeholder="🔍 ابحث باسم العميل أو رقم الهاتف أو رقم الطلب..." oninput="BayanOnlineOrders.setSearch(this.value)" style="flex:1; min-width:240px; padding:9px 14px; border-radius:10px; border:1.5px solid #cbd5e1; font-family:'Cairo',sans-serif; font-weight:700;">
                        <select id="ooStatusFilter" onchange="BayanOnlineOrders.setStatusFilter(this.value)" style="padding:9px 14px; border-radius:10px; border:1.5px solid #cbd5e1; font-family:'Cairo',sans-serif; font-weight:800; background:#f8fafc;">
                            <option value="all">كل الحالات</option>
                            <option value="new">🆕 جديد</option>
                            <option value="processing">📦 قيد التجهيز</option>
                            <option value="shipped">🚚 تم الشحن</option>
                            <option value="confirmed">✅ تم التحويل لفاتورة</option>
                            <option value="cancelled">❌ ملغي</option>
                        </select>
                    </div>

                    <!-- جدول الطلبات -->
                    <div class="table-container" style="flex:1; overflow:auto; background:white; border-radius:12px; border:1.5px solid #e2e8f0;">
                        <table class="invoice-table" style="width:100%; min-width:900px;">
                            <thead style="background:linear-gradient(135deg,#0f172a,#1e293b); color:white; position:sticky; top:0; z-index:5;">
                                <tr>
                                    <th style="padding:10px;">رقم الطلب</th>
                                    <th style="padding:10px;">التاريخ والوقت</th>
                                    <th style="padding:10px;">بيانات العميل</th>
                                    <th style="padding:10px;">عدد القطع</th>
                                    <th style="padding:10px;">الإجمالي (شامل الشحن)</th>
                                    <th style="padding:10px;">حالة الطلب</th>
                                    <th style="padding:10px;">رقم فاتورة POS</th>
                                    <th style="padding:10px;">الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody id="onlineOrdersTableBody"></tbody>
                        </table>
                    </div>
                </div>
            `;
            this._setConnectionState(this.isConnected);
        },

        setSearch(q) {
            this.currentSearchQuery = String(q || '').trim().toLowerCase();
            this.renderTable();
        },

        setStatusFilter(st) {
            this.currentStatusFilter = st || 'all';
            this.renderTable();
        },

        copyStoreUrl() {
            const url = this.getStoreUrl();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(() => {
                    if (typeof showToast === 'function') showToast('📋 تم نسخ رابط المتجر بنجاح!', 'success');
                }).catch(() => { });
            }
        },

        openStorePreview() {
            const url = this.getStoreUrl();
            if (typeof openExternalUrl === 'function') openExternalUrl(url);
            else window.open(url, '_blank', 'noopener,noreferrer');
        },

        renderTable() {
            this.renderSectionShell();
            const tbody = document.getElementById('onlineOrdersTableBody');
            if (!tbody) return;

            // تحديث الإحصائيات
            let cNew = 0, cProc = 0, cConf = 0, totalVal = 0;
            this.orders.forEach(o => {
                const st = o.status || 'new';
                if (st === 'new' || st === 'pending') cNew++;
                else if (st === 'processing') cProc++;
                else if (st === 'confirmed' || st === 'delivered' || o.posInvoiceNo) cConf++;
                if (st !== 'cancelled') totalVal += (parseFloat(o.grandTotal) || 0);
            });

            const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setTxt('ooStatNew', String(cNew));
            setTxt('ooStatProcessing', String(cProc));
            setTxt('ooStatConfirmed', String(cConf));
            setTxt('ooStatTotal', `${totalVal.toFixed(2)} ج.م`);

            // فلترة الطلبات
            const filtered = this.orders.filter(o => {
                const st = o.status || 'new';
                if (this.currentStatusFilter !== 'all') {
                    if (this.currentStatusFilter === 'new' && st !== 'new' && st !== 'pending') return false;
                    else if (this.currentStatusFilter !== 'new' && st !== this.currentStatusFilter) return false;
                }
                if (this.currentSearchQuery) {
                    const q = this.currentSearchQuery;
                    const hay = `${o.id || ''} ${o.customerName || ''} ${o.phone1 || ''} ${o.phone2 || ''} ${o.city || ''}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:#64748b; font-weight:800;">📭 لا توجد طلبات أونلاين مطابقة حالياً</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(o => {
                const key = this._esc(o.firestoreId || o.id);
                const stKey = o.status || 'new';
                const meta = STATUS_META[stKey] || STATUS_META.new;
                const itemsCount = Array.isArray(o.items) ? o.items.reduce((s, it) => s + (parseFloat(it.qty) || 1), 0) : 0;
                const dtStr = o.date ? new Date(o.date).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '-';
                const isConverted = Boolean(o.posInvoiceNo || stKey === 'confirmed');

                return `
                    <tr>
                        <td style="text-align:center; font-weight:900; color:#0284c7;">#${this._esc(o.seqId || o.orderNumber || o.id || '-')}</td>
                        <td style="text-align:center; font-size:0.82rem; color:#475569;">${this._esc(dtStr)}</td>
                        <td style="text-align:right;">
                            <div style="font-weight:900; color:#0f172a;">${this._esc(o.customerName || '-')}</div>
                            <div style="font-size:0.78rem; color:#64748b;">📱 ${this._esc(o.phone1 || '-')} • 📍 ${this._esc(o.city || '-')}</div>
                        </td>
                        <td style="text-align:center; font-weight:900;">${itemsCount}</td>
                        <td style="text-align:center; font-weight:900; color:#059669;">${(parseFloat(o.grandTotal) || 0).toFixed(2)} ج.م</td>
                        <td style="text-align:center;">
                            <span style="background:${meta.bg}; color:${meta.color}; border:1px solid ${meta.border}; padding:3px 10px; border-radius:999px; font-size:0.78rem; font-weight:900;">
                                ${meta.icon} ${meta.label}
                            </span>
                        </td>
                        <td style="text-align:center; font-weight:900; color:#15803d;">${o.posInvoiceNo ? `#${this._esc(o.posInvoiceNo)}` : '-'}</td>
                        <td style="text-align:center;">
                            <div style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;">
                                <button type="button" onclick="BayanOnlineOrders.openOrderDetails('${key}')" style="background:#0f172a; color:white; border:none; padding:5px 10px; border-radius:7px; font-size:0.78rem; font-weight:800; cursor:pointer; font-family:'Cairo',sans-serif;">👁️ التفاصيل</button>
                                ${!isConverted && stKey !== 'cancelled' ? `
                                    <button type="button" onclick="BayanOnlineOrders.openOrderDetails('${key}', true)" style="background:#059669; color:white; border:none; padding:5px 10px; border-radius:7px; font-size:0.78rem; font-weight:800; cursor:pointer; font-family:'Cairo',sans-serif;">🧾 تحويل لفاتورة</button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        openOrderDetails(orderKey) {
            const order = this.orders.find(o => String(o.firestoreId || o.id) === String(orderKey));
            if (!order) return;

            const oldModal = document.getElementById('onlineOrderDetailsModal');
            if (oldModal) oldModal.remove();

            const items = Array.isArray(order.items) ? order.items : [];
            const isConverted = Boolean(order.posInvoiceNo || order.status === 'confirmed');
            const stMeta = STATUS_META[order.status || 'new'] || STATUS_META.new;

            const itemRowsHtml = items.map((it, idx) => {
                const match = this.matchOrderItemToPOS(it);
                let stockTag = '';
                if (!match.matched) {
                    stockTag = '<span style="background:#fee2e2; color:#991b1b; padding:2px 7px; border-radius:6px; font-size:0.74rem; font-weight:800;">⚠️ غير مربوط بالـ POS</span>';
                } else if (!match.enoughStock) {
                    stockTag = `<span style="background:#fef3c7; color:#92400e; padding:2px 7px; border-radius:6px; font-size:0.74rem; font-weight:800;">⚠️ رصيد غير كافٍ (${match.availableStock})</span>`;
                } else {
                    stockTag = `<span style="background:#dcfce7; color:#166534; padding:2px 7px; border-radius:6px; font-size:0.74rem; font-weight:800;">✅ متوفر (${match.availableStock})</span>`;
                }
                return `
                    <tr style="border-bottom:1px solid #e2e8f0;">
                        <td style="padding:8px; text-align:center;">${idx + 1}</td>
                        <td style="padding:8px; font-weight:800;">${this._esc(it.name)}</td>
                        <td style="padding:8px; text-align:center;">${this._esc(it.size || '-')}</td>
                        <td style="padding:8px; text-align:center;">${this._esc(it.color || '-')}</td>
                        <td style="padding:8px; text-align:center; font-weight:900;">${parseFloat(it.qty) || 1}</td>
                        <td style="padding:8px; text-align:center;">${(parseFloat(it.price) || 0).toFixed(2)}</td>
                        <td style="padding:8px; text-align:center;">${stockTag}</td>
                    </tr>
                `;
            }).join('');

            const rawSub = parseFloat(order.subtotal) || items.reduce((s, it) => s + ((parseFloat(it.price) || 0) * (parseFloat(it.qty) || 1)), 0);
            const rawDisc = parseFloat(order.discountAmount) || 0;
            const rawShip = parseFloat(order.deliveryFee ?? order.shippingFee) || 0;
            const rawGrand = parseFloat(order.grandTotal) || Math.max(0, rawSub - rawDisc + rawShip);
            const cTypeLabel = order.couponCode
                ? (order.couponType === 'percent' ? `نسبة ${order.couponValue || ''}%` : 'خصم نقدي ثابت')
                : (rawDisc > 0 ? 'خصم عرض كميات' : '');
            const couponSummaryText = (order.couponCode || rawDisc > 0)
                ? `<span style="color:#dc2626; font-weight:900;">${this._esc(order.couponCode || 'عرض خاص')} (${this._esc(cTypeLabel)}) — خصم ${rawDisc.toFixed(2)} ج.م</span>`
                : 'لا يوجد';
            const keyEsc = this._esc(order.firestoreId || order.id);
            const modal = document.createElement('div');
            modal.id = 'onlineOrderDetailsModal';
            modal.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.75); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; direction:rtl; font-family:Cairo,sans-serif;';
            modal.innerHTML = `
                <div style="background:white; border-radius:18px; width:780px; max-width:96vw; max-height:90vh; overflow:auto; padding:22px; box-shadow:0 25px 60px rgba(0,0,0,0.4);">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #e2e8f0; padding-bottom:12px; margin-bottom:14px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <h3 style="margin:0; font-size:1.2rem; font-weight:900; color:#0f172a;">📦 تفاصيل طلب أونلاين #${this._esc(order.seqId || order.orderNumber || order.id)}</h3>
                            <span style="background:${stMeta.bg}; color:${stMeta.color}; border:1px solid ${stMeta.border}; padding:3px 10px; border-radius:999px; font-size:0.78rem; font-weight:900;">${stMeta.icon} ${stMeta.label}</span>
                        </div>
                        <button type="button" onclick="document.getElementById('onlineOrderDetailsModal').remove()" style="background:#f1f5f9; border:none; width:34px; height:34px; border-radius:10px; font-weight:900; cursor:pointer;">✕</button>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:#f8fafc; padding:14px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:14px; font-size:0.88rem;">
                        <div><b>👤 العميل:</b> ${this._esc(order.customerName || '-')}</div>
                        <div><b>📱 الموبايل:</b> ${this._esc(order.phone1 || '-')} ${order.phone2 ? ' / ' + this._esc(order.phone2) : ''}</div>
                        <div><b>📍 المحافظة:</b> ${this._esc(order.city || '-')}</div>
                        <div><b>🏠 العنوان:</b> ${this._esc(order.address || '-')}</div>
                        <div><b>🎟️ الكوبون ونوع الخصم:</b> ${couponSummaryText}</div>
                        <div><b>🚚 مصاريف الشحن:</b> ${rawShip.toFixed(2)} ج.م</div>
                        ${order.notes ? `<div style="grid-column:1/-1; color:#92400e; background:#fffbeb; padding:8px 10px; border-radius:8px; border:1px solid #fde68a;"><b>📝 ملاحظات العميل:</b> ${this._esc(order.notes)}</div>` : ''}
                    </div>

                    <table style="width:100%; border-collapse:collapse; font-size:0.86rem; margin-bottom:16px;">
                        <thead style="background:#0f172a; color:white;">
                            <tr>
                                <th style="padding:8px;">م</th>
                                <th style="padding:8px; text-align:right;">الصنف</th>
                                <th style="padding:8px;">المقاس</th>
                                <th style="padding:8px;">اللون</th>
                                <th style="padding:8px;">الكمية</th>
                                <th style="padding:8px;">السعر</th>
                                <th style="padding:8px;">حالة المخزون (POS)</th>
                            </tr>
                        </thead>
                        <tbody>${itemRowsHtml}</tbody>
                    </table>

                    <div style="background:#ecfdf5; border:1.5px solid #a7f3d0; padding:14px 16px; border-radius:12px; margin-bottom:16px; display:flex; flex-direction:column; gap:6px;">
                        <div style="display:flex; justify-content:space-between; font-size:0.88rem; color:#334155; font-weight:800;">
                            <span>إجمالي الأصناف (قبل الخصم):</span>
                            <span>${rawSub.toFixed(2)} ج.م</span>
                        </div>
                        ${rawDisc > 0 ? `
                        <div style="display:flex; justify-content:space-between; font-size:0.88rem; color:#dc2626; font-weight:900;">
                            <span>➖ خصم الكوبون (${this._esc(order.couponCode || 'عرض')} - ${this._esc(cTypeLabel)}):</span>
                            <span>- ${rawDisc.toFixed(2)} ج.م</span>
                        </div>` : ''}
                        <div style="display:flex; justify-content:space-between; font-size:0.88rem; color:#334155; font-weight:800;">
                            <span>➕ مصاريف الشحن:</span>
                            <span>${rawShip.toFixed(2)} ج.م</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-top:1.5px dashed #6ee7b7; padding-top:8px; margin-top:2px;">
                            <span style="font-weight:900; color:#065f46;">💵 الإجمالي النهائي بعد الخصم والشحن (${rawSub.toFixed(0)}${rawDisc > 0 ? ' - ' + rawDisc.toFixed(0) : ''}${rawShip > 0 ? ' + ' + rawShip.toFixed(0) : ''}):</span>
                            <span style="font-size:1.35rem; font-weight:950; color:#047857;">${rawGrand.toFixed(2)} ج.م</span>
                        </div>
                    </div>

                    ${isConverted ? `
                        <div style="background:#dcfce7; color:#166534; padding:10px 14px; border-radius:10px; font-weight:900; text-align:center; margin-bottom:14px;">
                            ✅ تم تحويل هذا الطلب مسبقاً إلى فاتورة بيع رقم #${this._esc(order.posInvoiceNo || '-')} (لا يمكن تكرار التحويل).
                        </div>
                    ` : `
                        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
                            <button type="button" onclick="BayanOnlineOrders.openOrderInPOS('${keyEsc}')" style="flex:1; background:#0284c7; color:white; border:none; padding:11px 16px; border-radius:10px; font-weight:900; cursor:pointer; font-family:'Cairo',sans-serif;">🖥️ فتح في شاشة الكاشير (POS) جاهزة</button>
                            <button type="button" onclick="BayanOnlineOrders.convertOrderDirectToInvoice('${keyEsc}')" style="flex:1; background:#059669; color:white; border:none; padding:11px 16px; border-radius:10px; font-weight:900; cursor:pointer; font-family:'Cairo',sans-serif;">⚡ تأكيد وحفظ كفاتورة بيع مباشرة</button>
                        </div>
                    `}

                    <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; border-top:1px solid #e2e8f0; padding-top:12px;">
                        <button type="button" onclick="BayanOnlineOrders.updateOrderStatus('${keyEsc}', 'processing')" style="background:#e0f2fe; color:#0369a1; border:1px solid #7dd3fc; padding:7px 12px; border-radius:8px; font-weight:800; cursor:pointer; font-family:'Cairo',sans-serif;">📦 قيد التجهيز</button>
                        <button type="button" onclick="BayanOnlineOrders.updateOrderStatus('${keyEsc}', 'shipped')" style="background:#ede9fe; color:#6d28d9; border:1px solid #c4b5fd; padding:7px 12px; border-radius:8px; font-weight:800; cursor:pointer; font-family:'Cairo',sans-serif;">🚚 تم الشحن</button>
                        <button type="button" onclick="BayanOnlineOrders.updateOrderStatus('${keyEsc}', 'cancelled')" style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:7px 12px; border-radius:8px; font-weight:800; cursor:pointer; font-family:'Cairo',sans-serif;">❌ إلغاء الطلب</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        async updateOrderStatus(orderKey, newStatus, extraFields = {}) {
            const order = this.orders.find(o => String(o.firestoreId || o.id) === String(orderKey));
            if (!order) return false;
            order.status = newStatus;
            Object.assign(order, extraFields);
            this._saveCachedOrders();
            this._updateBadges();
            this.renderTable();

            const modal = document.getElementById('onlineOrderDetailsModal');
            if (modal) modal.remove();

            try {
                const db = await this._ensureFirebaseReady();
                if (db && order.firestoreId) {
                    const shopId = this.getShopId();
                    await db.collection('shops').doc(shopId).collection('orders').doc(order.firestoreId).update({
                        status: newStatus,
                        updatedAt: new Date().toISOString(),
                        ...extraFields
                    });
                }
                if (typeof showToast === 'function') showToast('✅ تم تحديث حالة الطلب بنجاح!', 'success');
                return true;
            } catch (_) {
                if (typeof showToast === 'function') showToast('⚠️ تم تحديث الحالة محلياً (غير متصل بالسحابة حالياً)', 'warning');
                return false;
            }
        },

        // 1️⃣ فتح الطلب في شاشة الكاشير (POS) جاهزة للمراجعة والطباعة
        openOrderInPOS(orderKey) {
            const order = this.orders.find(o => String(o.firestoreId || o.id) === String(orderKey));
            if (!order) return;
            if (order.posInvoiceNo || order.status === 'confirmed') {
                if (typeof showToast === 'function') showToast('⚠️ هذا الطلب محوّل مسبقاً إلى فاتورة بيع!', 'warning');
                return;
            }

            const modal = document.getElementById('onlineOrderDetailsModal');
            if (modal) modal.remove();

            if (typeof switchSection === 'function') switchSection('sales');
            setTimeout(() => {
                if (typeof window.cart === 'undefined') window.cart = [];
                window.cart.length = 0;

                const items = Array.isArray(order.items) ? order.items : [];
                items.forEach(it => {
                    const m = this.matchOrderItemToPOS(it);
                    const p = m.product;
                    window.cart.push({
                        id: p ? p.id : (it.pos_id || Date.now() + Math.random()),
                        name: p ? p.name : it.name,
                        code: p ? (p.code || p.barcode || p.id) : (it.barcode || ''),
                        barcode: (m.variant && m.variant.barcode) || (p && p.barcode) || it.barcode || '',
                        size: (m.variant && m.variant.size) || it.size || '',
                        color: (m.variant && m.variant.color) || it.color || '',
                        selectedSize: (m.variant && m.variant.size) || it.size || '',
                        selectedColor: (m.variant && m.variant.color) || it.color || '',
                        qty: parseFloat(it.qty) || 1,
                        price: parseFloat(it.price) || (p ? parseFloat(p.price) : 0),
                        cost: (m.variant && parseFloat(m.variant.cost)) || (p ? parseFloat(p.cost) : 0) || 0,
                        unit: (p && p.unit) || 'قطعة',
                        unitFactor: 1
                    });
                });

                const custInp = document.getElementById('customerName');
                if (custInp) custInp.value = order.customerName || 'عميل أونلاين';
                const notesInp = document.getElementById('salesNotes');
                if (notesInp) notesInp.value = `طلب أونلاين #${order.id} | ${order.city || ''} - ${order.address || ''} | ${order.phone1 || ''}`;

                window._pendingOnlineOrderForPos = { firestoreId: order.firestoreId || order.id, id: order.id };
                if (typeof renderCart === 'function') renderCart();
                if (typeof updateTotal === 'function') updateTotal();
                if (typeof showToast === 'function') showToast(`🛒 تم تحميل طلب أونلاين #${order.id} في شاشة الكاشير بنجاح!`, 'success');
            }, 120);
        },

        // 2️⃣ تأكيد وحفظ كفاتورة بيع مباشرة في SQLite وخصم من FashionStockEngine
        _convertingOrders: new Set(),
        async convertOrderDirectToInvoice(orderKey) {
            const lockKey = String(orderKey || '');
            if (!lockKey || this._convertingOrders.has(lockKey)) return;
            const order = this.orders.find(o => String(o.firestoreId || o.id) === lockKey);
            if (!order) return;
            if (order.posInvoiceNo || order.status === 'confirmed') {
                if (typeof showToast === 'function') showToast('⚠️ هذا الطلب محوّل مسبقاً إلى فاتورة بيع!', 'warning');
                return;
            }
            this._convertingOrders.add(lockKey);

            const activeWH = ((typeof currentUser !== 'undefined' && currentUser && currentUser.warehouseName) ? currentUser.warehouseName : 'المخزن الرئيسي').trim();
            const cashierName = (typeof currentUser !== 'undefined' && currentUser && currentUser.name) ? currentUser.name : 'المدير';
            const invId = (typeof getNextSequence === 'function') ? getNextSequence('بيع') : ('ONL-' + Date.now().toString().slice(-6));
            const now = new Date();
            const dateISO = now.toLocaleDateString('en-CA');
            const timeStr = now.toTimeString().slice(0, 8);
            const dateDisplay = now.toLocaleString('ar-EG');

            const items = Array.isArray(order.items) ? order.items : [];
            const txRows = [];
            const modifiedProducts = new Map();

            items.forEach((it, idx) => {
                const m = this.matchOrderItemToPOS(it);
                const qty = parseFloat(it.qty) || 1;
                const price = parseFloat(it.price) || 0;
                const cost = (m.variant && parseFloat(m.variant.cost)) || (m.product ? parseFloat(m.product.cost) : 0) || 0;
                const lineTotal = qty * price;
                const lineProfit = (price - cost) * qty;

                if (m.matched && m.product && window.FashionStockEngine) {
                    window.FashionStockEngine.applyMovement({
                        product: m.product,
                        variantRef: m.variant || { size: it.size || '', color: it.color || '', barcode: it.barcode || '' },
                        qtyDelta: -qty,
                        warehouseName: activeWH
                    });
                    modifiedProducts.set(m.product.id, m.product);
                }

                txRows.push({
                    id: Date.now() + idx,
                    invoiceId: String(invId),
                    dateISO,
                    time: timeStr,
                    timeISO: timeStr,
                    date: dateDisplay,
                    type: 'بيع',
                    partner: order.customerName || 'عميل أونلاين',
                    product: m.product ? m.product.name : it.name,
                    productId: m.product ? m.product.id : (it.pos_id || ''),
                    barcode: (m.variant && m.variant.barcode) || (m.product && m.product.barcode) || it.barcode || '',
                    size: (m.variant && m.variant.size) || it.size || '',
                    color: (m.variant && m.variant.color) || it.color || '',
                    qty,
                    price,
                    cost,
                    total: lineTotal,
                    profit: lineProfit,
                    paid: idx === 0 ? (parseFloat(order.grandTotal) || lineTotal) : 0,
                    paidAmount: idx === 0 ? (parseFloat(order.grandTotal) || lineTotal) : 0,
                    remaining: 0,
                    method: 'كاش',
                    warehouse: activeWH,
                    cashier: cashierName,
                    user: cashierName,
                    isInvoiceHead: idx === 0 ? 1 : 0,
                    invoiceGrandTotal: parseFloat(order.grandTotal) || lineTotal,
                    notes: `طلب أونلاين #${order.id} | ${order.city || ''} - ${order.address || ''}`
                });
            });

            try {
                if (window.db && window.db.transactions) {
                    await window.db.transactions.bulkPut(txRows);
                }
                if (window.db && window.db.products && modifiedProducts.size > 0) {
                    const updatedProds = Array.from(modifiedProducts.values());
                    await window.db.products.bulkPut(updatedProds);
                    this.scheduleSilentStockSync(updatedProds);
                }
                txRows.forEach(r => {
                    if (typeof window.safelyMergeTransactionIntoMemory === 'function') {
                        window.safelyMergeTransactionIntoMemory(r);
                    }
                });
                if (typeof invalidateInvSummaryCache === 'function') invalidateInvSummaryCache();

                await this.updateOrderStatus(order.firestoreId || order.id, 'confirmed', {
                    posInvoiceNo: String(invId),
                    confirmedAt: new Date().toISOString()
                });

                if (typeof showToast === 'function') {
                    showToast(`✅ تم تحويل الطلب #${order.seqId || order.id} وحفظه كفاتورة بيع رقم #${invId} بنجاح!`, 'success', 6000);
                }
                this.reportOnlineStoreActivity('order_converted', {
                    orderNo: order.seqId || order.orderNumber || order.id,
                    posInvoiceNo: String(invId)
                });
            } catch (err) {
                console.error('[OnlineOrders] Direct conversion error:', err);
                if (typeof showToast === 'function') showToast('❌ تعذر حفظ الفاتورة: ' + err.message, 'error');
            } finally {
                this._convertingOrders.delete(lockKey);
            }
        },

        // =========================================================================
        // 🔄 مزامنة الأصناف والأرصدة الحية من بيان POS إلى المتجر الإلكتروني (Phase 3)
        // =========================================================================
        _stockSyncQueue: new Map(),
        _stockSyncTimer: null,

        _buildStoreProductPayload(p) {
            if (!p || p.id == null) return null;
            const totalStock = (window.FashionStockEngine && typeof window.FashionStockEngine.getProductStock === 'function')
                ? window.FashionStockEngine.getProductStock(p, 'all')
                : (parseFloat(p.stock) || 0);

            const sizesSet = new Set();
            const colorsSet = new Set();
            const variantsStock = {};

            let variantsTotalSum = 0;
            let hasVariants = false;
            if (Array.isArray(p.variants) && p.variants.length > 0) {
                hasVariants = true;
                p.variants.forEach(v => {
                    if (!v) return;
                    const rawS = String(v.size || '').trim();
                    const rawC = String(v.color || '').trim();
                    const s = (rawS && rawS !== '-') ? rawS : '';
                    const c = (rawC && rawC !== '-') ? rawC : '';
                    if (s && s !== 'موحد') sizesSet.add(s);
                    if (c && c !== 'قياسي') colorsSet.add(c);
                    const vSt = Math.max(0, (window.FashionStockEngine && typeof window.FashionStockEngine.getVariantStock === 'function')
                        ? window.FashionStockEngine.getVariantStock(v, 'all')
                        : (parseFloat(v.stock) || 0));
                    const key = `${s || 'موحد'}|${c || 'قياسي'}`;
                    variantsStock[key] = (variantsStock[key] || 0) + vSt;
                    variantsTotalSum += vSt;
                });
            }

            // ضمان تطابق الرصيد الإجمالي 100% مع مجموع أرصدة المقاسات والألوان الفعلي
            const exactStock = hasVariants ? variantsTotalSum : Math.max(0, totalStock);
            const isPublished = Boolean(p.showInStore) && !p.isDeleted;
            const payload = {
                id: `pos_${p.id}`,
                pos_id: String(p.id),
                code: String(p.code || ''),
                barcode: String(p.barcode || ''),
                name: String(p.name || 'صنف'),
                category: String(p.category || 'general'),
                categoryName: String(p.category || 'تشكيلة أزياء'),
                price: parseFloat(p.price) || 0,
                sizes: Array.from(sizesSet),
                colors: Array.from(colorsSet),
                stock: exactStock,
                stockQty: exactStock,
                variantsStock,
                inStock: exactStock > 0,
                active: isPublished,
                isFrozen: !isPublished,
                updatedAt: new Date().toISOString()
            };
            if (parseFloat(p.oldPrice) > payload.price) {
                payload.oldPrice = parseFloat(p.oldPrice);
            }
            return payload;
        },

        async _resolveProductImageForStore(rawImage) {
            try {
                if (!rawImage || typeof rawImage !== 'string') return '';
                const src = rawImage.trim();
                if (!src) return '';
                if (/^https?:\/\//i.test(src)) return src;

                // إذا كانت الصورة بصيغة local_img: الخاصة بـ BayanSQLite أو ملفاً محلياً في Electron، نحولها أولاً إلى Data URL
                let loadableSrc = src;
                if (src.startsWith('local_img:')) {
                    const fileName = src.slice('local_img:'.length).split('?')[0].trim();
                    if (window.BayanSQLite && typeof window.BayanSQLite._resolveProductImage === 'function') {
                        const resolved = window.BayanSQLite._resolveProductImage(src);
                        if (resolved) loadableSrc = resolved;
                    }
                    if (loadableSrc === src && typeof window !== 'undefined' && typeof window.require === 'function') {
                        try {
                            const pathMod = window.require('path');
                            const osMod = window.require('os');
                            const imgDir = (window.BayanSQLite && typeof window.BayanSQLite._getProductImageDir === 'function')
                                ? window.BayanSQLite._getProductImageDir()
                                : pathMod.join(osMod.homedir(), '.bayan_pos', 'product_images');
                            loadableSrc = pathMod.join(imgDir, fileName);
                        } catch (_) { }
                    }
                }
                if (!loadableSrc.startsWith('data:image')) {
                    if (typeof window !== 'undefined' && typeof window.require === 'function') {
                        try {
                            const fs = window.require('fs');
                            let filePath = loadableSrc.split('?')[0];
                            if (filePath.startsWith('file:///')) {
                                filePath = decodeURIComponent(filePath.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
                            } else if (filePath.startsWith('file://')) {
                                filePath = decodeURIComponent(filePath.replace(/^file:\/\//i, ''));
                            }
                            if (fs.existsSync(filePath)) {
                                const buf = fs.readFileSync(filePath);
                                const ext = (filePath.split('.').pop() || 'jpeg').toLowerCase();
                                const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
                                loadableSrc = `data:${mime};base64,${buf.toString('base64')}`;
                            }
                        } catch (_) { }
                    }
                }

                // ضغط الصورة عبر Canvas بحد أقصى 720px وجودة 0.78 لتكون خفيفة وسريعة على المتجر وضمن حدود Firestore
                const compressed = await new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        try {
                            const MAX_DIM = 720;
                            let w = img.naturalWidth || img.width || 600;
                            let h = img.naturalHeight || img.height || 600;
                            if (w > MAX_DIM || h > MAX_DIM) {
                                const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
                                w = Math.max(1, Math.round(w * ratio));
                                h = Math.max(1, Math.round(h * ratio));
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, w, h);
                            ctx.drawImage(img, 0, 0, w, h);
                            let out = canvas.toDataURL('image/webp', 0.78);
                            if (!out || !out.startsWith('data:image/webp')) {
                                out = canvas.toDataURL('image/jpeg', 0.78);
                            }
                            if (out.length > 350000) {
                                out = canvas.toDataURL('image/jpeg', 0.62);
                            }
                            resolve(out.length <= 450000 ? out : '');
                        } catch (_) {
                            resolve(loadableSrc.startsWith('data:image') && loadableSrc.length <= 450000 ? loadableSrc : '');
                        }
                    };
                    img.onerror = () => resolve(loadableSrc.startsWith('data:image') && loadableSrc.length <= 450000 ? loadableSrc : '');
                    img.src = loadableSrc;
                });
                return compressed || '';
            } catch (_) {
                return '';
            }
        },

        async syncProductToStore(product) {
            if (!product || product.id == null || !navigator.onLine) return false;
            try {
                const db = await this._ensureFirebaseReady();
                if (!db) return false;
                const shopId = this.getShopId();
                const docId = `pos_${product.id}`;
                const payload = this._buildStoreProductPayload(product);
                if (!payload) return false;

                // 📸 مزامنة صورة الموديل من البضاعة (مضغوطة وجاهزة للعرض على المتجر ولوحة التحكم)
                const rawImg = product.image || product.img || '';
                if (rawImg) {
                    const storeImg = await this._resolveProductImageForStore(rawImg);
                    if (storeImg) {
                        payload.image = storeImg;
                        payload.images = [storeImg];
                    }
                }

                const prodDocRef = db.collection('shops').doc(shopId).collection('products').doc(docId);
                await prodDocRef.set(payload, { merge: true });
                // استبدال خريطة variantsStock بالكامل لمنع بقاء مقاسات قديمة محذوفة من POS
                await prodDocRef.update({ variantsStock: payload.variantsStock }).catch(() => { });
                return true;
            } catch (_) {
                return false;
            }
        },

        async deactivateProductInStore(productId) {
            if (productId == null || !navigator.onLine) return false;
            try {
                const db = await this._ensureFirebaseReady();
                if (!db) return false;
                const shopId = this.getShopId();
                await db.collection('shops').doc(shopId).collection('products').doc(`pos_${productId}`).set({
                    active: false,
                    isFrozen: true,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
                return true;
            } catch (_) {
                return false;
            }
        },

        async clearCloudStoreData() {
            if (typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'admin') {
                if (typeof showToast === 'function') showToast('🔒 هذه العملية متاحة للمدير العام فقط.', 'error');
                return;
            }
            if (!navigator.onLine) {
                if (typeof showToast === 'function') showToast('⚠️ لا يوجد اتصال بالإنترنت حالياً لتفريغ السحابة.', 'warning');
                return;
            }
            const old = document.getElementById('bayanClearCloudModal');
            if (old) old.remove();
            const shopId = this.getShopId();
            const modal = document.createElement('div');
            modal.id = 'bayanClearCloudModal';
            modal.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.78); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:16px; direction:rtl; font-family:Cairo,sans-serif;';
            modal.innerHTML = `
                <div style="background:#fff; border-radius:18px; width:460px; max-width:95vw; padding:24px; box-shadow:0 25px 60px rgba(0,0,0,0.4); text-align:center;">
                    <div style="font-size:2.4rem; margin-bottom:6px;">🗑️☁️</div>
                    <h3 style="margin:0 0 8px; font-size:1.18rem; font-weight:900; color:#991b1b;">تفريغ بيانات المتجر الإلكتروني السحابي</h3>
                    <p style="margin:0 0 14px; font-size:0.84rem; color:#475569; font-weight:700; line-height:1.7;">
                        سيتم حذف البيانات المرفوعة على السحابة لمتجرك (<code>${this._esc(shopId)}</code>) فقط.<br>
                        <strong style="color:#059669;">✅ قاعدة بياناتك المحلية في بَيَان POS وبضاعتك وفواتيرك لن تُمس نهائياً!</strong>
                    </p>
                    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
                        <button type="button" id="btnClearCloudProductsOnly" style="background:#ea580c; color:#fff; border:none; padding:11px 16px; border-radius:12px; font-weight:900; font-size:0.9rem; cursor:pointer; font-family:Cairo,sans-serif;">📦 تفريغ المنتجات فقط من المتجر ولوحة التحكم</button>
                        <button type="button" id="btnClearCloudAll" style="background:#dc2626; color:#fff; border:none; padding:11px 16px; border-radius:12px; font-weight:900; font-size:0.9rem; cursor:pointer; font-family:Cairo,sans-serif;">🔥 تفريغ السحابة بالكامل (المنتجات + الطلبات)</button>
                        <button type="button" onclick="document.getElementById('bayanClearCloudModal').remove()" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:10px 14px; border-radius:12px; font-weight:800; font-size:0.88rem; cursor:pointer; font-family:Cairo,sans-serif;">إلغاء</button>
                    </div>
                    <div id="clearCloudProgressMsg" style="display:none; font-size:0.84rem; font-weight:800; color:#0284c7;">⏳ جاري التفريغ من السحابة...</div>
                </div>`;
            document.body.appendChild(modal);

            const runClear = async (includeOrders) => {
                const msgEl = document.getElementById('clearCloudProgressMsg');
                if (msgEl) { msgEl.style.display = 'block'; msgEl.textContent = '⏳ جاري الاتصال بالسحابة وتفريغ البيانات...'; }
                try {
                    const db = await this._ensureFirebaseReady();
                    if (!db) throw new Error('تعذر الاتصال بـ Firebase');
                    const shopRef = db.collection('shops').doc(shopId);
                    const deleteCollection = async (colName) => {
                        let deleted = 0;
                        const snap = await shopRef.collection(colName).get();
                        const docs = snap.docs || [];
                        for (let i = 0; i < docs.length; i += 400) {
                            const batch = db.batch();
                            docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
                            await batch.commit();
                            deleted += Math.min(400, docs.length - i);
                        }
                        return deleted;
                    };

                    const delProds = await deleteCollection('products');
                    let delOrders = 0;
                    if (includeOrders) {
                        delOrders = await deleteCollection('orders');
                        this.orders = [];
                        this._knownIds.clear();
                        this._saveCachedOrders();
                        this._updateBadges();
                        this.renderTable();
                    }
                    modal.remove();
                    if (typeof showToast === 'function') {
                        showToast(`✅ تم تفريغ السحابة بنجاح (حذف ${delProds} منتج${includeOrders ? ` و ${delOrders} طلب` : ''}) بدون لمس بيانات بَيَان المحلية!`, 'success', 6000);
                    }
                } catch (err) {
                    if (msgEl) { msgEl.style.color = '#dc2626'; msgEl.textContent = '❌ حدث خطأ أثناء التفريغ: ' + (err.message || err); }
                }
            };

            document.getElementById('btnClearCloudProductsOnly').onclick = () => runClear(false);
            document.getElementById('btnClearCloudAll').onclick = () => runClear(true);
        },

        async publishAllProductsToStore() {
            const list = (typeof productsDB !== 'undefined' && Array.isArray(productsDB)) ? productsDB : (window.productsDB || []);
            const activeList = list.filter(p => p && !p.isDeleted);
            if (!activeList.length) {
                if (typeof showToast === 'function') showToast('ℹ️ لا توجد أصناف في البضاعة للنشر.', 'info');
                return 0;
            }
            const okConfirm = typeof confirm === 'function'
                ? confirm(`سيتم تفعيل «عرض في المتجر الإلكتروني» على جميع الأصناف (${activeList.length} صنف) ومزامنتها للسحابة.\n\nيمكنك بعدها إزالة العلامة عن أي صنف لا تريد عرضه.\nهل تريد المتابعة؟`)
                : true;
            if (!okConfirm) return 0;

            for (let i = 0; i < activeList.length; i++) {
                activeList[i].showInStore = true;
            }
            try {
                if (typeof saveAll === 'function') await saveAll();
            } catch (_) { }
            if (typeof renderProducts === 'function') {
                try { renderProducts(); } catch (_) { }
            }
            return await this.syncAllPublishedProducts();
        },

        async syncAllPublishedProducts() {
            if (!navigator.onLine) {
                if (typeof showToast === 'function') showToast('⚠️ لا يوجد اتصال بالإنترنت حالياً للمزامنة مع المتجر.', 'warning');
                return 0;
            }
            const list = (typeof productsDB !== 'undefined' && Array.isArray(productsDB)) ? productsDB : (window.productsDB || []);
            const published = list.filter(p => p && !p.isDeleted && p.showInStore === true);
            if (published.length === 0) {
                if (typeof showToast === 'function') showToast('ℹ️ لا توجد أصناف مفعّل عليها «عرض في المتجر الإلكتروني» حالياً.', 'info');
                return 0;
            }
            if (typeof showToast === 'function') showToast(`⏳ جاري مزامنة (${published.length}) صنف مع المتجر الإلكتروني...`, 'info');
            let okCount = 0;
            for (let i = 0; i < published.length; i++) {
                const ok = await this.syncProductToStore(published[i]);
                if (ok) okCount++;
            }
            if (typeof showToast === 'function') {
                showToast(`✅ تمت مزامنة ${okCount} من ${published.length} صنف مع المتجر الإلكتروني بنجاح!`, 'success', 5000);
            }
            if (okCount > 0) {
                this.reportOnlineStoreActivity('products_synced', { syncedCount: okCount });
            }
            return okCount;
        },

        // ⚡ تحديث صامت ومؤجل (Debounced) لرصيد الأصناف المنشورة فقط بعد أي بيع/مرتجع/تسوية
        scheduleSilentStockSync(itemsOrOne) {
            if (!navigator.onLine || !itemsOrOne) return;
            const arr = Array.isArray(itemsOrOne) ? itemsOrOne : [itemsOrOne];
            let queued = false;
            for (let i = 0; i < arr.length; i++) {
                const p = arr[i];
                if (p && p.id != null && p.showInStore === true) {
                    this._stockSyncQueue.set(String(p.id), p);
                    queued = true;
                }
            }
            if (!queued) return;

            if (this._stockSyncTimer) clearTimeout(this._stockSyncTimer);
            this._stockSyncTimer = setTimeout(async () => {
                this._stockSyncTimer = null;
                if (!navigator.onLine || this._stockSyncQueue.size === 0) return;
                const batch = Array.from(this._stockSyncQueue.values());
                this._stockSyncQueue.clear();
                try {
                    const db = await this._ensureFirebaseReady();
                    if (!db) return;
                    const shopId = this.getShopId();
                    const col = db.collection('shops').doc(shopId).collection('products');
                    for (let i = 0; i < batch.length; i++) {
                        const payload = this._buildStoreProductPayload(batch[i]);
                        if (!payload) continue;
                        await col.doc(payload.id).set({
                            stock: payload.stock,
                            stockQty: payload.stockQty,
                            sizes: payload.sizes,
                            colors: payload.colors,
                            variantsStock: payload.variantsStock,
                            inStock: payload.inStock,
                            updatedAt: payload.updatedAt
                        }, { merge: true }).catch(() => { });
                    }
                } catch (_) { }
            }, 1500);
        }
    };

    window.BayanOnlineOrders = BayanOnlineOrders;
    window.renderOnlineOrdersSection = () => {
        BayanOnlineOrders.renderTable();
        if (!BayanOnlineOrders.isConnected && navigator.onLine) {
            BayanOnlineOrders.startListening();
        }
    };

    // تشغيل الاستماع الصامت بهدوء بعد إقلاع التطبيق بـ 4 ثوانٍ
    window.addEventListener('online', () => {
        BayanOnlineOrders.startListening();
    });
    window.addEventListener('offline', () => {
        BayanOnlineOrders._setConnectionState(false);
    });
    setTimeout(() => {
        BayanOnlineOrders.startListening();
    }, 4000);
})(window);
