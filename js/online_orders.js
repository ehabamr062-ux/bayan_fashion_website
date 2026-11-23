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

                        this.orders = list;
                        this._initialLoaded = true;
                        this._saveCachedOrders();
                        this._updateBadges();

                        if (newlyArrived > 0) {
                            this._playNewOrderBeep();
                            if (typeof showToast === 'function') {
                                showToast(`🛒 وصل ${newlyArrived} طلب أونلاين جديد من المتجر الإلكتروني!`, 'success', 6000);
                            }
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
                    ? window.FashionStockEngine.getVariantStock(variant, activeWH)
                    : window.FashionStockEngine.getProductStock(product, activeWH);
            } else if (window.FashionStockEngine) {
                availableStock = window.FashionStockEngine.getProductStock(product, activeWH);
            } else {
                availableStock = parseFloat(product.stock) || 0;
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

        isStoreUnlocked() {
            try {
                if (localStorage.getItem('bayan_store_vip_unlocked') === '1') return true;
                const startTs = Number(localStorage.getItem('bayan_store_trial_start') || 0);
                if (!startTs) {
                    localStorage.setItem('bayan_store_trial_start', String(Date.now()));
                    return true;
                }
                const daysUsed = (Date.now() - startTs) / (1000 * 60 * 60 * 24);
                return daysUsed <= 7 && this.orders.length < 10;
            } catch (_) { return true; }
        },

        activateStoreVip() {
            const code = prompt('أدخل كود تفعيل باقة المتجر الإلكتروني:');
            if (!code) return;
            const clean = code.trim().toUpperCase();
            if (clean === 'BAYAN-VIP-2026' || clean.startsWith('BAYAN-PRO-')) {
                localStorage.setItem('bayan_store_vip_unlocked', '1');
                if (typeof showToast === 'function') showToast('🎉 تم تفعيل باقة المتجر الإلكتروني بنجاح!', 'success');
                const sec = document.getElementById('online-orders-section');
                if (sec) { sec.dataset.initialized = ''; this.renderSectionShell(); }
            } else {
                alert('❌ كود التفعيل غير صحيح!');
            }
        },

        renderSectionShell() {
            const sec = document.getElementById('online-orders-section');
            if (!sec || sec.dataset.initialized === '1') return;
            sec.dataset.initialized = '1';

            if (!this.isStoreUnlocked()) {
                sec.innerHTML = `
                    <div class="products-panel" style="width:100%; min-height:70vh; background:#f8fafc; border-radius:16px; border:1.5px solid #e2e8f0; padding:32px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; gap:14px;">
                        <div style="font-size:3rem;">🔒</div>
                        <h2 style="margin:0; font-size:1.4rem; font-weight:900; color:#0f172a;">انتهت الفترة التجريبية لباقة المتجر الإلكتروني</h2>
                        <p style="margin:0; color:#475569; max-width:460px; font-weight:700; line-height:1.7;">للاستمرار في استقبال طلبات الأونلاين ومزامنة الأصناف مع متجرك الإلكتروني، يرجى إدخال كود التفعيل الخاص بك.</p>
                        <button type="button" onclick="BayanOnlineOrders.activateStoreVip()" style="background:#059669; color:white; border:none; padding:12px 26px; border-radius:12px; font-weight:900; font-size:1rem; cursor:pointer; font-family:'Cairo',sans-serif;">🔑 إدخال كود التفعيل الآن</button>
                    </div>`;
                return;
            }

            const storeUrl = this._esc(this.getStoreUrl());
            const shopId = this._esc(this.getShopId());

            sec.innerHTML = `
                <div class="products-panel" style="width:100%; min-height:85vh; background:#f8fafc; border-radius:16px; border:1.5px solid #e2e8f0; padding:16px; display:flex; flex-direction:column; gap:14px;">
                    <!-- الشريط العلوي ورابط المتجر -->
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:white; padding:14px 18px; border-radius:14px; border:1.5px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                            <h2 style="margin:0; font-size:1.2rem; font-weight:900; color:#0f172a;">🛒 طلبات المتجر الإلكتروني (الأونلاين)</h2>
                            <span id="onlineOrdersStatusPill"></span>
                            <span style="background:#f1f5f9; color:#334155; padding:4px 10px; border-radius:8px; font-size:0.78rem; font-weight:800; font-family:monospace;">كود المحل: ${shopId}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <input type="text" id="onlineStoreUrlInput" value="${storeUrl}" readonly style="width:280px; max-width:100%; padding:7px 10px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; font-size:0.78rem; font-family:monospace; color:#334155;" dir="ltr">
                            <button type="button" onclick="BayanOnlineOrders.copyStoreUrl()" style="background:#0284c7; color:white; border:none; padding:8px 14px; border-radius:8px; font-weight:800; font-size:0.82rem; cursor:pointer; font-family:'Cairo',sans-serif;">📋 نسخ رابط المتجر</button>
                            <button type="button" onclick="BayanOnlineOrders.openStorePreview()" style="background:#0f172a; color:white; border:none; padding:8px 14px; border-radius:8px; font-weight:800; font-size:0.82rem; cursor:pointer; font-family:'Cairo',sans-serif;">🌐 فتح المتجر</button>
                            <button type="button" onclick="BayanOnlineOrders.openAdminPanel()" style="background:#7c3aed; color:white; border:none; padding:8px 14px; border-radius:8px; font-weight:800; font-size:0.82rem; cursor:pointer; font-family:'Cairo',sans-serif;">⚙️ لوحة تحكم المتجر</button>
                            <button type="button" onclick="BayanOnlineOrders.publishAllProductsToStore()" style="background:#ea580c; color:white; border:none; padding:8px 14px; border-radius:8px; font-weight:800; font-size:0.82rem; cursor:pointer; font-family:'Cairo',sans-serif;">🚀 نشر كل الأصناف</button>
                            <button type="button" onclick="BayanOnlineOrders.syncAllPublishedProducts()" style="background:#059669; color:white; border:none; padding:8px 14px; border-radius:8px; font-weight:800; font-size:0.82rem; cursor:pointer; font-family:'Cairo',sans-serif;">📤 مزامنة المنشور</button>
                            <button type="button" onclick="BayanOnlineOrders.startListening()" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:8px 12px; border-radius:8px; font-weight:800; font-size:0.82rem; cursor:pointer; font-family:'Cairo',sans-serif;">🔄 تحديث</button>
                        </div>
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
                        <td style="text-align:center; font-weight:900; color:#0284c7;">#${this._esc(o.id || '-')}</td>
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
                            <h3 style="margin:0; font-size:1.2rem; font-weight:900; color:#0f172a;">📦 تفاصيل طلب أونلاين #${this._esc(order.id)}</h3>
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
        async convertOrderDirectToInvoice(orderKey) {
            const order = this.orders.find(o => String(o.firestoreId || o.id) === String(orderKey));
            if (!order) return;
            if (order.posInvoiceNo || order.status === 'confirmed') {
                if (typeof showToast === 'function') showToast('⚠️ هذا الطلب محوّل مسبقاً إلى فاتورة بيع!', 'warning');
                return;
            }

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
                    await window.db.products.bulkPut(Array.from(modifiedProducts.values()));
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
                    showToast(`✅ تم تحويل الطلب #${order.id} وحفظه كفاتورة بيع رقم #${invId} بنجاح!`, 'success', 6000);
                }
            } catch (err) {
                console.error('[OnlineOrders] Direct conversion error:', err);
                if (typeof showToast === 'function') showToast('❌ تعذر حفظ الفاتورة: ' + err.message, 'error');
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

            if (Array.isArray(p.variants) && p.variants.length > 0) {
                p.variants.forEach(v => {
                    if (!v) return;
                    const s = String(v.size || '').trim();
                    const c = String(v.color || '').trim();
                    if (s && s !== '-' && s !== 'موحد') sizesSet.add(s);
                    if (c && c !== '-' && c !== 'قياسي') colorsSet.add(c);
                    const vSt = (window.FashionStockEngine && typeof window.FashionStockEngine.getVariantStock === 'function')
                        ? window.FashionStockEngine.getVariantStock(v, 'all')
                        : (parseFloat(v.stock) || 0);
                    const key = `${s || 'موحد'}|${c || 'قياسي'}`;
                    variantsStock[key] = (variantsStock[key] || 0) + vSt;
                });
            }

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
                stock: totalStock,
                stockQty: totalStock,
                variantsStock,
                inStock: totalStock > 0,
                active: isPublished,
                isFrozen: !isPublished,
                updatedAt: new Date().toISOString()
            };
            if (parseFloat(p.oldPrice) > payload.price) {
                payload.oldPrice = parseFloat(p.oldPrice);
            }
            return payload;
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
                await db.collection('shops').doc(shopId).collection('products').doc(docId).set(payload, { merge: true });
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
