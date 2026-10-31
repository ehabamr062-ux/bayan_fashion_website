/**
 * ============================================================
 * 👗 BAYAN POS FASHION - MOBILE & LIVE DASHBOARD LOGIC
 * High-Performance, Standalone Client Engine (<20KB Zero Lag)
 * ============================================================
 */

(function (window, document) {
    'use strict';

    // ============================================================
    // ⚙️ STATE & CONFIGURATION
    // ============================================================
    // إزالة أي قيمة قديمة غير صالحة مثل SHOP_DEFAULT
    if (localStorage.getItem('bayan_mob_shop_id') === 'SHOP_DEFAULT') {
        localStorage.removeItem('bayan_mob_shop_id');
    }

    const savedShopId = localStorage.getItem('bayan_mob_shop_id') || '';

    const CONFIG = {
        STORAGE_PREFIX: 'bayan_mob_',
        DEVICE_ID: localStorage.getItem('bayan_mob_device_id') || ('MOB-' + Math.random().toString(36).substring(2, 9).toUpperCase()),
        DEVICE_NAME: localStorage.getItem('bayan_mob_device_name') || 'بيان فاشون موبايل 📱',
        SHOP_ID: savedShopId,
        SHOP_NAME: localStorage.getItem('bayan_mob_shop_name') || 'بَيَان فاشون',
        ACTIVE_WAREHOUSE: localStorage.getItem('bayan_mob_active_warehouse') || 'المخزن الرئيسي'
    };

    const SUPABASE_CONFIG = {
        url: 'https://kxhhdskmpaiitsojwcgu.supabase.co',
        key: 'sb_publishable_-4w34DQF7f2nsijk_xCuhg_NKWSHFoc'
    };

    function getSupabaseHeaders() {
        return {
            'apikey': SUPABASE_CONFIG.key,
            'Authorization': `Bearer ${SUPABASE_CONFIG.key}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        };
    }

    // 🛡️ دالة فحص صارمة لعزل المتاجر والتأكد من اقتران الجهاز بمتجر حقيقي
    function isValidPairedShop(id) {
        return Boolean(id && typeof id === 'string' && id.startsWith('SHOP_') && id !== 'SHOP_DEFAULT' && id.length >= 10);
    }

    // Save persistent device ID
    localStorage.setItem('bayan_mob_device_id', CONFIG.DEVICE_ID);

    const State = {
        token: localStorage.getItem(CONFIG.STORAGE_PREFIX + 'token') || '',
        terminalLetter: localStorage.getItem(CONFIG.STORAGE_PREFIX + 'terminal_letter') || 'B',
        shopId: savedShopId,
        shopName: localStorage.getItem('bayan_mob_shop_name') || 'بَيَان فاشون',
        activeWarehouse: localStorage.getItem('bayan_mob_active_warehouse') || 'المخزن الرئيسي',
        warehouses: JSON.parse(localStorage.getItem(CONFIG.STORAGE_PREFIX + 'warehouses') || '["المخزن الرئيسي"]'),
        isConnected: false,
        pollTimer: null,
        activeTab: 'dashboard',

        // Database
        products: [],
        transactions: [],
        vouchers: [],
        customers: [],
        accounts: [],
        settings: {},

        // Cart & Checkout
        cart: [],
        selectedPayMethod: 'cash', // 'cash', 'vodafone', 'card'
        selectedCustomer: 'عميل نقدي',

        // Filters
        searchQuery: '',
        selectedCategory: 'all',
        accountSearchQuery: '',
        accountFilter: 'all',
        dashboardPeriod: 'today',
        dashboardStartDate: '',
        dashboardEndDate: '',
        txTypeFilter: 'all',
        newProductImageBase64: ''
    };

    // ============================================================
    // 🔔 TOAST NOTIFICATIONS
    // ============================================================
    function showToast(message, type = 'success') {
        let container = document.getElementById('mobile-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mobile-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `mobile-toast ${type}`;
        const icons = { success: '✅', error: '⚠️', warning: '⚡' };
        toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'all 0.3s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300);
        }, 2800);
    }

    // ============================================================
    // 📡 SUPABASE CLOUD CONNECTION & PAIRING
    // ============================================================
    function updateConnectionStatus(connected, message = '') {
        State.isConnected = connected;
        const pill = document.getElementById('connectionStatusPill');
        const text = document.getElementById('connectionStatusText');
        if (pill) {
            if (connected) {
                pill.className = 'status-pill';
                text.textContent = 'متصل بالسحابة 🟢';
            } else {
                pill.className = 'status-pill offline';
                text.textContent = message || 'غير متصل 🔴';
            }
        }
    }

    // 🛡️ حفظ الأصناف محلياً بأمان مع حماية المتصفح من انهيار السعة (QuotaExceededError Protection)
    function safelyPersistProducts(productsList) {
        window.allProducts = productsList;
        try {
            localStorage.setItem(CONFIG.STORAGE_PREFIX + 'products', JSON.stringify(productsList));
        } catch (storageErr) {
            const isQuota = storageErr && (
                storageErr.name === 'QuotaExceededError' ||
                storageErr.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                storageErr.code === 22 ||
                storageErr.code === 1014 ||
                String(storageErr.message || '').toLowerCase().includes('quota')
            );
            if (isQuota) {
                console.warn('⚠️ [StorageQuota] Products catalog exceeds localStorage quota. Retaining full catalog in window.allProducts and RAM.');
                try {
                    // الاحتفاظ بأول 500 صنف فقط للأوفلاين تفادياً لضياع كامل البيانات
                    if (Array.isArray(productsList) && productsList.length > 500) {
                        localStorage.setItem(CONFIG.STORAGE_PREFIX + 'products', JSON.stringify(productsList.slice(0, 500)));
                    }
                } catch (subErr) { }
                showToast('⚡ حجم الأصناف كبير، تم حفظ الكتالوج كاملاً في الذاكرة السريعة دون استهلاك مساحة الهاتف', 'info');
            } else {
                console.warn('[Storage] Product save error:', storageErr);
            }
        }
    }

    async function checkServerInfo() {
        try {
            const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/products?select=id&limit=1`, {
                headers: getSupabaseHeaders()
            });
            if (res.ok) {
                updateConnectionStatus(true);
                return true;
            }
        } catch (e) {
            console.warn('[SupabaseMobile] checkServerInfo network error:', e);
        }
        updateConnectionStatus(false, navigator.onLine ? 'السيرفر السحابي غير متاح' : 'الجهاز غير متصل بالإنترنت');
        return false;
    }

    function openPinModal() {
        const modal = document.getElementById('pinModalOverlay');
        if (modal) modal.classList.add('active');
        const pinInput = document.getElementById('pinInput');
        if (pinInput) {
            pinInput.value = '';
            setTimeout(() => pinInput.focus(), 300);
        }
        const directInp = document.getElementById('directShopIdInput');
        if (directInp) {
            const cur = State.shopId || localStorage.getItem('bayan_mob_shop_id') || '';
            directInp.value = (cur && cur !== 'SHOP_DEFAULT') ? cur : '';
        }
    }

    function closePinModal() {
        const modal = document.getElementById('pinModalOverlay');
        if (modal) modal.classList.remove('active');
    }

    // Pair request flow
    function initiatePairing() {
        openPinModal();
    }

    // 🔐 آلية الإقران الصارمة بالتحقق المزدوج (Shop ID + Pairing PIN)
    async function verifyAndPairDevice(shopIdInput, pinInput) {
        let cleanShopId = String(shopIdInput || '').trim();
        let cleanPin = String(pinInput || '').trim();

        // دعم إدخال الكود المدمج إذا كتب المستخدم كود المحل والـ PIN معاً في حقل واحد (مثل SHOP_XXX:123456 أو SHOP_XXX-123456)
        if (cleanShopId && (!cleanPin || cleanPin.length < 4)) {
            const parts = cleanShopId.split(/[:\-\s_#]+/);
            if (parts.length >= 3 && cleanShopId.toUpperCase().startsWith('SHOP_')) {
                cleanShopId = parts.slice(0, 2).join('_');
                cleanPin = parts[2];
            } else if (parts.length === 2) {
                cleanShopId = parts[0];
                cleanPin = parts[1];
            }
        }
        if (cleanPin && (!cleanShopId || !cleanShopId.startsWith('SHOP_'))) {
            const parts = cleanPin.split(/[:\-\s_#]+/);
            if (parts.length >= 2 && cleanPin.toUpperCase().startsWith('SHOP_')) {
                cleanShopId = parts.slice(0, 2).join('_');
                cleanPin = parts[parts.length - 1];
            }
        }

        if (!cleanShopId) {
            const directEl = document.getElementById('directShopIdInput');
            if (directEl && directEl.value.trim()) cleanShopId = directEl.value.trim();
            else cleanShopId = State.shopId || localStorage.getItem('bayan_mob_shop_id') || '';
        }
        if (!cleanPin) {
            const pinEl = document.getElementById('pinInput');
            if (pinEl && pinEl.value.trim()) cleanPin = pinEl.value.trim();
        }

        cleanShopId = cleanShopId.trim();
        cleanPin = cleanPin.trim();

        if (!cleanShopId.startsWith('SHOP_')) {
            cleanShopId = 'SHOP_' + cleanShopId;
        }

        if (!isValidPairedShop(cleanShopId)) {
            showToast('يرجى إدخال كود محل صحيح (Shop ID يبدأ بـ SHOP_)', 'error');
            return false;
        }

        if (!cleanPin || cleanPin.length < 4) {
            showToast('يرجى إدخال رمز الـ PIN المعروض على شاشة الكمبيوتر (6 أرقام)', 'error');
            return false;
        }

        showToast('جاري التحقق من هوية المحل والرمز السحابي... ⏳', 'warning');

        try {
            // استعلام مباشر ومحصور حصراً على سجل هذا المتجر بعينه لمنع تسريب أو سحب بيانات متاجر أخرى
            const queryUrl = `${SUPABASE_CONFIG.url}/rest/v1/treasury_audit?id=eq.CONFIG_DEVICE_PAIRING_${encodeURIComponent(cleanShopId)}&select=*`;
            const res = await fetch(queryUrl, {
                headers: getSupabaseHeaders()
            });

            if (!res.ok) {
                showToast('تعذر الاتصال بالسيرفر السحابي للتحقق من بيانات الإقران ⚠️', 'error');
                return false;
            }

            const rows = await res.json();
            if (!Array.isArray(rows) || rows.length === 0) {
                showToast('لم يتم العثور على كود المحل في السحابة. تأكد من فتح البرنامج على الكمبيوتر وتفعيله ❌', 'error', 5000);
                return false;
            }

            const pairingRecord = rows[0];
            const raw = pairingRecord.raw_json || {};
            const cloudPin = String(raw.pairingPin || '').trim();

            if (!cloudPin || cloudPin !== cleanPin) {
                showToast('رمز الـ PIN غير صحيح لهذا المحل! راجع الرمز المعروض على شاشة الكمبيوتر ❌', 'error', 5000);
                return false;
            }

            // التحقق المزدوج نجح 100%
            const matchedShopName = raw.shopName || raw.shop_name || 'بَيَان فاشون';
            State.token = 'PAIRED_' + CONFIG.DEVICE_ID;
            State.terminalLetter = 'B';
            State.shopId = cleanShopId;
            CONFIG.SHOP_ID = cleanShopId;
            State.shopName = matchedShopName;

            localStorage.setItem(CONFIG.STORAGE_PREFIX + 'token', State.token);
            localStorage.setItem(CONFIG.STORAGE_PREFIX + 'terminal_letter', State.terminalLetter);
            localStorage.setItem('bayan_mob_shop_id', cleanShopId);
            localStorage.setItem('bayan_mob_shop_name', matchedShopName);

            syncStoreProfile(raw);
            closePinModal();
            showToast(`تم إقران الهاتف بنجاح مع (${matchedShopName}) 🚀`, 'success');
            updateConnectionStatus(true);
            await pullMasterData();
            startAutoSyncPoll();
            return true;
        } catch (e) {
            console.warn('[verifyAndPairDevice] Error:', e);
            showToast('تعذر التحقق: تأكد من اتصال الإنترنت بالسيرفر', 'error');
            return false;
        }
    }

    // 🔗 الربط المباشر بمعرّف المحل السحابي (يتطلب أيضاً PIN ساري للمحل)
    async function submitDirectShopId(rawShopId) {
        const pinInp = document.getElementById('pinInput');
        const pin = pinInp ? pinInp.value : '';
        return verifyAndPairDevice(rawShopId, pin);
    }

    // 🔑 اعتماد رمز الـ PIN (يتحقق بالاقتران مع Shop ID المعرف)
    async function submitPinVerification(pin) {
        const shopInp = document.getElementById('directShopIdInput');
        const shopId = shopInp ? shopInp.value : '';
        return verifyAndPairDevice(shopId, pin);
    }

    // ============================================================
    // 🏪 STORE PROFILE SYNC (مزامنة بيانات وهوية المتجر التلقائية)
    // ============================================================
    function syncStoreProfile(data) {
        if (!data || typeof data !== 'object') return;
        const shopName = data.shopName || data.shop_name || data.name || State.shopName || 'بَيَان فاشون';
        const phone = data.phone || data.shopPhone || data.shop_phone || data.tel || '';
        const address = data.address || data.shopAddress || data.shop_address || '';
        const footer = data.invoiceFooter || data.invoice_footer || data.footer || '';

        const storeInfo = {
            shopName,
            phone,
            address,
            invoiceFooter: footer,
            updatedAt: data.updatedAt || new Date().toISOString()
        };

        localStorage.setItem('bayan_mob_store_info', JSON.stringify(storeInfo));
        localStorage.setItem('bayan_mob_shop_name', shopName);

        State.storeInfo = storeInfo;
        State.shopName = shopName;

        let curSettings = {};
        try { curSettings = JSON.parse(localStorage.getItem('bayan_mob_settings') || '{}'); } catch (e) { }
        curSettings.shop_name = shopName;
        if (phone) curSettings.shop_phone = phone;
        if (address) curSettings.shop_address = address;
        if (footer) curSettings.invoice_footer = footer;
        localStorage.setItem('bayan_mob_settings', JSON.stringify(curSettings));
        State.settings = curSettings;

        applyStoreProfileToUI(storeInfo);
    }

    function applyStoreProfileToUI(storeInfo) {
        if (!storeInfo) {
            try { storeInfo = JSON.parse(localStorage.getItem('bayan_mob_store_info') || 'null'); } catch (e) { }
        }
        if (!storeInfo) return;

        const sName = storeInfo.shopName || 'بَيَان فاشون';
        const sPhone = storeInfo.phone || '';
        const sAddr = storeInfo.address || '';

        // 1. تحديث الهيدر العلوي للموبايل
        const topbarNameEl = document.getElementById('topbarShopName');
        const topbarSubEl = document.getElementById('topbarShopSub');
        if (topbarNameEl) {
            topbarNameEl.innerHTML = `<span class="shop-title-text">${sName}</span> <span class="badge-tag">موبايل 📱</span>`;
        }
        if (topbarSubEl) {
            if (sPhone) {
                topbarSubEl.textContent = `📞 ${sPhone} ${sAddr ? '• ' + sAddr : ''}`;
            } else if (sAddr) {
                topbarSubEl.textContent = `📍 ${sAddr}`;
            } else {
                topbarSubEl.textContent = 'متابعة الخزينة والبيع السريع 👗';
            }
        }

        // 2. تحديث حقول شاشة الإعدادات
        const nameInp = document.getElementById('settingShopNameInput');
        const phoneInp = document.getElementById('settingShopPhoneInput');
        const addrInp = document.getElementById('settingShopAddressInput');
        const footerInp = document.getElementById('settingInvoiceFooterInput');

        if (nameInp) nameInp.value = sName;
        if (phoneInp && sPhone) phoneInp.value = sPhone;
        if (addrInp && sAddr) addrInp.value = sAddr;
        if (footerInp && storeInfo.invoiceFooter) footerInp.value = storeInfo.invoiceFooter;

        // 3. تحديث مقتطفات القائمة الرئيسية للإعدادات
        const snippetBranch = document.getElementById('settingSnippetBranch');
        const snippetInvoice = document.getElementById('settingSnippetInvoice');
        const currentWh = State.activeWarehouse || 'المخزن الرئيسي';

        if (snippetBranch) snippetBranch.textContent = `${sName} • ${currentWh}`;
        if (snippetInvoice) snippetInvoice.textContent = `${sName}${sPhone ? ' • ' + sPhone : ''}`;

        // 4. تحديث معاينة رسالة الواتساب إن وجدت
        if (typeof updateInvoiceWaPreview === 'function') {
            updateInvoiceWaPreview(sName, storeInfo.invoiceFooter);
        }
    }

    function startAutoSyncPoll() {
        if (State.pollTimer) clearInterval(State.pollTimer);
        if (!isValidPairedShop(State.shopId)) return;
        // ترشيد دورة الفحص الدوري كل 30 ثانية لتوفير البطارية والبيانات
        State.pollTimer = setInterval(() => {
            if (navigator.onLine && isValidPairedShop(State.shopId)) {
                pullMasterData(false);
            }
        }, 30000);
    }

    // ============================================================
    // 📥 DATA SYNC PULL (SUPABASE REST)
    // ============================================================
    async function pullMasterData(showIndicator = true) {
        try {
            let currentShopId = State.shopId || CONFIG.SHOP_ID || localStorage.getItem('bayan_mob_shop_id');
            if (currentShopId === 'SHOP_DEFAULT') currentShopId = '';

            // 🛡️ حارس أمان صارم: منع إرسال أي طلب شبكة إذا كان المتجر غير مقترن أو المعرف غير صالح
            if (!isValidPairedShop(currentShopId)) {
                State.shopId = '';
                CONFIG.SHOP_ID = '';
                updateConnectionStatus(false, 'في انتظار الاقتران بكود المحل 🟡');
                if (showIndicator) openPinModal();
                return;
            }

            State.shopId = currentShopId;
            CONFIG.SHOP_ID = currentShopId;

            const safeFetchJson = async (url) => {
                try {
                    const res = await fetch(url, { headers: getSupabaseHeaders() });
                    if (!res.ok) {
                        console.warn(`[SupabaseMobile] HTTP ${res.status} on ${url}`);
                        return [];
                    }
                    return await res.json();
                } catch (netErr) {
                    console.warn(`[SupabaseMobile] Network fetch failed:`, netErr.message || netErr);
                    return [];
                }
            };

            const [pRes, tRes, cRes] = await Promise.all([
                safeFetchJson(`${SUPABASE_CONFIG.url}/rest/v1/products?id=like.${encodeURIComponent(currentShopId)}_PROD_*&select=*`),
                safeFetchJson(`${SUPABASE_CONFIG.url}/rest/v1/transactions?or=(id.like.${encodeURIComponent(currentShopId)}_*,raw_json->>shop_id.eq.${encodeURIComponent(currentShopId)})&select=*&order=created_at.desc&limit=150`),
                safeFetchJson(`${SUPABASE_CONFIG.url}/rest/v1/treasury_audit?or=(id.like.*${encodeURIComponent(currentShopId)}*,id.like.${encodeURIComponent(currentShopId)}_*)&select=*&order=date.desc&limit=100`)
            ]);

            // 0. مزامنة بيانات المتجر التلقائية (Store Profile Sync)
            if (Array.isArray(cRes) && cRes.length > 0) {
                const storeRow = cRes.find(r =>
                    r.id === `CONFIG_DEVICE_PAIRING_${currentShopId}` ||
                    (r.category === 'اقتران' && r.raw_json && (
                        String(r.raw_json.shopId || '').toUpperCase() === currentShopId.toUpperCase() ||
                        String(r.raw_json.shop_id || '').toUpperCase() === currentShopId.toUpperCase()
                    ))
                );
                if (storeRow && storeRow.raw_json) {
                    syncStoreProfile(storeRow.raw_json);
                }
            }

            // 1. معالجة وتوحيد الفواتير مع الاكتشاف الذكي لمعرف المحل
            // تجميع كل الفواتير الملغاة لحظرها وتصفيتها فوراً من الذاكرة والعرض
            const voidedInvIds = new Set();
            if (Array.isArray(cRes) && cRes.length > 0) {
                cRes.forEach(r => {
                    if (r && r.category === 'void_tx') {
                        const rawV = r.raw_json || {};
                        const rowShopId = rawV.shop_id || (r.id && r.id.startsWith(currentShopId + '_') ? currentShopId : null);
                        if (rowShopId !== currentShopId) return;
                        const vId = rawV.invoiceId || (r.id ? String(r.id).replace(`${currentShopId}_VOID_`, '').replace('VOID_DESK_', '').replace('VOID_', '').split('_')[0] : '');
                        if (vId) voidedInvIds.add(String(vId));
                    }
                });
            }

            if (voidedInvIds.size > 0 && Array.isArray(State.transactions)) {
                State.transactions = State.transactions.filter(t => !voidedInvIds.has(String(t.invoiceId || t.id || '')));
            }

            if (Array.isArray(tRes)) {
                let myTxs = tRes.filter(row => {
                    const rowInvId = String(row.invoice_id || row.id || '');
                    if (voidedInvIds.has(rowInvId)) return false;
                    const raw = row.raw_json || {};
                    const rowShopId = raw.shop_id || (row.id && row.id.startsWith(currentShopId + '_') ? currentShopId : null);
                    return rowShopId === currentShopId;
                });

                State.transactions = myTxs.map(row => {
                    const raw = row.raw_json || {};
                    const fallbackDate = row.created_at ? parseDateToISO(row.created_at) : getTodayISO();
                    const txDate = row.date_iso || raw.dateISO || raw.date || fallbackDate;
                    const parsedDateISO = parseDateToISO(txDate) || fallbackDate;
                    const txTime = row.time || raw.time || (row.created_at ? new Date(row.created_at).toTimeString().slice(0, 5) : '12:00');
                    const totVal = parseFloat(row.total !== undefined ? row.total : (raw.total !== undefined ? raw.total : (raw.invoiceGrandTotal || 0))) || 0;
                    const paidVal = parseFloat(row.paid_amount !== undefined ? row.paid_amount : (raw.paidAmount !== undefined ? raw.paidAmount : (raw.paid || totVal))) || 0;
                    const cleanInvId = String(row.invoice_id || raw.invoiceId || row.id || '').replace(`${currentShopId}_`, '');

                    return {
                        id: String(row.id || raw.id || Math.random().toString(36).substring(2, 9)),
                        invoiceId: cleanInvId,
                        dateISO: parsedDateISO,
                        timeISO: txTime,
                        type: row.type || raw.type || 'مبيعات',
                        partner: row.partner || raw.partner || 'عميل نقدي',
                        total: totVal,
                        invoiceGrandTotal: totVal,
                        paidAmount: paidVal,
                        remaining: parseFloat(row.remaining !== undefined ? row.remaining : (raw.remaining || 0)) || 0,
                        method: row.method || raw.method || 'كاش',
                        cashier: row.cashier || raw.cashier || 'المدير',
                        items: Array.isArray(raw.items) ? raw.items : [],
                        isInvoiceHead: (raw.isInvoiceHead !== undefined ? Boolean(raw.isInvoiceHead) : true),
                        ...raw
                    };
                });
                try { localStorage.setItem(CONFIG.STORAGE_PREFIX + 'transactions', JSON.stringify(State.transactions)); } catch (e) { }
            }

            // 2. استخراج قائمة المخازن الحقيقية المعتمدة المسجلة على اللابتوب
            let detectedWhList = [];
            if (Array.isArray(cRes) && cRes.length > 0) {
                const whRow = cRes.find(r => r.id === `CONFIG_WAREHOUSES_LIST_${currentShopId}`);
                if (whRow && whRow.raw_json && Array.isArray(whRow.raw_json.warehouses)) {
                    detectedWhList = whRow.raw_json.warehouses
                        .map(w => (typeof w === 'object' ? w.name : w))
                        .map(n => String(n || '').trim())
                        .filter(Boolean);
                }
            }

            // فحص إضافي تلقائي من أرصدة الأصناف ومصفوفة المقاسات والألوان
            if (Array.isArray(pRes) && pRes.length > 0) {
                pRes.forEach(row => {
                    const raw = row.raw_json || {};
                    if (raw.warehouseStocks && typeof raw.warehouseStocks === 'object') {
                        Object.keys(raw.warehouseStocks).forEach(k => {
                            const cleanK = String(k || '').trim();
                            if (cleanK && !detectedWhList.includes(cleanK)) detectedWhList.push(cleanK);
                        });
                    }
                    if (Array.isArray(raw.variants)) {
                        raw.variants.forEach(v => {
                            if (v.warehouseStocks && typeof v.warehouseStocks === 'object') {
                                Object.keys(v.warehouseStocks).forEach(k => {
                                    const cleanK = String(k || '').trim();
                                    if (cleanK && !detectedWhList.includes(cleanK)) detectedWhList.push(cleanK);
                                });
                            }
                        });
                    }
                });
            }

            if (detectedWhList.length === 0) {
                detectedWhList = ['المخزن الرئيسي'];
            } else if (!detectedWhList.includes('المخزن الرئيسي')) {
                detectedWhList.unshift('المخزن الرئيسي');
            }

            State.warehouses = detectedWhList;
            try { localStorage.setItem(CONFIG.STORAGE_PREFIX + 'warehouses', JSON.stringify(State.warehouses)); } catch (e) { }

            // ضبط المخزن النشط تلقائياً
            if (!State.activeWarehouse || !State.warehouses.includes(State.activeWarehouse)) {
                State.activeWarehouse = State.warehouses[0] || 'المخزن الرئيسي';
                localStorage.setItem('bayan_mob_active_warehouse', State.activeWarehouse);
            }

            // 3. معالجة وتوحيد الأصناف وحساب رصيد المخزن النشط بدقة
            if (Array.isArray(pRes)) {
                let myProds = pRes.filter(row => {
                    const raw = row.raw_json || {};
                    const rowShopId = raw.shop_id || (row.id && row.id.startsWith(currentShopId + '_') ? currentShopId : null);
                    return rowShopId === currentShopId;
                });

                const curWH = State.activeWarehouse || 'المخزن الرئيسي';

                State.products = myProds.map(row => {
                    const raw = row.raw_json || {};
                    const whStocks = (raw.warehouseStocks && typeof raw.warehouseStocks === 'object') ? raw.warehouseStocks : {};
                    const localProdId = raw.localId || raw.id || row.id.replace(`${currentShopId}_PROD_`, '');

                    // حساب رصيد الصنف الإجمالي في هذا المخزن النشط بالذات
                    let totalStockInWH = 0;
                    if (whStocks[curWH] !== undefined) {
                        totalStockInWH = parseFloat(whStocks[curWH]) || 0;
                    } else if (curWH === 'المخزن الرئيسي' || Object.keys(whStocks).length === 0) {
                        totalStockInWH = parseFloat(row.stock !== undefined ? row.stock : (raw.stock !== undefined ? raw.stock : (raw.quantity || 0))) || 0;
                    }

                    const variantsList = (Array.isArray(raw.variants) ? raw.variants : []).map(v => {
                        const vWhStocks = (v.warehouseStocks && typeof v.warehouseStocks === 'object') ? v.warehouseStocks : {};
                        let vStockInWH = 0;
                        if (vWhStocks[curWH] !== undefined) {
                            vStockInWH = parseFloat(vWhStocks[curWH]) || 0;
                        } else if (curWH === 'المخزن الرئيسي' || Object.keys(vWhStocks).length === 0) {
                            vStockInWH = parseFloat(v.stock !== undefined ? v.stock : (v.quantity !== undefined ? v.quantity : (v.qty || 0))) || 0;
                        }

                        return {
                            ...v,
                            size: v.size || 'عادي',
                            color: v.color || 'عام',
                            stock: vStockInWH,
                            quantity: vStockInWH,
                            warehouseStocks: vWhStocks
                        };
                    });

                    return {
                        id: String(localProdId),
                        name: row.name || raw.name || 'صنف',
                        barcode: row.barcode || raw.barcode || '',
                        category: row.category || raw.category || 'عام',
                        price: parseFloat(row.price !== undefined ? row.price : (raw.price || 0)),
                        cost: parseFloat(row.cost !== undefined ? row.cost : (raw.cost || 0)),
                        wholesale: parseFloat(row.wholesale !== undefined ? row.wholesale : (raw.wholesale || 0)),
                        quantity: totalStockInWH,
                        stock: totalStockInWH,
                        variants: variantsList,
                        warehouseStocks: whStocks,
                        ...raw,
                        id: String(localProdId)
                    };
                });
                safelyPersistProducts(State.products);
            }

            // 4. استقبال قائمة الحسابات والعملاء الخاصة بهذا المحل من السحابة
            if (Array.isArray(cRes) && cRes.length > 0) {
                const shopRow = cRes.find(r => r.id === `CONFIG_CUSTOMERS_LIST_${currentShopId}`);
                if (shopRow && shopRow.raw_json) {
                    const rawObj = shopRow.raw_json;
                    const accs = Array.isArray(rawObj.accounts) ? rawObj.accounts : (Array.isArray(rawObj.customers) ? rawObj.customers : []);
                    State.accounts = accs;
                    State.customers = accs;
                    try {
                        localStorage.setItem(CONFIG.STORAGE_PREFIX + 'accounts', JSON.stringify(State.accounts));
                        localStorage.setItem(CONFIG.STORAGE_PREFIX + 'customers', JSON.stringify(State.customers));
                    } catch (e) { }
                }
            }

            updateConnectionStatus(true);
            renderCurrentView();
            updateCategoriesList();
        } catch (e) {
            console.warn('[SupabaseMobile] Pull data error:', e);
            updateConnectionStatus(false, navigator.onLine ? 'تعذر مزامنة السحابة (جاري المحاولة)' : 'أوفلاين (يعمل محلياً)');
            const cachedP = localStorage.getItem(CONFIG.STORAGE_PREFIX + 'products');
            const cachedT = localStorage.getItem(CONFIG.STORAGE_PREFIX + 'transactions');
            const cachedC = localStorage.getItem(CONFIG.STORAGE_PREFIX + 'customers');
            const cachedA = localStorage.getItem(CONFIG.STORAGE_PREFIX + 'accounts');
            if (cachedP) {
                try {
                    State.products = JSON.parse(cachedP);
                    window.allProducts = State.products;
                } catch (e) { }
            }
            if (cachedT) { try { State.transactions = JSON.parse(cachedT); } catch (e) { } }
            if (cachedC) { try { State.customers = JSON.parse(cachedC); } catch (e) { } }
            if (cachedA) {
                try { State.accounts = JSON.parse(cachedA); } catch (e) { }
            } else if (cachedC) {
                State.accounts = State.customers;
            }
            renderCurrentView();
        }
    }

    // ============================================================
    // 📊 DASHBOARD & CASH DRAWER CALCULATIONS ("يشوف الكيس")
    // ============================================================
    // ============================================================
    // 📊 DASHBOARD & CASH DRAWER CALCULATIONS ("يشوف الكيس")
    // ============================================================
    function parseDateToISO(dateStr) {
        if (!dateStr) return '';
        // إذا كان التاريخ بتنسيق YYYY-MM-DD الخالص
        if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
            return dateStr.trim();
        }
        // إذا كان طابعاً زمنياً يحوي T (مثل 2026-10-05T21:45:00Z)، يحول للتوقيت المحلي للجهاز بدقة
        if (typeof dateStr === 'string' && dateStr.includes('T')) {
            const p = new Date(dateStr);
            if (!isNaN(p.getTime())) {
                const y = p.getFullYear();
                const m = String(p.getMonth() + 1).padStart(2, '0');
                const d = String(p.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
        }
        // Normalize Arabic digits
        const normalized = String(dateStr).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        // Check for DD/MM/YYYY or D/M/YYYY
        const match = normalized.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
        if (match) {
            const day = match[1].padStart(2, '0');
            const month = match[2].padStart(2, '0');
            const year = match[3];
            return `${year}-${month}-${day}`;
        }
        // Check for YYYY/MM/DD
        const isoMatch = normalized.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
        if (isoMatch) {
            return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
        }
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        return '';
    }

    function getTxDateISO(t) {
        if (!t) return '';
        if (t.dateISO) return parseDateToISO(t.dateISO);
        return parseDateToISO(t.date || t.date_iso || t.createdAt || t.created_at || t.timestamp) || '';
    }

    function getTodayISO() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getYesterdayISO() {
        const yDate = new Date();
        yDate.setDate(yDate.getDate() - 1);
        const y = yDate.getFullYear();
        const m = String(yDate.getMonth() + 1).padStart(2, '0');
        const d = String(yDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function isNonCash(m) {
        if (!m) return false;
        const str = String(m).toLowerCase().trim();
        return str.includes('بنك') || str.includes('تحويل') || str.includes('فيزا') ||
            str.includes('شيك') || str.includes('شبكة') || str.includes('فودافون') ||
            str.includes('فودافن') || str.includes('vodafone') || str.includes('voda') ||
            str.includes('اورنج') || str.includes('orange') || str.includes('اتصالات') ||
            str.includes('etisalat') || str.includes('وي') || str.includes('we') ||
            str.includes('انستا') || str.includes('insta') || str.includes('محفظة') ||
            str.includes('wallet') || str.includes('card') || str.includes('visa');
    }

    function formatDateISO(d) {
        if (!d || isNaN(d.getTime())) return getTodayISO();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function getPeriodDateRange(period = 'today') {
        const today = getTodayISO();
        const now = new Date();

        if (period === 'yesterday') {
            const yISO = getYesterdayISO();
            const yDate = new Date();
            yDate.setDate(yDate.getDate() - 1);
            return {
                start: yISO,
                end: yISO,
                label: 'الأمس',
                chipText: 'الأمس (' + yDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) + ')'
            };
        }

        if (period === 'week') {
            const wDate = new Date();
            wDate.setDate(wDate.getDate() - 6);
            const wISO = formatDateISO(wDate);
            return {
                start: wISO,
                end: today,
                label: 'آخر 7 أيام',
                chipText: 'آخر 7 أيام'
            };
        }

        if (period === 'month') {
            const mDate = new Date(now.getFullYear(), now.getMonth(), 1);
            const mISO = formatDateISO(mDate);
            return {
                start: mISO,
                end: today,
                label: 'هذا الشهر',
                chipText: now.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
            };
        }

        if (period === 'custom') {
            const s = State.dashboardStartDate || today;
            const e = State.dashboardEndDate || today;
            return {
                start: s <= e ? s : e,
                end: s <= e ? e : s,
                label: `فترة (${s} إلى ${e})`,
                chipText: `${s} ⬅ ${e}`
            };
        }

        // الافتراضي: اليوم
        return {
            start: today,
            end: today,
            label: 'اليوم',
            chipText: now.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })
        };
    }

    function calculatePeriodDrawerStats(range) {
        let netDrawerCashAllTime = 0;
        let totalSales = 0;
        let cashSales = 0;
        let vodafoneSales = 0;
        let cardSales = 0;
        let totalReturns = 0;
        let cashReturns = 0;
        let expenses = 0;
        let invoiceCount = 0;
        let itemsCount = 0;

        const startISO = range.start;
        const endISO = range.end;

        State.transactions.forEach(t => {
            const amt = parseFloat(t.paidAmount !== undefined ? t.paidAmount : (t.paid !== undefined ? t.paid : (t.invoiceGrandTotal || t.total || 0))) || 0;
            const isHead = (t.isInvoiceHead === true || t.isInvoiceHead === undefined || t.isInvoiceHead === null || t.isInvoiceHead === 1 || t.isInvoiceHead === '1');
            const rawMethod = String(t.method || t.paymentMethod || '');
            const nonCash = isNonCash(rawMethod);
            const type = String(t.type || '');
            const typeLow = type.toLowerCase();
            const isSaleType = (type.includes('بيع') || typeLow.includes('sale') || typeLow.includes('pos') || typeLow.includes('invoice')) && !type.includes('مرتجع') && !typeLow.includes('return');
            const isReturnType = (type.includes('مرتجع') || typeLow.includes('return'));
            const isDisburseType = (type.includes('صرف') || type.includes('مصروف') || typeLow.includes('expense') || typeLow.includes('disburse'));
            const isReceiptType = (type.includes('قبض') || typeLow.includes('receipt'));
            const tDateISO = getTxDateISO(t);

            // Cumulative cash in physical drawer (all-time)
            if (!nonCash) {
                if (isSaleType) {
                    if (isHead) netDrawerCashAllTime += amt;
                } else if (isReceiptType) {
                    netDrawerCashAllTime += amt;
                } else if (type.includes('مرتجع شراء') || (isReturnType && (typeLow.includes('purch') || type.includes('شراء')))) {
                    if (isHead) netDrawerCashAllTime += amt;
                } else if (isReturnType) {
                    if (isHead) netDrawerCashAllTime -= amt;
                } else if (isDisburseType) {
                    netDrawerCashAllTime -= amt;
                } else if (type.includes('شراء') || typeLow.includes('purch')) {
                    if (isHead) netDrawerCashAllTime -= amt;
                }
            }

            // إحصائيات الفترة المحددة (startISO <= tDateISO <= endISO)
            const inPeriod = (tDateISO && tDateISO >= startISO && tDateISO <= endISO);
            if (inPeriod) {
                if (isSaleType) {
                    if (isHead) {
                        const invTot = parseFloat(t.invoiceGrandTotal || t.total || amt) || 0;
                        totalSales += invTot;
                        invoiceCount++;
                        const mLower = rawMethod.toLowerCase();
                        if (mLower.includes('voda') || mLower.includes('فودافون')) {
                            vodafoneSales += invTot;
                        } else if (mLower.includes('فيزا') || mLower.includes('card') || mLower.includes('انستا') || mLower.includes('visa')) {
                            cardSales += invTot;
                        } else {
                            cashSales += invTot;
                        }
                    }
                    const qVal = parseFloat(t.qty || (Array.isArray(t.items) ? t.items.reduce((sum, it) => sum + (parseFloat(it.quantity || it.qty || 1) || 1), 0) : 1)) || 1;
                    itemsCount += qVal;
                } else if (isReturnType) {
                    if (isHead) {
                        totalReturns += amt;
                        if (!nonCash) cashReturns += amt;
                    }
                } else if (isDisburseType) {
                    expenses += amt;
                }
            }
        });

        // احتساب المصروفات من السندات بالفترة إن وجدت
        if (Array.isArray(State.vouchers)) {
            State.vouchers.forEach(v => {
                const vDateISO = parseDateToISO(v.date || v.createdAt);
                const vAmt = parseFloat(v.amount || 0) || 0;
                if (vDateISO && vDateISO >= startISO && vDateISO <= endISO) {
                    if (v.type === 'disburse' || v.type === 'expense' || v.voucherType === 'disburse') {
                        expenses += vAmt;
                    }
                }
            });
        }

        const periodTxs = State.transactions.filter(t => {
            const d = getTxDateISO(t);
            return d && d >= startISO && d <= endISO;
        });

        // احتساب الكاش المعروض:
        // لليوم: كاش الدرج الفعلي التراكمي
        // للفترات السابقة: صافي النقدية المتحصلة خلال الفترة نفسها
        const isTodayPeriod = (State.dashboardPeriod === 'today');
        const netCashPeriod = (cashSales - cashReturns - expenses);
        const displayedDrawerCash = isTodayPeriod
            ? (netDrawerCashAllTime !== 0 ? netDrawerCashAllTime : Math.max(0, netCashPeriod))
            : netCashPeriod;

        return {
            netDrawerCash: displayedDrawerCash,
            netDrawerCashAllTime,
            netCashPeriod,
            totalSales,
            cashSales,
            vodafoneSales,
            cardSales,
            totalReturns,
            expenses,
            invoiceCount,
            itemsCount,
            periodTxs
        };
    }

    // مزامنة فواتير ومعاملات فترة زمنية محددة من سحابة Supabase
    async function syncPeriodTransactionsFromCloud(startISO, endISO) {
        if (!startISO || !endISO || !navigator.onLine) return;
        const currentShopId = State.shopId || CONFIG.SHOP_ID || '';
        if (!isValidPairedShop(currentShopId)) return;

        try {
            let url = `${SUPABASE_CONFIG.url}/rest/v1/transactions?select=*&order=created_at.desc&limit=300`;
            url += `&or=(id.like.${encodeURIComponent(currentShopId)}_*,raw_json->>shop_id.eq.${encodeURIComponent(currentShopId)})`;
            url += `&or=(and(date_iso.gte.${startISO},date_iso.lte.${endISO}),and(created_at.gte.${startISO}T00:00:00Z,created_at.lte.${endISO}T23:59:59Z))`;

            const res = await fetch(url, { headers: getSupabaseHeaders() });
            if (res.ok) {
                const rows = await res.json();
                if (Array.isArray(rows) && rows.length > 0) {
                    const shopRows = rows.filter(r => {
                        const raw = r.raw_json || {};
                        const rowShopId = raw.shop_id || (r.id && r.id.startsWith(currentShopId + '_') ? currentShopId : null);
                        return rowShopId === currentShopId;
                    });

                    const mapped = shopRows.map(row => {
                        const raw = row.raw_json || {};
                        const fallbackDate = row.created_at ? parseDateToISO(row.created_at) : getTodayISO();
                        const txDate = row.date_iso || raw.dateISO || raw.date || fallbackDate;
                        const parsedDateISO = parseDateToISO(txDate) || fallbackDate;
                        const txTime = row.time || raw.time || (row.created_at ? new Date(row.created_at).toTimeString().slice(0, 5) : '12:00');
                        const totVal = parseFloat(row.total !== undefined ? row.total : (raw.total !== undefined ? raw.total : (raw.invoiceGrandTotal || 0))) || 0;
                        const paidVal = parseFloat(row.paid_amount !== undefined ? row.paid_amount : (raw.paidAmount !== undefined ? raw.paidAmount : (raw.paid || totVal))) || 0;
                        const cleanInvId = String(row.invoice_id || raw.invoiceId || row.id || '').replace(`${currentShopId}_`, '');

                        return {
                            id: String(row.id || raw.id),
                            invoiceId: cleanInvId,
                            dateISO: parsedDateISO,
                            timeISO: txTime,
                            type: row.type || raw.type || 'مبيعات',
                            partner: row.partner || raw.partner || 'عميل نقدي',
                            total: totVal,
                            invoiceGrandTotal: totVal,
                            paidAmount: paidVal,
                            remaining: parseFloat(row.remaining !== undefined ? row.remaining : (raw.remaining || 0)) || 0,
                            method: row.method || raw.method || 'كاش',
                            cashier: row.cashier || raw.cashier || 'المدير',
                            items: Array.isArray(raw.items) ? raw.items : [],
                            isInvoiceHead: (raw.isInvoiceHead !== undefined ? Boolean(raw.isInvoiceHead) : true),
                            ...raw
                        };
                    });

                    const existingIds = new Set(State.transactions.map(t => String(t.invoiceId || t.id)));
                    let newCount = 0;
                    mapped.forEach(m => {
                        const key = String(m.invoiceId || m.id);
                        if (!existingIds.has(key)) {
                            State.transactions.push(m);
                            existingIds.add(key);
                            newCount++;
                        }
                    });

                    if (newCount > 0) {
                        try { localStorage.setItem(CONFIG.STORAGE_PREFIX + 'transactions', JSON.stringify(State.transactions)); } catch (e) { }
                        renderDashboard();
                    }
                }
            }
        } catch (err) {
            console.warn('[SyncPeriod] Error:', err);
        }
    }

    function setDashboardPeriod(period) {
        State.dashboardPeriod = period;

        const periodSelect = document.getElementById('dashboardPeriodSelect');
        if (periodSelect && periodSelect.value !== period) {
            periodSelect.value = period;
        }

        const activeLabel = document.getElementById('activePeriodLabel');
        if (activeLabel) {
            const labels = {
                'today': 'اليوم',
                'yesterday': 'الأمس',
                'week': 'آخر 7 أيام',
                'month': 'هذا الشهر',
                'custom': 'فترة مخصصة'
            };
            activeLabel.textContent = labels[period] || period;
        }

        const chipMap = {
            'today': 'periodChipToday',
            'yesterday': 'periodChipYesterday',
            'week': 'periodChipWeek',
            'month': 'periodChipMonth',
            'custom': 'periodChipCustom'
        };

        Object.keys(chipMap).forEach(key => {
            const el = document.getElementById(chipMap[key]);
            if (el) el.classList.toggle('active', key === period);
        });

        const customBox = document.getElementById('customDateRangeBox');
        if (customBox && period !== 'custom') {
            customBox.style.display = 'none';
        }

        renderDashboard();

        const range = getPeriodDateRange(period);
        syncPeriodTransactionsFromCloud(range.start, range.end);
    }

    function onPeriodSelectChange(val) {
        if (val === 'custom') {
            toggleCustomDateRange(true);
        } else {
            const customBox = document.getElementById('customDateRangeBox');
            if (customBox) customBox.style.display = 'none';
            setDashboardPeriod(val);
        }
    }

    // دالة مرادفة معتمدة لفلترة المبيعات حسب الفترة
    function filterSalesByPeriod(period) {
        return setDashboardPeriod(period);
    }

    function toggleCustomDateRange(forceOpen) {
        const customBox = document.getElementById('customDateRangeBox');
        if (!customBox) return;

        const isVisible = (customBox.style.display === 'block');
        const shouldShow = (forceOpen !== undefined) ? forceOpen : !isVisible;

        if (shouldShow) {
            customBox.style.display = 'block';

            const periodSelect = document.getElementById('dashboardPeriodSelect');
            if (periodSelect) periodSelect.value = 'custom';
            const activeLabel = document.getElementById('activePeriodLabel');
            if (activeLabel) activeLabel.textContent = 'فترة مخصصة';

            const startInput = document.getElementById('dashCustomStartDate');
            const endInput = document.getElementById('dashCustomEndDate');
            const today = getTodayISO();

            if (startInput && !startInput.value) {
                const wDate = new Date();
                wDate.setDate(wDate.getDate() - 7);
                startInput.value = formatDateISO(wDate);
            }
            if (endInput && !endInput.value) {
                endInput.value = today;
            }

            ['periodChipToday', 'periodChipYesterday', 'periodChipWeek', 'periodChipMonth'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active');
            });
            const chipCustom = document.getElementById('periodChipCustom');
            if (chipCustom) chipCustom.classList.add('active');
        } else {
            customBox.style.display = 'none';
            if (State.dashboardPeriod !== 'custom') {
                const periodSelect = document.getElementById('dashboardPeriodSelect');
                if (periodSelect) periodSelect.value = State.dashboardPeriod;
                const activeLabel = document.getElementById('activePeriodLabel');
                if (activeLabel) {
                    const labels = { 'today': 'اليوم', 'yesterday': 'الأمس', 'week': 'آخر 7 أيام', 'month': 'هذا الشهر' };
                    activeLabel.textContent = labels[State.dashboardPeriod] || 'اليوم';
                }
            }
        }
    }

    function applyCustomDateRange() {
        const startInput = document.getElementById('dashCustomStartDate');
        const endInput = document.getElementById('dashCustomEndDate');

        const startVal = startInput ? startInput.value : '';
        const endVal = endInput ? endInput.value : '';

        if (!startVal || !endVal) {
            showToast('يرجى تحديد تاريخ البداية والنهاية أولاً 📅', 'warning');
            return;
        }

        State.dashboardPeriod = 'custom';
        State.dashboardStartDate = startVal <= endVal ? startVal : endVal;
        State.dashboardEndDate = startVal <= endVal ? endVal : startVal;

        const periodSelect = document.getElementById('dashboardPeriodSelect');
        if (periodSelect) periodSelect.value = 'custom';
        const activeLabel = document.getElementById('activePeriodLabel');
        if (activeLabel) activeLabel.textContent = `${State.dashboardStartDate} إلى ${State.dashboardEndDate}`;

        const chipCustom = document.getElementById('periodChipCustom');
        if (chipCustom) chipCustom.classList.add('active');

        renderDashboard();
        showToast(`جاري جلب فواتير الفترة (${State.dashboardStartDate} إلى ${State.dashboardEndDate}) ⏳`, 'info');
        syncPeriodTransactionsFromCloud(State.dashboardStartDate, State.dashboardEndDate);
    }

    function renderDashboard() {
        const period = State.dashboardPeriod || 'today';
        const range = getPeriodDateRange(period);
        const stats = calculatePeriodDrawerStats(range);

        // عناصر بطاقة الخزينة الرئيسية
        const elDrawerAmount = document.getElementById('drawerAmount');
        const elTodaySales = document.getElementById('todayTotalSales');
        const elInvoicesCount = document.getElementById('todayInvoicesCount');
        const elTodayDate = document.getElementById('drawerDateChip');
        const elDrawerTitleText = document.getElementById('drawerTitleText');
        const elDashSalesLabel = document.getElementById('dashSalesLabel');
        const elDashInvoicesLabel = document.getElementById('dashInvoicesLabel');
        const elDashCashLabel = document.getElementById('dashCashLabel');
        const elRecentInvoicesTitle = document.getElementById('dashRecentInvoicesTitle');
        const elRecentInvoicesSub = document.getElementById('dashRecentInvoicesSub');

        // تحديث النصوص والعناوين حسب الفترة
        if (elDrawerTitleText) {
            elDrawerTitleText.textContent = (period === 'today')
                ? 'رصيد النقدية المتاح بالدرج (الكاش)'
                : `صافي كاش الدرج (${range.label})`;
        }
        if (elDashSalesLabel) {
            elDashSalesLabel.textContent = (period === 'today') ? 'إجمالي مبيعات اليوم' : `إجمالي مبيعات (${range.label})`;
        }
        if (elDashInvoicesLabel) {
            elDashInvoicesLabel.textContent = (period === 'today') ? 'عدد الفواتير المنفذة' : `فواتير (${range.label})`;
        }
        if (elDashCashLabel) {
            elDashCashLabel.textContent = (period === 'today') ? 'كاش نقدي اليوم' : `كاش نقدي (${range.label})`;
        }
        if (elRecentInvoicesTitle) {
            elRecentInvoicesTitle.textContent = (period === 'today') ? 'أحدث حركات البيع اليوم' : `فواتير وحركات (${range.label})`;
        }
        if (elRecentInvoicesSub) {
            elRecentInvoicesSub.textContent = `${stats.periodTxs.length} حركة • ${stats.totalSales.toLocaleString('ar-EG')} ج.م`;
        }

        if (elDrawerAmount) elDrawerAmount.textContent = stats.netDrawerCash.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (elTodaySales) elTodaySales.textContent = stats.totalSales.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        if (elInvoicesCount) elInvoicesCount.textContent = stats.invoiceCount + ' فاتورة (' + stats.itemsCount + ' قطعة)';
        if (elTodayDate) {
            elTodayDate.textContent = range.chipText;
        }

        // شبكة وسائط الدفع
        const elCash = document.getElementById('statCashAmount');
        const elVoda = document.getElementById('statVodafoneAmount');
        const elCard = document.getElementById('statCardAmount');
        const elExpense = document.getElementById('statExpenseAmount');

        if (elCash) elCash.textContent = stats.cashSales.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        if (elVoda) elVoda.textContent = stats.vodafoneSales.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        if (elCard) elCard.textContent = stats.cardSales.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        if (elExpense) elExpense.textContent = stats.expenses.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

        // تنبيه النواقص السريع في الداشبورد
        const lowStockBanner = document.getElementById('dashLowStockBanner');
        const lowStockTitle = document.getElementById('dashLowStockTitle');
        if (lowStockBanner) {
            const lowItems = (State.products || []).filter(p => {
                const s = parseFloat(p.quantity !== undefined ? p.quantity : (p.stock || 0));
                return s <= 2;
            });
            if (lowItems.length > 0) {
                lowStockBanner.style.display = 'flex';
                if (lowStockTitle) lowStockTitle.textContent = `تنبيه نواقص المخزن (${lowItems.length} موديلات)`;
            } else {
                lowStockBanner.style.display = 'none';
            }
        }

        // قائمة الفواتير والحركات الذكية
        const listEl = document.getElementById('recentActivityList');
        if (!listEl) return;

        // تطبيق فلتر نوع المعاملة
        let displayTxs = stats.periodTxs;
        if (State.txTypeFilter && State.txTypeFilter !== 'all') {
            displayTxs = displayTxs.filter(tx => {
                const c = classifyTransaction(tx);
                return c.key === State.txTypeFilter;
            });
        }

        if (stats.periodTxs.length === 0) {
            const emptyLabel = (period === 'today') ? 'اليوم' : (period === 'yesterday' ? 'الأمس' : range.label);
            listEl.innerHTML = `
                <div class="empty-sales-card">
                    <div class="empty-sales-icon-wrap">
                        <span class="empty-sales-icon">🛍️</span>
                    </div>
                    <h4 class="empty-sales-title">لا توجد حركات مسجلة في هذا اليوم 🛍️</h4>
                    <p class="empty-sales-desc">فترة (${emptyLabel}) لا تحتوي على أي فواتير أو حركات مسجلة بعد. يمكنك بدء تسجيل أول عملية بيع فوري الآن بنقرة واحدة.</p>
                    <button type="button" class="btn-empty-pos-shortcut" onclick="window.BayanMobile.switchTab('pos')">
                        <span>🛒</span> إنشاء فاتورة بيع جديدة
                    </button>
                </div>
            `;
            return;
        }

        if (displayTxs.length === 0) {
            const filterLabels = {
                sale: 'مبيعات 🛍️',
                purchase: 'مشتريات 📦',
                receipt: 'سندات قبض 📥',
                disburse: 'سندات صرف 📤',
                return: 'مرتجعات ↩️',
                adjustment: 'تسويات مخزنية ⚖️',
                transfer: 'تحويلات مخزنية 🔄'
            };
            const currentLabel = filterLabels[State.txTypeFilter] || State.txTypeFilter;
            listEl.innerHTML = `
                <div class="empty-sales-card" style="padding: 30px 16px;">
                    <div class="empty-sales-icon-wrap">
                        <span class="empty-sales-icon">🔍</span>
                    </div>
                    <h4 class="empty-sales-title">لا توجد ${currentLabel} مسجلة</h4>
                    <p class="empty-sales-desc">لم يتم تسجيل أي حركات مطابقة لهذا التصنيف خلال الفترة المحددة.</p>
                    <button type="button" class="btn-empty-pos-shortcut" onclick="window.BayanMobile.setTxTypeFilter('all')">
                        <span>📋</span> عرض كافة الحركات
                    </button>
                </div>
            `;
            return;
        }

        const sorted = [...displayTxs].sort((a, b) => {
            const dateA = a.dateISO || '';
            const dateB = b.dateISO || '';
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            const idA = parseInt(a.id || 0, 10);
            const idB = parseInt(b.id || 0, 10);
            return idB - idA;
        }).slice(0, 40);

        listEl.innerHTML = sorted.map(tx => {
            const classification = classifyTransaction(tx);
            const dateStr = tx.dateISO || (tx.date ? String(tx.date).split('،')[0] : '');
            const timeStr = tx.timeISO || (tx.date ? String(tx.date).split('،')[1] || tx.date : '--:--');
            const displayDateTime = (period === 'today') ? timeStr : `${dateStr} ${timeStr}`;
            const rawMethod = tx.method || tx.paymentMethod || 'كاش (نقدي)';
            const payMethodText = getPayMethodLabel(rawMethod);
            const totalVal = Math.abs(parseFloat(tx.invoiceGrandTotal || tx.total || tx.paidAmount || tx.amount || 0));
            const total = totalVal.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const itemsSummary = tx.product || (Array.isArray(tx.items) ? tx.items.map(i => i.name).slice(0, 2).join('، ') : (tx.description || tx.notes || classification.label));
            const sign = classification.isNegative ? '-' : '+';
            const priceColor = classification.isNegative ? '#f43f5e' : (classification.key === 'sale' ? 'var(--emerald)' : classification.color);

            return `
                <div class="activity-card ${classification.badgeClass}" onclick="window.BayanMobile.openInvoiceDetails('${tx.invoiceId || tx.id}')">
                    <div class="activity-meta">
                        <div class="activity-badge ${classification.badgeClass}">
                            ${classification.icon}
                        </div>
                        <div class="activity-details">
                            <h4>#${tx.invoiceId || tx.id || '---'} <span style="font-size:0.75rem; color:var(--text-dim); font-weight:700;">(${classification.label})</span></h4>
                            <p>${itemsSummary} • ${displayDateTime}</p>
                        </div>
                    </div>
                    <div class="activity-right">
                        <div class="activity-price" style="color: ${priceColor};">${sign}${total} ج.م</div>
                        <span class="activity-pay-tag">${payMethodText}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // تصنيف المعاملات بذكاء ودقة إلى 7 فئات أساسية
    function classifyTransaction(tx) {
        const s = String(tx.type || tx.txType || tx.kind || '').trim().toLowerCase();
        if (s.includes('مرتجع') || s.includes('return') || s.includes('مردود')) {
            return { key: 'return', label: 'مرتجع', icon: '↩️', color: '#ea580c', badgeClass: 'return', isNegative: true };
        }
        if (s.includes('صرف') || s.includes('disburse') || s.includes('مصروف') || s.includes('نثريات')) {
            return { key: 'disburse', label: 'سند صرف', icon: '📤', color: '#e11d48', badgeClass: 'disburse', isNegative: true };
        }
        if (s.includes('قبض') || s.includes('receipt') || s.includes('إيداع') || s.includes('ايداع')) {
            return { key: 'receipt', label: 'سند قبض', icon: '📥', color: '#0891b2', badgeClass: 'receipt', isNegative: false };
        }
        if (s.includes('شراء') || s.includes('purchase') || s.includes('مشتريات')) {
            return { key: 'purchase', label: 'فاتورة شراء', icon: '📦', color: '#2563eb', badgeClass: 'purchase', isNegative: true };
        }
        if (s.includes('تسوي') || s.includes('adjust') || s.includes('عجز') || s.includes('زيادة')) {
            return { key: 'adjustment', label: 'تسوية مخزنية', icon: '⚖️', color: '#7c3aed', badgeClass: 'adjustment', isNegative: false };
        }
        if (s.includes('تحويل') || s.includes('transfer') || s.includes('نقل')) {
            return { key: 'transfer', label: 'تحويل مخزني', icon: '🔄', color: '#d97706', badgeClass: 'transfer', isNegative: false };
        }
        return { key: 'sale', label: 'فاتورة بيع', icon: '🛍️', color: 'var(--emerald)', badgeClass: 'sale', isNegative: false };
    }

    // تغيير فلتر نوع الحركات في الداشبورد
    function setTxTypeFilter(filterType) {
        State.txTypeFilter = filterType || 'all';

        const selectEl = document.getElementById('txTypeFilterSelect');
        if (selectEl && selectEl.value !== State.txTypeFilter) {
            selectEl.value = State.txTypeFilter;
        }

        document.querySelectorAll('.tx-filter-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.txFilter === State.txTypeFilter);
        });

        renderDashboard();
    }

    function getPayMethodLabel(m) {
        if (!m) return '💵 كاش نقدي';
        const s = String(m).toLowerCase().trim();
        if (s.includes('voda') || s.includes('فودافون')) return '📱 فودافون كاش';
        if (s.includes('card') || s.includes('فيزا') || s.includes('شبكة')) return '💳 بطاقة بنكية';
        if (s.includes('انستا') || s.includes('insta')) return '⚡ انستا باي';
        if (s.includes('أجل')) return '⏳ أجل';
        return '💵 كاش نقدي';
    }

    // ============================================================
    // 🔍 PRODUCT LOOKUP & STOCK ("يجيب صنف")
    // ============================================================
    function updateCategoriesList() {
        const container = document.getElementById('categoriesScroll');
        if (!container) return;

        const cats = new Set(['all']);
        State.products.forEach(p => {
            if (p.category) cats.add(p.category.trim());
        });

        const lowCount = (State.products || []).filter(p => {
            const s = parseFloat(p.quantity !== undefined ? p.quantity : (p.stock || 0));
            return s <= 2;
        }).length;

        let chipsHtml = Array.from(cats).map(cat => {
            const label = cat === 'all' ? '✨ الكل' : cat;
            const isActive = State.selectedCategory === cat ? 'active' : '';
            return `<div class="cat-chip ${isActive}" onclick="window.BayanMobile.setCategory('${cat}')">${label}</div>`;
        }).join('');

        if (lowCount > 0) {
            const isLowActive = State.selectedCategory === 'low-stock' ? 'active' : '';
            chipsHtml += `<div class="cat-chip ${isLowActive}" style="border-color: rgba(245, 158, 11, 0.4); color: #d97706; font-weight: 800;" onclick="window.BayanMobile.setCategory('low-stock')">⚠️ النواقص (${lowCount})</div>`;
        }

        container.innerHTML = chipsHtml;
    }

    function filterByLowStock() {
        switchTab('products');
        State.selectedCategory = 'low-stock';
        updateCategoriesList();
        renderProducts();
    }

    function renderProducts() {
        const listEl = document.getElementById('productsList');
        if (!listEl) return;

        const q = State.searchQuery.trim().toLowerCase();
        const cat = State.selectedCategory;

        let filtered = State.products.filter(p => {
            // Category filter
            if (cat === 'low-stock') {
                const s = parseFloat(p.quantity !== undefined ? p.quantity : (p.stock || 0));
                if (s > 2) return false;
            } else if (cat !== 'all' && (p.category || '').trim() !== cat) {
                return false;
            }
            // Search query filter
            if (!q) return true;
            const name = (p.name || '').toLowerCase();
            const code = (p.code || '').toLowerCase();
            const barcode = (p.barcode || '').toLowerCase();
            return name.includes(q) || code.includes(q) || barcode.includes(q);
        });

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-dim);">
                    <div style="font-size: 3rem; margin-bottom: 8px;">🔍</div>
                    <p style="font-size: 0.95rem; font-weight: 800;">لم يتم العثور على أي صنف مطابق للبحث</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = filtered.slice(0, 30).map(p => {
            const price = parseFloat(p.price || p.salePrice || 0).toLocaleString('ar-EG');
            const totalStock = parseFloat(p.quantity !== undefined ? p.quantity : (p.stock || 0));
            const stockStatus = totalStock <= 0 ? 'out-of-stock' : (totalStock <= 3 ? 'low-stock' : 'in-stock');
            const stockText = totalStock <= 0 ? 'نفد من المخزن ❌' : (totalStock <= 3 ? `متبقي ${totalStock} فقط ⚠️` : `متوفر (${totalStock} قطعة) ✅`);

            // Variants Matrix (Sizes & Colors)
            const variantsHtml = renderProductVariantsMatrix(p);

            const hasThumb = Boolean(p.image);
            const headHtml = hasThumb ? `
                <div class="product-head-with-thumb">
                    <img src="${p.image}" class="product-card-img-thumb" alt="${p.name || ''}" loading="lazy" onerror="this.style.display='none'">
                    <div style="flex: 1; min-width: 0;">
                        <div class="product-title">${p.name || 'صنف بدون اسم'}</div>
                        <div class="product-barcode-row" style="margin: 2px 0 0 0;">
                            <span>🏷️ ${p.code || p.barcode || 'بدون كود'}</span>
                            ${p.category ? `<span>• 📁 ${p.category}</span>` : ''}
                        </div>
                    </div>
                    <div class="product-price-badge">${price} ج.م</div>
                </div>
            ` : `
                <div class="product-head">
                    <div class="product-title">${p.name || 'صنف بدون اسم'}</div>
                    <div class="product-price-badge">${price} ج.م</div>
                </div>
                <div class="product-barcode-row">
                    <span>🏷️ ${p.code || p.barcode || 'بدون كود'}</span>
                    ${p.category ? `<span>• 📁 ${p.category}</span>` : ''}
                </div>
            `;

            return `
                <div class="product-card" id="prod-${p.id}" onclick="window.BayanMobile.openAddToCartModal('${p.id}')" style="cursor: pointer;">
                    ${headHtml}

                    ${variantsHtml}

                    <div class="product-foot">
                        <div class="stock-status ${stockStatus}">
                            <span>${stockText}</span>
                        </div>
                        <button class="btn-add-cart-quick" onclick="event.stopPropagation(); window.BayanMobile.openAddToCartModal('${p.id}')">
                            <span>🛒</span> بيع سريع
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function getVariantStock(product, size = '', color = '') {
        if (!product) return 0;
        if (Array.isArray(product.variants) && product.variants.length > 0) {
            const v = product.variants.find(item =>
                (!size || String(item.size || '').trim().toLowerCase() === String(size || '').trim().toLowerCase()) &&
                (!color || String(item.color || '').trim().toLowerCase() === String(color || '').trim().toLowerCase())
            );
            if (v) {
                return parseFloat(v.stock !== undefined ? v.stock : (v.quantity !== undefined ? v.quantity : (v.qty || 0)));
            }
        }
        return parseFloat(product.stock !== undefined ? product.stock : (product.quantity || 0));
    }

    function renderProductVariantsMatrix(product) {
        // Look for variants in products
        let variants = product.variants || [];
        if (!Array.isArray(variants) || variants.length === 0) {
            if (product.sizes || product.colors) {
                // simple fallback
                const s = Array.isArray(product.sizes) ? product.sizes.join(', ') : (product.sizes || '');
                const c = Array.isArray(product.colors) ? product.colors.join(', ') : (product.colors || '');
                if (!s && !c) return '';
                return `
                    <div class="variants-matrix">
                        <div class="variant-row">
                            <span class="variant-color">🎨 ${c || 'عام'}</span>
                            <div class="variant-sizes-chips">
                                <span class="size-pill">${s || 'حر'}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
            return '';
        }

        // Group variants by color
        const colorMap = {};
        variants.forEach(v => {
            const color = v.color || 'عام';
            if (!colorMap[color]) colorMap[color] = [];
            colorMap[color].push(v);
        });

        const rows = Object.keys(colorMap).map(color => {
            const list = colorMap[color];
            const sizeChips = list.map(v => {
                const qty = parseInt(v.stock !== undefined ? v.stock : (v.quantity !== undefined ? v.quantity : (v.qty || 0)), 10);
                const isOut = qty <= 0;
                const pillClass = isOut ? 'out' : (qty <= 2 ? 'low' : '');
                const safeSize = String(v.size || 'M').replace(/'/g, "\\'");
                const safeColor = String(color || 'عام').replace(/'/g, "\\'");
                const label = isOut ? `${v.size || 'M'} (نفد ❌)` : `${v.size || 'M'} (${qty})`;
                const clickHandler = isOut
                    ? `window.BayanMobile.onOutStockClicked('${safeSize}', '${safeColor}')`
                    : `window.BayanMobile.quickAddVariant('${product.id}', '${safeSize}', '${safeColor}')`;
                const titleText = isOut
                    ? `مقاس ${safeSize} لون ${safeColor} نفد من المخزن تماماً (رصيد 0)`
                    : `اضغط لبيع مقاس ${safeSize} لون ${safeColor} (متبقي ${qty})`;

                return `<span class="size-pill ${pillClass}" onclick="event.stopPropagation(); ${clickHandler}" title="${titleText}">${label}</span>`;
            }).join('');

            return `
                <div class="variant-row">
                    <span class="variant-color">🎨 ${color}</span>
                    <div class="variant-sizes-chips">${sizeChips}</div>
                </div>
            `;
        }).join('');

        return `<div class="variants-matrix">${rows}</div>`;
    }

    // ============================================================
    // 🛒 QUICK MOBILE POS ("ممكن يبيع ولا حاجة")
    // ============================================================
    function addToCart(product, size = '', color = '', qty = 1, customPrice) {
        if (!product) return;
        const availableStock = getVariantStock(product, size, color);

        if (availableStock <= 0) {
            showToast(`عفواً! مقاس (${size || 'عادي'}) لون (${color || 'عام'}) نفد من المخزن تماماً (رصيد 0) ❌`, 'error');
            return;
        }

        let itemPrice = (customPrice !== undefined && !isNaN(customPrice) && customPrice > 0)
            ? customPrice
            : parseFloat(product.price || product.salePrice || 0);

        if ((customPrice === undefined || customPrice <= 0) && Array.isArray(product.variants) && product.variants.length > 0) {
            const v = product.variants.find(item =>
                (!size || String(item.size || '').trim().toLowerCase() === String(size || '').trim().toLowerCase()) &&
                (!color || String(item.color || '').trim().toLowerCase() === String(color || '').trim().toLowerCase())
            );
            if (v) {
                const vPrice = parseFloat(v.price !== undefined ? v.price : (v.salePrice || 0));
                if (!isNaN(vPrice) && vPrice > 0) {
                    itemPrice = vPrice;
                }
            }
        }

        const cartKey = `${product.id}_${size}_${color}`;
        const existing = State.cart.find(item => item.key === cartKey);
        const currentQty = existing ? existing.qty : 0;

        if (currentQty + qty > availableStock) {
            showToast(`لا يمكن إضافة المزيد! الرصيد المتاح بالمخزن لهذا المقاس (${availableStock} قطعة فقط) ⚠️`, 'warning');
            return;
        }

        if (existing) {
            existing.qty += qty;
        } else {
            State.cart.push({
                key: cartKey,
                productId: product.id,
                name: product.name,
                code: product.code || product.barcode || '',
                price: itemPrice,
                size: size || 'عادي',
                color: color || 'عادي',
                qty: qty,
                maxStock: availableStock
            });
        }

        updateCartCount();
        showToast(`تم إضافة ${product.name} (${size}) إلى السلة 🛒`, 'success');
        if (State.activeTab === 'pos') {
            renderCartView();
        }
    }

    function updateCartCount() {
        const badge = document.getElementById('navCartBadge');
        const count = State.cart.reduce((sum, item) => sum + item.qty, 0);
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    function modifyCartQty(key, delta) {
        const item = State.cart.find(i => i.key === key);
        if (!item) return;

        if (delta > 0) {
            const prod = State.products.find(p => String(p.id) === String(item.productId));
            const availableStock = getVariantStock(prod, item.size, item.color);
            if (item.qty + delta > availableStock) {
                showToast(`أقصى كمية متوفرة من هذا المقاس بالمخزن هي (${availableStock} قطعة) ⚠️`, 'warning');
                return;
            }
        }

        item.qty += delta;
        if (item.qty <= 0) {
            State.cart = State.cart.filter(i => i.key !== key);
        }
        updateCartCount();
        renderCartView();
    }

    function renderCartView() {
        const itemsContainer = document.getElementById('cartItemsContainer');
        const subtotalEl = document.getElementById('cartSubtotalAmount');
        const totalEl = document.getElementById('cartFinalTotalAmount');
        const finalTotalLabel = document.getElementById('cartFinalTotalLabel');
        const prevRow = document.getElementById('cartPrevBalanceRow');
        const prevLabel = document.getElementById('cartPrevBalanceLabel');
        const prevAmt = document.getElementById('cartPrevBalanceAmount');
        const netRow = document.getElementById('cartNetAccountRow');
        const netLabel = document.getElementById('cartNetAccountLabel');
        const netAmt = document.getElementById('cartNetAccountAmount');
        const btnCheckout = document.getElementById('btnSubmitInvoice');

        if (!itemsContainer) return;

        if (State.cart.length === 0) {
            itemsContainer.innerHTML = `
                <div class="cart-empty-placeholder">
                    <div class="empty-icon">🛍️</div>
                    <p>سلة المبيعات فارغة</p>
                    <span style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 14px; display: block;">اختر أصنافاً من قسم البحث لإصدار فاتورة سريعة</span>
                    <button type="button" class="btn-complete-invoice" style="max-width: 240px; margin: 0 auto; height: 44px; font-size: 0.9rem;" onclick="window.BayanMobile.switchTab('products')">
                        <span>🔍</span> تصفح واختيار الأصناف
                    </button>
                </div>
            `;
            if (subtotalEl) subtotalEl.textContent = '0.00 ج.م';
            if (totalEl) totalEl.textContent = '0.00 ج.م';
            if (prevRow) prevRow.style.display = 'none';
            if (netRow) netRow.style.display = 'none';
            if (btnCheckout) btnCheckout.disabled = true;
            return;
        }

        let total = 0;
        itemsContainer.innerHTML = State.cart.map(item => {
            const lineTotal = item.price * item.qty;
            total += lineTotal;
            return `
                <div class="cart-item-card">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-meta">المقاس: ${item.size} • اللون: ${item.color}</div>
                    </div>
                    <div class="cart-item-qty-stepper">
                        <button class="btn-stepper" onclick="window.BayanMobile.modifyCartQty('${item.key}', -1)">-</button>
                        <span class="cart-item-qty">${item.qty}</span>
                        <button class="btn-stepper" onclick="window.BayanMobile.modifyCartQty('${item.key}', 1)">+</button>
                    </div>
                    <div class="cart-item-total">${lineTotal.toLocaleString('ar-EG')} ج.م</div>
                </div>
            `;
        }).join('');

        if (subtotalEl) subtotalEl.textContent = total.toLocaleString('ar-EG') + ' ج.م';

        // 💳 حساب دقيق للمقاصة مع رصيد العميل السابق
        const currentCustName = (document.getElementById('posCustomerInput')?.value || State.selectedCustomer || 'عميل نقدي').trim();
        const isCash = (!currentCustName || currentCustName === 'عميل نقدي');
        let customerObj = null;
        if (!isCash && Array.isArray(State.customers)) {
            const cleanTarget = cleanArabic(currentCustName);
            customerObj = State.customers.find(c => c && cleanArabic(c.name) === cleanTarget);
        }

        const isCreditPay = (State.selectedPayMethod === 'credit');

        if (customerObj) {
            const prevBal = parseFloat(customerObj.balance) || 0;
            if (prevBal < 0) {
                // العميل له رصيد سابق (دائن للمحل، مثل 70 ج.م)
                const creditAmt = Math.abs(prevBal);
                if (prevRow) {
                    prevRow.className = 'summary-row prev-balance-row credit';
                    if (prevLabel) prevLabel.textContent = 'خصم رصيد سابق (دائن له):';
                    if (prevAmt) prevAmt.textContent = `-${creditAmt.toLocaleString('ar-EG')} ج.م 🟢`;
                    prevRow.style.display = 'flex';
                }

                if (isCreditPay) {
                    const remainingOnCustomer = total - creditAmt;
                    if (finalTotalLabel) finalTotalLabel.textContent = 'قيمة الفاتورة (آجل):';
                    if (totalEl) totalEl.textContent = total.toLocaleString('ar-EG') + ' ج.م';

                    if (netRow) {
                        netRow.style.display = 'flex';
                        if (remainingOnCustomer >= 0) {
                            netRow.className = 'summary-row net-account-row debt';
                            if (netLabel) netLabel.textContent = 'الصافي المتبقي على العميل بعد الفاتورة:';
                            if (netAmt) netAmt.textContent = `${remainingOnCustomer.toLocaleString('ar-EG')} ج.م (عليه 🔴)`;
                        } else {
                            netRow.className = 'summary-row net-account-row credit';
                            if (netLabel) netLabel.textContent = 'الرصيد المتبقي لصالح العميل بعد الفاتورة:';
                            if (netAmt) netAmt.textContent = `${Math.abs(remainingOnCustomer).toLocaleString('ar-EG')} ج.م (له 🟢)`;
                        }
                    }
                } else {
                    const netRequiredToPay = Math.max(0, total - creditAmt);
                    if (finalTotalLabel) finalTotalLabel.textContent = 'الصافي المطلوب سداده نقداً:';
                    if (totalEl) totalEl.textContent = netRequiredToPay.toLocaleString('ar-EG') + ' ج.م';

                    if (netRow) {
                        if (total < creditAmt) {
                            netRow.style.display = 'flex';
                            netRow.className = 'summary-row net-account-row credit';
                            if (netLabel) netLabel.textContent = 'المتبقي كرصيد دائن للعميل بعد الشراء:';
                            if (netAmt) netAmt.textContent = `${(creditAmt - total).toLocaleString('ar-EG')} ج.م (له 🟢)`;
                        } else {
                            netRow.style.display = 'none';
                        }
                    }
                }
            } else if (prevBal > 0) {
                // العميل عليه مديونية سابقة (مدين، مثل 100 ج.م)
                if (prevRow) {
                    prevRow.className = 'summary-row prev-balance-row debt';
                    if (prevLabel) prevLabel.textContent = 'مديونية سابقة مستحقة (عليه):';
                    if (prevAmt) prevAmt.textContent = `+${prevBal.toLocaleString('ar-EG')} ج.م 🔴`;
                    prevRow.style.display = 'flex';
                }

                if (isCreditPay) {
                    const totalDebtAfter = total + prevBal;
                    if (finalTotalLabel) finalTotalLabel.textContent = 'قيمة الفاتورة الحالية (آجل):';
                    if (totalEl) totalEl.textContent = total.toLocaleString('ar-EG') + ' ج.م';

                    if (netRow) {
                        netRow.style.display = 'flex';
                        netRow.className = 'summary-row net-account-row debt';
                        if (netLabel) netLabel.textContent = 'إجمالي مديونية العميل بعد هذه الفاتورة:';
                        if (netAmt) netAmt.textContent = `${totalDebtAfter.toLocaleString('ar-EG')} ج.م (عليه 🔴)`;
                    }
                } else {
                    if (finalTotalLabel) finalTotalLabel.textContent = 'المطلوب للفاتورة الحالية:';
                    if (totalEl) totalEl.textContent = total.toLocaleString('ar-EG') + ' ج.م';

                    if (netRow) {
                        netRow.style.display = 'flex';
                        netRow.className = 'summary-row net-account-row debt';
                        if (netLabel) netLabel.textContent = 'المديونية السابقة المستمرة بذمته:';
                        if (netAmt) netAmt.textContent = `${prevBal.toLocaleString('ar-EG')} ج.م (عليه 🔴)`;
                    }
                }
            } else {
                if (prevRow) prevRow.style.display = 'none';
                if (netRow) netRow.style.display = 'none';
                if (finalTotalLabel) finalTotalLabel.textContent = 'الإجمالي المطلوب:';
                if (totalEl) totalEl.textContent = total.toLocaleString('ar-EG') + ' ج.م';
            }
        } else {
            if (prevRow) prevRow.style.display = 'none';
            if (netRow) netRow.style.display = 'none';
            if (finalTotalLabel) finalTotalLabel.textContent = 'الإجمالي المطلوب:';
            if (totalEl) totalEl.textContent = total.toLocaleString('ar-EG') + ' ج.م';
        }

        if (btnCheckout) btnCheckout.disabled = false;
    }

    /**
     * ============================================================
     * 🔢 GENERATE SHORT SEQUENTIAL INVOICE ID (ترقيم تسلسلي يومي ذكي)
     * الصيغة: MOB-YYMMDD-XXX (مثال: MOB-261019-001)
     * يتم حفظ ومتابعة العداد في localStorage بمفتاح 'bayan_mob_last_invoice_seq'
     * ============================================================
     */
    function generateInvoiceId() {
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const dateKey = `${yy}${mm}${dd}`; // e.g. "261019"
        const term = State.terminalLetter || 'B';

        const lastDate = localStorage.getItem('bayan_mob_last_invoice_date') || '';
        let lastSeq = parseInt(localStorage.getItem('bayan_mob_last_invoice_seq') || '0', 10);

        if (isNaN(lastSeq) || lastSeq < 0) {
            lastSeq = 0;
        }

        // إذا بدأ يوم جديد، يتم تصفير العداد لليوم الجديد
        if (lastDate !== dateKey) {
            lastSeq = 0;
            localStorage.setItem('bayan_mob_last_invoice_date', dateKey);
        }

        // فحص وقائي في الفواتير المسجلة محلياً لمنع أي تكرار لنفس اليوم
        const prefix = `MOB-${term}-${dateKey}-`;
        const legacyPrefix = `MOB-${dateKey}-`;
        if (Array.isArray(State.transactions) && State.transactions.length > 0) {
            State.transactions.forEach(t => {
                const id = String(t.invoiceId || t.id || '');
                if (id.startsWith(prefix)) {
                    const rawPart = id.replace(prefix, '');
                    const numPart = parseInt(rawPart, 10);
                    if (!isNaN(numPart) && numPart > lastSeq) {
                        lastSeq = numPart;
                    }
                } else if (id.startsWith(legacyPrefix)) {
                    const rawPart = id.replace(legacyPrefix, '');
                    const numPart = parseInt(rawPart, 10);
                    if (!isNaN(numPart) && numPart > lastSeq) {
                        lastSeq = numPart;
                    }
                }
            });
        }

        const nextSeq = lastSeq + 1;
        localStorage.setItem('bayan_mob_last_invoice_seq', String(nextSeq));

        const seqStr = String(nextSeq).padStart(3, '0');
        return `MOB-${term}-${dateKey}-${seqStr}`;
    }

    // Submit Mobile Invoice
    async function submitMobileInvoice() {
        if (State.cart.length === 0) return;

        const btn = document.getElementById('btnSubmitInvoice');
        if (btn) btn.disabled = true;

        try {
            const timestamp = Date.now();
            const invoiceId = generateInvoiceId();
            const total = State.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            const custName = (document.getElementById('posCustomerInput')?.value || State.selectedCustomer || 'عميل نقدي').trim() || 'عميل نقدي';

            // إذا كانت طريقة الدفع آجلة (على الحساب)، يجب كتابة أو اختيار اسم العميل
            const isCredit = (State.selectedPayMethod === 'credit');
            if (isCredit && (!custName || custName === 'عميل نقدي')) {
                showToast('⚠️ البيع الآجل يتطلب تحديد اسم العميل أو كتابته أولاً لتسجيل المديونية', 'warning');
                const custInput = document.getElementById('posCustomerInput');
                if (custInput) {
                    custInput.focus();
                    custInput.select();
                }
                if (btn) btn.disabled = false;
                return;
            }

            let payMethodArabic = 'كاش';
            let paidAmount = total;
            let remaining = 0;
            if (isCredit) {
                payMethodArabic = 'أجل';
                paidAmount = 0;
                remaining = total;
            } else if (State.selectedPayMethod === 'vodafone') {
                payMethodArabic = 'فودافون كاش';
            } else if (State.selectedPayMethod === 'card') {
                payMethodArabic = 'فيزا';
            }

            const activeWh = State.activeWarehouse || 'المخزن الرئيسي';
            const currentShopId = State.shopId || CONFIG.SHOP_ID || '';

            const newTx = {
                id: invoiceId,
                numericId: timestamp,
                invoiceId: invoiceId,
                type: 'sale',
                partner: custName,
                date: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                paymentMethod: payMethodArabic,
                items: State.cart.map(i => ({
                    productId: i.productId,
                    name: i.name,
                    quantity: i.qty,
                    price: i.price,
                    size: i.size,
                    color: i.color,
                    total: i.price * i.qty
                })),
                total: total,
                finalTotal: total,
                discount: 0,
                paid: paidAmount,
                remaining: remaining,
                terminalLetter: State.terminalLetter,
                devicePrefix: `MOB-${State.terminalLetter}`,
                shop_id: currentShopId,
                warehouse: activeWh,
                isDelta: true
            };

            // 1. خصم الكميات من المخزون العام ومخزن الفرع النشط محلياً
            const updatedProductsList = [];
            State.cart.forEach(item => {
                const prod = State.products.find(p => String(p.id) === String(item.productId));
                if (prod) {
                    prod.quantity = Math.max(0, (parseFloat(prod.quantity !== undefined ? prod.quantity : (prod.stock || 0))) - item.qty);
                    prod.stock = prod.quantity;

                    // خصم من رصيد المخزن المحدد للصنف
                    if (prod.warehouseStocks && typeof prod.warehouseStocks === 'object') {
                        if (prod.warehouseStocks[activeWh] !== undefined) {
                            prod.warehouseStocks[activeWh] = Math.max(0, (parseFloat(prod.warehouseStocks[activeWh] || 0)) - item.qty);
                        }
                    }

                    // خصم من متغيرات المقاس واللون والمخزن المحدد للمتغير
                    if (Array.isArray(prod.variants)) {
                        const v = prod.variants.find(varItem =>
                            (!item.size || String(varItem.size || '').trim().toLowerCase() === String(item.size || '').trim().toLowerCase()) &&
                            (!item.color || String(varItem.color || '').trim().toLowerCase() === String(item.color || '').trim().toLowerCase())
                        );
                        if (v) {
                            const curVarStock = parseFloat(v.stock !== undefined ? v.stock : (v.quantity || 0));
                            v.stock = Math.max(0, curVarStock - item.qty);
                            v.quantity = v.stock;

                            if (v.warehouseStocks && typeof v.warehouseStocks === 'object') {
                                if (v.warehouseStocks[activeWh] !== undefined) {
                                    v.warehouseStocks[activeWh] = Math.max(0, (parseFloat(v.warehouseStocks[activeWh] || 0)) - item.qty);
                                }
                            }
                        }
                    }
                    if (!updatedProductsList.some(up => up.id === prod.id)) {
                        updatedProductsList.push(prod);
                    }
                }
            });

            // 2. تحديث فوري لرصيد ومديونية العميل الآجل في الذاكرة والكاش
            let custPayload = null;
            if (isCredit && remaining > 0 && custName !== 'عميل نقدي') {
                const cleanTarget = cleanArabic(custName);
                let foundCustomer = State.customers.find(c => c && cleanArabic(c.name) === cleanTarget);
                let foundAccount = State.accounts.find(a => a && cleanArabic(a.name) === cleanTarget);

                if (foundCustomer) {
                    foundCustomer.balance = (parseFloat(foundCustomer.balance) || 0) + remaining;
                }
                if (foundAccount) {
                    foundAccount.balance = (parseFloat(foundAccount.balance) || 0) + remaining;
                } else if (!foundCustomer) {
                    // عميل جديد يسجل فوراً بالمديونية
                    const newCustObj = {
                        id: String(Date.now()),
                        name: custName,
                        code: String(Math.floor(1000 + Math.random() * 9000)),
                        type: 'client',
                        typeLabel: 'عميل',
                        mobile: '',
                        balance: remaining,
                        created_at: new Date().toISOString()
                    };
                    State.customers.push(newCustObj);
                    State.accounts.push(newCustObj);
                }

                try {
                    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'customers', JSON.stringify(State.customers));
                    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'accounts', JSON.stringify(State.accounts));
                } catch (e) { }

                custPayload = [
                    {
                        id: `CONFIG_CUSTOMERS_LIST_${currentShopId}`,
                        date: new Date().toISOString(),
                        category: 'customers',
                        amount: State.accounts.length,
                        user_name: `تابلت (${State.terminalLetter})`,
                        warehouse: activeWh,
                        raw_json: {
                            shop_id: currentShopId,
                            customers: State.accounts,
                            accounts: State.accounts,
                            updatedAt: new Date().toISOString()
                        }
                    }
                ];
            }

            // 3. اعتماد الفاتورة محلياً فوراً (Local-First Success) وتفريغ السلة
            State.transactions.unshift(newTx);
            State.cart = [];
            try { localStorage.setItem(CONFIG.STORAGE_PREFIX + 'products', JSON.stringify(State.products)); } catch (e) { }
            try { localStorage.setItem(CONFIG.STORAGE_PREFIX + 'transactions', JSON.stringify(State.transactions)); } catch (e) { }

            updateCartCount();
            renderCartView();
            renderProducts();
            renderDashboard();

            // إظهار الفاتورة والنجاح فوراً للكاشير دون أي انتظار للشبكة
            openInvoiceSuccessModal(newTx);

            // 4. تجهيز حزم المزامنة السحابية وطابور الأوفلاين
            const txPayload = [{
                id: `${currentShopId}_${invoiceId}`,
                invoice_id: invoiceId,
                date_iso: new Date().toISOString(),
                time: new Date().toLocaleTimeString('ar-EG'),
                type: 'مبيعات',
                partner: custName,
                total: total,
                paid_amount: paidAmount,
                remaining: remaining,
                method: payMethodArabic,
                cashier: `تابلت (${State.terminalLetter})`,
                warehouse: activeWh,
                raw_json: { ...newTx, shop_id: currentShopId }
            }];

            let prodBatch = [];
            if (updatedProductsList.length > 0) {
                prodBatch = updatedProductsList.map(p => ({
                    id: `${currentShopId}_PROD_${p.id}`,
                    name: p.name || 'صنف',
                    barcode: p.barcode || '',
                    category: p.category || 'عام',
                    unit: p.unit || 'قطعة',
                    price: parseFloat(p.price || 0),
                    cost: parseFloat(p.cost || 0),
                    wholesale: parseFloat(p.wholesale || 0),
                    stock: parseFloat(p.stock !== undefined ? p.stock : (p.quantity || 0)),
                    raw_json: {
                        ...(p.raw_json || {}),
                        ...p,
                        localId: p.id,
                        shop_id: currentShopId,
                        stock: parseFloat(p.stock !== undefined ? p.stock : (p.quantity || 0)),
                        variants: p.variants || [],
                        warehouseStocks: p.warehouseStocks || {}
                    },
                    updated_at: new Date().toISOString()
                }));
            }

            const queueItem = {
                id: invoiceId,
                txPayload,
                prodBatch,
                custPayload,
                createdAt: new Date().toISOString()
            };

            // فحص الاتصال بالإنترنت ومزامنة السحابة بالخلفية
            if (!navigator.onLine) {
                enqueueOfflineItem(queueItem);
                showToast(`💾 تم حفظ الفاتورة #${invoiceId} محلياً (أوفلاين) ⚡ ستُرحل للسحابة فور توفر النت`, 'info');
            } else {
                // إرسال سحابي في الخلفية دون تعطيل الكاشير
                (async () => {
                    try {
                        await fetch(`${SUPABASE_CONFIG.url}/rest/v1/transactions?on_conflict=id`, {
                            method: 'POST',
                            headers: getSupabaseHeaders(),
                            body: JSON.stringify(txPayload)
                        });

                        if (prodBatch.length > 0) {
                            await fetch(`${SUPABASE_CONFIG.url}/rest/v1/products?on_conflict=id`, {
                                method: 'POST',
                                headers: getSupabaseHeaders(),
                                body: JSON.stringify(prodBatch)
                            }).catch(() => { });
                        }

                        if (custPayload && custPayload.length > 0) {
                            await fetch(`${SUPABASE_CONFIG.url}/rest/v1/treasury_audit?on_conflict=id`, {
                                method: 'POST',
                                headers: getSupabaseHeaders(),
                                body: JSON.stringify(custPayload)
                            }).catch(() => { });
                        }

                        showToast(`✅ تم حفظ الفاتورة #${invoiceId} ومزامنتها سحابياً!`, 'success');
                        processOfflineQueue();
                    } catch (netErr) {
                        console.warn('[OfflineQueue] Background upload failed, enqueuing:', netErr);
                        enqueueOfflineItem(queueItem);
                        showToast(`💾 الفاتورة #${invoiceId} محفوظة محلياً وفي طابور المزامنة التلقائية ⚡`, 'info');
                    }
                })();
            }

        } catch (e) {
            console.error('Submit invoice error:', e);
            showToast('حدث خطأ أثناء معالجة الفاتورة محلياً', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ============================================================
    // 📶 OFFLINE QUEUE MANAGEMENT (إدارة طابور الأوفلاين السحابي)
    // ============================================================
    function enqueueOfflineItem(item) {
        try {
            let queue = JSON.parse(localStorage.getItem('bayan_mob_offline_queue') || '[]');
            if (!Array.isArray(queue)) queue = [];
            if (!queue.some(q => q.id === item.id)) {
                queue.push(item);
                localStorage.setItem('bayan_mob_offline_queue', JSON.stringify(queue));
            }
        } catch (e) {
            console.warn('[OfflineQueue] Enqueue error:', e);
        }
    }

    let isProcessingOfflineQueue = false;
    async function processOfflineQueue() {
        if (isProcessingOfflineQueue || !navigator.onLine) return;
        let queue = [];
        try {
            queue = JSON.parse(localStorage.getItem('bayan_mob_offline_queue') || '[]');
        } catch (e) {
            queue = [];
        }
        if (!Array.isArray(queue) || queue.length === 0) return;

        isProcessingOfflineQueue = true;
        const remainingQueue = [];
        let successCount = 0;

        for (const item of queue) {
            try {
                if (item.txPayload && Array.isArray(item.txPayload) && item.txPayload.length > 0) {
                    await fetch(`${SUPABASE_CONFIG.url}/rest/v1/transactions?on_conflict=id`, {
                        method: 'POST',
                        headers: getSupabaseHeaders(),
                        body: JSON.stringify(item.txPayload)
                    });
                }
                if (item.prodBatch && Array.isArray(item.prodBatch) && item.prodBatch.length > 0) {
                    await fetch(`${SUPABASE_CONFIG.url}/rest/v1/products?on_conflict=id`, {
                        method: 'POST',
                        headers: getSupabaseHeaders(),
                        body: JSON.stringify(item.prodBatch)
                    });
                }
                if (item.custPayload && Array.isArray(item.custPayload) && item.custPayload.length > 0) {
                    await fetch(`${SUPABASE_CONFIG.url}/rest/v1/treasury_audit?on_conflict=id`, {
                        method: 'POST',
                        headers: getSupabaseHeaders(),
                        body: JSON.stringify(item.custPayload)
                    }).catch(() => { });
                }
                successCount++;
            } catch (err) {
                console.warn('[OfflineQueue] Retry failed for invoice:', item.id, err);
                remainingQueue.push(item);
            }
        }

        try {
            localStorage.setItem('bayan_mob_offline_queue', JSON.stringify(remainingQueue));
        } catch (e) { }

        isProcessingOfflineQueue = false;

        if (successCount > 0) {
            showToast(`☁️ تم ترحيل (${successCount}) فاتورة سابقة من طابور الأوفلاين للسحابة بنجاح!`, 'success');
        }
    }

    // استماع عودة الإنترنت لترحيل الطابور تلقائياً
    window.addEventListener('online', () => {
        showToast('🟢 تم استعادة الاتصال بالإنترنت! جاري ترحيل العمليات المعلقة...', 'info');
        processOfflineQueue();
        pullMasterData(false);
    });

    // ============================================================
    // 🪟 MODALS MANAGEMENT
    // ============================================================

    function openAddToCartModal(productId) {
        const product = State.products.find(p => p.id === productId);
        if (!product) return;

        const modal = document.getElementById('addToCartModalOverlay');
        const title = document.getElementById('addModalTitle');
        const price = document.getElementById('addModalPrice');
        const sizesBox = document.getElementById('addModalSizesBox');
        const colorsBox = document.getElementById('addModalColorsBox');

        if (title) title.textContent = product.name;
        if (price) price.textContent = (product.price || 0) + ' ج.م';

        // Calculate available stock per size
        let sizeStockMap = {};
        let colorList = [];

        if (Array.isArray(product.variants) && product.variants.length > 0) {
            product.variants.forEach(v => {
                const s = v.size || 'عادي';
                const c = v.color || 'عام';
                const sQty = parseFloat(v.stock !== undefined ? v.stock : (v.quantity !== undefined ? v.quantity : (v.qty || 0)));
                sizeStockMap[s] = (sizeStockMap[s] || 0) + sQty;
                if (!colorList.includes(c)) colorList.push(c);
            });
        } else {
            const tot = parseFloat(product.stock !== undefined ? product.stock : (product.quantity || 0));
            sizeStockMap['عادي'] = tot;
        }

        if (colorList.length === 0) colorList = ['عام'];
        const sizes = Object.keys(sizeStockMap);

        // Pick first available size that has stock > 0
        const firstAvailableSize = sizes.find(s => sizeStockMap[s] > 0) || sizes[0] || 'عادي';
        const firstAvailableColor = colorList[0] || 'عام';

        window._pendingAddProduct = product;
        window._pendingAddSize = firstAvailableSize;
        window._pendingAddColor = firstAvailableColor;

        if (sizesBox) {
            sizesBox.innerHTML = sizes.map(s => {
                const sStock = sizeStockMap[s] || 0;
                const isOut = sStock <= 0;
                const isActive = (s === firstAvailableSize && !isOut);
                const cls = `cat-chip ${isActive ? 'active' : ''} ${isOut ? 'disabled' : ''}`;
                const label = isOut ? `${s} (نفد ❌)` : `${s} (متوفر: ${sStock})`;
                const clickAction = isOut
                    ? `window.BayanMobile.onOutStockClicked('${s}', '')`
                    : `window.BayanMobile.selectVariantSize(this, '${s}')`;
                return `<div class="${cls}" onclick="${clickAction}">${label}</div>`;
            }).join('');
        }

        if (colorsBox) {
            colorsBox.innerHTML = colorList.map((c, idx) => `
                <div class="cat-chip ${idx === 0 ? 'active' : ''}" onclick="window.BayanMobile.selectVariantColor(this, '${c}')">${c}</div>
            `).join('');
        }

        // Enable or disable checkout buttons based on stock
        const totalAvail = parseFloat(product.stock !== undefined ? product.stock : (product.quantity || 0));
        const btnInstant = modal ? modal.querySelector('button[onclick*="confirmInstantSale"]') : null;
        const btnAdd = modal ? modal.querySelector('button[onclick*="confirmAddToCart"]') : null;
        const hasStock = totalAvail > 0 && (sizeStockMap[firstAvailableSize] > 0);
        if (btnInstant) btnInstant.disabled = !hasStock;
        if (btnAdd) btnAdd.disabled = !hasStock;

        if (modal) modal.classList.add('active');
    }

    function closeAddToCartModal() {
        const modal = document.getElementById('addToCartModalOverlay');
        if (modal) modal.classList.remove('active');
    }

    function confirmAddToCart() {
        if (!window._pendingAddProduct) return;
        const prod = window._pendingAddProduct;
        const size = window._pendingAddSize || 'عادي';
        const color = window._pendingAddColor || 'عام';

        const avail = getVariantStock(prod, size, color);
        if (avail <= 0) {
            showToast(`عفواً، مقاس (${size}) لون (${color}) نفد من المخزن (رصيد 0) ❌`, 'error');
            return;
        }

        // إذا كان المقاس المختار له سعر مخصص في التشكيلة (variant.price > 0) يتم اعتماده
        let finalPrice = parseFloat(prod.price || prod.salePrice || 0);
        if (Array.isArray(prod.variants) && prod.variants.length > 0) {
            const v = prod.variants.find(item =>
                (!size || String(item.size || '').trim().toLowerCase() === String(size || '').trim().toLowerCase()) &&
                (!color || String(item.color || '').trim().toLowerCase() === String(color || '').trim().toLowerCase())
            );
            if (v) {
                const vPrice = parseFloat(v.price !== undefined ? v.price : (v.salePrice || 0));
                if (!isNaN(vPrice) && vPrice > 0) {
                    finalPrice = vPrice;
                }
            }
        }

        addToCart(prod, size, color, 1, finalPrice);
        closeAddToCartModal();
    }

    async function confirmInstantSale() {
        if (!window._pendingAddProduct) return;
        const prod = window._pendingAddProduct;
        const size = window._pendingAddSize || 'عادي';
        const color = window._pendingAddColor || 'عام';

        const avail = getVariantStock(prod, size, color);
        if (avail <= 0) {
            showToast(`عفواً، مقاس (${size}) لون (${color}) نفد من المخزن (رصيد 0) ❌`, 'error');
            return;
        }

        // إذا كان المقاس المختار له سعر مخصص في التشكيلة (variant.price > 0) يتم اعتماده
        let finalPrice = parseFloat(prod.price || prod.salePrice || 0);
        if (Array.isArray(prod.variants) && prod.variants.length > 0) {
            const v = prod.variants.find(item =>
                (!size || String(item.size || '').trim().toLowerCase() === String(size || '').trim().toLowerCase()) &&
                (!color || String(item.color || '').trim().toLowerCase() === String(color || '').trim().toLowerCase())
            );
            if (v) {
                const vPrice = parseFloat(v.price !== undefined ? v.price : (v.salePrice || 0));
                if (!isNaN(vPrice) && vPrice > 0) {
                    finalPrice = vPrice;
                }
            }
        }

        closeAddToCartModal();

        // One-tap quick checkout: set cart to this single item and submit immediately
        State.cart = [{
            key: `${prod.id}_${size}_${color}`,
            productId: prod.id,
            name: prod.name,
            code: prod.code || prod.barcode || '',
            price: finalPrice,
            size: size,
            color: color,
            qty: 1,
            maxStock: avail
        }];
        State.selectedPayMethod = 'cash';
        await submitMobileInvoice();
    }

    // ============================================================
    // 🎨 THEME MANAGEMENT (LIGHT & DARK MODES)
    // ============================================================
    function getSavedTheme() {
        return localStorage.getItem('bayan_mob_theme') || 'light';
    }

    function setTheme(theme) {
        const targetTheme = (theme === 'dark') ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', targetTheme);
        localStorage.setItem('bayan_mob_theme', targetTheme);

        const btn = document.getElementById('topThemeToggleBtn');
        if (btn) {
            btn.innerHTML = (targetTheme === 'dark') ? '🌙' : '☀️';
            btn.title = (targetTheme === 'dark') ? 'تبديل للوضع الفاتح ☀️' : 'تبديل للوضع الداكن 🌙';
        }

        const cardLight = document.getElementById('themeCardLight');
        const cardDark = document.getElementById('themeCardDark');
        if (cardLight && cardDark) {
            cardLight.classList.toggle('active', targetTheme === 'light');
            cardDark.classList.toggle('active', targetTheme === 'dark');
        }
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = (current === 'dark') ? 'light' : 'dark';
        setTheme(next);
        showToast(next === 'light' ? 'تم تفعيل الوضع الفاتح ✨' : 'تم تفعيل الوضع الداكن 🌙', 'success');
    }

    function openInvoiceDetails(invoiceId) {
        const matchingTxs = State.transactions.filter(t => String(t.invoiceId) === String(invoiceId) || String(t.id) === String(invoiceId));
        if (matchingTxs.length === 0) return;
        const tx = matchingTxs[0];

        const modal = document.getElementById('invoiceDetailsModalOverlay');
        const content = document.getElementById('invoiceDetailsContent');

        if (content) {
            const rawDate = tx.dateISO ? `${tx.dateISO} ${tx.timeISO || ''}` : (tx.date || '---');
            const total = parseFloat(tx.invoiceGrandTotal || tx.total || tx.paidAmount || 0);
            const remaining = parseFloat(tx.remaining || tx.deferred || 0);
            const method = tx.method || tx.paymentMethod || 'كاش (نقدي)';
            const partnerName = (tx.partner || 'عميل نقدي').trim();
            const isCashCustomer = (!partnerName || partnerName === 'عميل نقدي');

            // شارة رصيد العميل إن وجد في القائمة
            let custBalHtml = '';
            if (!isCashCustomer && Array.isArray(State.customers)) {
                const foundC = State.customers.find(c => c && cleanArabic(c.name) === cleanArabic(partnerName));
                if (foundC) {
                    const cBal = parseFloat(foundC.balance) || 0;
                    if (cBal < 0) {
                        custBalHtml = `
                            <div class="receipt-row" style="background: rgba(16, 185, 129, 0.08); padding: 6px 10px; border-radius: 8px; margin-top: 4px;">
                                <span class="label" style="color: var(--emerald);">🟢 رصيد العميل الحالي:</span>
                                <span class="value" style="color: var(--emerald); font-family: monospace;">له ${Math.abs(cBal).toLocaleString('ar-EG')} ج.م (دائن)</span>
                            </div>
                        `;
                    } else if (cBal > 0) {
                        custBalHtml = `
                            <div class="receipt-row" style="background: rgba(244, 63, 94, 0.08); padding: 6px 10px; border-radius: 8px; margin-top: 4px;">
                                <span class="label" style="color: var(--rose);">🔴 مديونية العميل الحالية:</span>
                                <span class="value" style="color: var(--rose); font-family: monospace;">عليه ${cBal.toLocaleString('ar-EG')} ج.م (مدين)</span>
                            </div>
                        `;
                    }
                }
            }

            let itemsHtml = '';
            const allItems = (Array.isArray(tx.items) && tx.items.length > 0)
                ? tx.items
                : (Array.isArray(tx.raw_items) && tx.raw_items.length > 0 ? tx.raw_items : matchingTxs);

            itemsHtml = allItems.map(i => {
                const name = i.name || i.product || 'صنف فاشون';
                const qty = parseFloat(i.quantity || i.qty || 1);
                const price = parseFloat(i.price || (i.total ? i.total / qty : 0));
                const lineTotal = parseFloat(i.total || (price * qty) || 0);
                const size = i.size ? `مقاس: ${i.size}` : '';
                const color = i.color ? `لون: ${i.color}` : '';
                const meta = [size, color].filter(Boolean).join(' • ') || 'مقاس ولون حر';

                return `
                    <div class="receipt-item-row">
                        <div>
                            <div class="item-title">${name}</div>
                            <div class="item-meta">الكمية: ${qty} قطعة • ${meta}</div>
                        </div>
                        <div class="item-total">${lineTotal.toLocaleString('ar-EG')} ج.م</div>
                    </div>
                `;
            }).join('');

            content.innerHTML = `
                <div class="invoice-details-receipt">
                    <div class="receipt-card">
                        <div class="receipt-row">
                            <span class="label">رقم الفاتورة:</span>
                            <span class="value" style="font-family: monospace; color: var(--primary);">#${tx.invoiceId || tx.id}</span>
                        </div>
                        <div class="receipt-row">
                            <span class="label">العميل / المشتري:</span>
                            <span class="value" style="color: #fff;">👤 ${partnerName}</span>
                        </div>
                        ${custBalHtml}
                        <div class="receipt-row" style="margin-top: 4px;">
                            <span class="label">التاريخ والوقت:</span>
                            <span class="value" style="font-size: 0.8rem;">🕒 ${rawDate}</span>
                        </div>
                        <div class="receipt-row">
                            <span class="label">طريقة السداد:</span>
                            <span class="value" style="color: var(--gold);">${getPayMethodLabel(method)}</span>
                        </div>
                    </div>

                    <div style="font-weight: 900; font-size: 0.85rem; color: var(--text-dim); margin: 8px 4px 6px;">📋 الأصناف في الفاتورة:</div>
                    <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; max-height: 240px; overflow-y: auto;">
                        ${itemsHtml}
                    </div>

                    <div class="receipt-card" style="border-top: 2px dashed var(--border-strong);">
                        <div class="receipt-row">
                            <span class="label" style="font-size: 0.95rem; font-weight: 900; color: #fff;">إجمالي الفاتورة:</span>
                            <span class="value" style="font-size: 1.15rem; font-weight: 900; color: var(--gold); font-family: monospace;">${total.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        ${remaining > 0 ? `
                        <div class="receipt-row" style="color: var(--rose);">
                            <span class="label" style="color: var(--rose);">المتبقي (آجل على الحساب):</span>
                            <span class="value" style="color: var(--rose); font-weight: 900; font-family: monospace;">${remaining.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        ` : `
                        <div class="receipt-row" style="color: var(--emerald);">
                            <span class="label" style="color: var(--emerald);">حالة السداد:</span>
                            <span class="value" style="color: var(--emerald); font-weight: 900;">مسدد بالكامل بالخزينة ✅</span>
                        </div>
                        `}
                    </div>

                    <div class="invoice-details-actions" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="btn-complete-invoice" style="flex: 1.3; background: linear-gradient(135deg, #0284c7, #0369a1); box-shadow: 0 4px 14px rgba(2,132,199,0.3); font-size: 0.85rem;" onclick="window.BayanMobile.openReceiptImageModal('${tx.invoiceId || tx.id}')">
                                <span>📸</span> إيصال صورة لواتساب
                            </button>
                            <button type="button" class="btn-complete-invoice" style="flex: 0.8; background: linear-gradient(135deg, #25d366, #128c7e); box-shadow: 0 4px 14px rgba(37,211,102,0.3); font-size: 0.82rem;" onclick="window.BayanMobile.shareInvoiceWhatsApp('${tx.invoiceId || tx.id}', ${total}, '${partnerName.replace(/'/g, "\\'")}')">
                                <span>💬</span> نص
                            </button>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="btn-action-edit" style="flex: 1;" onclick="window.BayanMobile.editInvoice('${tx.invoiceId || tx.id}')">
                                <span>✏️</span> تعديل
                            </button>
                            <button type="button" class="btn-action-delete" style="flex: 1;" onclick="window.BayanMobile.deleteInvoice('${tx.invoiceId || tx.id}')">
                                <span>🗑️</span> حذف
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        if (modal) modal.classList.add('active');
    }

    function shareInvoiceWhatsApp(invoiceId, total, partner) {
        const matchingTxs = State.transactions.filter(t => String(t.invoiceId) === String(invoiceId) || String(t.id) === String(invoiceId));
        const tx = matchingTxs[0];
        const allItems = tx ? ((Array.isArray(tx.items) && tx.items.length > 0) ? tx.items : (Array.isArray(tx.raw_items) && tx.raw_items.length > 0 ? tx.raw_items : matchingTxs)) : [];
        const itemsText = allItems.map(i => `• ${i.name || i.product || 'صنف'} (مقاس: ${i.size || 'حر'}, لون: ${i.color || 'عام'}) x ${i.quantity || i.qty || 1}`).join('%0A');
        const shopName = State.settings?.shop_name || 'بَيَان فاشون';
        const msg = `🧾 *فاتورة مشتريات من ${shopName}*%0Aرقم الفاتورة: #${invoiceId}%0Aالعميل: ${partner}%0Aالتاريخ: ${new Date().toLocaleDateString('ar-EG')}%0A%0A*الأصناف:*%0A${itemsText}%0A%0A💰 *الإجمالي:* ${Number(total).toLocaleString('ar-EG')} ج.م%0Aشكراً لزيارتكم! ✨`;
        window.open(`https://wa.me/?text=${msg}`, '_blank');
    }

    function closeInvoiceDetailsModal() {
        const modal = document.getElementById('invoiceDetailsModalOverlay');
        if (modal) modal.classList.remove('active');
    }

    // 🗑️ حذف / إلغاء فاتورة مع استرجاع كميات المخزن
    async function deleteInvoice(invoiceId, promptUser = true) {
        const tx = State.transactions.find(t => String(t.invoiceId || t.id) === String(invoiceId));
        if (!tx) {
            showToast('الفاتورة غير موجودة', 'error');
            return false;
        }

        if (promptUser) {
            const ok = confirm(`هل أنت متأكد من حذف الفاتورة #${tx.invoiceId || tx.id} نهائياً؟\nسيتم استرجاع جميع كميات الأصناف والمقاسات للمخزن فوراً.`);
            if (!ok) return false;
        }

        showToast('جاري حذف الفاتورة واسترجاع المخزون... ⏳', 'warning');

        try {
            const updatedProductsList = [];
            const targetWh = tx.warehouse || State.activeWarehouse || 'المخزن الرئيسي';

            // 1. استرجاع كميات الأصناف والمقاسات محلياً للمخزن المحدد
            if (Array.isArray(tx.items) && tx.items.length > 0) {
                tx.items.forEach(soldItem => {
                    const prod = State.products.find(p => String(p.id) === String(soldItem.productId || soldItem.id));
                    if (prod) {
                        const qty = parseFloat(soldItem.quantity || soldItem.qty || 1);
                        prod.quantity = (parseFloat(prod.quantity !== undefined ? prod.quantity : (prod.stock || 0))) + qty;
                        prod.stock = prod.quantity;

                        // استرجاع رصيد المخزن المحدد للصنف
                        if (prod.warehouseStocks && typeof prod.warehouseStocks === 'object') {
                            prod.warehouseStocks[targetWh] = (parseFloat(prod.warehouseStocks[targetWh] || 0)) + qty;
                        }

                        if (Array.isArray(prod.variants) && prod.variants.length > 0) {
                            const v = prod.variants.find(varItem =>
                                (!soldItem.size || String(varItem.size || '').trim().toLowerCase() === String(soldItem.size || '').trim().toLowerCase()) &&
                                (!soldItem.color || String(varItem.color || '').trim().toLowerCase() === String(soldItem.color || '').trim().toLowerCase())
                            );
                            if (v) {
                                v.stock = (parseFloat(v.stock !== undefined ? v.stock : (v.quantity || 0))) + qty;
                                v.quantity = v.stock;

                                // استرجاع رصيد المخزن المحدد للمتغير
                                if (v.warehouseStocks && typeof v.warehouseStocks === 'object') {
                                    v.warehouseStocks[targetWh] = (parseFloat(v.warehouseStocks[targetWh] || 0)) + qty;
                                }
                            }
                        }
                        if (!updatedProductsList.some(up => up.id === prod.id)) {
                            updatedProductsList.push(prod);
                        }
                    }
                });
            }

            // 2. عكس مديونية العميل الآجل إن كانت الفاتورة آجلة
            const remainingToReverse = parseFloat(tx.remaining || 0);
            const partnerName = String(tx.partner || '').trim();
            if (remainingToReverse > 0 && partnerName && partnerName !== 'عميل نقدي') {
                const cleanP = cleanArabic(partnerName);
                const targetCustomer = State.customers.find(c => c && cleanArabic(c.name) === cleanP);
                const targetAccount = State.accounts.find(a => a && cleanArabic(a.name) === cleanP);
                if (targetCustomer) {
                    targetCustomer.balance = (parseFloat(targetCustomer.balance) || 0) - remainingToReverse;
                }
                if (targetAccount) {
                    targetAccount.balance = (parseFloat(targetAccount.balance) || 0) - remainingToReverse;
                }
                try {
                    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'customers', JSON.stringify(State.customers));
                    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'accounts', JSON.stringify(State.accounts));
                } catch (e) { }

                // ترحيل كشف حساب العملاء بعد الخصم للسحابة
                const currentShopId = State.shopId || CONFIG.SHOP_ID || '';
                if (isValidPairedShop(currentShopId)) {
                    const custUpdatePayload = [
                        {
                            id: `CONFIG_CUSTOMERS_LIST_${currentShopId}`,
                            date: new Date().toISOString(),
                            category: 'customers',
                            amount: State.accounts.length,
                            user_name: `تابلت (${State.terminalLetter})`,
                            warehouse: targetWh,
                            raw_json: {
                                shop_id: currentShopId,
                                customers: State.accounts,
                                accounts: State.accounts,
                                updatedAt: new Date().toISOString()
                            }
                        }
                    ];
                    fetch(`${SUPABASE_CONFIG.url}/rest/v1/treasury_audit?on_conflict=id`, {
                        method: 'POST',
                        headers: getSupabaseHeaders(),
                        body: JSON.stringify(custUpdatePayload)
                    }).catch(() => { });
                }
            }

            // 3. تحديث المخزون المسترجع بالسحابة
            if (updatedProductsList.length > 0) {
                const currentShopId = State.shopId || CONFIG.SHOP_ID || '';
                if (!isValidPairedShop(currentShopId)) return;
                const prodBatch = updatedProductsList.map(p => ({
                    id: String(p.id),
                    name: p.name || 'صنف',
                    barcode: p.barcode || '',
                    category: p.category || 'عام',
                    unit: p.unit || 'قطعة',
                    price: parseFloat(p.price || 0),
                    cost: parseFloat(p.cost || 0),
                    wholesale: parseFloat(p.wholesale || 0),
                    stock: parseFloat(p.stock !== undefined ? p.stock : (p.quantity || 0)),
                    raw_json: {
                        ...(p.raw_json || {}),
                        ...p,
                        shop_id: currentShopId,
                        stock: parseFloat(p.stock !== undefined ? p.stock : (p.quantity || 0)),
                        variants: p.variants || [],
                        warehouseStocks: p.warehouseStocks || {}
                    },
                    updated_at: new Date().toISOString()
                }));
                await fetch(`${SUPABASE_CONFIG.url}/rest/v1/products?on_conflict=id`, {
                    method: 'POST',
                    headers: getSupabaseHeaders(),
                    body: JSON.stringify(prodBatch)
                }).catch(() => { });
            }

            // 4. حذف الفاتورة من السحابة
            const invId = tx.invoiceId || tx.id;
            await fetch(`${SUPABASE_CONFIG.url}/rest/v1/transactions?id=eq.${invId}`, {
                method: 'DELETE',
                headers: getSupabaseHeaders()
            }).catch(() => { });
            await fetch(`${SUPABASE_CONFIG.url}/rest/v1/transactions?invoice_id=eq.${invId}`, {
                method: 'DELETE',
                headers: getSupabaseHeaders()
            }).catch(() => { });

            // 5. تسجيل حركة الإلغاء في treasury_audit ليعلم الكمبيوتر فورياً
            const voidPayload = [{
                id: 'VOID_' + invId,
                date: new Date().toISOString(),
                category: 'void_tx',
                amount: parseFloat(tx.total || 0),
                user_name: `تابلت (${State.terminalLetter})`,
                warehouse: targetWh,
                raw_json: { invoiceId: invId, warehouse: targetWh, voidedAt: new Date().toISOString() }
            }];
            await fetch(`${SUPABASE_CONFIG.url}/rest/v1/treasury_audit?on_conflict=id`, {
                method: 'POST',
                headers: getSupabaseHeaders(),
                body: JSON.stringify(voidPayload)
            }).catch(() => { });

            // 6. إزالة الفاتورة من القائمة المحلية وتحديث الذاكرة
            State.transactions = State.transactions.filter(t => String(t.invoiceId || t.id) !== String(invId));
            try { localStorage.setItem(CONFIG.STORAGE_PREFIX + 'products', JSON.stringify(State.products)); } catch (e) { }
            try { localStorage.setItem(CONFIG.STORAGE_PREFIX + 'transactions', JSON.stringify(State.transactions)); } catch (e) { }

            if (promptUser) {
                closeInvoiceDetailsModal();
                renderDashboard();
                renderProducts();
                renderCartView();
                showToast(`✅ تم حذف الفاتورة #${invId} واسترجاع الكميات لمخزن (${targetWh}) بنجاح!`, 'success');
            }
            return true;
        } catch (err) {
            console.error('Delete invoice error:', err);
            showToast('حدث خطأ أثناء حذف الفاتورة، تأكد من الإنترنت', 'error');
            return false;
        }
    }

    // ✏️ تعديل فاتورة: استرجاع البضاعة ووضع الأصناف في السلة
    async function editInvoice(invoiceId) {
        const tx = State.transactions.find(t => String(t.invoiceId || t.id) === String(invoiceId));
        if (!tx) {
            showToast('الفاتورة غير موجودة', 'error');
            return;
        }

        const ok = confirm(`هل تريد تعديل الفاتورة #${tx.invoiceId || tx.id}؟\nسيتم فتح أصنافها في السلة للتعديل وإلغاء الفاتورة القديمة.`);
        if (!ok) return;

        // حذف الفاتورة القديمة مع استرجاع رصيد المخزن أولاً
        const deleted = await deleteInvoice(invoiceId, false);
        if (!deleted) return;

        // وضع أصناف الفاتورة السابقة في السلة
        State.cart = (tx.items || []).map(i => ({
            key: `${i.productId}_${i.size || 'عادي'}_${i.color || 'عام'}`,
            productId: i.productId,
            name: i.name || 'صنف',
            code: i.code || '',
            price: parseFloat(i.price || 0),
            size: i.size || 'عادي',
            color: i.color || 'عام',
            qty: parseFloat(i.quantity || i.qty || 1),
            maxStock: 999
        }));

        // ضبط وسيلة الدفع واسم العميل
        if (tx.paymentMethod) State.selectedPayMethod = tx.paymentMethod;
        if (tx.partner) {
            selectCustomer(tx.partner);
        }

        closeInvoiceDetailsModal();
        switchTab('pos');
        updateCartCount();
        renderCartView();
        showToast(`تم فتح أصناف الفاتورة #${tx.invoiceId || tx.id} في السلة للتعديل 🛒`, 'info');
    }

    function openInvoiceSuccessModal(tx) {
        window.BayanMobile.lastSuccessTx = tx;
        window._currentReceiptTx = tx;

        const modal = document.getElementById('invoiceSuccessModalOverlay');
        const numEl = document.getElementById('successModalInvoiceNum');
        const totalEl = document.getElementById('successModalTotal');

        if (numEl) numEl.textContent = '#' + tx.invoiceId;
        if (totalEl) totalEl.textContent = parseFloat(tx.finalTotal).toLocaleString('ar-EG') + ' ج.م';

        // WhatsApp share button link
        const btnWa = document.getElementById('btnShareWhatsApp');
        if (btnWa) {
            const itemsText = tx.items.map(i => `• ${i.name} (مقاس: ${i.size}, لون: ${i.color}) - عدد: ${i.quantity}`).join('%0A');
            const msg = `🧾 فاتورة مشتريات من ${State.settings?.shop_name || 'بَيَان فاشون'}%0Aرقم الفاتورة: #${tx.invoiceId}%0Aالتاريخ: ${new Date().toLocaleDateString('ar-EG')}%0A%0A${itemsText}%0A%0A💰 الإجمالي: ${tx.finalTotal} ج.م%0Aشكراً لزيارتكم! ✨`;
            btnWa.onclick = () => window.open(`https://wa.me/?text=${msg}`, '_blank');
        }

        if (modal) modal.classList.add('active');
    }

    function closeInvoiceSuccessModal() {
        const modal = document.getElementById('invoiceSuccessModalOverlay');
        if (modal) modal.classList.remove('active');
    }

    // إرسال الفاتورة الرقمية الأنيقة مباشرة لواتساب العميل
    function sendWhatsAppReceiptDirectly(tx) {
        if (!tx) tx = window.BayanMobile.lastSuccessTx || (State.transactions && State.transactions[0]);
        if (!tx) {
            showToast('لا توجد فاتورة محددة لإرسالها ⚠️', 'warning');
            return;
        }

        let phone = String(tx.customerPhone || tx.phone || tx.mobile || '').replace(/\D/g, '');
        if (!phone) {
            const entered = prompt('📱 يرجى إدخال رقم واتساب العميل لإرسال الفاتورة (مثال: 01012345678):');
            if (!entered) return;
            phone = entered.replace(/\D/g, '');
        }

        if (phone.startsWith('01') && phone.length === 11) {
            phone = '2' + phone;
        } else if (phone.startsWith('1') && phone.length === 10) {
            phone = '20' + phone;
        }

        const shopName = State.settings?.shop_name || State.shopName || 'بَيَان فاشون';
        const invId = tx.invoiceId || tx.id || '---';
        const dateStr = tx.dateISO || (tx.date ? String(tx.date).split('،')[0] : new Date().toLocaleDateString('ar-EG'));
        const timeStr = tx.timeISO || (tx.date ? String(tx.date).split('،')[1] : new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
        const total = parseFloat(tx.invoiceGrandTotal || tx.total || tx.finalTotal || tx.paidAmount || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const items = Array.isArray(tx.items) ? tx.items : [];

        let itemsText = '';
        if (items.length > 0) {
            itemsText = items.map(it => {
                const s = it.size && it.size !== 'عادي' ? ` (مقاس: ${it.size})` : '';
                const c = it.color && it.color !== 'عام' ? ` (لون: ${it.color})` : '';
                const q = it.quantity || it.qty || 1;
                const p = parseFloat(it.price || it.salePrice || 0);
                return `🔹 *${it.name || 'صنف'}*${s}${c}%0A   الكمية: ${q} × ${p} ج.م = ${q * p} ج.م`;
            }).join('%0A');
        } else {
            itemsText = `🔹 *${tx.product || 'فاتورة مشتريات'}* - ${total} ج.م`;
        }

        const msg = `✨ *فاتورة شراء رقمية - ${shopName}* ✨%0A%0A` +
            `🧾 رقم الفاتورة: *#${invId}*%0A` +
            `📅 التاريخ: ${dateStr} - ${timeStr}%0A` +
            `👤 العميل: *${tx.customerName || tx.customer || 'عميل نقدي'}*%0A` +
            `-----------------------------------%0A` +
            `📋 *تفاصيل المشتريات:*%0A${itemsText}%0A` +
            `-----------------------------------%0A` +
            `💰 *الإجمالي النهائي: ${total} ج.م*%0A` +
            `💳 طريقة الدفع: ${getPayMethodLabel(tx.method || tx.paymentMethod)}%0A%0A` +
            `👗 *شكراً لتعاملكم الراقي مع ${shopName}! يسعدنا تشريفكم دائماً.* 🌸`;

        const waUrl = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
        window.open(waUrl, '_blank');
        showToast('تم فتح واتساب لإرسال الفاتورة 📲✨', 'success');
    }

    // ============================================================
    // 👗 ADD PRODUCT & FASHION VARIANT MATRIX BUILDER
    // ============================================================
    function openAddProductModal() {
        const modal = document.getElementById('addProductModalOverlay');
        if (!modal) return;

        // Reset inputs
        const nameInp = document.getElementById('newProdName');
        const barcodeInp = document.getElementById('newProdBarcode');
        const catInp = document.getElementById('newProdCategory');
        const priceInp = document.getElementById('newProdPrice');
        const costInp = document.getElementById('newProdCost');
        const wholesaleInp = document.getElementById('newProdWholesale');

        if (nameInp) nameInp.value = '';
        if (catInp) catInp.value = (State.selectedCategory !== 'all' && State.selectedCategory) ? State.selectedCategory : 'عام';
        if (priceInp) priceInp.value = '';
        if (costInp) costInp.value = '';
        if (wholesaleInp) wholesaleInp.value = '';

        // Reset product image uploader
        removeProductImage();

        // Auto generate barcode
        generateBarcode();

        // Generate variant rows initially
        generateVariantRows();

        modal.classList.add('active');
        if (nameInp) setTimeout(() => nameInp.focus(), 250);
    }

    function closeAddProductModal() {
        const modal = document.getElementById('addProductModalOverlay');
        if (modal) modal.classList.remove('active');
        removeProductImage();
    }

    // ============================================================
    // 📸 PRODUCT IMAGE UPLOADER & COMPRESSION ENGINE
    // ============================================================
    function handleProductImageUpload(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('يرجى اختيار ملف صورة صالح (JPG, PNG, WebP) ⚠️', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const maxDim = 600;
                let w = img.width;
                let h = img.height;

                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round(h * (maxDim / w));
                        w = maxDim;
                    } else {
                        w = Math.round(w * (maxDim / h));
                        h = maxDim;
                    }
                }

                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                // ضغط الصورة إلى صيغة JPEG بجودة 0.8 لتكون خفيفة جداً (~30-50KB)
                const compressed = canvas.toDataURL('image/jpeg', 0.8);
                State.newProductImageBase64 = compressed;

                const preview = document.getElementById('newProdImagePreview');
                if (preview) preview.src = compressed;

                const emptyBox = document.getElementById('prodImageEmptyState');
                const previewBox = document.getElementById('prodImagePreviewState');
                if (emptyBox) emptyBox.style.display = 'none';
                if (previewBox) previewBox.style.display = 'flex';

                showToast('تم التقاط وضغط صورة الموديل بنجاح 📸✨', 'success');
            };
            img.onerror = function () {
                showToast('تعذر قراءة ملف الصورة، يرجى المحاولة مرة أخرى ⚠️', 'error');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function removeProductImage() {
        State.newProductImageBase64 = '';
        const inp = document.getElementById('newProdImageInput');
        if (inp) inp.value = '';

        const emptyBox = document.getElementById('prodImageEmptyState');
        const previewBox = document.getElementById('prodImagePreviewState');
        if (emptyBox) emptyBox.style.display = 'flex';
        if (previewBox) previewBox.style.display = 'none';

        const preview = document.getElementById('newProdImagePreview');
        if (preview) preview.src = '';
    }

    function generateBarcode() {
        const barcodeInp = document.getElementById('newProdBarcode');
        if (!barcodeInp) return;
        const rand = Math.floor(1000000000 + Math.random() * 9000000000);
        barcodeInp.value = '20' + rand;
    }

    function generateVariantRows() {
        const sizeChips = document.querySelectorAll('#newProdSizesSelector .vb-chip.active');
        let selectedSizes = Array.from(sizeChips).map(c => c.textContent.trim()).filter(Boolean);
        if (selectedSizes.length === 0) selectedSizes = ['عادي'];

        const colorChips = document.querySelectorAll('#newProdColorsSelector .vb-chip.active');
        let selectedColors = Array.from(colorChips).map(c => c.textContent.trim()).filter(Boolean);
        if (selectedColors.length === 0) selectedColors = ['عام'];

        const container = document.getElementById('newProdVariantRowsContainer');
        const list = document.getElementById('newProdVariantRowsList');
        if (!list) return;

        let rowsHtml = '';
        selectedSizes.forEach(s => {
            selectedColors.forEach(c => {
                rowsHtml += `
                    <div class="vb-row-item" data-size="${s}" data-color="${c}">
                        <div class="vb-row-label">
                            <span style="background: var(--primary-subtle); color: var(--primary); padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800;">${s}</span>
                            <span style="background: var(--chip-bg); color: var(--text-main); padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; border: 1px solid var(--border-subtle);">${c}</span>
                        </div>
                        <input type="number" class="vb-row-input" min="0" value="1" placeholder="0" oninput="window.BayanMobile.onVariantRowQtyChange()">
                    </div>
                `;
            });
        });

        list.innerHTML = rowsHtml;
        if (container) container.style.display = 'block';

        onVariantRowQtyChange();
    }

    function onVariantRowQtyChange() {
        const inputs = document.querySelectorAll('#newProdVariantRowsList .vb-row-input');
        let total = 0;
        inputs.forEach(inp => {
            const val = parseFloat(inp.value) || 0;
            if (val > 0) total += val;
        });

        const badge = document.getElementById('newProdTotalQuantityBadge');
        if (badge) {
            badge.textContent = `${total} قطعة`;
        }
    }

    async function submitNewProduct() {
        const nameInp = document.getElementById('newProdName');
        const barcodeInp = document.getElementById('newProdBarcode');
        const catInp = document.getElementById('newProdCategory');
        const priceInp = document.getElementById('newProdPrice');
        const costInp = document.getElementById('newProdCost');
        const wholesaleInp = document.getElementById('newProdWholesale');
        const btnSave = document.getElementById('btnSaveNewProduct');

        const name = (nameInp ? nameInp.value : '').trim();
        if (!name) {
            showToast('يرجى كتابة اسم الموديل أو الصنف أولاً ⚠️', 'warning');
            if (nameInp) nameInp.focus();
            return;
        }

        const price = parseFloat(priceInp ? priceInp.value : 0) || 0;
        if (price <= 0) {
            showToast('يرجى تحديد سعر البيع للصنف ⚠️', 'warning');
            if (priceInp) priceInp.focus();
            return;
        }

        const cost = parseFloat(costInp ? costInp.value : 0) || 0;
        const wholesale = parseFloat(wholesaleInp ? wholesaleInp.value : 0) || price;
        const barcode = (barcodeInp && barcodeInp.value.trim()) ? barcodeInp.value.trim() : ('20' + Math.floor(1000000000 + Math.random() * 9000000000));
        const category = (catInp && catInp.value.trim()) ? catInp.value.trim() : 'عام';

        // Collect variants from generated rows
        const rowItems = document.querySelectorAll('#newProdVariantRowsList .vb-row-item');
        const variantsList = [];
        let totalStock = 0;

        const activeWh = State.activeWarehouse || 'المخزن الرئيسي';
        const currentShopId = State.shopId || CONFIG.SHOP_ID || '';

        if (rowItems.length > 0) {
            rowItems.forEach((row) => {
                const s = row.dataset.size || 'عادي';
                const c = row.dataset.color || 'عام';
                const inp = row.querySelector('.vb-row-input');
                const qty = parseFloat(inp ? inp.value : 0) || 0;
                totalStock += qty;

                variantsList.push({
                    size: s,
                    color: c,
                    barcode: `${barcode}-${s}-${c}`,
                    stock: qty,
                    quantity: qty,
                    warehouseStocks: { [activeWh]: qty },
                    price: price,
                    cost: cost,
                    wholesale: wholesale
                });
            });
        } else {
            variantsList.push({
                size: 'عادي',
                color: 'عام',
                barcode: barcode,
                stock: 0,
                quantity: 0,
                warehouseStocks: { [activeWh]: 0 },
                price: price,
                cost: cost,
                wholesale: wholesale
            });
        }

        // Construct Product Object
        const newProdId = String(Date.now());
        const newProduct = {
            id: newProdId,
            name: name,
            barcode: barcode,
            category: category,
            unit: 'قطعة',
            price: price,
            cost: cost,
            wholesale: wholesale,
            stock: totalStock,
            quantity: totalStock,
            warehouseStocks: { [activeWh]: totalStock },
            variants: variantsList,
            image: State.newProductImageBase64 || '',
            shop_id: currentShopId,
            created_at: new Date().toISOString()
        };

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '⏳ جاري الحفظ والترحيل للسحابة...';
        }

        try {
            // 1. Add locally to mobile state immediately
            State.products.unshift(newProduct);
            safelyPersistProducts(State.products);

            // Update UI immediately
            updateCategoriesList();
            renderProducts();

            // 2. Upload to Supabase `products` table
            const sbRow = {
                id: `${currentShopId}_PROD_${newProduct.id}`,
                name: newProduct.name,
                barcode: newProduct.barcode,
                category: newProduct.category,
                unit: 'قطعة',
                cost: newProduct.cost,
                price: newProduct.price,
                wholesale: newProduct.wholesale,
                stock: newProduct.stock,
                image: newProduct.image || null,
                raw_json: { ...newProduct, localId: newProduct.id, shop_id: currentShopId },
                updated_at: new Date().toISOString()
            };

            if (!navigator.onLine) {
                enqueueOfflineItem({ id: 'PROD_' + newProdId, prodBatch: [sbRow], createdAt: new Date().toISOString() });
                showToast(`تم حفظ الصنف (${name}) محلياً في مخزن (${activeWh}) وفي طابور الأوفلاين 📦⚡`, 'info');
            } else {
                fetch(`${SUPABASE_CONFIG.url}/rest/v1/products?on_conflict=id`, {
                    method: 'POST',
                    headers: getSupabaseHeaders(),
                    body: JSON.stringify([sbRow])
                }).then(res => {
                    if (res.ok || res.status === 201 || res.status === 200) {
                        showToast(`تمت إضافة صنف (${name}) وترحيله للسحابة بنجاح! 👗✨`, 'success');
                    } else {
                        enqueueOfflineItem({ id: 'PROD_' + newProdId, prodBatch: [sbRow], createdAt: new Date().toISOString() });
                        showToast(`تم حفظ الصنف محلياً، وسيرحل للسحابة تلقائياً ✅`, 'info');
                    }
                }).catch(() => {
                    enqueueOfflineItem({ id: 'PROD_' + newProdId, prodBatch: [sbRow], createdAt: new Date().toISOString() });
                    showToast(`تم حفظ الصنف محلياً وفي طابور المزامنة التلقائية ✅`, 'info');
                });
            }

            closeAddProductModal();
        } catch (err) {
            console.error('[AddProduct] Error:', err);
            showToast(`تم حفظ الصنف محلياً في الذاكرة ✅`, 'info');
            closeAddProductModal();
        } finally {
            removeProductImage();
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<span>💾</span> حفظ الصنف وترحيله للسحابة والماستر';
            }
        }
    }

    // ============================================================
    // 🔊 AUDIO & HAPTIC POS SCANNER SYNTHESIZER
    // ============================================================
    function playBarcodeBeepAndVibrate() {
        try {
            // Haptic vibration
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(60);
            }
            // Web Audio API Synthesizer (Zero-latency 1760Hz POS beep)
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1760, ctx.currentTime);
                gain.gain.setValueAtTime(0.25, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.08);
            }
        } catch (e) {}
    }

    // ============================================================
    // 📸 CAMERA SCANNER
    // ============================================================
    function triggerCameraScan() {
        const fileInput = document.getElementById('cameraFileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    // Handle Camera Image
    async function handleCameraFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        showToast('جاري قراءة الباركود من الصورة...', 'warning');

        // Check if BarcodeDetector is natively supported
        if ('BarcodeDetector' in window) {
            try {
                const detector = new window.BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a'] });
                const bitmap = await createImageBitmap(file);
                const barcodes = await detector.detect(bitmap);
                if (barcodes && barcodes.length > 0) {
                    const rawVal = barcodes[0].rawValue;
                    playBarcodeBeepAndVibrate();
                    showToast(`تم مسح الباركود: ${rawVal} 🏷️`, 'success');
                    onBarcodeFound(rawVal);
                    return;
                }
            } catch (err) {
                console.warn('BarcodeDetector error:', err);
            }
        }

        const manualInput = prompt('يرجى إدخال الباركود أو اسم الصنف للبحث:');
        if (manualInput && manualInput.trim()) {
            onBarcodeFound(manualInput.trim());
        } else {
            showToast('يمكنك كتابة اسم الصنف أو الباركود في شريط البحث بالأعلى 🔍', 'info');
        }
    }

    function onBarcodeFound(barcode) {
        playBarcodeBeepAndVibrate();
        const searchInput = document.getElementById('productSearchInput');
        if (searchInput) {
            searchInput.value = barcode;
            const clearBtn = document.getElementById('productSearchClearBtn');
            if (clearBtn) clearBtn.style.display = 'flex';
            State.searchQuery = barcode;
            renderProducts();
        }
        // Switch to products tab
        switchTab('products');
    }

    function clearProductSearch() {
        const searchInput = document.getElementById('productSearchInput');
        const clearBtn = document.getElementById('productSearchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        if (clearBtn) {
            clearBtn.style.display = 'none';
        }
        State.searchQuery = '';
        renderProducts();
    }

    // ============================================================
    // 🧭 NAVIGATION & TAB SWITCHING
    // ============================================================
    function switchTab(tabId) {
        // فحص قفل الخزينة برقم سري (PIN) في حال تفعيله لحماية رصيد الدرج من البائعين
        if (tabId === 'dashboard' && localStorage.getItem('bayan_mob_treasury_pin_enabled') === 'true' && !State.treasuryUnlocked) {
            const entered = prompt('🔐 الخزينة محمية برقم سري: يرجى إدخال رمز الـ PIN:');
            if (!entered) return;

            const storedHash = localStorage.getItem('bayan_mob_treasury_pin_hash');
            const oldPlainPin = localStorage.getItem('bayan_mob_treasury_pin');
            const enteredHash = hashSecurityPin(entered);

            const isMatch = (storedHash && enteredHash === storedHash) ||
                (oldPlainPin && String(entered).trim() === String(oldPlainPin).trim());

            if (!isMatch) {
                showToast('رمز الـ PIN غير صحيح! تم حظر الوصول للخزينة واليومية ❌', 'error');
                return;
            }

            // ترقية تلقائية للرمز المشفر إذا كان قادماً من نص قديم صريح
            if (oldPlainPin && !storedHash) {
                localStorage.setItem('bayan_mob_treasury_pin_hash', hashSecurityPin(oldPlainPin));
                localStorage.removeItem('bayan_mob_treasury_pin');
            }

            State.treasuryUnlocked = true;
            showToast('تم التحقق بنجاح! مرحباً بك في الخزينة واليومية 🔓', 'success');
        }

        // عند الانتقال لتبويب الإعدادات نعيد عرض القائمة الرئيسية ونغلق أي لوحة فرعية
        if (tabId === 'settings') {
            closeSettingSubPage(false);
        }

        State.activeTab = tabId;

        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabId);
        });

        // Update views
        document.querySelectorAll('.tab-view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${tabId}`);
        });

        if ((tabId === 'pos' || tabId === 'accounts') && State.token && navigator.onLine) {
            // تحديث هادئ لقائمة الحسابات والعملاء لضمان التقاط أي حساب جديد مضاف من الكمبيوتر
            const sId = State.shopId || CONFIG.SHOP_ID || localStorage.getItem('bayan_mob_shop_id');
            if (sId && sId !== 'SHOP_DEFAULT') {
                fetch(`${SUPABASE_CONFIG.url}/rest/v1/treasury_audit?id=eq.CONFIG_CUSTOMERS_LIST_${encodeURIComponent(sId)}`, { headers: getSupabaseHeaders() })
                    .then(r => r.json())
                    .then(rows => {
                        if (Array.isArray(rows) && rows.length > 0) {
                            const targetRow = rows[0];
                            if (targetRow && targetRow.raw_json) {
                                const rawObj = targetRow.raw_json;
                                const accList = Array.isArray(rawObj.accounts) ? rawObj.accounts : (Array.isArray(rawObj.customers) ? rawObj.customers : []);
                                State.accounts = accList;
                                State.customers = accList;
                                try {
                                    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'accounts', JSON.stringify(State.accounts));
                                    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'customers', JSON.stringify(State.customers));
                                } catch (e) { }
                                if (State.activeTab === 'accounts') renderAccountsView();
                            }
                        }
                    })
                    .catch(() => { });
            }
        }

        renderCurrentView();
    }

    function renderCurrentView() {
        if (State.activeTab === 'dashboard') {
            renderDashboard();
        } else if (State.activeTab === 'products') {
            renderProducts();
        } else if (State.activeTab === 'pos') {
            renderCartView();
        } else if (State.activeTab === 'accounts') {
            renderAccountsView();
        } else if (State.activeTab === 'settings') {
            renderSettingsView();
        }
    }

    // ============================================================
    // ⚙️ NATIVE MOBILE SETTINGS HUB & SUBPAGES
    // ============================================================
    State.activeSettingSubPage = null;
    State.treasuryUnlocked = false;

    function openSettingSubPage(pageKey, pushHistory = true) {
        const titles = {
            branch: '🏬 الفرع والمتجر السحابي',
            theme: '🎨 مظهر وثيم التطبيق',
            invoice: '🧾 بيانات المتجر وفاتورة الموبايل',
            security: '🔐 قفل الخزينة برقم سري (PIN)',
            pos_prefs: '📳 تفضيلات البيع السريع والماسح',
            sync_data: '🔄 إدارة البيانات والمزامنة الكاملة',
            printer: '🖨️ طابعة الفواتير البلوتوث',
            backup: '☁️ النسخ الاحتياطي والأمان السحابي',
            about: 'ℹ️ معلومات النظام والدعم الفني'
        };

        const mainMenu = document.getElementById('settingsMainMenu');
        const container = document.getElementById('settingsSubPageContainer');
        const titleEl = document.getElementById('subpageTitle');

        if (!container || !mainMenu) return;

        // Hide main menu, show container
        mainMenu.style.display = 'none';
        container.style.display = 'block';

        if (titleEl) titleEl.textContent = titles[pageKey] || 'الإعدادات';

        // Hide all detail panels
        document.querySelectorAll('.setting-detail-panel').forEach(p => p.style.display = 'none');

        // Show target panel
        const targetPanel = document.getElementById(`panel_${pageKey}`);
        if (targetPanel) targetPanel.style.display = 'block';

        if (pageKey === 'backup') {
            const lastTime = localStorage.getItem('bayan_mob_last_backup_time');
            const labelEl = document.getElementById('lastBackupTimeText');
            if (labelEl && lastTime) {
                labelEl.textContent = `آخر عملية نسخ: ${lastTime} ✅`;
            }
        }

        State.activeSettingSubPage = pageKey;

        // Push history state so phone back button returns to settings menu
        if (pushHistory) {
            try {
                window.history.pushState({ settingSubPage: pageKey }, '');
            } catch (e) { }
        }

        // Initialize panel data
        renderSettingsView();

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function closeSettingSubPage(triggerHistoryBack = true) {
        const mainMenu = document.getElementById('settingsMainMenu');
        const container = document.getElementById('settingsSubPageContainer');

        if (mainMenu) mainMenu.style.display = 'block';
        if (container) container.style.display = 'none';

        document.querySelectorAll('.setting-detail-panel').forEach(p => p.style.display = 'none');

        const wasInSubpage = !!State.activeSettingSubPage;
        State.activeSettingSubPage = null;

        if (triggerHistoryBack && wasInSubpage && window.history.state && window.history.state.settingSubPage) {
            try {
                window.history.back();
            } catch (e) { }
        }

        renderSettingsView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Phone Back button / Swipe gesture listener
    window.addEventListener('popstate', (e) => {
        if (State.activeSettingSubPage) {
            closeSettingSubPage(false);
        }
    });

    function renderSettingsView() {
        // 1. Branch & Warehouse Snippet & Fields
        const nameEl = document.getElementById('currentShopNameDisplay');
        const idEl = document.getElementById('currentShopIdDisplay');
        const inpEl = document.getElementById('settingShopIdInput');
        const whDisplayEl = document.getElementById('currentWarehouseDisplay');
        const whSelectEl = document.getElementById('settingWarehouseSelect');
        const whCustomWrap = document.getElementById('customWarehouseInputWrapper');
        const whCustomInp = document.getElementById('settingCustomWarehouseInput');
        const snippetBranch = document.getElementById('settingSnippetBranch');
        const posWhBadge = document.getElementById('posActiveWarehouseBadge');

        const currentName = State.shopName || localStorage.getItem('bayan_mob_shop_name') || 'بَيَان فاشون';
        const currentId = (State.shopId && State.shopId !== 'SHOP_DEFAULT') ? State.shopId : ((CONFIG.SHOP_ID && CONFIG.SHOP_ID !== 'SHOP_DEFAULT') ? CONFIG.SHOP_ID : '');
        const currentWh = State.activeWarehouse || localStorage.getItem('bayan_mob_active_warehouse') || 'المخزن الرئيسي';

        if (nameEl) nameEl.textContent = currentName;
        if (idEl) idEl.textContent = currentId;
        if (inpEl && !inpEl.value) inpEl.value = currentId;
        if (whDisplayEl) whDisplayEl.textContent = `${currentWh} 📦`;
        if (snippetBranch) snippetBranch.textContent = `${currentName} • ${currentWh}`;
        if (posWhBadge) posWhBadge.textContent = `📦 ${currentWh}`;

        if (whSelectEl) {
            const list = (Array.isArray(State.warehouses) && State.warehouses.length > 0) ? State.warehouses : ['المخزن الرئيسي'];
            whSelectEl.innerHTML = list.map(w => `
                <option value="${w}">${w} 🏬</option>
            `).join('');
            whSelectEl.value = currentWh && list.includes(currentWh) ? currentWh : list[0];
        }

        // 2. Theme Snippet
        const snippetTheme = document.getElementById('settingSnippetTheme');
        const currentTheme = getSavedTheme();
        if (snippetTheme) {
            snippetTheme.textContent = currentTheme === 'dark' ? 'الوضع الداكن 🌙' : 'الوضع الفاتح ✨ (افتراضي)';
        }

        // 3. Invoice & Store Profile
        let storedSettings = {};
        try {
            storedSettings = JSON.parse(localStorage.getItem('bayan_mob_settings') || '{}');
        } catch (e) { }

        const shopNameInp = document.getElementById('settingShopNameInput');
        const shopPhoneInp = document.getElementById('settingShopPhoneInput');
        const shopAddrInp = document.getElementById('settingShopAddressInput');
        const invoiceFooterInp = document.getElementById('settingInvoiceFooterInput');
        const snippetInvoice = document.getElementById('settingSnippetInvoice');

        const effectiveShopName = storedSettings.shop_name || currentName;
        const effectiveShopPhone = storedSettings.shop_phone || '';
        const effectiveShopAddr = storedSettings.shop_address || '';
        const effectiveFooter = storedSettings.invoice_footer || 'البضاعة المباعة تُستبدل خلال 14 يوماً بالفاتورة والباركود. شكراً لزيارتكم! ✨';

        if (shopNameInp && !shopNameInp.value) shopNameInp.value = effectiveShopName;
        if (shopPhoneInp && !shopPhoneInp.value) shopPhoneInp.value = effectiveShopPhone;
        if (shopAddrInp && !shopAddrInp.value) shopAddrInp.value = effectiveShopAddr;
        if (invoiceFooterInp && !invoiceFooterInp.value) invoiceFooterInp.value = effectiveFooter;
        if (snippetInvoice) {
            snippetInvoice.textContent = effectiveShopName + (effectiveShopPhone ? ` • ${effectiveShopPhone}` : '');
        }

        updateInvoiceWaPreview(effectiveShopName, effectiveFooter);

        // 4. Security PIN Lock
        const isPinLocked = localStorage.getItem('bayan_mob_treasury_pin_enabled') === 'true';
        const pinCheck = document.getElementById('settingTreasuryPinEnabled');
        const pinBox = document.getElementById('pinLockInputsSection');
        const snippetSecurity = document.getElementById('settingSnippetSecurity');
        const pinInp = document.getElementById('settingNewPinInput');

        if (pinCheck) pinCheck.checked = isPinLocked;
        if (pinBox) pinBox.style.display = isPinLocked ? 'block' : 'none';
        if (pinInp) {
            pinInp.value = '';
            pinInp.placeholder = isPinLocked ? '•••• (الرمز مشفر ومحمي، اكتب للتغيير)' : 'أدخل 4 أرقام جديدة';
        }
        if (snippetSecurity) {
            snippetSecurity.textContent = isPinLocked ? '🔒 الخزينة محمية برمز PIN مشفر' : 'حماية رصيد الدرج من البائعين';
            snippetSecurity.style.color = isPinLocked ? 'var(--emerald)' : 'var(--text-dim)';
        }

        // 5. POS Preferences
        let prefs = {};
        try {
            prefs = JSON.parse(localStorage.getItem('bayan_mob_pos_prefs') || '{}');
        } catch (e) { }

        const hapticCheck = document.getElementById('settingPrefHaptic');
        const beepCheck = document.getElementById('settingPrefBeep');
        const hideStockCheck = document.getElementById('settingPrefHideOutOfStock');
        const quickAddCheck = document.getElementById('settingPrefQuickAdd');

        if (hapticCheck) hapticCheck.checked = prefs.haptic !== false;
        if (beepCheck) beepCheck.checked = prefs.beep !== false;
        if (hideStockCheck) hideStockCheck.checked = prefs.hideOutOfStock === true;
        if (quickAddCheck) quickAddCheck.checked = prefs.quickAdd !== false;

        // 6. Sync Data Stats
        const statProd = document.getElementById('syncStatProductsCount');
        const statAcc = document.getElementById('syncStatAccountsCount');
        const statTime = document.getElementById('syncStatLastTime');
        const snippetSync = document.getElementById('settingSnippetSync');

        const pCount = Array.isArray(State.products) ? State.products.length : 0;
        const aCount = Array.isArray(State.accounts) ? State.accounts.length : 0;
        if (statProd) statProd.textContent = pCount;
        if (statAcc) statAcc.textContent = aCount;
        if (statTime) {
            statTime.textContent = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        }
        if (snippetSync) {
            snippetSync.textContent = `${pCount} صنف • ${aCount} حساب • متزامن ⚡`;
        }
    }

    function updateInvoiceWaPreview(shopName, footer) {
        const previewBox = document.getElementById('invoiceWaPreviewBox');
        if (!previewBox) return;
        previewBox.textContent = `🧾 *فاتورة مشتريات من ${shopName || 'بَيَان فاشون'}*
رقم الفاتورة: #MOB-261019-001
العميل: عميل نقدي
التاريخ: ${new Date().toLocaleDateString('ar-EG')}

*الأصناف:*
1x فستان سهرة فاخر (L / كحلي) = 750 ج.م

💰 *الإجمالي المسدد:* 750 ج.م
${footer || 'شكراً لتعاملكم الراقي معنا! ✨'}`;
    }

    function recalculateStockForActiveWarehouse() {
        const curWH = State.activeWarehouse || 'المخزن الرئيسي';
        State.products.forEach(p => {
            const whStocks = (p.warehouseStocks && typeof p.warehouseStocks === 'object') ? p.warehouseStocks : {};
            if (whStocks[curWH] !== undefined) {
                p.stock = parseFloat(whStocks[curWH]) || 0;
            } else if (curWH === 'المخزن الرئيسي' || Object.keys(whStocks).length === 0) {
                p.stock = parseFloat(p.stock !== undefined ? p.stock : (p.quantity || 0)) || 0;
            } else {
                p.stock = 0;
            }
            p.quantity = p.stock;

            if (Array.isArray(p.variants)) {
                p.variants.forEach(v => {
                    const vWhStocks = (v.warehouseStocks && typeof v.warehouseStocks === 'object') ? v.warehouseStocks : {};
                    if (vWhStocks[curWH] !== undefined) {
                        v.stock = parseFloat(vWhStocks[curWH]) || 0;
                    } else if (curWH === 'المخزن الرئيسي' || Object.keys(vWhStocks).length === 0) {
                        v.stock = parseFloat(v.stock !== undefined ? v.stock : (v.quantity || 0)) || 0;
                    } else {
                        v.stock = 0;
                    }
                    v.quantity = v.stock;
                });
            }
        });
        safelyPersistProducts(State.products);
    }

    function onWarehouseSelectChange(val) {
        if (!val) return;
        State.activeWarehouse = val;
        localStorage.setItem('bayan_mob_active_warehouse', val);

        recalculateStockForActiveWarehouse();

        renderSettingsView();
        renderProducts();
        renderCartView();
        renderDashboard();
        showToast(`📦 تم التحويل إلى: (${val}) وجاري عرض رصيد بضاعته الحقيقية!`, 'success');
    }

    async function saveShopBranch() {
        const inpEl = document.getElementById('settingShopIdInput');
        const whSelectEl = document.getElementById('settingWarehouseSelect');

        const raw = inpEl ? inpEl.value.trim() : '';
        const cleanId = raw ? raw.replace(/\s+/g, '_') : (State.shopId || 'SHOP_DEFAULT');
        const chosenWh = whSelectEl ? whSelectEl.value : (State.activeWarehouse || 'المخزن الرئيسي');

        State.shopId = cleanId;
        CONFIG.SHOP_ID = cleanId;
        localStorage.setItem('bayan_mob_shop_id', cleanId);

        State.activeWarehouse = chosenWh;
        localStorage.setItem('bayan_mob_active_warehouse', chosenWh);

        recalculateStockForActiveWarehouse();
        renderSettingsView();
        renderProducts();
        renderCartView();
        showToast(`✅ تم حفظ الفرع (${cleanId}) والمخزن النشط: ${chosenWh} بنجاح! 📦`, 'success');

        await pullMasterData();
        startAutoSyncPoll();
        renderDashboard();
    }

    function saveShopProfileSettings() {
        const name = (document.getElementById('settingShopNameInput')?.value || '').trim() || 'بَيَان فاشون';
        const phone = (document.getElementById('settingShopPhoneInput')?.value || '').trim();
        const address = (document.getElementById('settingShopAddressInput')?.value || '').trim();
        const footer = (document.getElementById('settingInvoiceFooterInput')?.value || '').trim();

        syncStoreProfile({
            shopName: name,
            phone: phone,
            address: address,
            invoiceFooter: footer
        });

        renderSettingsView();
        showToast('تم حفظ بيانات المتجر والفاتورة بنجاح! 🧾✨', 'success');
    }

    // ============================================================
    // 🔐 PIN SECURITY & HASHING (تشفير وحماية رمز الخزينة)
    // ============================================================
    function hashSecurityPin(pin) {
        if (!pin) return '';
        const salt = 'BAYAN_POS_SECURE_SALT_2026';
        let hash = 0;
        const str = salt + String(pin).trim() + salt;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return 'SEC_' + Math.abs(hash).toString(36);
    }

    function togglePinLockSection(enabled) {
        const box = document.getElementById('pinLockInputsSection');
        if (box) box.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            const inp = document.getElementById('settingNewPinInput');
            if (inp) setTimeout(() => inp.focus(), 200);
        }
    }

    function saveSecuritySettings() {
        const enabled = document.getElementById('settingTreasuryPinEnabled')?.checked;
        const pinInp = document.getElementById('settingNewPinInput');
        const pinVal = (pinInp ? pinInp.value : '').trim();

        const currentHash = localStorage.getItem('bayan_mob_treasury_pin_hash');
        const oldPlain = localStorage.getItem('bayan_mob_treasury_pin');

        if (enabled) {
            if (pinVal) {
                if (pinVal.length < 4) {
                    showToast('يرجى إدخال رمز PIN مكون من 4 أرقام على الأقل ⚠️', 'warning');
                    if (pinInp) pinInp.focus();
                    return;
                }
                const newHash = hashSecurityPin(pinVal);
                localStorage.setItem('bayan_mob_treasury_pin_hash', newHash);
                localStorage.removeItem('bayan_mob_treasury_pin'); // مسح النص الصريح نهائياً
                if (pinInp) pinInp.value = '';
                showToast('تم حفظ وقفل الخزينة برمز PIN مشفر بنجاح! 🔒', 'success');
            } else if (!currentHash && !oldPlain) {
                showToast('يرجى إدخال رمز PIN مكون من 4 أرقام ⚠️', 'warning');
                if (pinInp) pinInp.focus();
                return;
            } else {
                showToast('تم تفعيل حماية الخزينة بالرمز السري الحالي! 🔒', 'success');
            }
            localStorage.setItem('bayan_mob_treasury_pin_enabled', 'true');
        } else {
            localStorage.setItem('bayan_mob_treasury_pin_enabled', 'false');
            showToast('تم إلغاء قفل الخزينة بنجاح 🔓', 'info');
        }

        renderSettingsView();
    }

    function savePosPreferences() {
        const prefs = {
            haptic: document.getElementById('settingPrefHaptic')?.checked !== false,
            beep: document.getElementById('settingPrefBeep')?.checked !== false,
            hideOutOfStock: document.getElementById('settingPrefHideOutOfStock')?.checked === true,
            quickAdd: document.getElementById('settingPrefQuickAdd')?.checked !== false
        };

        localStorage.setItem('bayan_mob_pos_prefs', JSON.stringify(prefs));
        showToast('تم حفظ تفضيلات البيع والماسح بنجاح! 📳', 'success');
        renderSettingsView();
    }

    async function forceFullSync() {
        showToast('جاري تحديث كافة الأصناف والحسابات والمعاملات... ⏳', 'warning');
        await processOfflineQueue();
        await pullMasterData();
        renderSettingsView();
        renderDashboard();
        showToast('تمت المزامنة الشاملة وتحديث الذاكرة بنجاح! 🚀', 'success');
    }

    function connectBluetoothPrinter() {
        if (!navigator.bluetooth) {
            alert('خاصية Web Bluetooth غير مدعومة في متصفحك الحالي، يمكنك مشاركة الفاتورة عبر واتساب أو استخدام متصفح Chrome.');
            return;
        }
        showToast('جاري البحث عن طابعات بلوتوث قريبة... 🖨️', 'info');
        navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        }).then(device => {
            showToast(`تم العثور على الطابعة (${device.name || 'طابعة بلوتوث'}) بنجاح! ✅`, 'success');
        }).catch(err => {
            console.warn('Bluetooth pairing:', err);
            showToast('تم إغلاق نافذة البحث عن الطابعة', 'info');
        });
    }

    function testPrintReceipt() {
        const shop = State.shopName || 'بَيَان فاشون';
        const sampleText = `==============================\n      ${shop}\n==============================\nرقم الفاتورة: #TEST-001\nالتاريخ: ${new Date().toLocaleDateString('ar-EG')}\n\nالصنف: فستان كلاسيك 1x\nالسعر: 450 ج.م\n==============================\nالإجمالي: 450 ج.م\nشكراً لزيارتكم!\n==============================\n\n\n`;
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(`<pre style="font-size:16px; font-weight:bold; font-family:monospace; text-align:center;">${sampleText}</pre>`);
            win.document.close();
            win.print();
        } else {
            showToast('تم تجهيز إيصال الاختبار بنجاح 🖨️', 'success');
        }
    }

    // ============================================================
    // 📦 INSTANT MOBILE STOCKTAKE ENGINE
    // ============================================================
    State.stocktakeWarehouse = localStorage.getItem('bayan_mob_active_warehouse') || 'المخزن الرئيسي';
    State.stocktakeActiveProduct = null;
    State.stocktakeInitialQty = 0;
    State.stocktakeSessionLog = [];

    function openStocktakeModal() {
        const modal = document.getElementById('stocktakeModalOverlay');
        if (!modal) return;

        // Populate warehouses select
        const whSelect = document.getElementById('stocktakeWarehouseSelect');
        if (whSelect) {
            const whs = State.warehouses && State.warehouses.length > 0 ? State.warehouses : ['المخزن الرئيسي'];
            whSelect.innerHTML = whs.map(w => `<option value="${w}" ${w === State.stocktakeWarehouse ? 'selected' : ''}>${w}</option>`).join('');
        }

        clearStocktakeSearch();
        State.stocktakeActiveProduct = null;
        const activeBox = document.getElementById('stocktakeActiveProductBox');
        if (activeBox) activeBox.style.display = 'none';

        renderStocktakeSessionList();
        modal.classList.add('active');

        const searchInp = document.getElementById('stocktakeSearchInput');
        if (searchInp) setTimeout(() => searchInp.focus(), 250);
    }

    function closeStocktakeModal() {
        const modal = document.getElementById('stocktakeModalOverlay');
        if (modal) modal.classList.remove('active');
        clearStocktakeSearch();
    }

    function onStocktakeWarehouseChange(wh) {
        State.stocktakeWarehouse = wh || 'المخزن الرئيسي';
        if (State.stocktakeActiveProduct) {
            displayStocktakeActiveProduct(State.stocktakeActiveProduct);
        }
    }

    function onStocktakeSearchInput(query) {
        const q = String(query || '').trim().toLowerCase();
        const clearBtn = document.getElementById('stocktakeSearchClearBtn');
        if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';

        const suggList = document.getElementById('stocktakeSuggestionsList');
        if (!q) {
            if (suggList) suggList.style.display = 'none';
            return;
        }

        // Direct exact barcode match
        const exactMatch = State.products.find(p => (p.barcode && p.barcode.toLowerCase() === q) || (p.code && p.code.toLowerCase() === q));
        if (exactMatch) {
            playBarcodeBeepAndVibrate();
            selectProductForStocktake(exactMatch.id);
            if (suggList) suggList.style.display = 'none';
            return;
        }

        // Suggestions by name or barcode substring
        const matches = State.products.filter(p => {
            const name = (p.name || '').toLowerCase();
            const bar = (p.barcode || '').toLowerCase();
            return name.includes(q) || bar.includes(q);
        }).slice(0, 6);

        if (matches.length > 0 && suggList) {
            suggList.innerHTML = matches.map(m => `
                <div class="stocktake-suggestion-item" onclick="window.BayanMobile.selectProductForStocktake('${m.id}')">
                    <span>${m.name} (${m.barcode || 'بدون باركود'})</span>
                    <span style="color: var(--primary); font-size: 0.78rem;">رصيد: ${m.stock || 0}</span>
                </div>
            `).join('');
            suggList.style.display = 'block';
        } else if (suggList) {
            suggList.style.display = 'none';
        }
    }

    function clearStocktakeSearch() {
        const searchInp = document.getElementById('stocktakeSearchInput');
        if (searchInp) searchInp.value = '';
        const clearBtn = document.getElementById('stocktakeSearchClearBtn');
        if (clearBtn) clearBtn.style.display = 'none';
        const suggList = document.getElementById('stocktakeSuggestionsList');
        if (suggList) suggList.style.display = 'none';
    }

    function selectProductForStocktake(productId) {
        const product = State.products.find(p => String(p.id) === String(productId));
        if (!product) return;

        State.stocktakeActiveProduct = product;
        clearStocktakeSearch();
        displayStocktakeActiveProduct(product);
    }

    function displayStocktakeActiveProduct(product) {
        const activeBox = document.getElementById('stocktakeActiveProductBox');
        if (!activeBox) return;

        const wh = State.stocktakeWarehouse || 'المخزن الرئيسي';
        const whStocks = product.warehouseStocks || {};
        const currentWhStock = parseFloat(whStocks[wh] !== undefined ? whStocks[wh] : (product.quantity !== undefined ? product.quantity : (product.stock || 0))) || 0;
        State.stocktakeInitialQty = currentWhStock;

        activeBox.innerHTML = `
            <div class="stocktake-prod-head">
                ${product.image ? `<img src="${product.image}" class="stocktake-prod-thumb" alt="${product.name}">` : `<div class="stocktake-prod-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--primary-subtle);font-size:1.4rem;">👗</div>`}
                <div class="stocktake-prod-info">
                    <h4>${product.name || 'صنف بدون اسم'}</h4>
                    <p>🏷️ باركود: ${product.barcode || '---'} • 📁 ${product.category || 'عام'}</p>
                    <p style="color: #7c3aed; font-weight: 800; margin-top: 2px;">📦 الرصيد المسجل بمخزن (${wh}): <b>${currentWhStock} قطعة</b></p>
                </div>
            </div>

            <div class="stocktake-count-stepper">
                <button type="button" class="btn-step-stock" onclick="window.BayanMobile.stepStocktakeQty(-10)">-10</button>
                <button type="button" class="btn-step-stock" onclick="window.BayanMobile.stepStocktakeQty(-1)">-1</button>
                <input type="number" id="stocktakeCountedQtyInput" class="stocktake-qty-input" min="0" value="${currentWhStock}" oninput="window.BayanMobile.onStocktakeQtyChange()">
                <button type="button" class="btn-step-stock" onclick="window.BayanMobile.stepStocktakeQty(1)">+1</button>
                <button type="button" class="btn-step-stock" onclick="window.BayanMobile.stepStocktakeQty(10)">+10</button>
            </div>

            <div id="stocktakeDiffTag" class="stocktake-diff-tag zero">
                الفارق: لا يوجد تغيير (0 قطعة)
            </div>

            <div style="display: flex; gap: 8px;">
                <button type="button" class="btn-step-stock" style="width: auto; padding: 0 14px; font-size: 0.82rem; height: 42px; border-color: rgba(225, 29, 72, 0.3); color: #e11d48;" onclick="window.BayanMobile.setStocktakeQty(0)">
                    0 (نفد)
                </button>
                <button type="button" class="btn-complete-invoice" style="flex: 1; height: 42px; margin-top: 0; background: linear-gradient(135deg, #10b981, #059669); font-size: 0.9rem;" onclick="window.BayanMobile.submitStocktakeCount()">
                    <span>💾</span> اعتماد وحفظ الرصيد الفعلي
                </button>
            </div>
        `;
        activeBox.style.display = 'block';
    }

    function stepStocktakeQty(delta) {
        const inp = document.getElementById('stocktakeCountedQtyInput');
        if (!inp) return;
        let val = parseFloat(inp.value) || 0;
        val = Math.max(0, val + delta);
        inp.value = val;
        onStocktakeQtyChange();
    }

    function setStocktakeQty(val) {
        const inp = document.getElementById('stocktakeCountedQtyInput');
        if (!inp) return;
        inp.value = Math.max(0, val);
        onStocktakeQtyChange();
    }

    function onStocktakeQtyChange() {
        const inp = document.getElementById('stocktakeCountedQtyInput');
        const diffTag = document.getElementById('stocktakeDiffTag');
        if (!inp || !diffTag) return;

        const counted = parseFloat(inp.value) || 0;
        const initial = State.stocktakeInitialQty || 0;
        const diff = counted - initial;

        if (diff === 0) {
            diffTag.className = 'stocktake-diff-tag zero';
            diffTag.textContent = 'الفارق: لا يوجد تغيير (0 قطعة)';
        } else if (diff > 0) {
            diffTag.className = 'stocktake-diff-tag plus';
            diffTag.textContent = `الفارق: زيادة (+${diff} قطعة)`;
        } else {
            diffTag.className = 'stocktake-diff-tag minus';
            diffTag.textContent = `الفارق: عجز (${diff} قطعة)`;
        }
    }

    async function submitStocktakeCount() {
        const p = State.stocktakeActiveProduct;
        if (!p) return;

        const inp = document.getElementById('stocktakeCountedQtyInput');
        const counted = parseFloat(inp ? inp.value : 0) || 0;
        const wh = State.stocktakeWarehouse || 'المخزن الرئيسي';
        const initial = State.stocktakeInitialQty || 0;
        const diff = counted - initial;

        // 1. Update product warehouseStocks and total quantity
        if (!p.warehouseStocks) p.warehouseStocks = {};
        p.warehouseStocks[wh] = counted;

        // Recalculate total stock across warehouses
        const total = Object.values(p.warehouseStocks).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
        p.stock = total;
        p.quantity = total;

        safelyPersistProducts(State.products);

        // 2. Log inventory adjustment transaction
        const adjTx = {
            id: 'ADJ-' + Date.now(),
            invoiceId: 'ADJ-' + Date.now().toString().slice(-6),
            type: 'تسوية مخزنية',
            dateISO: getTodayISO(),
            timeISO: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
            product: `${p.name} (${wh})`,
            total: Math.abs(diff * (parseFloat(p.cost || p.price || 0) || 0)),
            diff: diff,
            qty: counted,
            previousQty: initial,
            warehouse: wh,
            cashier: CONFIG.DEVICE_NAME || 'بيان موبايل'
        };
        State.transactions.unshift(adjTx);
        try { localStorage.setItem(CONFIG.STORAGE_PREFIX + 'transactions', JSON.stringify(State.transactions)); } catch (e) {}

        // 3. Record session log
        State.stocktakeSessionLog.unshift({
            name: p.name,
            wh: wh,
            initial: initial,
            counted: counted,
            diff: diff,
            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        });
        renderStocktakeSessionList();

        // 4. Sync product to Supabase
        const currentShopId = State.shopId || CONFIG.SHOP_ID || '';
        const sbRow = {
            id: `${currentShopId}_PROD_${p.id}`,
            name: p.name,
            barcode: p.barcode,
            category: p.category,
            stock: p.stock,
            image: p.image || null,
            raw_json: { ...p, localId: p.id, shop_id: currentShopId },
            updated_at: new Date().toISOString()
        };

        if (navigator.onLine) {
            fetch(`${SUPABASE_CONFIG.url}/rest/v1/products?on_conflict=id`, {
                method: 'POST',
                headers: getSupabaseHeaders(),
                body: JSON.stringify([sbRow])
            }).catch(() => {
                enqueueOfflineItem({ id: 'PROD_ST_' + p.id, prodBatch: [sbRow], createdAt: new Date().toISOString() });
            });
        } else {
            enqueueOfflineItem({ id: 'PROD_ST_' + p.id, prodBatch: [sbRow], createdAt: new Date().toISOString() });
        }

        playBarcodeBeepAndVibrate();
        showToast(`تم تحديث رصيد (${p.name}) إلى (${counted}) قطعة بنجاح! 📦✅`, 'success');

        // Reset active box and re-render views
        renderProducts();
        renderDashboard();
        const activeBox = document.getElementById('stocktakeActiveProductBox');
        if (activeBox) activeBox.style.display = 'none';
        State.stocktakeActiveProduct = null;
    }

    function renderStocktakeSessionList() {
        const listEl = document.getElementById('stocktakeSessionList');
        const countTag = document.getElementById('stocktakeSessionCount');
        if (!listEl) return;

        if (countTag) countTag.textContent = `${State.stocktakeSessionLog.length} أصناف`;

        if (State.stocktakeSessionLog.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--text-dim); font-size: 0.82rem;">
                    امسح باركود الصنف أو ابحث عنه للبدء في جرد الرصيد الفعلي 📦
                </div>
            `;
            return;
        }

        listEl.innerHTML = State.stocktakeSessionLog.map(item => {
            const sign = item.diff > 0 ? `+${item.diff}` : `${item.diff}`;
            const color = item.diff === 0 ? 'var(--emerald)' : (item.diff > 0 ? '#2563eb' : '#e11d48');
            return `
                <div class="stocktake-session-item">
                    <div>
                        <b>${item.name}</b>
                        <div style="font-size: 0.72rem; color: var(--text-dim);">${item.wh} • ${item.time}</div>
                    </div>
                    <div style="text-align: left;">
                        <span style="font-weight: 900; font-family: monospace;">${item.counted} قطعة</span>
                        <div style="font-size: 0.72rem; font-weight: 800; color: ${color};">(${sign})</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function triggerStocktakeCameraScan() {
        const fileInput = document.getElementById('stocktakeCameraInput');
        if (fileInput) fileInput.click();
    }

    async function handleStocktakeCameraFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        showToast('جاري قراءة الباركود بكاميرا الهاتف 📷...', 'info');
        if ('BarcodeDetector' in window) {
            try {
                const detector = new window.BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a'] });
                const bitmap = await createImageBitmap(file);
                const barcodes = await detector.detect(bitmap);
                if (barcodes && barcodes.length > 0) {
                    const rawVal = barcodes[0].rawValue;
                    playBarcodeBeepAndVibrate();
                    showToast(`تم التقاط الباركود: ${rawVal} 🎯`, 'success');
                    onStocktakeSearchInput(rawVal);
                    return;
                }
            } catch (e) {}
        }
        const manual = prompt('أدخل الباركود أو اسم الصنف للجرد:');
        if (manual && manual.trim()) {
            onStocktakeSearchInput(manual.trim());
        }
    }

    // ============================================================
    // ☁️ CLOUD & LOCAL BACKUP ENGINE
    // ============================================================
    async function createCloudBackup() {
        const shopId = State.shopId || CONFIG.SHOP_ID || 'SHOP_DEFAULT';
        const timestamp = new Date().toISOString();
        const backupData = {
            version: '5.1.5',
            shop_id: shopId,
            shop_name: State.shopName || CONFIG.SHOP_NAME,
            timestamp: timestamp,
            productsCount: State.products.length,
            transactionsCount: State.transactions.length,
            accountsCount: State.accounts.length
        };

        showToast('جاري إنشاء ورفع النسخة الاحتياطية للسحابة ⏳...', 'info');

        try {
            await fetch(`${SUPABASE_CONFIG.url}/rest/v1/store_profiles?on_conflict=shop_id`, {
                method: 'POST',
                headers: getSupabaseHeaders(),
                body: JSON.stringify([{
                    shop_id: shopId,
                    shop_name: State.shopName || CONFIG.SHOP_NAME,
                    raw_json: {
                        lastBackup: timestamp,
                        backupSummary: backupData
                    },
                    updated_at: timestamp
                }])
            });

            const backupTimeStr = new Date().toLocaleString('ar-EG');
            localStorage.setItem('bayan_mob_last_backup_time', backupTimeStr);
            const labelEl = document.getElementById('lastBackupTimeText');
            if (labelEl) labelEl.textContent = `آخر نسخة سحابية: ${backupTimeStr} ✅`;

            showToast('تم رفع النسخة الاحتياطية وحفظها بالسحابة بنجاح! ☁️🎉', 'success');
        } catch (err) {
            console.error('[CloudBackup] Error:', err);
            downloadLocalBackupJSON();
            showToast('تم تحميل النسخة الاحتياطية محلياً على هاتفك ✅', 'info');
        }
    }

    function downloadLocalBackupJSON() {
        const shopId = State.shopId || CONFIG.SHOP_ID || 'SHOP';
        const dateStr = getTodayISO();
        const backupData = {
            system: 'BAYAN POS FASHION',
            version: '5.1.5',
            shop_id: shopId,
            shop_name: State.shopName || CONFIG.SHOP_NAME,
            exported_at: new Date().toISOString(),
            products: State.products,
            transactions: State.transactions,
            accounts: State.accounts,
            vouchers: State.vouchers,
            settings: State.settings
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Bayan_POS_Backup_${shopId}_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        const backupTimeStr = new Date().toLocaleString('ar-EG');
        localStorage.setItem('bayan_mob_last_backup_time', backupTimeStr);
        const labelEl = document.getElementById('lastBackupTimeText');
        if (labelEl) labelEl.textContent = `آخر تحميل محلي: ${backupTimeStr} 💾`;

        showToast('تم تنزيل ملف النسخة الاحتياطية الكامل بنجاح 💾✨', 'success');
    }

    function restoreBackupFromFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!parsed || (!parsed.products && !parsed.transactions && !parsed.accounts)) {
                    showToast('ملف النسخة الاحتياطية غير صالح أو تالف ⚠️', 'error');
                    return;
                }

                const confirmRestore = confirm(`هل أنت متأكد من استعادة هذه النسخة الاحتياطية؟\nتحتوي على (${(parsed.products||[]).length}) أصناف، و(${(parsed.transactions||[]).length}) حركات.`);
                if (!confirmRestore) return;

                if (Array.isArray(parsed.products) && parsed.products.length > 0) {
                    State.products = parsed.products;
                    safelyPersistProducts(State.products);
                }
                if (Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
                    State.transactions = parsed.transactions;
                    try { localStorage.setItem(CONFIG.STORAGE_PREFIX + 'transactions', JSON.stringify(State.transactions)); } catch (err) {}
                }
                if (Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
                    State.accounts = parsed.accounts;
                    State.customers = parsed.accounts;
                    try {
                        localStorage.setItem(CONFIG.STORAGE_PREFIX + 'accounts', JSON.stringify(State.accounts));
                        localStorage.setItem(CONFIG.STORAGE_PREFIX + 'customers', JSON.stringify(State.customers));
                    } catch (err) {}
                }

                updateCategoriesList();
                renderProducts();
                renderDashboard();
                renderAccountsView();

                showToast('تمت استعادة كافة البيانات وتحديث الشاشات بنجاح! 🎉📦', 'success');
            } catch (err) {
                console.error('[RestoreBackup] Error:', err);
                showToast('حدث خطأ أثناء قراءة ملف النسخة الاحتياطية ❌', 'error');
            }
        };
        reader.readAsText(file);
    }

    // ============================================================
    // 📸 LUXURY RECEIPT IMAGE CAPTURE & WHATSAPP SHARING
    // ============================================================
    function openReceiptImageModal(txOrId) {
        let tx = null;
        if (typeof txOrId === 'object' && txOrId !== null) {
            tx = txOrId;
        } else if (txOrId) {
            tx = State.transactions.find(t => String(t.invoiceId) === String(txOrId) || String(t.id) === String(txOrId));
        }

        if (!tx && State.transactions.length > 0) {
            tx = State.transactions[0];
        }

        if (!tx) {
            showToast('لم يتم العثور على بيانات الفاتورة', 'error');
            return;
        }

        window._currentReceiptTx = tx;

        // Retrieve shop profile settings
        let storedSettings = {};
        try {
            storedSettings = JSON.parse(localStorage.getItem('bayan_mob_settings') || '{}');
        } catch (e) { }

        const shopName = storedSettings.shop_name || State.shopName || 'بَيَان فاشون';
        const shopPhone = storedSettings.shop_phone || '';
        const shopAddr = storedSettings.shop_address || '';
        const policyMsg = storedSettings.invoice_footer || 'الاستبدال والاسترجاع خلال 14 يوماً بالفاتورة وبحالة القطعة الأصلية. شكراً لزيارتكم! ✨';

        // Populate receipt modal fields
        const rcShopName = document.getElementById('rcShopName');
        const rcShopDetails = document.getElementById('rcShopDetails');
        const rcShopContact = document.getElementById('rcShopContact');
        const rcInvoiceId = document.getElementById('rcInvoiceId');
        const rcDate = document.getElementById('rcDate');
        const rcCustomer = document.getElementById('rcCustomer');
        const rcWarehouse = document.getElementById('rcWarehouse');
        const rcItemsBody = document.getElementById('rcItemsBody');
        const rcSubtotal = document.getElementById('rcSubtotal');
        const rcGrandTotal = document.getElementById('rcGrandTotal');
        const rcMethodBadge = document.getElementById('rcMethodBadge');
        const rcDeferredRow = document.getElementById('rcDeferredRow');
        const rcRemaining = document.getElementById('rcRemaining');
        const rcPolicyMessage = document.getElementById('rcPolicyMessage');

        if (rcShopName) rcShopName.textContent = shopName;
        if (rcShopDetails) rcShopDetails.textContent = 'أرقى صيحات الموضة والأزياء';
        if (rcShopContact) {
            const contactParts = [];
            if (shopPhone) contactParts.push(`📞 ${shopPhone}`);
            if (shopAddr) contactParts.push(`📍 ${shopAddr}`);
            rcShopContact.textContent = contactParts.join(' • ') || '📞 خدمة العملاء والمبيعات';
        }

        const invId = tx.invoiceId || tx.id;
        if (rcInvoiceId) rcInvoiceId.textContent = '#' + invId;

        const dateStr = tx.date ? (new Date(tx.date).toLocaleDateString('ar-EG') + ' ' + new Date(tx.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })) : new Date().toLocaleDateString('ar-EG');
        if (rcDate) rcDate.textContent = dateStr;

        if (rcCustomer) rcCustomer.textContent = tx.partner || 'عميل نقدي';
        if (rcWarehouse) rcWarehouse.textContent = tx.warehouse || State.activeWarehouse || 'المخزن الرئيسي';

        // Populate items
        const allItems = (Array.isArray(tx.items) && tx.items.length > 0)
            ? tx.items
            : (Array.isArray(tx.raw_items) && tx.raw_items.length > 0 ? tx.raw_items : [tx]);

        if (rcItemsBody) {
            rcItemsBody.innerHTML = allItems.map(it => {
                const name = it.name || it.product || 'صنف';
                const size = it.size && it.size !== 'عادي' ? it.size : '';
                const color = it.color && it.color !== 'عام' ? it.color : '';
                const variantTag = (size || color) ? `<div style="font-size: 0.7rem; color: #64748b;">${size} ${color ? '• ' + color : ''}</div>` : '';
                const qty = parseFloat(it.quantity || it.qty || 1);
                const price = parseFloat(it.price || 0);
                const itemTotal = parseFloat(it.total || (qty * price) || 0);

                return `
                    <tr>
                        <td style="text-align: right; padding: 6px 4px;">
                            <div style="font-weight: 700; color: #0f172a;">${name}</div>
                            ${variantTag}
                        </td>
                        <td style="text-align: center; font-weight: 800; font-family: monospace; padding: 6px 4px;">${qty}</td>
                        <td style="text-align: left; font-family: monospace; padding: 6px 4px;">${price.toFixed(1)}</td>
                        <td style="text-align: left; font-weight: 800; font-family: monospace; padding: 6px 4px;">${itemTotal.toFixed(1)}</td>
                    </tr>
                `;
            }).join('');
        }

        const totalVal = parseFloat(tx.total || tx.finalTotal || 0);
        if (rcSubtotal) rcSubtotal.textContent = totalVal.toLocaleString('ar-EG') + ' ج.م';
        if (rcGrandTotal) rcGrandTotal.textContent = totalVal.toLocaleString('ar-EG') + ' ج.م';

        const method = tx.paymentMethod || tx.method || 'كاش';
        if (rcMethodBadge) {
            rcMethodBadge.textContent = method + (method === 'كاش' ? ' 💵' : (method === 'فيزا' ? ' 💳' : ' ⏳'));
        }

        const remVal = parseFloat(tx.remaining || tx.deferred || 0);
        if (rcDeferredRow) {
            rcDeferredRow.style.display = remVal > 0 ? 'flex' : 'none';
        }
        if (rcRemaining) {
            rcRemaining.textContent = remVal.toLocaleString('ar-EG') + ' ج.م';
        }

        if (rcPolicyMessage) {
            rcPolicyMessage.textContent = policyMsg;
        }

        const modal = document.getElementById('receiptImageModalOverlay');
        if (modal) modal.classList.add('active');
    }

    function closeReceiptImageModal() {
        const modal = document.getElementById('receiptImageModalOverlay');
        if (modal) modal.classList.remove('active');
    }

    async function captureReceiptCanvas() {
        const card = document.getElementById('receiptCardToCapture');
        if (!card) return null;
        if (typeof html2canvas === 'function') {
            try {
                return await html2canvas(card, {
                    scale: 2,
                    backgroundColor: '#ffffff',
                    useCORS: true,
                    logging: false
                });
            } catch (err) {
                console.warn('html2canvas error, drawing canvas fallback:', err);
            }
        }
        return null;
    }

    async function shareReceiptAsImage() {
        showToast('جاري تجهيز صورة الفاتورة للمشاركة... ⏳', 'info');
        try {
            const canvas = await captureReceiptCanvas();
            if (!canvas) {
                showToast('تعذر إنشاء صورة الفاتورة، سيتم فتح الواتساب نصياً 📲', 'warning');
                shareReceiptAsText();
                return;
            }

            const tx = window._currentReceiptTx;
            const invId = tx ? (tx.invoiceId || tx.id) : 'MOB-INV';
            const fileName = `فاتورة_${invId}.png`;

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    shareReceiptAsText();
                    return;
                }

                const file = new File([blob], fileName, { type: 'image/png' });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        const shopName = State.settings?.shop_name || State.shopName || 'بَيَان فاشون';
                        await navigator.share({
                            title: `فاتورة مشتريات #${invId}`,
                            text: `🧾 فاتورة مشترياتك من ${shopName} (#${invId})`,
                            files: [file]
                        });
                        showToast('تمت مشاركة الفاتورة بنجاح! ✅', 'success');
                        return;
                    } catch (shareErr) {
                        if (shareErr.name === 'AbortError') return;
                        console.warn('Share file aborted:', shareErr);
                    }
                }

                // Fallback for devices where files cannot be directly shared via navigator.share:
                downloadReceiptImage(canvas);
                setTimeout(() => {
                    showToast('تم حفظ صورة الفاتورة! جاري فتح الواتساب... 📲', 'success');
                    shareReceiptAsText();
                }, 600);

            }, 'image/png');

        } catch (err) {
            console.error('Share receipt error:', err);
            showToast('حدث خطأ أثناء تجهيز الصورة، جاري الفتح نصياً', 'warning');
            shareReceiptAsText();
        }
    }

    async function downloadReceiptImage(existingCanvas) {
        showToast('جاري حفظ صورة الفاتورة... ⏳', 'info');
        const canvas = existingCanvas || await captureReceiptCanvas();
        if (!canvas) {
            showToast('تعذر إنشاء صورة الفاتورة', 'error');
            return;
        }

        const tx = window._currentReceiptTx;
        const invId = tx ? (tx.invoiceId || tx.id) : 'MOB-INV';
        const a = document.createElement('a');
        a.download = `فاتورة_${invId}.png`;
        a.href = canvas.toDataURL('image/png');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('تم حفظ صورة الفاتورة في جهازك بنجاح! 💾', 'success');
    }

    function shareReceiptAsText() {
        const tx = window._currentReceiptTx;
        if (!tx) return;
        shareInvoiceWhatsApp(tx.invoiceId || tx.id, tx.total || tx.finalTotal, tx.partner);
    }

    // ============================================================
    // 👤 CUSTOMER MANAGEMENT & AUTOCOMPLETE
    // ============================================================
    function cleanArabic(str) {
        return (str || '')
            .trim()
            .toLowerCase()
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/[ىي]/g, 'ي')
            .replace(/[ًٌٍَُِّْ]/g, '')
            .replace(/\s+/g, ' ');
    }

    function onCustomerInput(val) {
        State.selectedCustomer = val;
        const badge = document.getElementById('posCustomerBadge');
        const isCash = (!val.trim() || val.trim() === 'عميل نقدي');
        if (badge) {
            badge.textContent = isCash ? 'نقدي' : 'عميل مميز 🌟';
            badge.style.background = isCash ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)';
            badge.style.color = isCash ? 'var(--emerald)' : 'var(--primary)';
        }
        renderCustomerDropdown(val);
    }

    function onCustomerFocus() {
        const input = document.getElementById('posCustomerInput');
        if (input && input.value.trim() === 'عميل نقدي') {
            input.select();
        }
        // عرض قائمة العملاء فوراً بمجرد الضغط
        renderCustomerDropdown('');
    }

    function renderCustomerDropdown(query = '') {
        const dropdown = document.getElementById('posCustomerDropdown');
        if (!dropdown) return;

        const cleanQ = cleanArabic(query);
        const isDefault = !cleanQ || cleanQ === cleanArabic('عميل نقدي');

        let allCustomers = Array.isArray(State.customers) ? State.customers : [];
        let filtered = allCustomers;

        if (!isDefault) {
            filtered = allCustomers.filter(c => {
                const cName = cleanArabic(c.name);
                const cMobile = String(c.mobile || '').replace(/\D/g, '');
                const cCode = String(c.code || c.id || '');
                return cName.includes(cleanQ) || cMobile.includes(cleanQ) || cCode.includes(cleanQ);
            });
        }

        let html = '';

        // خيار البيع بالاسم المكتوب إذا لم يكن مطابقاً لعميل نقدي
        if (!isDefault && query.trim()) {
            const trimmedQuery = query.trim();
            const exactMatch = allCustomers.some(c => cleanArabic(c.name) === cleanQ);
            if (!exactMatch) {
                html += `
                    <div class="customer-dropdown-item" style="background: rgba(99, 102, 241, 0.08); border-right: 4px solid var(--primary);" onclick="window.BayanMobile.selectCustomer('${trimmedQuery.replace(/'/g, "\\'")}')">
                        <div>
                            <div class="c-name" style="color: var(--primary);">➕ بيع باسم: "${trimmedQuery}"</div>
                            <div class="c-meta">تسجيل هذا الاسم على الفاتورة الحالية مباشرة</div>
                        </div>
                        <span style="font-size: 0.72rem; color: var(--primary); font-weight: 800;">تسجيل سريع ✨</span>
                    </div>
                `;
            }
        }

        // خيار عميل نقدي الافتراضي
        html += `
            <div class="customer-dropdown-item" onclick="window.BayanMobile.selectCustomer('عميل نقدي')">
                <div>
                    <div class="c-name">💵 عميل نقدي (افتراضي)</div>
                    <div class="c-meta">بيع سريع بدون تسجيل اسم أو مديونية</div>
                </div>
            </div>
        `;

        // عرض قائمة العملاء
        if (filtered.length > 0) {
            html += filtered.slice(0, 15).map(c => {
                const bal = parseFloat(c.balance) || 0;
                let balBadge = '<span class="c-bal-pill bal-zero">خالص ✅</span>';
                if (bal > 0) {
                    balBadge = `<span class="c-bal-pill bal-debt">🔴 عليه: ${bal.toLocaleString('ar-EG')} ج.م</span>`;
                } else if (bal < 0) {
                    balBadge = `<span class="c-bal-pill bal-credit">🟢 له: ${Math.abs(bal).toLocaleString('ar-EG')} ج.م</span>`;
                }

                return `
                    <div class="customer-dropdown-item" onclick="window.BayanMobile.selectCustomer('${c.name.replace(/'/g, "\\'")}')">
                        <div>
                            <div class="c-name">👤 ${c.name}</div>
                            <div class="c-meta">${c.mobile ? '📱 ' + c.mobile : (c.code ? 'كود: ' + c.code : 'عميل مسجل بالبرنامج')}</div>
                        </div>
                        <div style="font-size: 0.72rem; font-weight: 800; text-align: left;">
                            ${balBadge}
                        </div>
                    </div>
                `;
            }).join('');
        } else if (!isDefault && query.trim()) {
            html += `
                <div style="padding: 10px 14px; text-align: center; color: var(--text-dim); font-size: 0.78rem;">
                    لا يوجد عميل مسجل باسم "${query}"، يمكنك الضغط على "بيع باسم: ${query}" بالأعلى ☝️
                </div>
            `;
        }

        dropdown.innerHTML = html;
        dropdown.classList.add('active');
    }

    function selectCustomer(name) {
        const input = document.getElementById('posCustomerInput');
        const badge = document.getElementById('posCustomerBadge');
        const dropdown = document.getElementById('posCustomerDropdown');
        const banner = document.getElementById('posCustomerBalanceBanner');
        const cleanName = (name || '').trim() || 'عميل نقدي';
        if (input) input.value = cleanName;
        const isCash = (cleanName === 'عميل نقدي');

        let foundCust = null;
        if (!isCash && Array.isArray(State.customers)) {
            const cleanTarget = cleanArabic(cleanName);
            foundCust = State.customers.find(c => c && cleanArabic(c.name) === cleanTarget);
        }

        if (badge) {
            badge.textContent = isCash ? 'نقدي' : 'عميل مسجل 👤';
            badge.style.background = isCash ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)';
            badge.style.color = isCash ? 'var(--emerald)' : 'var(--primary)';
        }

        if (banner) {
            if (foundCust) {
                const bal = parseFloat(foundCust.balance) || 0;
                if (bal < 0) {
                    const amt = Math.abs(bal).toLocaleString('ar-EG');
                    banner.className = 'customer-balance-banner credit';
                    banner.innerHTML = `<span>🟢 العميل له رصيد سابق (دائن بالمحل):</span> <b style="font-family: monospace; font-size: 0.95rem;">${amt} ج.م</b>`;
                    banner.style.display = 'flex';
                } else if (bal > 0) {
                    const amt = bal.toLocaleString('ar-EG');
                    banner.className = 'customer-balance-banner debt';
                    banner.innerHTML = `<span>🔴 العميل عليه مديونية سابقة (مدين):</span> <b style="font-family: monospace; font-size: 0.95rem;">${amt} ج.م</b>`;
                    banner.style.display = 'flex';
                } else {
                    banner.className = 'customer-balance-banner zero';
                    banner.innerHTML = `<span>✅ حساب العميل خالص تماماً:</span> <b style="font-family: monospace;">0.00 ج.م</b>`;
                    banner.style.display = 'flex';
                }
            } else {
                banner.style.display = 'none';
            }
        }

        State.selectedCustomer = cleanName;
        if (dropdown) dropdown.classList.remove('active');
        renderCartView();
    }

    function resetCustomer() {
        const input = document.getElementById('posCustomerInput');
        const banner = document.getElementById('posCustomerBalanceBanner');
        if (banner) banner.style.display = 'none';
        if (input) {
            input.value = '';
            input.focus();
            renderCustomerDropdown('');
        }
        State.selectedCustomer = 'عميل نقدي';
        renderCartView();
    }

    function onOutStockClicked(size = '', color = '') {
        const sText = size ? `مقاس (${size})` : 'هذا المقاس';
        const cText = color ? `لون (${color})` : '';
        showToast(`عفواً! ${sText} ${cText} نفد من المخزن تماماً (رصيد 0) ❌`, 'error');
    }

    // ============================================================
    // 👥 ACCOUNTS & PARTNERS LOGIC (العملاء والموردين وكشوف الحساب)
    // ============================================================
    function renderAccountsView() {
        const listEl = document.getElementById('accountsList');
        if (!listEl) return;

        const allAccs = Array.isArray(State.accounts) && State.accounts.length > 0
            ? State.accounts
            : (Array.isArray(State.customers) ? State.customers : []);

        // 1. حساب الإحصائيات العامة للأرصدة والديون
        let totalClientsDebt = 0;       // مديونيات لنا (على العملاء)
        let totalClientsCredit = 0;     // أرصدة دائنة للعملاء (علينا)
        let totalSuppliersCredit = 0;   // مستحقات للموردين (علينا)
        let totalSuppliersDebt = 0;     // مديونيات على الموردين (لنا)
        let clientCount = 0;
        let supplierCount = 0;

        allAccs.forEach(a => {
            if (!a || !a.name) return;
            const bal = parseFloat(a.balance) || 0;
            const rawType = String(a.type || '').toLowerCase();
            const isSupp = (rawType === 'supplier' || rawType.includes('مورد') || String(a.typeLabel || '').includes('مورد'));
            if (isSupp) {
                supplierCount++;
                if (bal > 0) totalSuppliersCredit += bal;
                else if (bal < 0) totalSuppliersDebt += Math.abs(bal);
            } else {
                clientCount++;
                if (bal > 0) totalClientsDebt += bal;
                else if (bal < 0) totalClientsCredit += Math.abs(bal);
            }
        });

        const elTotalClientsDebt = document.getElementById('statTotalClientsDebt');
        const elTotalSuppliersCredit = document.getElementById('statTotalSuppliersCredit');
        const elAccountsTotalCount = document.getElementById('accountsTotalCountChip');

        if (elTotalClientsDebt) elTotalClientsDebt.textContent = totalClientsDebt.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        if (elTotalSuppliersCredit) elTotalSuppliersCredit.textContent = totalSuppliersCredit.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        if (elAccountsTotalCount) elAccountsTotalCount.textContent = `${allAccs.length} حساب (${clientCount} عميل • ${supplierCount} مورد)`;

        // 2. تطبيق البحث والفلترة
        const q = cleanArabic(State.accountSearchQuery || '');
        const filter = State.accountFilter || 'all';

        let filtered = allAccs.filter(a => {
            if (!a || !a.name) return false;
            const rawType = String(a.type || '').toLowerCase();
            const isSupp = (rawType === 'supplier' || rawType.includes('مورد') || String(a.typeLabel || '').includes('مورد'));
            const bal = parseFloat(a.balance) || 0;

            // فلتر النوع والحالة
            if (filter === 'clients' && isSupp) return false;
            if (filter === 'suppliers' && !isSupp) return false;
            if (filter === 'debt' && bal <= 0) return false;
            if (filter === 'credit' && bal >= 0) return false;

            // فلتر البحث
            if (!q) return true;
            const name = cleanArabic(a.name);
            const phone = String(a.mobile || a.phone || '').replace(/\D/g, '');
            const code = String(a.code || a.id || '');
            return name.includes(q) || phone.includes(q) || code.includes(q);
        });

        // 3. الترتيب الذكي: أصحاب المديونيات والأرصدة الكبيرة أولاً ثم الترتيب الأبجدي
        filtered.sort((a, b) => {
            const balA = Math.abs(parseFloat(a.balance) || 0);
            const balB = Math.abs(parseFloat(b.balance) || 0);
            if (balA !== balB) return balB - balA;
            return (a.name || '').localeCompare(b.name || '', 'ar');
        });

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div class="accounts-empty-state">
                    <div style="font-size: 2.8rem; margin-bottom: 8px;">👥</div>
                    <h4>لم يتم العثور على أي حسابات مطابقة</h4>
                    <p>يمكنك تغيير كلمات البحث أو التصنيف، أو الضغط على زر "حساب جديد" لإضافة عميل أو مورد فوراً</p>
                    <button type="button" class="btn-complete-invoice" style="max-width: 220px; margin: 16px auto 0; height: 42px; font-size: 0.88rem;" onclick="window.BayanMobile.openAddAccountModal()">
                        <span>➕</span> إضافة حساب الآن
                    </button>
                </div>
            `;
            return;
        }

        listEl.innerHTML = filtered.map(a => {
            const rawType = String(a.type || '').toLowerCase();
            const isSupp = (rawType === 'supplier' || rawType.includes('مورد') || String(a.typeLabel || '').includes('مورد'));
            const bal = parseFloat(a.balance) || 0;
            const absBal = Math.abs(bal).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const typeBadge = isSupp
                ? '<span class="acc-type-pill supplier">🏢 مورد</span>'
                : '<span class="acc-type-pill client">👤 عميل</span>';
            const avatarIcon = isSupp ? '🏢' : '👤';
            const cleanPhone = String(a.mobile || a.phone || '').trim();

            let balBoxClass = 'zero';
            let balStatusText = 'حساب خالص / متزن';
            let balIcon = '⚪';
            let balDisplayVal = '0.00 ج.م';

            if (bal > 0) {
                balBoxClass = 'debt';
                balIcon = '🔴';
                balStatusText = isSupp ? 'مستحق للمورد (علينا للمحل)' : 'مديونية مستحقة (عليه)';
                balDisplayVal = `${absBal} ج.م`;
            } else if (bal < 0) {
                balBoxClass = 'credit';
                balIcon = '🟢';
                balStatusText = isSupp ? 'مدفوع مقدماً (لنا طرف المورد)' : 'رصيد دائن متاح (له)';
                balDisplayVal = `${absBal} ج.م`;
            }

            const safeName = String(a.name || '').replace(/'/g, "\\'");
            const safePhone = cleanPhone.replace(/'/g, "\\'");

            // رابط واتساب مباشر محترف مع رصيد الحساب المحدث
            const shopTitle = State.settings?.shop_name || 'بَيَان فاشون';
            const waGreeting = `السلام عليكم يا فندم، تحياتنا من ${shopTitle} ✨%0Aنود إحاطتكم علماً بأن رصيد حسابكم المسجل طرفنا حالياً هو: (${balDisplayVal} ${balStatusText}).%0Aشكراً لتعاملكم الراقي معنا! 🌸`;
            const waLink = cleanPhone
                ? `https://wa.me/${cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone}?text=${waGreeting}`
                : `https://wa.me/?text=${waGreeting}`;

            return `
                <div class="account-card ${balBoxClass}">
                    <div class="account-card-header">
                        <div class="account-avatar ${isSupp ? 'supplier' : 'client'}">${avatarIcon}</div>
                        <div class="account-main-info">
                            <div class="account-name-row">
                                <h4 class="account-name">${a.name}</h4>
                                ${typeBadge}
                            </div>
                            <div class="account-meta-row">
                                ${cleanPhone ? `
                                <a href="tel:${cleanPhone}" class="acc-phone-badge" title="اتصال مباشر بالهاتف">
                                    <span class="phone-call-icon">📞</span>
                                    <span class="phone-num-text" dir="ltr">${cleanPhone}</span>
                                </a>` : '<span class="acc-phone-dim" style="color:var(--text-dim); opacity:0.6;">بدون هاتف</span>'}
                                ${a.code ? `<span class="acc-code">كود: ${a.code}</span>` : ''}
                                ${a.address ? `<span class="acc-address">📍 ${a.address}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="account-balance-banner ${balBoxClass}">
                        <div class="acc-bal-left">
                            <span class="acc-bal-icon">${balIcon}</span>
                            <span class="acc-bal-label">${balStatusText}:</span>
                        </div>
                        <div class="acc-bal-val ${balBoxClass}">${balDisplayVal}</div>
                    </div>

                    <div class="account-card-actions">
                        <button type="button" class="btn-acc-action statement" onclick="window.BayanMobile.openAccountStatement('${a.id || safeName}')">
                            <span>🧾</span> كشف الحساب
                        </button>
                        ${!isSupp ? `
                        <button type="button" class="btn-acc-action pos" onclick="window.BayanMobile.quickSaleForAccount('${safeName}')">
                            <span>🛒</span> بيع سريع
                        </button>
                        ` : ''}
                        <button type="button" class="btn-acc-action whatsapp" onclick="window.open('${waLink}', '_blank')">
                            <span>💬</span> واتساب
                        </button>
                        ${cleanPhone ? `
                        <a href="tel:${cleanPhone}" class="btn-acc-action call">
                            <span>📞</span> اتصال
                        </a>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function setAccountFilter(filter) {
        State.accountFilter = filter;
        document.querySelectorAll('#view-accounts .acc-pill-btn, #view-accounts .cat-chip').forEach(c => c.classList.remove('active'));
        const chipMap = {
            'all': 'accFilterAll',
            'clients': 'accFilterClients',
            'suppliers': 'accFilterSuppliers',
            'debt': 'accFilterDebt',
            'credit': 'accFilterCredit'
        };
        const activeChip = document.getElementById(chipMap[filter] || 'accFilterAll');
        if (activeChip) activeChip.classList.add('active');
        renderAccountsView();
    }

    function onAccountSearchInput(query) {
        State.accountSearchQuery = query;
        const clearBtn = document.getElementById('accountSearchClear');
        if (clearBtn) clearBtn.style.display = query.trim() ? 'flex' : 'none';
        renderAccountsView();
    }

    function clearAccountSearch() {
        const inp = document.getElementById('accountSearchInput');
        if (inp) {
            inp.value = '';
            inp.focus();
        }
        State.accountSearchQuery = '';
        const clearBtn = document.getElementById('accountSearchClear');
        if (clearBtn) clearBtn.style.display = 'none';
        renderAccountsView();
    }

    function openAccountStatement(accIdentifier) {
        const allAccs = Array.isArray(State.accounts) && State.accounts.length > 0
            ? State.accounts
            : (Array.isArray(State.customers) ? State.customers : []);
        const cleanId = String(accIdentifier || '').trim();
        const acc = allAccs.find(a => String(a.id) === cleanId || cleanArabic(a.name) === cleanArabic(cleanId));

        if (!acc) {
            showToast('لم يتم العثور على الحساب المطلوب', 'error');
            return;
        }

        const modal = document.getElementById('accountStatementModalOverlay');
        const container = document.getElementById('accountStatementContent');
        if (!modal || !container) return;

        const rawType = String(acc.type || '').toLowerCase();
        const isSupp = (rawType === 'supplier' || rawType.includes('مورد') || String(acc.typeLabel || '').includes('مورد'));
        const bal = parseFloat(acc.balance) || 0;
        const absBal = Math.abs(bal).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let balClass = 'zero';
        let balStatus = 'حساب خالص / متزن';
        if (bal > 0) {
            balClass = 'debt';
            balStatus = isSupp ? 'مستحق للمورد (علينا للمحل)' : 'مديونية مستحقة (عليه)';
        } else if (bal < 0) {
            balClass = 'credit';
            balStatus = isSupp ? 'مدفوع مقدماً (لنا طرف المورد)' : 'رصيد دائن متاح (له)';
        }

        // استخراج الفواتير والحركات الخاصة بهذا الحساب من الذاكرة
        const cleanTargetName = cleanArabic(acc.name);
        const partnerTxs = State.transactions.filter(t => cleanArabic(t.partner) === cleanTargetName);

        let totalPurchases = 0;
        let totalPaid = 0;
        partnerTxs.forEach(t => {
            const isHead = (t.isInvoiceHead || t.isInvoiceHead === undefined);
            if (isHead) {
                totalPurchases += parseFloat(t.invoiceGrandTotal || t.total || 0) || 0;
                totalPaid += parseFloat(t.paidAmount || t.paid || 0) || 0;
            }
        });

        let txsHtml = '';
        if (partnerTxs.length === 0) {
            txsHtml = `
                <div style="text-align: center; padding: 25px 10px; color: var(--text-dim); font-size: 0.85rem;">
                    لا توجد فواتير أو حركات مسجلة حديثاً بالسحابة لهذا الحساب
                </div>
            `;
        } else {
            txsHtml = partnerTxs.slice(0, 20).map(t => {
                const dateStr = t.dateISO || t.date || '';
                const tot = parseFloat(t.invoiceGrandTotal || t.total || 0);
                const paid = parseFloat(t.paidAmount || t.paid || 0);
                const rem = parseFloat(t.remaining || Math.max(0, tot - paid));
                const method = t.method || t.paymentMethod || 'كاش';
                const itemsSummary = t.product || (Array.isArray(t.items) ? t.items.map(i => i.name).slice(0, 2).join('، ') : 'فاتورة مبيعات');

                return `
                    <div class="statement-tx-card" onclick="window.BayanMobile.openInvoiceDetails('${t.invoiceId || t.id}')">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-family: monospace; font-weight: 900; color: var(--primary);">#${t.invoiceId || t.id}</span>
                            <span style="font-size: 0.72rem; color: var(--text-dim);">${dateStr}</span>
                        </div>
                        <div style="font-size: 0.82rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px;">
                            ${itemsSummary}
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 800;">
                            <span style="color: var(--text-dim);">طريقة السداد: <b>${getPayMethodLabel(method)}</b></span>
                            <span style="color: var(--gold); font-family: monospace; font-size: 0.9rem;">${tot.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        ${rem > 0 ? `
                            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--rose); font-weight: 800; margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--border-subtle);">
                                <span>المتبقي (آجل على الحساب):</span>
                                <span style="font-family: monospace;">${rem.toLocaleString('ar-EG')} ج.م</span>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }

        container.innerHTML = `
            <div class="statement-header-card ${balClass}">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 1.1rem; font-weight: 900; color: var(--text-main);">
                        ${isSupp ? '🏢' : '👤'} ${acc.name}
                    </div>
                    <span class="acc-type-pill ${isSupp ? 'supplier' : 'client'}">${isSupp ? 'مورد' : 'عميل'}</span>
                </div>
                ${acc.mobile ? `<div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 10px;">📱 ${acc.mobile}</div>` : ''}

                <div class="statement-balance-box ${balClass}">
                    <div style="font-size: 0.8rem; font-weight: 800;">${balStatus}:</div>
                    <div style="font-size: 1.45rem; font-weight: 900; font-family: monospace;">${absBal} ج.م</div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
                    <div style="background: var(--bg-card-subtle); padding: 8px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-dim);">إجمالي الفواتير</div>
                        <div style="font-size: 0.95rem; font-weight: 900; font-family: monospace; color: var(--text-main);">${totalPurchases.toLocaleString('ar-EG')} ج.م</div>
                    </div>
                    <div style="background: var(--bg-card-subtle); padding: 8px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 0.7rem; color: var(--text-dim);">إجمالي المسدد</div>
                        <div style="font-size: 0.95rem; font-weight: 900; font-family: monospace; color: var(--emerald);">${totalPaid.toLocaleString('ar-EG')} ج.م</div>
                    </div>
                </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin: 16px 4px 8px;">
                <div style="font-weight: 900; font-size: 0.9rem; color: var(--text-main);">📋 سجل الفواتير والمعاملات:</div>
                <span style="font-size: 0.75rem; color: var(--text-dim); font-weight: 800;">(${partnerTxs.length} حركة)</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto; margin-bottom: 16px;">
                ${txsHtml}
            </div>

            <div style="display: flex; gap: 8px;">
                <button type="button" class="btn-complete-invoice" style="flex: 1.2; background: linear-gradient(135deg, #25d366, #128c7e); box-shadow: 0 4px 14px rgba(37,211,102,0.3); font-size: 0.88rem;" onclick="window.BayanMobile.shareAccountStatementWhatsApp('${acc.name.replace(/'/g, "\\'")}', '${absBal}', '${balStatus}')">
                    <span>📲</span> مشاركة على واتساب
                </button>
                <button type="button" class="btn-complete-invoice" style="flex: 0.6; background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); box-shadow: none;" onclick="window.BayanMobile.closeAccountStatement()">
                    إغلاق
                </button>
            </div>
        `;

        modal.classList.add('active');
    }

    function closeAccountStatement() {
        const modal = document.getElementById('accountStatementModalOverlay');
        if (modal) modal.classList.remove('active');
    }

    function shareAccountStatementWhatsApp(accName, balanceStr, statusText) {
        const shopTitle = State.settings?.shop_name || 'بَيَان فاشون';
        const msg = `🧾 *كشف حساب من ${shopTitle}*%0A👤 الحساب: ${accName}%0A🕒 التاريخ: ${new Date().toLocaleDateString('ar-EG')}%0A%0A💰 *الرصيد الحالي:* ${balanceStr} ج.م%0A📌 *حالة الحساب:* ${statusText}%0A%0Aشكراً لتعاملكم الراقي معنا! ✨`;
        window.open(`https://wa.me/?text=${msg}`, '_blank');
    }

    function quickSaleForAccount(accName) {
        selectCustomer(accName);
        switchTab('pos');
        showToast(`تم فتح سلة البيع وتحديد العميل (${accName}) بنجاح 🛒`, 'info');
    }

    function openAddAccountModal() {
        const modal = document.getElementById('addAccountModalOverlay');
        if (!modal) return;
        const nameInp = document.getElementById('newAccName');
        const mobileInp = document.getElementById('newAccMobile');
        const addressInp = document.getElementById('newAccAddress');
        const balInp = document.getElementById('newAccBalance');
        const balType = document.getElementById('newAccBalanceType');

        if (nameInp) nameInp.value = '';
        if (mobileInp) mobileInp.value = '';
        if (addressInp) addressInp.value = '';
        if (balInp) balInp.value = '0';
        if (balType) balType.value = 'zero';

        onAccountTypeChange('client');
        modal.classList.add('active');
        if (nameInp) setTimeout(() => nameInp.focus(), 250);
    }

    function closeAddAccountModal() {
        const modal = document.getElementById('addAccountModalOverlay');
        if (modal) modal.classList.remove('active');
    }

    function onAccountTypeChange(type) {
        const labelClient = document.getElementById('accTypeLabelClient');
        const labelSupplier = document.getElementById('accTypeLabelSupplier');
        if (labelClient) labelClient.classList.toggle('active', type === 'client');
        if (labelSupplier) labelSupplier.classList.toggle('active', type === 'supplier');
    }

    async function submitNewAccount() {
        const nameInp = document.getElementById('newAccName');
        const mobileInp = document.getElementById('newAccMobile');
        const typeInp = document.querySelector('input[name="newAccType"]:checked');
        const addressInp = document.getElementById('newAccAddress');
        const balInp = document.getElementById('newAccBalance');
        const balTypeInp = document.getElementById('newAccBalanceType');
        const btnSave = document.getElementById('btnSaveNewAccount');

        const name = (nameInp?.value || '').trim();
        if (!name) {
            showToast('يرجى كتابة اسم العميل أو المورد ⚠️', 'warning');
            nameInp?.focus();
            return;
        }

        const type = typeInp ? typeInp.value : 'client';
        const mobile = (mobileInp?.value || '').trim();
        const address = (addressInp?.value || '').trim();
        let rawBal = parseFloat(balInp?.value || 0) || 0;
        let finalBal = 0;
        if (balTypeInp && balTypeInp.value === 'credit') {
            finalBal = -Math.abs(rawBal);
        } else if (balTypeInp && balTypeInp.value === 'debt') {
            finalBal = Math.abs(rawBal);
        }

        const newAcc = {
            id: String(Date.now()),
            name: name,
            code: String(Math.floor(1000 + Math.random() * 9000)),
            type: type,
            typeLabel: type === 'supplier' ? 'مورد' : 'عميل',
            mobile: mobile,
            address: address,
            balance: finalBal,
            created_at: new Date().toISOString()
        };

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '⏳ جاري الحفظ والترحيل...';
        }

        try {
            // 1. إضافة الحساب محلياً فوراً
            State.accounts.unshift(newAcc);
            State.customers = State.accounts;
            try {
                localStorage.setItem(CONFIG.STORAGE_PREFIX + 'accounts', JSON.stringify(State.accounts));
                localStorage.setItem(CONFIG.STORAGE_PREFIX + 'customers', JSON.stringify(State.customers));
            } catch (e) { }

            renderAccountsView();

            // 2. ترحيل الحساب للسحابة مع عزل المتجر
            const currentShopId = State.shopId || CONFIG.SHOP_ID || '';
            if (isValidPairedShop(currentShopId)) {
                const payload = [
                    {
                        id: `CONFIG_CUSTOMERS_LIST_${currentShopId}`,
                        date: new Date().toISOString(),
                        category: 'customers',
                        amount: State.accounts.length,
                        user_name: 'تابلت',
                        warehouse: 'المخزن الرئيسي',
                        raw_json: {
                            shop_id: currentShopId,
                            customers: State.accounts,
                            accounts: State.accounts,
                            updatedAt: new Date().toISOString()
                        }
                    }
                ];

                if (!navigator.onLine) {
                    enqueueOfflineItem({ id: 'CONFIG_CUSTOMERS_' + Date.now(), custPayload: payload, createdAt: new Date().toISOString() });
                    showToast(`✅ تم حفظ ${type === 'supplier' ? 'المورد' : 'العميل'} (${name}) محلياً وفي طابور المزامنة التلقائية ⚡`, 'info');
                } else {
                    fetch(`${SUPABASE_CONFIG.url}/rest/v1/treasury_audit?on_conflict=id`, {
                        method: 'POST',
                        headers: getSupabaseHeaders(),
                        body: JSON.stringify(payload)
                    }).then(() => {
                        showToast(`✅ تمت إضافة ${type === 'supplier' ? 'المورد' : 'العميل'} (${name}) وترحيله بنجاح!`, 'success');
                    }).catch(() => {
                        enqueueOfflineItem({ id: 'CONFIG_CUSTOMERS_' + Date.now(), custPayload: payload, createdAt: new Date().toISOString() });
                        showToast(`تم حفظ الحساب محلياً وفي طابور المزامنة التلقائية ✅`, 'info');
                    });
                }
            }

            closeAddAccountModal();
        } catch (err) {
            console.error('Add account error:', err);
            showToast('تم حفظ الحساب محلياً في الذاكرة ✅', 'info');
            closeAddAccountModal();
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<span>💾</span> حفظ الحساب وترحيله للسحابة والماستر';
            }
        }
    }

    // ============================================================
    // 🚀 INITIALIZATION
    // ============================================================
    async function init() {
        // تطبيق فوري لبيانات المتجر المخزنة محلياً على الهيدر والإعدادات فور بدء التشغيل
        applyStoreProfileToUI();

        // Setup Search Input Listener (Debounce 200ms لمنع أي تهنيج أثناء الكتابة السريعة)
        const searchInput = document.getElementById('productSearchInput');
        if (searchInput) {
            let searchDebounceTimer = null;
            const clearBtn = document.getElementById('productSearchClearBtn');
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                State.searchQuery = val;
                if (clearBtn) {
                    clearBtn.style.display = val.trim() ? 'flex' : 'none';
                }
                if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    renderProducts();
                }, 200);
            });
        }

        // Setup Customer Input Listeners
        const custInput = document.getElementById('posCustomerInput');
        if (custInput) {
            custInput.addEventListener('input', (e) => onCustomerInput(e.target.value));
            custInput.addEventListener('focus', () => onCustomerFocus());
        }
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.customer-input-wrap')) {
                const dd = document.getElementById('posCustomerDropdown');
                if (dd) dd.classList.remove('active');
                const custInp = document.getElementById('posCustomerInput');
                if (custInp && !custInp.value.trim()) {
                    custInp.value = 'عميل نقدي';
                    State.selectedCustomer = 'عميل نقدي';
                    const badge = document.getElementById('posCustomerBadge');
                    if (badge) {
                        badge.textContent = 'نقدي';
                        badge.style.background = 'rgba(16, 185, 129, 0.15)';
                        badge.style.color = 'var(--emerald)';
                    }
                    const banner = document.getElementById('posCustomerBalanceBanner');
                    if (banner) banner.style.display = 'none';
                    renderCartView();
                }
            }
        });

        // Setup Payment Method Switcher
        document.querySelectorAll('.pay-btn-radio').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pay-btn-radio').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.selectedPayMethod = btn.dataset.method;

                // إذا اختار آجل والعميل نقدي، نوجه المؤشر فورياً لمربع العميل ونفتح القائمة!
                if (State.selectedPayMethod === 'credit') {
                    const custInp = document.getElementById('posCustomerInput');
                    if (custInp && (custInp.value.trim() === 'عميل نقدي' || !custInp.value.trim())) {
                        custInp.value = '';
                        custInp.focus();
                        renderCustomerDropdown('');
                        showToast('👇 اختر اسم العميل من القائمة بالأسفل أو اكتب اسمه لتسجيل الآجل 👤', 'info');
                    }
                }
                renderCartView();
            });
        });

        // Initialize Theme (Default Light)
        setTheme(getSavedTheme());

        // Connect & Pull Initial Data مع حارس الإقران الصارم
        if (!isValidPairedShop(State.shopId)) {
            updateConnectionStatus(false, 'في انتظار الاقتران بكود المحل 🟡');
            applyStoreProfileToUI();
            openPinModal();
        } else {
            const isOnline = await checkServerInfo();
            if (isOnline) {
                await pullMasterData();
                processOfflineQueue();
            } else {
                applyStoreProfileToUI();
            }
            startAutoSyncPoll();
        }

        if (!State.token) {
            State.token = 'PAIRED_' + CONFIG.DEVICE_ID;
            localStorage.setItem(CONFIG.STORAGE_PREFIX + 'token', State.token);
        }

        renderCurrentView();
        renderSettingsView();
    }

    // Public API
    window.BayanMobile = {
        switchTab,
        setCategory: (cat) => { State.selectedCategory = cat; updateCategoriesList(); renderProducts(); },
        openAddToCartModal,
        closeAddToCartModal,
        quickAddVariant: (productId, size = '', color = '') => {
            const product = State.products.find(p => String(p.id) === String(productId));
            if (!product) return;
            const available = getVariantStock(product, size, color);
            if (available <= 0) {
                onOutStockClicked(size, color);
                return;
            }
            addToCart(product, size, color, 1);
        },
        selectVariantSize: (el, size) => {
            el.parentElement.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
            el.classList.add('active');
            window._pendingAddSize = size;
        },
        selectVariantColor: (el, color) => {
            el.parentElement.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
            el.classList.add('active');
            window._pendingAddColor = color;
        },
        confirmAddToCart,
        confirmInstantSale,
        setTheme,
        toggleTheme,
        modifyCartQty,
        submitMobileInvoice,
        processOfflineQueue,
        openInvoiceDetails,
        closeInvoiceDetailsModal,
        shareInvoiceWhatsApp,
        closeInvoiceSuccessModal,
        deleteInvoice,
        editInvoice,
        onCustomerInput,
        onCustomerFocus,
        selectCustomer,
        resetCustomer,
        onOutStockClicked,
        triggerCameraScan,
        handleCameraFile,
        submitPinVerification,
        submitDirectShopId,
        checkConnectionStatus: checkServerInfo,
        openPinModal,
        closePinModal,
        openSettingSubPage,
        closeSettingSubPage,
        renderSettingsView,
        saveShopBranch,
        onWarehouseSelectChange,
        openReceiptImageModal,
        closeReceiptImageModal,
        shareReceiptAsImage,
        downloadReceiptImage,
        shareReceiptAsText,
        lastSuccessTx: null,
        saveShopProfileSettings,
        togglePinLockSection,
        saveSecuritySettings,
        savePosPreferences,
        forceFullSync,
        connectBluetoothPrinter,
        testPrintReceipt,
        openAddProductModal,
        closeAddProductModal,
        generateBarcode,
        generateVariantRows,
        onVariantRowQtyChange,
        submitNewProduct,
        handleProductImageUpload,
        removeProductImage,
        clearProductSearch,
        setTxTypeFilter,
        classifyTransaction,
        renderAccountsView,
        setAccountFilter,
        onAccountSearchInput,
        clearAccountSearch,
        openAccountStatement,
        closeAccountStatement,
        shareAccountStatementWhatsApp,
        quickSaleForAccount,
        openAddAccountModal,
        closeAddAccountModal,
        onAccountTypeChange,
        submitNewAccount,
        playBarcodeBeepAndVibrate,
        sendWhatsAppReceiptDirectly,
        filterByLowStock,
        openStocktakeModal,
        closeStocktakeModal,
        onStocktakeWarehouseChange,
        onStocktakeSearchInput,
        clearStocktakeSearch,
        selectProductForStocktake,
        stepStocktakeQty,
        setStocktakeQty,
        onStocktakeQtyChange,
        submitStocktakeCount,
        triggerStocktakeCameraScan,
        handleStocktakeCameraFile,
        createCloudBackup,
        downloadLocalBackupJSON,
        restoreBackupFromFile,
        setDashboardPeriod,
        onPeriodSelectChange,
        filterSalesByPeriod,
        toggleCustomDateRange,
        applyCustomDateRange,
        generateInvoiceId,
        syncStoreProfile,
        applyStoreProfileToUI,
        reconnect: async () => {
            showToast('جاري إعادة فحص الاتصال بالسحابة...', 'warning');
            const ok = await checkServerInfo();
            if (ok) {
                await pullMasterData();
                await processOfflineQueue();
                startAutoSyncPoll();
                showToast('تم الاتصال بالسحابة بنجاح ✅', 'success');
            } else {
                showToast('تعذر الاتصال بالسحابة ❌', 'error');
            }
        },
        updateServerUrl: () => { }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window, document);
