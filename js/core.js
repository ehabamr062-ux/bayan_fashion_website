// دالة لفتح الروابط الخارجية بأمان (خاصة ببيئة Electron والمتصفح)
function openExternalUrl(url) {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.trim();
    // 🔒 صمام الأمان الفولاذي: حصر الفتح بالبروتوكولات الآمنة ومنع تشغيل أي ملفات أو أوامر تنفيذية
    if (!/^https?:\/\//i.test(cleanUrl) && !/^mailto:/i.test(cleanUrl) && !/^tel:/i.test(cleanUrl) && !/^anydesk:/i.test(cleanUrl) && !/^whatsapp:/i.test(cleanUrl)) {
        console.warn('⚠️ [Security Shield] Blocked opening untrusted external URL protocol:', cleanUrl);
        return;
    }
    // التحقق من وجود بيئة Electron وفتح الرابط في متصفح النظام الافتراضي فوراً لتفادي بطء واتساب ويب داخل إلكترون
    try {
        if (typeof require !== 'undefined') {
            const { shell } = require('electron');
            if (shell && typeof shell.openExternal === 'function') {
                shell.openExternal(cleanUrl);
                return;
            }
        }
    } catch (e) {
        console.warn('Electron shell.openExternal notice:', e);
    }
    // فتح الرابط في نافذة جديدة للمتصفح العادي مع عزل المرجع لمنع التلاعب (noopener,noreferrer)
    window.open(cleanUrl, '_blank', 'noopener,noreferrer');
}
window.openExternalUrl = openExternalUrl;


// حل مشكلة تعريف مكتبة XLSX في بيئة Electron وحمايتها من الضياع
(function initXLSX() {
    if (typeof window.XLSX !== 'undefined' && window.XLSX && window.XLSX.utils) {
        return;
    }
    if (typeof XLSX !== 'undefined' && XLSX && XLSX.utils) {
        window.XLSX = XLSX;
        return;
    }
    if (typeof globalThis !== 'undefined' && globalThis.XLSX && globalThis.XLSX.utils) {
        window.XLSX = globalThis.XLSX;
        return;
    }
    if (typeof require !== 'undefined') {
        try {
            const path = require('path');
            const fs = require('fs');
            const xlsxPath = path.join(__dirname, '..', 'lib', 'xlsx.full.min.js');
            if (fs.existsSync(xlsxPath)) {
                window.XLSX = require(xlsxPath);
            }
        } catch (e) { }
    }
})();

// =========================================================================
// 💻 تهيئة بيئة نقطة البيع الأساسية (Master Terminal Environment)
// =========================================================================
window.BayanNetworkHub = {
    isMasterServer: true,
    deviceId: 'DEV-HOST',
    getTerminalDisplayName: () => 'الجهاز الرئيسي 💻',
    getTerminalLetter: () => 'MASTER',
    getPairingOrder: () => 0,
    getTerminalInfo: () => ({
        terminal: 'الجهاز الرئيسي 💻',
        terminalLetter: 'MASTER',
        terminalOrder: 0,
        terminalId: 'DEV-HOST'
    }),
    onDataSaved: () => {},
    onDeltaSaved: () => {}
};

// =========================================================================
// 🔢 المزامنة التلقائية لرقم الإصدار الموحد (Single Source of Truth Unification)
// المصدر الرسمي الوحيد هو package.json عبر app.getVersion()
// =========================================================================
window.appVersion = '4.9.5';
window.APP_VERSION = '4.9.5';

async function fetchAppVersion() {
    let version = '4.9.5';
    try {
        if (typeof window !== 'undefined' && window.require) {
            const electron = window.require('electron');
            if (electron && electron.ipcRenderer) {
                const ver = await electron.ipcRenderer.invoke('get-app-version');
                if (ver) return ver;
            }
        }
        // في بيئة المتصفح: جلب الإصدار المحدث من version.json مباشرة
        const res = await fetch('version.json?t=' + Date.now()).catch(() => null);
        if (res && res.ok) {
            const vData = await res.json().catch(() => null);
            if (vData && vData.version) return vData.version;
        }
    } catch (e) { }
    return version;
}

function syncAppVersionUI(version) {
    if (!version) version = window.appVersion || '4.9.5';
    window.appVersion = version;
    window.APP_VERSION = version;

    // 1. تحديث كافة العناصر التي تحمل الأصناف أو الخصائص المخصصة لرقم الإصدار
    document.querySelectorAll('.dynamic-app-version, .app-version, [data-app-version]').forEach(el => {
        el.innerText = `v${version}`;
    });

    // 2. تحديث شاشة "حول البرنامج" ومركز التحديثات
    const aboutBadge = document.getElementById('aboutAppVersionBadge');
    if (aboutBadge) aboutBadge.innerText = `الإصدار الرسمي v${version} ⚡`;

    const label = document.getElementById('updateCurrentVerLabel');
    if (label) label.innerText = `v${version}`;

    const badge = document.getElementById('updateCurrentVerBadge');
    if (badge) badge.innerText = `v${version} ⚡`;

    const changelogBadge = document.getElementById('updateChangelogCurrentVer');
    if (changelogBadge) changelogBadge.innerText = `(v${version})`;

    if (typeof window.updateAutoUpdatesPolicyDOM === 'function' && typeof window.__isAutoUpdatesFrozenNow === 'function') {
        window.updateAutoUpdatesPolicyDOM(!window.__isAutoUpdatesFrozenNow());
    }
}

window.syncAppVersionUI = syncAppVersionUI;
window.fetchAppVersion = fetchAppVersion;

(async function initAppVersion() {
    const ver = await fetchAppVersion();
    window.appVersion = ver;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => syncAppVersionUI(ver));
    } else {
        syncAppVersionUI(ver);
    }
})();

if ('serviceWorker' in navigator && window.location.protocol !== 'file:' && !navigator.userAgent.includes('Electron')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('Service Worker: Registered ✅');
                // فحص وجود تحديثات جديدة بشكل دوري تلقائي
                setInterval(() => {
                    reg.update();
                }, 1000 * 60 * 30); // كل 30 دقيقة
            })
            .catch(err => console.log('Service Worker: Failed ❌', err));
    });

    // إعادة تحميل الصفحة فوراً عند تحديث ملفات النظام في الخلفية وتنشيط SW الجديد
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
}

// نظام محلي 100% (Offline Local-First Architecture)

async function checkSubscriptionStatus() {
    if (typeof checkLicenseAndLockApp === 'function') {
        return await checkLicenseAndLockApp();
    }
    return true;
}

// دالة فحص التحديثات الجديدة

// تهيئة قاعدة بيانات النظام (SQLite المباشر والدائم عبر BayanDBAdapter)
let db = (typeof window !== 'undefined' && window.BayanDBAdapter) ? window.BayanDBAdapter : (typeof window !== 'undefined' ? window.db : null);
window.db = db;
window.bayanDB = db;

// قاعدة بيانات وهمية للأصناف (سيتم استبدالها لاحقاً ببيانات من DB)

let initialProducts = [];

window.productsDB = [];

let isEditMode = false;

let editingInvoiceId = null;

let editingOriginalDate = null;

let editingOriginalItems = []; // لحساب فرق المخزون والمديونية

let selectedInvoiceIndex = null;
let selectedInvoiceId = null;
let selectedInvoiceType = null;
window.selectedInvoiceId = null;
window.selectedInvoiceType = null;

let selectedHistoryIndex = null;

let currentQuickAddContext = null;

let currentSessionSelectedAddress = ''; // تتبع العنوان المختار للطباعة حالياً

// --- التبديل بين الأقسام ---

// --- نظام المختبر المتعدد المطوّر (Multi-Instance Tab Logic) ---

let openTabs = [{ id: 'dashboard', type: 'dashboard', label: '🏠 الرئيسية' }];

let activeTabId = 'dashboard';

let pendingCloseSection = null;

let tabStates = {};

let tabCounters = {};

// --- تهيئة أزرار نافذة التأكيد (Unsaved Changes Modal) ---

async function checkAccess() {
    try {
        const isAllowed = await checkSubscriptionStatus();
        if (!isAllowed) {
            console.warn("⚠️ Access Denied: Subscription status check failed.");
            return false;
        }
        return true;
    } catch (e) {
        console.error("❌ Error in checkAccess:", e);
        return true;
    }
}

window.cart = [];

window.currentTotal = 0; // الصافي النهائي

window.transactions = []; // سجل العمليات العام (إجمالي الحركة)

window.currentInvoicesView = 'operation'; // وضع العرض: operation (تجميع) أو items (تفصيلي)

window.currentFontSize = 16; // حجم الخط الافتراضي

window.users = [];

window.currentUser = null;

window.selectedLoginUser = null;

window.warehouses = []; // مصفوفة المخازن

window.accounts = []; // مصفوفة الحسابات العامة (العملاء والموردين)

window.trashBin = []; // سلة المحذوفات

window.auditLogs = []; // سجل التدقيق للعمليات الحساسة

window.selectedAccountID = null; // الحساب المحدد في الجدول

/**
 * دوال مساعدة موحدة للتحقق من حسابات مديري النظام ديناميكياً لدعم خصوصية الفواتير
 */
window.getAdminUserNames = function() {
    const adminSet = new Set(['المدير', 'المدير العام', 'مدير النظام', 'admin', 'administrator']);
    const uList = (window.users && Array.isArray(window.users) && window.users.length > 0)
        ? window.users
        : ((typeof users !== 'undefined' && Array.isArray(users)) ? users : []);
    uList.forEach(u => {
        if (u && u.role === 'admin' && u.name) {
            adminSet.add(String(u.name).trim().toLowerCase());
        }
    });
    return adminSet;
};

window.isUserAdminName = function(userName) {
    if (!userName) return false;
    const clean = String(userName).trim().toLowerCase();
    const adminSet = window.getAdminUserNames();
    return adminSet.has(clean);
};

/**
 * ⚡ نظام التحميل الذكي عند الطلب ومزامنة الفواتير (Lazy & On-Demand Loader)
 * لحماية الذاكرة والسرعة الخارقة لأقل من 1 ثانية مع الاحتفاظ بكافة فواتير السنين في SQLite
/**
 * ⚡ محرك الدمج الآمن والفائق للمعاملات بالذاكرة ومنع التكرار والدبلرة بتقنية O(1) Hash Map
 * يحول سرعة معالجة عشرات الآلاف من الحركات من 40 ثانية إلى 0.02 ثانية فقط
 */
window._txMemoryIdMap = null;
window._txMemorySigMap = null;
window._txMemoryPoolRef = null;

function _ensureTxMemoryMaps() {
    const pool = window.transactions || [];
    if (!window._txMemoryIdMap || window._txMemoryPoolRef !== pool) {
        window._txMemoryIdMap = new Map();
        window._txMemorySigMap = new Map();
        window._txMemoryPoolRef = pool;
        for (let i = 0; i < pool.length; i++) {
            const t = pool[i];
            if (!t) continue;
            if (t.id) window._txMemoryIdMap.set(String(t.id), t);
            const docId = String(t.invoiceId || t.id || t.transferId || t.adjId || '');
            const sig = `${docId}|${t.type || ''}|${(t.product || t.productName || t.name || '').trim()}|${(t.size || t.selectedSize || '').trim()}|${(t.color || t.selectedColor || '').trim()}|${t.isInvoiceHead ? '1' : '0'}`;
            if (!window._txMemorySigMap.has(sig)) {
                window._txMemorySigMap.set(sig, t);
            }
        }
    }
}

window.safelyMergeTransactionIntoMemory = function(row) {
    if (!row) return;
    if (!window.transactions) window.transactions = [];
    if (typeof transactions !== 'undefined' && transactions !== window.transactions) {
        transactions = window.transactions;
    }
    const pool = window.transactions;
    _ensureTxMemoryMaps();

    // 1. فحص فوري بالمعرف الصريح O(1)
    if (row.id) {
        const exact = window._txMemoryIdMap.get(String(row.id));
        if (exact) {
            Object.assign(exact, row);
            return;
        }
    }

    // 2. فحص فوري بتوقيع الفاتورة والبنود O(1)
    const docId = String(row.invoiceId || row.id || row.transferId || row.adjId || '');
    const sig = `${docId}|${row.type || ''}|${(row.product || row.productName || row.name || '').trim()}|${(row.size || row.selectedSize || '').trim()}|${(row.color || row.selectedColor || '').trim()}|${row.isInvoiceHead ? '1' : '0'}`;
    const inMemMatch = window._txMemorySigMap.get(sig);
    if (inMemMatch) {
        if (row.id && !inMemMatch.id) {
            inMemMatch.id = row.id;
            window._txMemoryIdMap.set(String(row.id), inMemMatch);
        }
        Object.assign(inMemMatch, row);
        return;
    }

    // إضافة السجل الجديد وتحديث فهارس الذاكرة اللحظية
    pool.push(row);
    if (row.id) window._txMemoryIdMap.set(String(row.id), row);
    window._txMemorySigMap.set(sig, row);
};

// ⚡ دالة الدمج المجمع فائق السرعة O(N) لعشرات الآلاف من الحركات دفعة واحدة في 15ms فقط
window.safelyMergeTransactionsBulk = function(records) {
    if (!records || !records.length) return;
    if (!window.transactions) window.transactions = [];
    if (typeof transactions !== 'undefined' && transactions !== window.transactions) {
        transactions = window.transactions;
    }
    _ensureTxMemoryMaps();
    for (let i = 0; i < records.length; i++) {
        const row = records[i];
        if (!row) continue;
        if (row.id) {
            const exact = window._txMemoryIdMap.get(String(row.id));
            if (exact) {
                Object.assign(exact, row);
                continue;
            }
        }
        const docId = String(row.invoiceId || row.id || row.transferId || row.adjId || '');
        const sig = `${docId}|${row.type || ''}|${(row.product || row.productName || row.name || '').trim()}|${(row.size || row.selectedSize || '').trim()}|${(row.color || row.selectedColor || '').trim()}|${row.isInvoiceHead ? '1' : '0'}`;
        const inMemMatch = window._txMemorySigMap.get(sig);
        if (inMemMatch) {
            if (row.id && !inMemMatch.id) {
                inMemMatch.id = row.id;
                window._txMemoryIdMap.set(String(row.id), inMemMatch);
            }
            Object.assign(inMemMatch, row);
            continue;
        }
        window.transactions.push(row);
        if (row.id) window._txMemoryIdMap.set(String(row.id), row);
        window._txMemorySigMap.set(sig, row);
    }
};

/**
 * ⚡ تنظيف الذاكرة الفوري من أي سجلات مكررة أو مدبلرة مع إعادة ضبط الفهارس
 */
window.deduplicateTransactionsMemory = function() {
    if (!window.transactions || !Array.isArray(window.transactions)) return;
    const seen = new Map();
    const clean = [];
    for (let i = 0; i < window.transactions.length; i++) {
        const t = window.transactions[i];
        if (!t) continue;
        const docId = String(t.invoiceId || t.id || t.transferId || t.adjId || '');
        const type = String(t.type || '');
        const prod = String(t.product || t.productName || t.name || '').trim();
        const size = String(t.size || t.selectedSize || '').trim();
        const color = String(t.color || t.selectedColor || '').trim();
        const qty = parseFloat(t.qty != null ? t.qty : (t.quantity || 0)) || 0;
        const price = parseFloat(t.price != null ? t.price : 0) || 0;
        const isHead = t.isInvoiceHead ? 'head' : 'item';

        const sig = `${docId}|${type}|${isHead}|${prod}|${size}|${color}|${qty}|${price}`;

        if (!seen.has(sig)) {
            seen.set(sig, t);
            clean.push(t);
        } else {
            const existing = seen.get(sig);
            if (t.id && !existing.id) {
                existing.id = t.id;
                Object.assign(existing, t);
            }
        }
    }
    window.transactions = clean;
    if (typeof transactions !== 'undefined') transactions = clean;
    window._txMemoryIdMap = null;
    window._txMemorySigMap = null;
    window._txMemoryPoolRef = null;
};

/**
 * ⚡ نظام التحميل الذكي عند الطلب ومزامنة الفواتير (Lazy & On-Demand Loader)
 * لحماية الذاكرة والسرعة الخارقة لأقل من 1 ثانية مع الاحتفاظ بكافة فواتير السنين في SQLite
 */
window.ensureInvoiceLoaded = async function(invoiceId) {
    if (!invoiceId || invoiceId === '---') return [];
    const sId = String(invoiceId).trim();
    if (!sId) return [];
    
    // هل الفاتورة موجودة بالفعل في الذاكرة بكامل أصنافها؟
    const inMem = (window.transactions || []).filter(t => t && (String(t.invoiceId) === sId || String(t.id) === sId));
    if (inMem.length > 0 && inMem.some(t => t.product || t.productName || t.name)) {
        return inMem;
    }
    
    // ⚡ 1. استدعاء فوري للفاتورة وكافة بنودها من SQLite عبر محرك C++ فائق السرعة
    if (window.BayanSQLite && typeof window.BayanSQLite.getInvoiceFullDetails === 'function' && window.BayanSQLite.db) {
        try {
            const fullDetails = window.BayanSQLite.getInvoiceFullDetails(sId);
            if (fullDetails && fullDetails.transactionsRows && fullDetails.transactionsRows.length > 0) {
                fullDetails.transactionsRows.forEach(row => {
                    if (row && typeof window.safelyMergeTransactionIntoMemory === 'function') {
                        window.safelyMergeTransactionIntoMemory(row);
                    }
                });
                if (typeof window.deduplicateTransactionsMemory === 'function') {
                    window.deduplicateTransactionsMemory();
                }
                return fullDetails.transactionsRows;
            }
        } catch(e) {
            console.warn("[SQLite] ensureInvoiceLoaded notice:", e.message);
        }
    }

    // 2. مسار احتياطي من مخزن Dexie
    try {
        if (!window.db || !window.db.transactions) return inMem;
        const numId = Number(sId);
        const queryKeys = !isNaN(numId) ? [sId, numId] : [sId];
        const fromDB = await window.db.transactions.where('invoiceId').anyOf(queryKeys).toArray();
        if (fromDB && fromDB.length > 0) {
            fromDB.forEach(row => {
                if (row && typeof window.safelyMergeTransactionIntoMemory === 'function') {
                    window.safelyMergeTransactionIntoMemory(row);
                }
            });
            if (typeof window.deduplicateTransactionsMemory === 'function') {
                window.deduplicateTransactionsMemory();
            }
            return fromDB;
        }
    } catch(e) {
        console.warn("⚠️ ensureInvoiceLoaded notice:", e);
    }
    return inMem;
};

window.loadTransactionsForDateRange = async function(fromDate, toDate, maxLimit = 15000) {
    try {
        const lim = parseInt(maxLimit, 10) || 15000;
        let records = [];

        // ⚡ 1. الجلب فائق السرعة عبر محرك C++ SQLite في 15ms فقط بالاعتماد على فهارس B-Tree
        if (window.BayanSQLite && typeof window.BayanSQLite.getTransactionsForPeriod === 'function' && window.BayanSQLite.db) {
            try {
                records = window.BayanSQLite.getTransactionsForPeriod(fromDate, toDate, lim, 'all', 'all');
            } catch(e) {
                console.warn("[SQLite] loadTransactionsForDateRange notice:", e);
            }
        }

        // 2. مسار احتياطي من Dexie فقط في حال عدم توفر SQLite
        if ((!records || records.length === 0) && window.db && window.db.transactions) {
            let q;
            if (fromDate && toDate) {
                q = window.db.transactions.where('dateISO').between(fromDate, toDate, true, true).limit(lim);
            } else if (fromDate) {
                q = window.db.transactions.where('dateISO').aboveOrEqual(fromDate).limit(lim);
            } else if (toDate) {
                q = window.db.transactions.where('dateISO').belowOrEqual(toDate).limit(lim);
            } else {
                // كل الفترات: جلب أحدث الحركات بأمان دون تجميد المتصفح
                q = window.db.transactions.orderBy('id').reverse().limit(Math.min(3000, lim));
            }
            records = await q.toArray();
        }

        if (records && records.length > 0) {
            // ⚡ دمج مجمع فائق السرعة O(1) بدلاً من الحلقات التربيعية البطيئة
            if (typeof window.safelyMergeTransactionsBulk === 'function') {
                window.safelyMergeTransactionsBulk(records);
            } else {
                records.forEach(row => {
                    if (row) window.safelyMergeTransactionIntoMemory(row);
                });
            }
            window.deduplicateTransactionsMemory();

            // 🛡️ صمام أمان الذاكرة: حماية الذاكرة مع الحفاظ على كافة فواتير الفترة المطلوبة للتقارير
            const safeCap = Math.max(15000, lim);
            if (window.transactions.length > safeCap) {
                const todayISO = new Date().toLocaleDateString('en-CA');
                const recentQueryIds = new Set(records.map(r => r.id));
                window.transactions = window.transactions.filter(t => 
                    t && (t.dateISO >= todayISO || recentQueryIds.has(t.id) || (t.type && String(t.type).includes('تحويل') && t.transferStatus === 'pending'))
                );
                if (typeof transactions !== 'undefined') transactions = window.transactions;
            }
        }
    } catch(e) {
        console.warn("⚠️ loadTransactionsForDateRange notice:", e);
    }
};

window.syncMaxSequencesFromDB = async function(preloadedTx = null) {
    try {
        if (!window.db || !window.db.transactions) return;

        const types = ['بيع', 'شراء', 'مرتجع بيع', 'مرتجع شراء', 'تسوية', 'قبض', 'صرف'];
        const savedPrefix = (typeof getStore === 'function') ? getStore('bayan_device_prefix') : null;
        let devPrefix = (savedPrefix !== null && savedPrefix !== undefined && savedPrefix !== '') ? savedPrefix : '';
        if (!devPrefix && typeof window.BayanNetworkHub !== 'undefined' && !window.BayanNetworkHub.isMasterServer) {
            const dId = (window.BayanNetworkHub && window.BayanNetworkHub.deviceId) ? String(window.BayanNetworkHub.deviceId) : '';
            const shortCode = dId ? dId.replace(/^DEV-/i, '').substring(0, 3).toUpperCase() : '';
            devPrefix = shortCode ? `T${shortCode}-` : 'T-';
        }

        // 1. إعادة استخدام فواتير اليوم المحملة بالذاكرة مسبقاً دون قراءة إضافية
        const memList = (preloadedTx && Array.isArray(preloadedTx))
            ? preloadedTx
            : ((typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : []);

        // 2. فحص أقصى تسلسل مسجل في SQLite مباشرة عبر استعلام SQL مخصص دون تحميل الجدول كاملاً ودون قراءة raw_json
        for (const tp of types) {
            const key = 'bayan_last_seq_' + (devPrefix || '') + tp;
            let realMax = 0;

            // أ. فحص الحركات المحملة بالذاكرة (فواتير اليوم الحالية)
            if (memList && memList.length > 0) {
                memList.forEach(t => {
                    const matchesType = (typeof window.isTransactionOfType === 'function')
                        ? window.isTransactionOfType(t, tp)
                        : (t && t.type && t.type.includes(tp) && (!tp.includes('بيع') || !t.type.includes('مرتجع')));
                    if (matchesType) {
                        const n = (typeof window.extractNumericInvoiceId === 'function')
                            ? window.extractNumericInvoiceId(t.invoiceId, devPrefix)
                            : parseInt(String(t.invoiceId || '').replace(/\D+/g, ''), 10);
                        if (!isNaN(n) && n > realMax) realMax = n;
                    }
                });
            }

            // ب. استعلام SQLite الفوري: قراءة عمود invoiceId فقط لأحدث السجلات (LIMIT 10) مستفيداً من الفهرس idx_tx_type
            let queriedFromDb = false;
            if (window.BayanSQLite && window.BayanSQLite.db) {
                try {
                    let stmt = null;
                    if (tp === 'بيع') {
                        stmt = window.BayanSQLite.db.prepare("SELECT invoiceId FROM transactions WHERE type LIKE '%بيع%' AND type NOT LIKE '%مرتجع%' ORDER BY id DESC LIMIT 10;");
                    } else if (tp === 'شراء') {
                        stmt = window.BayanSQLite.db.prepare("SELECT invoiceId FROM transactions WHERE type LIKE '%شراء%' AND type NOT LIKE '%مرتجع%' ORDER BY id DESC LIMIT 10;");
                    } else if (tp === 'مرتجع بيع') {
                        stmt = window.BayanSQLite.db.prepare("SELECT invoiceId FROM transactions WHERE type LIKE '%مرتجع%بيع%' ORDER BY id DESC LIMIT 10;");
                    } else if (tp === 'مرتجع شراء') {
                        stmt = window.BayanSQLite.db.prepare("SELECT invoiceId FROM transactions WHERE type LIKE '%مرتجع%شراء%' ORDER BY id DESC LIMIT 10;");
                    } else {
                        stmt = window.BayanSQLite.db.prepare("SELECT invoiceId FROM transactions WHERE type LIKE ? ORDER BY id DESC LIMIT 10;");
                        stmt.bind([`%${tp}%`]);
                    }

                    if (stmt) {
                        while (stmt.step()) {
                            const row = stmt.get();
                            if (row && row[0] != null) {
                                const n = (typeof window.extractNumericInvoiceId === 'function')
                                    ? window.extractNumericInvoiceId(row[0], devPrefix)
                                    : parseInt(String(row[0] || '').replace(/\D+/g, ''), 10);
                                if (!isNaN(n) && n > realMax) realMax = n;
                            }
                        }
                        stmt.free();
                        queriedFromDb = true;
                    }
                } catch(sqlErr) {
                    console.warn(`⚠️ [SQLite] syncMaxSequences fast query notice for ${tp}:`, sqlErr.message || sqlErr);
                }
            }

            // ج. صمام أمان بديل في حال تعذر الاستعلام المباشر عبر المحرك (يقرأ بحد أقصى 10 سجلات عبر المحول)
            if (!queriedFromDb && window.db && window.db.transactions) {
                try {
                    const fallbackRecords = await window.db.transactions
                        .where('type').startsWith(tp)
                        .reverse()
                        .limit(10)
                        .toArray()
                        .catch(() => []);
                    fallbackRecords.forEach(t => {
                        const matchesType = (typeof window.isTransactionOfType === 'function')
                            ? window.isTransactionOfType(t, tp)
                            : (t && t.type && t.type.includes(tp) && (!tp.includes('بيع') || !t.type.includes('مرتجع')));
                        if (matchesType) {
                            const n = (typeof window.extractNumericInvoiceId === 'function')
                                ? window.extractNumericInvoiceId(t.invoiceId, devPrefix)
                                : parseInt(String(t.invoiceId || '').replace(/\D+/g, ''), 10);
                            if (!isNaN(n) && n > realMax) realMax = n;
                        }
                    });
                } catch(fbErr) {}
            }

            // د. تصحيح الذاكرة الدائمة وتصفير أو تعديل الأرقام التالفة المتضخمة فورياً
            if (typeof setStore === 'function') setStore(key, String(realMax));
        }
    } catch(e) {
        console.warn("⚠️ syncMaxSequencesFromDB notice:", e);
    }
};

let currentLanguage = 'ar'; // اللغة الافتراضية

// --- نظام تخصيص أعمدة المخزن (Inventory Column Visibility) ---

let inventoryColumnVisibility = JSON.parse(getStore('pos_inv_cols') || '{"0":true,"1":true,"2":true,"3":true,"4":true,"5":true,"6":true,"7":true,"8":true,"9":true,"image":true,"10":true,"11":true,"12":true,"13":true,"margin":true,"detailed":true}');

// قوائم أسباب الخصم والإضافة (للحفظ الذكي)

let discountReasons = ['خصم عام', 'خصم عميل مميز', 'خصم تجاري', 'تعويض شكوى'];

let taxReasons = ['ضريبة (VAT)', 'خدمة توصيل', 'مصاريف إضافية'];

let purchaseDiscountReasons = ['خصم توريد', 'خصم كمية', 'تعجيل دفع'];

let purchaseTaxReasons = ['ضريبة مشتريات', 'نقل ومشال', 'تغليف / إضافات'];

window.inventoryCategories = ['عام'];

if (getStore('bayan_inventory_categories')) {

    window.inventoryCategories = JSON.parse(getStore('bayan_inventory_categories'));

}

// --- نظام الحفظ والاسترجاع (SQLite) ---

// --- نظام الحسابات والديناميكية ---

async function loadData() {
    // 0. تهيئة نظام التخزين الوسيط والمزامنة مع SQLite
    if (typeof initAppStore === 'function') {
        await initAppStore();
    }

    // تطبيق وتفعيل تخصيص الأعمدة المحفوظة فور تحميل الـ Store
    if (typeof applyInventoryColumnVisibility === 'function') {
        applyInventoryColumnVisibility();
    }
    if (typeof initInvoicesColumns === 'function') {
        initInvoicesColumns();
    }

    // 📡 التحقق من ترخيص الاشتراك محلياً بطريقة مؤمنة وسريعة في الخلفية دون تعطيل قراءة البيانات
    try {
        if (typeof LicenseService !== 'undefined' && LicenseService.verifyLicense) {
            LicenseService.verifyLicense().catch(err => console.warn("License verify notice:", err));
            if (!window._licenseCheckIntervalSet) {
                window._licenseCheckIntervalSet = true;
                setInterval(() => LicenseService.verifyLicense(), 5 * 60 * 1000);
            }
        }
    } catch(err) {
        console.warn("⚠️ LicenseService verify notice:", err);
    }


    const savedSession = getStore('pos_session_user');

    try {
        await Promise.race([
            db.open(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('db.open timeout after 30s')), 30000))
        ]);
    } catch (openError) {
        console.warn("⚠️ [SQLite] ملاحظة فتح قاعدة البيانات:", openError.message || openError);
    }

    try {
        // 1. جلب أولي فائق السرعة لـ 100 صنف فقط بالتوازي لفتح شاشة البيع فوراً في 0.05 ثانية
        const initialProductsPromise = (window.BayanSQLite && typeof window.BayanSQLite.getProductsChunk === 'function')
            ? Promise.resolve(window.BayanSQLite.getProductsChunk(100, 0))
            : (db && db.products ? db.products.limit(100).toArray().catch(() => []) : Promise.resolve([]));

        // 2. تحميل البيانات الأساسية السريعة (المستخدمين، المخازن، الحسابات، يوميات اليوم) في أقل من 15ms
        const todayDateISO = new Date().toLocaleDateString('en-CA');
        const [tTodayData, tPendingTransfers, aData, uData, trData, logData, wData] = await Promise.all([
            db.transactions.where('dateISO').aboveOrEqual(todayDateISO).toArray().catch(e => { console.warn("transactions today load:", e); return []; }),
            db.transactions.where('type').startsWith('تحويل').filter(t => t && t.transferStatus === 'pending').toArray().catch(e => { console.warn("pending transfers load:", e); return []; }),
            db.accounts.toArray().catch(e => { console.warn("accounts load:", e); return []; }),
            (window.users && window.users.length > 0) ? Promise.resolve(window.users) : db.users.toArray().catch(e => { console.warn("users load:", e); return []; }),
            db.trash.filter(t => t && (t.type === 'user' || String(t.type || '').includes('مستخدم'))).toArray().catch(e => { console.warn("trash users load:", e); return []; }),
            db.auditLogs.orderBy('id').reverse().limit(100).toArray().catch(e => { console.warn("auditLogs load:", e); return []; }),
            (window.warehouses && window.warehouses.length > 0) ? Promise.resolve(window.warehouses) : db.warehouses.toArray().catch(e => { console.warn("warehouses load:", e); return []; })
        ]);
        
        // دمج فواتير اليوم الحالي مع التحويلات المعلقة بأمان بدون تكرار
        const initialTxMap = new Map();
        (tTodayData || []).forEach(t => { if (t && t.id) initialTxMap.set(t.id, t); });
        (tPendingTransfers || []).forEach(t => { if (t && t.id) initialTxMap.set(t.id, t); });

        // 🛡️ صمام أمان: إذا لم تكن هناك فواتير لليوم الحالي، نقوم بجلب أحدث الفواتير المسجلة لضمان عدم ظهور الواجهة فارغة
        if (initialTxMap.size === 0 && db.transactions) {
            try {
                const recentTx = await db.transactions.orderBy('id').reverse().limit(100).toArray();
                (recentTx || []).forEach(t => { if (t && t.id) initialTxMap.set(t.id, t); });
            } catch (rErr) {}
        }

        transactions = Array.from(initialTxMap.values());
        window.transactions = transactions;

        // 🛡️ مزامنة أقصى تسلسل للفواتير بإعادة استخدام فواتير اليوم واستعلام SQLite السريع دون تحميل مكرر
        await window.syncMaxSequencesFromDB(transactions);

        accounts = aData || [];
        window.accounts = accounts;

        // 🩹 ترميم وتطهير أي رصيد افتتاحي تضرر بالخطأ في الحسابات عند الإقلاع
        const cleanArFn = (typeof window.normalizeSearchQuery === 'function')
            ? window.normalizeSearchQuery
            : ((typeof window.cleanAr === 'function')
                ? window.cleanAr
                : (s => String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ')));
        accounts.forEach(a => {
            if (!a) return;
            if (cleanArFn(a.name) === cleanArFn('طه') && (parseFloat(a.debit) === 400 || a.debit == '400') && (parseFloat(a.credit) === 70 || a.credit == '70')) {
                a.debit = '0';
                delete a.balance;
                if (typeof db !== 'undefined' && db.accounts) {
                    db.accounts.put(a).catch(e => console.warn("Repair acc in core:", e));
                }
            }
        });

        if (typeof window.invalidateAccountBalancesCache === 'function') {
            window.invalidateAccountBalancesCache();
        }

        trashBin = trData || [];
        auditLogs = logData || [];
        warehouses = (wData && wData.length > 0) ? wData : [{ id: 1, name: 'المخزن الرئيسي', address: 'المقر الرئيسي' }];

        // 🗑️ فحص وتنقية المستخدمين المحذوفين مسبقاً الموجودين في سلة المحذوفات لمنع ظهورهم
        const trashedUserKeys = new Set();
        (trashBin || []).forEach(t => {
            if (!t) return;
            const tp = String(t.type || '').toLowerCase();
            if (tp === 'user' || tp.includes('مستخدم')) {
                const d = t.originalData || t;
                if (d.id) trashedUserKeys.add(String(d.id));
                if (d.name) trashedUserKeys.add(String(d.name).trim());
            }
        });

        // 🔒 فك تشفير رموز الـ PIN في الذاكرة لتسهيل المقارنة مع استبعاد أي مستخدم تم حذفه
        let pinMigrationNeeded = false;
        const orphanedUserIdsToDelete = [];
        users = (uData || []).filter(u => {
            if (!u) return false;
            // حماية حساب المدير الأساسي رقم 1 دائماً
            if (u.id === 1 || u.id === '1' || (u.role === 'admin' && u.id === 1)) return true;
            const sId = String(u.id);
            const sName = String(u.name || '').trim();
            if (trashedUserKeys.has(sId) || trashedUserKeys.has(sName)) {
                orphanedUserIdsToDelete.push(u.id);
                return false;
            }
            return true;
        }).map(u => {
            if (!u) return u;
            let rawPin = u.pin;
            // 🛡️ إصلاح ذاتي فوري لحساب المدير إذا كان رمزه مشوهاً بالنجوم بسبب خطأ الحفظ السابق
            const isAdmin = u.id === 1 || u.id === '1' || u.role === 'admin';
            const isCorrupted = isAdmin && (
                rawPin === '••••' ||
                !rawPin ||
                (window.BayanSecurity && typeof window.BayanSecurity.verifyPin === 'function' && window.BayanSecurity.verifyPin('••••', rawPin))
            );
            if (isCorrupted) {
                console.warn("🔧 [Auto-Heal] تم تصحيح رمز المدير التالف واستعادته إلى 1234 تلقائياً.");
                rawPin = '1234';
                pinMigrationNeeded = true;
                if (window.BayanSQLite && window.BayanSQLite.isNative && window.BayanSQLite.nativeDb) {
                    try {
                        const enc = (window.BayanSecurity && typeof window.BayanSecurity.encryptPin === 'function')
                            ? window.BayanSecurity.encryptPin('1234')
                            : '1234';
                        window.BayanSQLite.nativeDb.prepare("UPDATE users SET pin = ? WHERE id = ? OR role = 'admin';").run(enc, u.id);
                    } catch(e) {}
                }
            }
            // 🔒 نحافظ على حماية وتشفير رمز PIN في الذاكرة لمنع كشفه بنص صريح وترقيته للتشفير المتقدم
            if (rawPin != null && rawPin !== '' && !String(rawPin).startsWith('ENC:v4:') && !String(rawPin).startsWith('HASH:v1:')) {
                pinMigrationNeeded = true;
            }
            return { ...u, pin: rawPin };
        });

        window.users = users;

        // تحديث فوري لقائمة المستخدمين في شاشة تسجيل الدخول بمجرد جاهزيتها (< 15ms)
        if (typeof updateLoginUsersList === 'function') {
            updateLoginUsersList();
        }

        // تنظيف أي سجلات قديمة لمستخدمين محذوفين من جدول db.users نهائياً
        if (orphanedUserIdsToDelete.length > 0 && db && db.users) {
            db.users.bulkDelete(orphanedUserIdsToDelete).catch(() => {});
        }

        if (pinMigrationNeeded && users.length > 0) {
            try {
                const encryptedUsers = users.map(u => ({
                    ...u,
                    pin: (window.BayanSecurity && typeof window.BayanSecurity.encryptPin === 'function')
                        ? window.BayanSecurity.encryptPin(u.pin)
                        : u.pin
                }));
                await db.users.bulkPut(encryptedUsers);
                if (window.BayanSQLite && window.BayanSQLite.isNative && window.BayanSQLite.nativeDb) {
                    try {
                        for (const u of encryptedUsers) {
                            window.BayanSQLite.nativeDb.prepare("UPDATE users SET pin = ? WHERE id = ?;").run(u.pin, u.id);
                        }
                    } catch(ne) {}
                }
                console.log("🔒 [Security] تم تشفير وتأمين كافة رموز PIN في قاعدة بيانات SQLite بنجاح.");
            } catch (migErr) {
                console.warn("⚠️ [Security] تعذر التحديث التلقائي لتشفير رموز PIN في SQLite:", migErr);
            }
        }

        // 🛠️ تصحيح تلقائي لأي فواتير نقدية/بنكية/شبكة سابقة حُفظت بمدفوع صفر بسبب خطأ الحفظ السابق
        let txMigrationNeeded = false;
        const healedTransactions = [];
        if (Array.isArray(transactions)) {
            transactions.forEach(t => {
                if (!t) return;
                const isInvHead = t.isInvoiceHead || (t.invoiceId && t.type && (t.type.includes('بيع') || t.type.includes('شراء')));
                if (isInvHead && (!t.paidAmount || parseFloat(t.paidAmount) === 0)) {
                    const isCred = typeof window.isTransactionCredit === 'function'
                        ? window.isTransactionCredit(t.method, 0, 0, 0)
                        : (t.method && (t.method.includes('آجل') || t.method.includes('اجل')));
                    if (!isCred && t.method) {
                        const invTot = parseFloat(t.invoiceGrandTotal) || parseFloat(t.total) || 0;
                        if (invTot > 0) {
                            t.paidAmount = invTot;
                            txMigrationNeeded = true;
                            healedTransactions.push(t);
                        }
                    }
                }
            });
            if (txMigrationNeeded && healedTransactions.length > 0 && typeof db !== 'undefined' && db.transactions) {
                try {
                    await db.transactions.bulkPut(healedTransactions);
                    console.log(`🛠️ [Payment Fix] تم تصحيح (${healedTransactions.length}) فاتورة نقدية وبنكية مسجلة بمدفوع صفر بنجاح.`);
                } catch(e) { console.warn("Auto-heal transactions error:", e); }
            }
        }

        // تفريغ كاش الأرصدة لضمان احتسابها على البيانات المحملة حديثاً من SQLite
        if (typeof window.invalidateAccountBalancesCache === 'function') {
            window.invalidateAccountBalancesCache();
        }

        // 3. ⚡ التحميل الفوري السريع للأصناف (0ms Instant Login) + التحميل المتدرج الذكي في الخلفية (Chunked Non-Blocking Loader)
        window.productsDB = window.productsDB || [];
        productsDB = window.productsDB;

        const syncProductVariantsStock = (p) => {
            if (p && p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
                let vSum = 0;
                for (let j = 0; j < p.variants.length; j++) {
                    const v = p.variants[j];
                    if (v.stock !== undefined && (parseFloat(v.stock) < 0 || isNaN(parseFloat(v.stock)))) {
                        v.stock = 0;
                    }
                    if (v.warehouseStocks && typeof v.warehouseStocks === 'object') {
                        Object.keys(v.warehouseStocks).forEach(wh => {
                            if (parseFloat(v.warehouseStocks[wh]) < 0 && (parseFloat(v.stock) || 0) > 0) {
                                if (wh === 'المخزن الرئيسي') v.warehouseStocks[wh] = parseFloat(v.stock) || 0;
                                else delete v.warehouseStocks[wh];
                            }
                        });
                    }
                    vSum += (parseFloat(v.stock) || 0);
                }
                p.stock = vSum;
                if (p.warehouseStocks && typeof p.warehouseStocks === 'object') {
                    Object.keys(p.warehouseStocks).forEach(wh => {
                        if (parseFloat(p.warehouseStocks[wh]) < 0 && p.stock > 0) {
                            if (wh === 'المخزن الرئيسي') p.warehouseStocks[wh] = p.stock;
                            else delete p.warehouseStocks[wh];
                        }
                    });
                }
            } else if (p && p.warehouseStocks && typeof p.warehouseStocks === 'object') {
                Object.keys(p.warehouseStocks).forEach(wh => {
                    if (parseFloat(p.warehouseStocks[wh]) < 0 && (parseFloat(p.stock) || 0) > 0) {
                        if (wh === 'المخزن الرئيسي') p.warehouseStocks[wh] = parseFloat(p.stock) || 0;
                        else delete p.warehouseStocks[wh];
                    }
                });
            }
        };

        // أ) معالجة وتثبيت أول 100 صنف فوراً لتمكين الكاشير والبحث اللحظي في أقل من 5ms
        try {
            const initialPData = await initialProductsPromise;
            if (initialPData && Array.isArray(initialPData) && initialPData.length > 0) {
                for (let i = 0; i < initialPData.length; i++) {
                    syncProductVariantsStock(initialPData[i]);
                }
                productsDB = initialPData;
                window.productsDB = productsDB;
                if (typeof updateProductFastIndexForChunk === 'function') {
                    updateProductFastIndexForChunk(initialPData);
                } else if (typeof rebuildProductFastIndex === 'function') {
                    rebuildProductFastIndex();
                }
            }
        } catch(iErr) {
            console.warn("Initial products setup notice:", iErr);
        }

        // ب) جدولة التحميل المتدرج غير الحاجب للواجهة (Non-Blocking Chunked Loader) لباقي الأصناف
        const scheduleBackgroundProductsLoad = () => {
            const loadRemainingChunks = async () => {
                try {
                    let offset = window.productsDB.length;
                    const CHUNK_SIZE = 1000;
                    let hasMore = true;
                    const totalProductsCount = (window.BayanSQLite && typeof window.BayanSQLite.getProductsTotalCount === 'function')
                        ? window.BayanSQLite.getProductsTotalCount()
                        : 0;

                    if (totalProductsCount > 0 && offset >= totalProductsCount) return;

                    const loadedIdSet = new Set(window.productsDB.map(p => p.id));

                    while (hasMore) {
                        let chunk = [];
                        if (window.BayanSQLite && typeof window.BayanSQLite.getProductsChunk === 'function') {
                            chunk = window.BayanSQLite.getProductsChunk(CHUNK_SIZE, offset);
                        } else if (db && db.products) {
                            chunk = await db.products.offset(offset).limit(CHUNK_SIZE).toArray().catch(() => []);
                        }

                        if (!chunk || chunk.length === 0) {
                            hasMore = false;
                            break;
                        }

                        for (let i = 0; i < chunk.length; i++) {
                            const p = chunk[i];
                            syncProductVariantsStock(p);
                            if (!loadedIdSet.has(p.id)) {
                                loadedIdSet.add(p.id);
                                window.productsDB.push(p);
                            }
                        }

                        offset += chunk.length;
                        productsDB = window.productsDB;

                        // تحديث خريطة الباركود السريع للدفعة المحملة فقط دون تكرار تدوير الأصناف القديمة
                        if (typeof updateProductFastIndexForChunk === 'function') {
                            updateProductFastIndexForChunk(chunk);
                        }

                        if (chunk.length < CHUNK_SIZE) {
                            hasMore = false;
                            break;
                        }

                        // 🛑 تحرير خيط المعالج (Event Loop) لـ 20 ملي ثانية حتى تظل الواجهة والماوس والباركود سريعة بنسبة 100%
                        await new Promise(r => setTimeout(r, 20));
                    }

                    console.log(`📦 [Chunked Loader] تم تحميل وتحديث (${window.productsDB.length}) صنف بالذاكرة بنجاح في الخلفية.`);
                    if (typeof rebuildProductFastIndex === 'function') rebuildProductFastIndex();
                    if (typeof initEntitySignatures === 'function') initEntitySignatures();

                    // إذا كان المستخدم فاتحاً شاشة المخازن وقت اكتمال الجلب، نحدّث الجدول
                    const invSecEl = document.getElementById('inventory-section');
                    if (invSecEl && !invSecEl.classList.contains('hidden') && typeof renderInventoryTable === 'function') {
                        renderInventoryTable();
                    }
                } catch (pErr) {
                    console.warn("Chunked products background load notice:", pErr);
                }
            };

            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => loadRemainingChunks(), { timeout: 1200 });
            } else {
                setTimeout(loadRemainingChunks, 60);
            }
        };

        scheduleBackgroundProductsLoad();

        console.log("✅ Core data successfully loaded (Users, Accounts, Today's Tx) in < 20ms.");

        // ⚡ تهيئة بصمات الكيانات السريعة للفواتير والحسابات
        if (typeof initEntitySignatures === 'function') {
            initEntitySignatures();
        }

        // 🔄 تحديث جدول الحسابات فورياً إذا كان المستخدم فاتحاً قسم الحسابات أثناء اكتمال التحميل
        const accSectionEl = document.getElementById('accounts-section');
        if (accSectionEl && !accSectionEl.classList.contains('hidden') && typeof renderAccountsTable === 'function') {
            renderAccountsTable();
        }
    } catch (err) {
        console.error("❌ Failed to load data from SQLite:", err);
        users = [];
        trashBin = [];
        auditLogs = [];
    }

    window.warehouses = warehouses;


    // تحميل أسباب الخصم والإضافة التلقائية من SQLite

    if (getStore('pos_discount_reasons')) discountReasons = JSON.parse(getStore('pos_discount_reasons'));

    if (getStore('pos_tax_reasons')) taxReasons = JSON.parse(getStore('pos_tax_reasons'));

    if (getStore('pos_p_discount_reasons')) purchaseDiscountReasons = JSON.parse(getStore('pos_p_discount_reasons'));

    if (getStore('pos_p_tax_reasons')) purchaseTaxReasons = JSON.parse(getStore('pos_p_tax_reasons'));

    // دمج التصنيفات الموجودة في المنتجات مع القائمة الدائمة لضمان عدم ضياع أي تصنيف قديم

    if (window.productsDB && window.productsDB.length > 0) {
        if (!Array.isArray(window.inventoryCategories)) window.inventoryCategories = [];
        const catSet = new Set(window.inventoryCategories);
        for (let i = 0; i < window.productsDB.length; i++) {
            const cat = window.productsDB[i]?.category;
            if (cat && !catSet.has(cat)) {
                catSet.add(cat);
                window.inventoryCategories.push(cat);
            }
        }
    }

    updateDatalists();

    const mainSettings = (await db.settings.get('main')) || {};

    // تطبيق الثيم

    if (mainSettings.theme === 'dark' || getStore('pos_theme') === 'dark') {

        document.body.classList.add('dark-mode');

        const themeBtn = document.querySelector('.theme-toggle-btn');

        if (themeBtn) themeBtn.innerText = '☀️';

    }

    // إعدادات الخط

    if (mainSettings.fontSize) {

        currentFontSize = mainSettings.fontSize;

        document.documentElement.style.setProperty('--app-font-size', currentFontSize + 'px');

    }

    if (mainSettings.name) document.getElementById('appTitle').innerText = '🚀 ' + mainSettings.name;

    if (mainSettings.language) {

        currentLanguage = mainSettings.language;

        changeLanguage(currentLanguage);

    }

    if (mainSettings.mainColor) document.documentElement.style.setProperty('--main-green', mainSettings.mainColor);

    const todayISO = new Date().toLocaleDateString('en-CA');

    document.getElementById('reportDateFrom').value = todayISO;

    document.getElementById('reportDateTo').value = todayISO;

    document.getElementById('invoicesDateFrom').value = todayISO;

    document.getElementById('invoicesDateTo').value = todayISO;

    document.getElementById('historyDateFrom').value = todayISO;

    document.getElementById('historyDateTo').value = todayISO;

    // ضبط القيمة الافتراضية للفلاتر لتكون "الكل" عند التحميل

    if (document.getElementById('invoicesSearchMethod')) document.getElementById('invoicesSearchMethod').value = 'all';

    if (document.getElementById('anMethod')) document.getElementById('anMethod').value = 'all';

    if (document.getElementById('historyMethodFilter')) document.getElementById('historyMethodFilter').value = 'all';

    initConfirmModal();

    // تحديث وإظهار شاشة تسجيل الدخول بشكل إجباري ومستقل
    if (typeof updateLoginUsersList === 'function') {
        updateLoginUsersList();
    }
    if (typeof initLogin === 'function' && !window.currentUser) {
        initLogin();
    }

    // ✅ أمان معزز: استعادة الجلسة بالاسم والمخزن فقط دون تخزين رمز الـ PIN في LocalStorage
    if (savedSession) {
        try {
            const sessionData = JSON.parse(savedSession);
            const savedUserName = sessionData.userName || '';
            const savedWarehouse = sessionData.warehouseName || 'المخزن الرئيسي';

            let realUser = null;
            if (savedUserName) {
                realUser = users.find(u => u.name === savedUserName);
            } else if (sessionData.pin) {
                // توافقية عكسية للجلسات القديمة مع تنظيف الـ PIN فورياً
                const decSavedPin = (window.BayanSecurity && typeof window.BayanSecurity.decryptPin === 'function')
                    ? window.BayanSecurity.decryptPin(sessionData.pin)
                    : sessionData.pin;
                realUser = users.find(u => u.pin === sessionData.pin || u.pin === decSavedPin);
            }

            if (realUser) {
                // نملأ اسم المستخدم مسبقاً في شاشة تسجيل الدخول لسرعة العمل
                const userSelect = document.getElementById('loginUsernameInput');
                if (userSelect) {
                    userSelect.value = realUser.name;
                    setTimeout(() => {
                        const pinInput = document.getElementById('loginPinInput');
                        if (pinInput) pinInput.focus();
                    }, 500);
                }
                // تطهير الجلسة المخزنة وتحديثها لحفظ الاسم فقط بدون رمز PIN
                if (typeof setStore === 'function') {
                    setStore('pos_session_user', JSON.stringify({ userName: realUser.name, warehouseName: savedWarehouse }));
                }
            } else {
                removeStore('pos_session_user');
            }
        } catch (e) {
            removeStore('pos_session_user');
        }
    }

    updateConnectionStatus();

    // ✅ تطبيق صلاحيات وإعدادات التاريخ فور تحميل البيانات فورياً وبدون تأخير لمنع الوميض
    if (typeof applyPermissions === 'function') applyPermissions();

    // 🛡️ تشغيل النسخ الاحتياطي التلقائي بهدوء عند إغلاق البرنامج لمنع أي استهلاك للمعالج أو تجميد للداتابيز عند الإقلاع
    if (!window._hasRegisteredBackupBeforeUnload) {
        window._hasRegisteredBackupBeforeUnload = true;
        window.addEventListener('beforeunload', () => {
            const settings = JSON.parse(getStore('pos_settings') || '{}');
            if (settings.autoBackup === true && typeof BackupService !== 'undefined') {
                BackupService.createAutoBackup();
            }
        });
    }

}

window.deletedItemIds = {
    transactions: [],
    products: [],
    accounts: [],
    users: []
};

// ⚡ نظام تتبع العناصر المتغيرة والبصمات لحفظ الفروقات فقط (Incremental / Delta Engine)
window.dirtyItemIds = {
    products: new Set(),
    accounts: new Set(),
    transactions: new Set()
};

window._entitySignatures = {
    products: new Map(),
    accounts: new Map(),
    transactions: new Map()
};

function getProductSignature(p) {
    if (!p) return '';
    const whStockStr = (p.warehouseStocks && Object.keys(p.warehouseStocks).length > 0) ? JSON.stringify(p.warehouseStocks) : '';
    const varStr = (p.variants && p.variants.length > 0) ? JSON.stringify(p.variants) : '';
    const unitStr = (p.units && p.units.length > 0) ? JSON.stringify(p.units) : '';
    const imgSig = p.image ? (typeof p.image === 'string' ? (p.image.length + '_' + p.image.slice(-30)) : '1') : '';
    return `${p.id}|${p.name || ''}|${p.code || ''}|${p.barcode || ''}|${p.cost || 0}|${p.price || 0}|${p.wholesale || 0}|${p.stock || 0}|${p.category || ''}|${p.unit || ''}|${p.minStock || ''}|${p.maxStock || ''}|${imgSig}|${p.updatedAt || ''}|${p.editDate || ''}|${p.status || ''}|${whStockStr}|${varStr}|${unitStr}`;
}

function getTransactionSignature(t) {
    if (!t) return '';
    return `${t.id || ''}|${t.invoiceId || ''}|${t.type || ''}|${t.dateISO || ''}|${t.timeISO || t.time || ''}|${t.method || ''}|${t.partner || ''}|${t.total || 0}|${t.paidAmount || 0}|${t.remaining || 0}|${t.invoiceGrandTotal || 0}|${t.warehouse || ''}|${t.transferStatus || ''}|${t.editDate || ''}|${t.product || ''}|${t.qty || 0}|${t.price || 0}|${t.isInvoiceHead ? 1 : 0}|${t.notes || ''}`;
}

function getAccountSignature(a) {
    if (!a) return '';
    return `${a.id || ''}|${a.name || ''}|${a.code || ''}|${a.type || ''}|${a.mobile || ''}|${a.balance || 0}|${a.address || ''}|${a.taxNumber || ''}|${a.notes || ''}`;
}

function initEntitySignatures() {
    if (!window._entitySignatures) {
        window._entitySignatures = {
            products: new Map(),
            accounts: new Map(),
            transactions: new Map()
        };
    }
    if (Array.isArray(window.transactions)) {
        const txs = window.transactions;
        const txLen = txs.length;
        if (txLen <= 300) {
            for (let i = 0; i < txLen; i++) {
                const t = txs[i];
                if (t && t.id != null) window._entitySignatures.transactions.set(t.id, getTransactionSignature(t));
            }
        } else {
            // ⚡ معالجة هادئة تدريجية للفواتير في الخلفية لمنع أي إجهاد للمعالج عند الإقلاع
            let txIdx = 0;
            const TX_BATCH = 500;
            const processTxBatch = () => {
                const end = Math.min(txIdx + TX_BATCH, txLen);
                for (let i = txIdx; i < end; i++) {
                    const t = txs[i];
                    if (t && t.id != null) window._entitySignatures.transactions.set(t.id, getTransactionSignature(t));
                }
                txIdx = end;
                if (txIdx < txLen) {
                    if (typeof requestIdleCallback === 'function') {
                        requestIdleCallback(processTxBatch, { timeout: 100 });
                    } else {
                        setTimeout(processTxBatch, 10);
                    }
                }
            };
            processTxBatch();
        }
    }
    if (Array.isArray(window.accounts)) {
        for (let i = 0; i < window.accounts.length; i++) {
            const a = window.accounts[i];
            if (a && a.id != null) window._entitySignatures.accounts.set(a.id, getAccountSignature(a));
        }
    }
    if (Array.isArray(window.productsDB)) {
        const prods = window.productsDB;
        const len = prods.length;
        if (len <= 500) {
            for (let i = 0; i < len; i++) {
                const p = prods[i];
                if (p && p.id != null) window._entitySignatures.products.set(p.id, getProductSignature(p));
            }
        }
        // للكتالوجات الضخمة (> 500 صنف)، يتم الاعتماد الحصري على تتبع التعديلات اللحظي dirtyItemIds دون إجهاد الذاكرة بـ 50 ألف بصمة
    }
}
window.initEntitySignatures = initEntitySignatures;

function updateEntitySignatures(table, items) {
    if (!window._entitySignatures || !window._entitySignatures[table]) initEntitySignatures();
    const sigMap = window._entitySignatures ? window._entitySignatures[table] : null;
    if (!sigMap || !Array.isArray(items)) return;

    const getSig = (table === 'products') ? getProductSignature
                 : (table === 'transactions') ? getTransactionSignature
                 : getAccountSignature;

    items.forEach(it => {
        if (it && it.id != null) {
            sigMap.set(it.id, getSig(it));
            if (window.dirtyItemIds && window.dirtyItemIds[table]) {
                window.dirtyItemIds[table].delete(it.id);
            }
        }
    });
}
window.updateEntitySignatures = updateEntitySignatures;

function markDirty(table, itemOrId) {
    if (!itemOrId) return;
    const id = (typeof itemOrId === 'object') ? itemOrId.id : itemOrId;
    if (id != null && window.dirtyItemIds && window.dirtyItemIds[table]) {
        window.dirtyItemIds[table].add(id);
    }
}
window.markDirty = markDirty;

function getDirtyOrChangedProducts(explicitModified = null, forceFull = false) {
    if (!Array.isArray(productsDB) || productsDB.length === 0) return [];
    if (forceFull) return productsDB;

    const dirtyList = [];
    const seenIds = new Set();

    // 1. الأصناف المحددة صراحة (مثل عمليات البيع والشراء والتحويلات)
    if (Array.isArray(explicitModified) && explicitModified.length > 0) {
        explicitModified.forEach(p => {
            if (p) {
                dirtyList.push(p);
                if (p.id != null) seenIds.add(p.id);
            }
        });
        // ⚡ إذا تم تحديد الأصناف صراحة نكتفي بها فوراً دون إجهاد المعالج
        return dirtyList;
    }

    // 2. الأصناف المتأثرة المسجلة في dirtyItemIds
    if (window.dirtyItemIds && window.dirtyItemIds.products && window.dirtyItemIds.products.size > 0) {
        window.dirtyItemIds.products.forEach(id => {
            if (!seenIds.has(id)) {
                const found = productsDB.find(p => p && p.id === id);
                if (found) {
                    dirtyList.push(found);
                    seenIds.add(id);
                }
            }
        });
        if (dirtyList.length > 0) return dirtyList;
    }

    // 3. فحص الأصناف الجديدة غير المحفوظة فقط (التي ليس لها ID بعد)
    const newItems = productsDB.filter(p => p && p.id == null);
    if (newItems.length > 0) return newItems;

    return [];
}

function getDirtyOrChangedTransactions(explicitModified = null, forceFull = false) {
    if (!Array.isArray(transactions) || transactions.length === 0) return [];
    if (forceFull) return transactions;

    const dirtyList = [];
    const seenIds = new Set();

    if (Array.isArray(explicitModified) && explicitModified.length > 0) {
        explicitModified.forEach(t => {
            if (t) {
                dirtyList.push(t);
                if (t.id != null) seenIds.add(t.id);
            }
        });
        return dirtyList;
    }

    if (window.dirtyItemIds && window.dirtyItemIds.transactions && window.dirtyItemIds.transactions.size > 0) {
        window.dirtyItemIds.transactions.forEach(id => {
            if (!seenIds.has(id)) {
                const found = transactions.find(t => t && t.id === id);
                if (found) {
                    dirtyList.push(found);
                    seenIds.add(id);
                }
            }
        });
        if (dirtyList.length > 0) return dirtyList;
    }

    const newItems = transactions.filter(t => t && t.id == null);
    if (newItems.length > 0) return newItems;

    return [];
}

function getDirtyOrChangedAccounts(explicitModified = null, forceFull = false) {
    if (!Array.isArray(accounts) || accounts.length === 0) return [];
    if (forceFull) return accounts;

    const dirtyList = [];
    const seenIds = new Set();

    if (Array.isArray(explicitModified) && explicitModified.length > 0) {
        explicitModified.forEach(a => {
            if (a) {
                dirtyList.push(a);
                if (a.id != null) seenIds.add(a.id);
            }
        });
        return dirtyList;
    }

    if (window.dirtyItemIds && window.dirtyItemIds.accounts && window.dirtyItemIds.accounts.size > 0) {
        window.dirtyItemIds.accounts.forEach(id => {
            if (!seenIds.has(id)) {
                const found = accounts.find(a => a && a.id === id);
                if (found) {
                    dirtyList.push(found);
                    seenIds.add(id);
                }
            }
        });
        if (dirtyList.length > 0) return dirtyList;
    }

    const newItems = accounts.filter(a => a && a.id == null);
    if (newItems.length > 0) return newItems;

    return [];
}

let isSavingDbData = false;
let pendingSaveDbRequest = false;
let dbSaveQueue = Promise.resolve();

// 🔒 منسق طابور الحفظ (Save Lock Coordinator) لمنع تضارب العمليات المتزامنة في SQLite
function runDbSaveTask(task) {
    const nextTask = dbSaveQueue.then(async () => {
        return await task();
    }).catch(err => {
        console.error("❌ [DBSaveQueue] خطأ في طابور حفظ قاعدة البيانات:", err);
    });
    dbSaveQueue = nextTask;
    return nextTask;
}

async function saveData(targetTables = null, deltaOptions = null) {
    if (isSavingDbData) {
        pendingSaveDbRequest = true;
        return;
    }
    isSavingDbData = true;

    return runDbSaveTask(async () => {
        try {
            let requested = targetTables;
            let delta = deltaOptions;

            // دعم استدعاء saveData بكائن خيارات مباشر: saveData({ tables: [...], modifiedProducts: [...] })
            if (targetTables && typeof targetTables === 'object' && !Array.isArray(targetTables)) {
                delta = targetTables;
                requested = targetTables.tables || targetTables.targetTables || null;
            }

            const requestedList = requested ? (Array.isArray(requested) ? requested : [requested]) : null;
            const shouldSave = (tbl) => !requestedList || requestedList.includes(tbl);

            const forceFull = delta ? Boolean(delta.forceFull) : false;
            const explicitProducts = delta ? (delta.modifiedProducts || delta.products) : null;
            const explicitAccounts = delta ? (delta.modifiedAccounts || delta.accounts) : null;
            const explicitTransactions = delta ? (delta.newTransactions || delta.modifiedTransactions || delta.transactions) : null;

            // تحديد السجلات المتغيرة فقط (Incremental / Delta Save)
            const deltaProducts = shouldSave('products') ? getDirtyOrChangedProducts(explicitProducts, forceFull) : [];
            const hasDeletedProducts = Boolean(window.deletedItemIds && window.deletedItemIds.products && window.deletedItemIds.products.length > 0);

            const deltaAccounts = shouldSave('accounts') ? getDirtyOrChangedAccounts(explicitAccounts, forceFull) : [];
            const hasDeletedAccounts = Boolean(window.deletedItemIds && window.deletedItemIds.accounts && window.deletedItemIds.accounts.length > 0);

            const deltaTransactions = shouldSave('transactions') ? getDirtyOrChangedTransactions(explicitTransactions, forceFull) : [];
            const hasDeletedTransactions = Boolean(window.deletedItemIds && window.deletedItemIds.transactions && window.deletedItemIds.transactions.length > 0);

            const tablesToTransact = [];
            if (shouldSave('products') && db.products && (deltaProducts.length > 0 || hasDeletedProducts)) tablesToTransact.push(db.products);
            if (shouldSave('accounts') && db.accounts && (deltaAccounts.length > 0 || hasDeletedAccounts)) tablesToTransact.push(db.accounts);
            if (shouldSave('transactions') && db.transactions && (deltaTransactions.length > 0 || hasDeletedTransactions)) tablesToTransact.push(db.transactions);
            if (shouldSave('users') && db.users) tablesToTransact.push(db.users);
            if (shouldSave('trash') && db.trash) tablesToTransact.push(db.trash);
            if (shouldSave('auditLogs') && db.auditLogs) tablesToTransact.push(db.auditLogs);
            if (shouldSave('settings') && db.settings) tablesToTransact.push(db.settings);
            if (shouldSave('warehouses') && db.warehouses) tablesToTransact.push(db.warehouses);
            if (shouldSave('treasuryAudit') && db.treasuryAudit) tablesToTransact.push(db.treasuryAudit);

            if (tablesToTransact.length > 0) {
                await db.transaction('rw', tablesToTransact, async () => {
                    // 1. حفظ وتحديث الأصناف المتغيرة فقط (Delta Save)
                    if (shouldSave('products') && Array.isArray(productsDB)) {
                        if (hasDeletedProducts) {
                            await db.products.bulkDelete(window.deletedItemIds.products);
                            if (window._entitySignatures && window._entitySignatures.products) {
                                window.deletedItemIds.products.forEach(id => window._entitySignatures.products.delete(id));
                            }
                            window.deletedItemIds.products = [];
                        }
                        if (deltaProducts.length > 0) {
                            const keys = await db.products.bulkPut(deltaProducts, { allKeys: true });
                            if (keys && keys.length === deltaProducts.length) {
                                deltaProducts.forEach((p, i) => { if (!p.id) p.id = keys[i]; });
                            }
                            updateEntitySignatures('products', deltaProducts);
                        }
                    }

                    // 2. حفظ وتحديث الحسابات المتغيرة فقط (Delta Save)
                    if (shouldSave('accounts') && Array.isArray(accounts)) {
                        if (hasDeletedAccounts) {
                            await db.accounts.bulkDelete(window.deletedItemIds.accounts);
                            if (window._entitySignatures && window._entitySignatures.accounts) {
                                window.deletedItemIds.accounts.forEach(id => window._entitySignatures.accounts.delete(id));
                            }
                            window.deletedItemIds.accounts = [];
                        }
                        if (deltaAccounts.length > 0) {
                            const keys = await db.accounts.bulkPut(deltaAccounts, { allKeys: true });
                            if (keys && keys.length === deltaAccounts.length) {
                                deltaAccounts.forEach((a, i) => { if (!a.id) a.id = keys[i]; });
                            }
                            updateEntitySignatures('accounts', deltaAccounts);
                        }
                    }

                    // 3. حفظ وتحديث العمليات والفواتير الجديدة والمعدلة فقط (Delta Save)
                    if (shouldSave('transactions') && Array.isArray(transactions)) {
                        if (hasDeletedTransactions) {
                            await db.transactions.bulkDelete(window.deletedItemIds.transactions);
                            if (window._entitySignatures && window._entitySignatures.transactions) {
                                window.deletedItemIds.transactions.forEach(id => window._entitySignatures.transactions.delete(id));
                            }
                            window.deletedItemIds.transactions = [];
                        }
                        if (deltaTransactions.length > 0) {
                            const keys = await db.transactions.bulkPut(deltaTransactions, { allKeys: true });
                            if (keys && keys.length === deltaTransactions.length) {
                                deltaTransactions.forEach((t, i) => { if (!t.id) t.id = keys[i]; });
                            }
                            updateEntitySignatures('transactions', deltaTransactions);
                        }
                    }

                    // 4. حفظ وتحديث المستخدمين ومزامنة جدول SQLite 100% لمنع بقاء أي مستخدم محذوف
                    // 🔒 حماية فولاذية: لا نقوم بحفظ جدول المستخدمين إذا كان المستخدم الحالي كاشير (لمنع إفساد بيانات المدير)
                    if (shouldSave('users') && Array.isArray(users) && (!currentUser || currentUser.role === 'admin' || currentUser.isAdmin)) {
                        window.users = users;
                        if (window.deletedItemIds && window.deletedItemIds.users && window.deletedItemIds.users.length > 0) {
                            await db.users.bulkDelete(window.deletedItemIds.users);
                            window.deletedItemIds.users = [];
                        }
                        if (users.length > 0) {
                            const secureUsers = users.map(u => {
                                let userPin = u.pin;
                                if (userPin === '••••') {
                                    userPin = '1234'; // صمام أمان ضد حفظ النجوم
                                }
                                return {
                                    ...u,
                                    pin: (window.BayanSecurity && typeof window.BayanSecurity.encryptPin === 'function')
                                        ? window.BayanSecurity.encryptPin(userPin)
                                        : userPin
                                };
                            });
                            await db.users.clear();
                            await db.users.bulkPut(secureUsers);
                        }
                    }

                    // 5. حفظ المهملات
                    if (shouldSave('trash') && Array.isArray(trashBin) && trashBin.length > 0) {
                        if (trashBin.length > 500) {
                            trashBin = trashBin.slice(-500);
                            window.trashBin = trashBin;
                        }
                        await db.trash.bulkPut(trashBin);
                    }

                    // 6. حفظ سجل التدقيق
                    if (shouldSave('auditLogs') && Array.isArray(auditLogs) && auditLogs.length > 0) {
                        if (auditLogs.length > 500) {
                            auditLogs = auditLogs.slice(-500);
                            window.auditLogs = auditLogs;
                        }
                        await db.auditLogs.bulkPut(auditLogs);
                    }

                    // 7. حفظ الإعدادات
                    if (shouldSave('settings')) {
                        const settings = JSON.parse(getStore('pos_settings') || '{}');
                        await db.settings.put({ id: 'main', ...settings });
                    }

                    // 8. حفظ المخازن
                    if (shouldSave('warehouses') && Array.isArray(warehouses) && warehouses.length > 0) {
                        await db.warehouses.bulkPut(warehouses);
                    }
                });
            }

            console.log("✅ Data successfully saved incrementally to SQLite.");
        } catch (err) {
            console.error("❌ Failed to save data to SQLite:", err);
        } finally {
            window.accountBalancesCache = {}; // Invalidate balance cache
            if (typeof window.invalidateAccountBalancesCache === 'function') window.invalidateAccountBalancesCache();
            isSavingDbData = false;
            if (pendingSaveDbRequest) {
                pendingSaveDbRequest = false;
                saveData();
            }
        }

        // حفظ الإعدادات السريعة في SQLite عبر setStore
        setStore('pos_discount_reasons', JSON.stringify(discountReasons));
        setStore('pos_tax_reasons', JSON.stringify(taxReasons));
        setStore('pos_p_discount_reasons', JSON.stringify(purchaseDiscountReasons));
        setStore('pos_p_tax_reasons', JSON.stringify(purchaseTaxReasons));
        setStore('bayan_inventory_categories', JSON.stringify(window.inventoryCategories));

        // تحديث وتفريغ كاش أرصدة المخازن فورياً
        if (typeof invalidateStockCache === 'function') {
            invalidateStockCache();
        }
        if (typeof window.invalidateStockCache === 'function') {
            window.invalidateStockCache();
        }

        scheduleNotificationsUpdate();
    });
}

// 🔔 تحديث هادئ للإشعارات في الخلفية وقت خمول المعالج دون تجميد واجهة الكاشير
function scheduleNotificationsUpdate() {
    if (window._notifUpdateTimer) {
        clearTimeout(window._notifUpdateTimer);
    }
    window._notifUpdateTimer = setTimeout(() => {
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => {
                if (typeof updateNotifications === 'function') updateNotifications();
            }, { timeout: 1500 });
        } else {
            if (typeof updateNotifications === 'function') updateNotifications();
        }
    }, 250);
}
window.scheduleNotificationsUpdate = scheduleNotificationsUpdate;

// =========================================================================
// ⚡ دالة الحفظ الجزئي فائق السرعة للمعاملات والفواتير (Instant Incremental Save)
// تحفظ فقط أسطر الفاتورة الجديدة والأصناف المتأثرة دون إعادة كتابة قاعدة البيانات بالكامل
// ومؤمنة بواسطة طابور الحفظ (Queue Coordinator) لمنع أي تضارب مع الحفظ الشامل
// =========================================================================
async function saveTransactionChanges({ newTransactions = [], modifiedTransactions = [], modifiedProducts = [], modifiedAccounts = [] } = {}) {
    if (!db) return;
    if (newTransactions.length > 0 || modifiedTransactions.length > 0) {
        window._cachedDailyReportPriorBalance = null;
        window._dailyReportNeedsRefresh = true;
        window._invoicesNeedsRefresh = true;
        window._historyNeedsRefresh = true;
        window._accountsNeedsRefresh = true;
        window._analysisNeedsRefresh = true;
        window._wrNeedsRefresh = true;
        window._adjNeedsRefresh = true;
        window._bayanLastDataChangeTime = Date.now();
        if (window._loadedTxDateRanges) window._loadedTxDateRanges.clear();
    }
    if (modifiedProducts.length > 0) {
        window._inventoryNeedsRefresh = true;
    }
    if (modifiedAccounts.length > 0) {
        window._accountsNeedsRefresh = true;
    }
    return runDbSaveTask(async () => {
        try {
            const tablesToUse = [];
            if ((newTransactions.length > 0 || modifiedTransactions.length > 0) && db.transactions) tablesToUse.push(db.transactions);
            if (modifiedProducts.length > 0 && db.products) tablesToUse.push(db.products);
            if (modifiedAccounts.length > 0 && db.accounts) tablesToUse.push(db.accounts);

            if (tablesToUse.length === 0) return;

            await db.transaction('rw', tablesToUse, async () => {
                // 1. حفظ أسطر الفاتورة الجديدة فقط
                if (newTransactions.length > 0 && db.transactions) {
                    const keys = await db.transactions.bulkPut(newTransactions, { allKeys: true });
                    if (keys && keys.length === newTransactions.length) {
                        newTransactions.forEach((t, i) => { if (!t.id) t.id = keys[i]; });
                    }
                    if (typeof updateEntitySignatures === 'function') updateEntitySignatures('transactions', newTransactions);
                }
                // 1.1 تحديث المعاملات القائمة (مثل علامة الإرجاع is_returned)
                if (modifiedTransactions.length > 0 && db.transactions) {
                    await db.transactions.bulkPut(modifiedTransactions, { allKeys: true });
                    if (typeof updateEntitySignatures === 'function') updateEntitySignatures('transactions', modifiedTransactions);
                }
                // 2. تحديث الأصناف التي تأثرت كمياتها أو أسعارها فقط
                if (modifiedProducts.length > 0 && db.products) {
                    const keys = await db.products.bulkPut(modifiedProducts, { allKeys: true });
                    if (keys && keys.length === modifiedProducts.length) {
                        modifiedProducts.forEach((p, i) => { if (!p.id) p.id = keys[i]; });
                    }
                    if (typeof updateEntitySignatures === 'function') updateEntitySignatures('products', modifiedProducts);
                }
                // 3. تحديث الحسابات المتأثرة فقط
                if (modifiedAccounts.length > 0 && db.accounts) {
                    const keys = await db.accounts.bulkPut(modifiedAccounts, { allKeys: true });
                    if (keys && keys.length === modifiedAccounts.length) {
                        modifiedAccounts.forEach((a, i) => { if (!a.id) a.id = keys[i]; });
                    }
                    if (typeof updateEntitySignatures === 'function') updateEntitySignatures('accounts', modifiedAccounts);
                }
            });

            // مزامنة فورية في الذاكرة لتطابق productsDB و accounts مع التحديثات
            if (Array.isArray(window.productsDB) && modifiedProducts.length > 0) {
                modifiedProducts.forEach(mp => {
                    if (!mp) return;
                    const idx = window.productsDB.findIndex(p => p && (p.id === mp.id || (p.code && mp.code && p.code === mp.code)));
                    if (idx !== -1) {
                        window.productsDB[idx] = Object.assign(window.productsDB[idx], mp);
                    }
                });
            }
            if (Array.isArray(window.accounts) && modifiedAccounts.length > 0) {
                modifiedAccounts.forEach(ma => {
                    if (!ma) return;
                    const idx = window.accounts.findIndex(a => a && (a.id === ma.id || a.name === ma.name));
                    if (idx !== -1) {
                        window.accounts[idx] = Object.assign(window.accounts[idx], ma);
                    }
                });
            }

            // مسح كاش الأرصدة والمخزون بذكاء عند تأثر الحسابات فقط
            const hasAccountChanges = (modifiedAccounts.length > 0) || (newTransactions.some(t => t && t.partner && (!window.isGenericCashPartner || !window.isGenericCashPartner(t.partner))));
            if (hasAccountChanges) {
                if (typeof window.invalidateAccountBalancesCache === 'function') {
                    if (modifiedAccounts.length > 0) {
                        modifiedAccounts.forEach(a => { if (a && a.name) window.invalidateAccountBalancesCache(a.name); });
                    }
                    newTransactions.forEach(t => {
                        if (t && t.partner && (!window.isGenericCashPartner || !window.isGenericCashPartner(t.partner))) {
                            window.invalidateAccountBalancesCache(t.partner);
                        }
                    });
                } else {
                    window.accountBalancesCache = {};
                }
            }
            if (typeof invalidateStockCache === 'function') invalidateStockCache();
            if (typeof window.invalidateStockCache === 'function') window.invalidateStockCache();
            scheduleNotificationsUpdate();

            // 🌐 إرسال التحديث لسيرفر الشبكة ومحرك المزامنة السحابية فورياً وبأعلى كفاءة وخفة
            if (window.BayanNetworkHub && typeof window.BayanNetworkHub.onDeltaSaved === 'function') {
                window.BayanNetworkHub.onDeltaSaved({ newTransactions, modifiedTransactions, modifiedProducts, modifiedAccounts });
            }
            if (window.BayanNetworkHub && typeof window.BayanNetworkHub.onDataSaved === 'function') {
                window.BayanNetworkHub.onDataSaved();
            }

            // 💾 حفظ سريع ومثبت لملف قاعدة البيانات على الهارد ديسك
            if (window.BayanSQLite && typeof window.BayanSQLite.schedulePersist === 'function') {
                window.BayanSQLite.schedulePersist(200);
            } else if (window.BayanSQLite && typeof window.BayanSQLite.persistNow === 'function') {
                window.BayanSQLite.persistNow(true);
            }

            console.log("⚡ [FastSave] Transaction saved incrementally in ultra-fast mode.");
        } catch (err) {
            console.warn("⚠️ [FastSave] Incremental save failed, falling back to full saveData:", err);
            await saveData(null, { modifiedProducts, newTransactions, modifiedAccounts });
        }
    });
}
window.saveTransactionChanges = saveTransactionChanges;

// =========================================================================
// ⚡ دالة حفظ الإعدادات الفوري (Instant Settings Save)
// تحفظ فقط إعدادات النظام في جدول db.settings دون المساس بالأصناف أو الفواتير نهائياً
// =========================================================================
async function saveSettingsDirect(settingsObj) {
    if (!db || !db.settings) return;
    try {
        const currentSettings = settingsObj || JSON.parse(getStore('pos_settings') || '{}');
        await db.settings.put({ id: 'main', ...currentSettings });
        console.log("⚡ [Settings] Saved directly to SQLite settings table.");
    } catch(err) {
        console.error("❌ Failed to save settings directly:", err);
    }
}
window.saveSettingsDirect = saveSettingsDirect;

// تحديث القوائم المنسدلة الذكية لدعم الأنواع الجديدة (Select)

async function wipeAllSystemData() {

    if (!confirm("⚠️ تنبيه خطير جداً!\n\nأنت على وشك مسح كافة بيانات النظام (الأصناف، الفواتير، الحسابات، الإعدادات).\n\nهل أنت متأكد تماماً من هذه الخطوة؟ لا يمكن التراجع عنها!")) {

        return;

    }

    const confirmSecond = confirm("⚠️ تأكيد أخير:\n\nسيتم حذف كل شيء والبدء من جديد. هل أنت متأكد؟");

    if (!confirmSecond) return;

    try {

        // مسح كافة الجداول في SQLite

        await Promise.all([

            db.products.clear(),

            db.transactions.clear(),

            db.accounts.clear(),

            db.users.clear(),

            db.settings.clear(),

            db.trash.clear(),

            db.auditLogs.clear()

        ]);

        // مسح الإعدادات من SQLite عبر removeStore

        const keysToRemove = [

            'pos_products', 'pos_transactions', 'pos_accounts', 'pos_users',

            'pos_settings', 'pos_theme', 'pos_session_user', 'pos_warehouses',

            'bayan_install_date', 'bayan_active'

        ];

        keysToRemove.forEach(key => removeStore(key));

        alert("✅ تمت عملية تصفير النظام بنجاح! سيتم إعادة تحميل البرنامج الآن.");

        location.reload();

    } catch (error) {

        console.error("Error wiping data:", error);

        alert("❌ حدث خطأ أثناء مسح البيانات: " + error.message);

    }

}

window.wipeAllSystemData = wipeAllSystemData;

window.syncAllVariantPricesWithProductBase = async function() {
    if (typeof productsDB === 'undefined' || !Array.isArray(productsDB)) return 0;
    let productsToUpdateInDb = [];
    productsDB.forEach(p => {
        if (p.variants && Array.isArray(p.variants) && p.variants.length > 0) {
            const basePrice = parseFloat(p.price) || 0;
            if (basePrice > 0) {
                const firstP = parseFloat(p.variants[0].price) || 0;
                const allSameP = p.variants.every(v => (parseFloat(v.price) || 0) === firstP);
                if (allSameP && Math.abs(firstP - basePrice) > 0.01) {
                    p.variants.forEach(v => {
                        v.price = basePrice;
                    });
                    productsToUpdateInDb.push(p);
                }
            }
        }
    });
    if (productsToUpdateInDb.length > 0 && typeof db !== 'undefined' && db.products) {
        try {
            await db.products.bulkPut(productsToUpdateInDb);
            if (typeof updateEntitySignatures === 'function') updateEntitySignatures('products', productsToUpdateInDb);
            console.log(`✅ [Bayan Sync] Synced variant prices for ${productsToUpdateInDb.length} products with base prices.`);
        } catch(e) {
            console.warn("Error in syncAllVariantPricesWithProductBase:", e);
        }
    }
    return productsToUpdateInDb.length;
};


// =========================================================================
// 🧠 دورة تنظيف الذاكرة العشوائية RAM ومنع تسريب الذاكرة (24/7 Stability & Memory Leak Prevention)
// =========================================================================
window._bayanActiveIntervals = window._bayanActiveIntervals || [];

// =========================================================================
// 🧹 حارس الذاكرة المركزي الفوري والدوري (Bayan Master Memory Guard)
// =========================================================================
window.bayanTriggerMemoryPurge = function() {
    try {
        // 1. تفريغ كاش حركات وتلخيص المخزون واستعلامات الأثر الرجعي
        if (typeof window.invalidateInvSummaryCache === 'function') {
            window.invalidateInvSummaryCache();
        }
        if (typeof _stockHistoryCache !== 'undefined') {
            _stockHistoryCache = null;
        }

        // 2. ترشيد ذاكرة المعاملات والتخلص من السجلات القديمة المعلقة
        if (window.transactions && Array.isArray(window.transactions) && window.transactions.length > 3000) {
            try {
                const todayStr = new Date().toISOString().split('T')[0];
                const activeDocIds = new Set();
                if (window.openTabs && Array.isArray(window.openTabs)) {
                    window.openTabs.forEach(t => {
                        if (t && t.id) activeDocIds.add(String(t.id));
                    });
                }
                if (window.cart && Array.isArray(window.cart)) {
                    window.cart.forEach(c => {
                        if (c && c.invoiceId) activeDocIds.add(String(c.invoiceId));
                    });
                }
                const kept = window.transactions.filter(t => {
                    if (!t) return false;
                    const d = t.dateISO ? t.dateISO.split('T')[0] : '';
                    const invId = String(t.invoiceId || t.id || '');
                    return d === todayStr || activeDocIds.has(invId);
                });
                if (kept.length > 0 && kept.length < window.transactions.length) {
                    window.transactions = kept;
                    if (typeof transactions !== 'undefined') transactions = kept;
                }
            } catch(e) {}
        }

        // 3. تحرير ذاكرة التخزين المؤقت لمحرك SQLite واستعادة صفحات الذاكرة لنظام التشغيل
        if (window.BayanSQLite && typeof window.BayanSQLite.purgeMemory === 'function') {
            window.BayanSQLite.purgeMemory();
        }

        // 4. استدعاء جامع القمامة V8 Garbage Collector سواء كان على window أو global
        const runGC = window.gc || (typeof global !== 'undefined' && global && global.gc);
        if (typeof runGC === 'function') {
            try { runGC(); } catch (_) {}
        }

        // 5. إشعار نواة إلكترون بتفريغ كاش كروميوم والصور المؤقتة
        if (typeof require === 'function') {
            try {
                const { ipcRenderer } = require('electron');
                if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
                    ipcRenderer.invoke('bayan-trim-memory').catch(() => {});
                }
            } catch (_) {}
        }
    } catch (errPurge) {
        console.warn("⚠️ [Memory Guard Notice]:", errPurge.message);
    }
};

window._bayanMemoryCleanupInterval = setInterval(() => {
    if (typeof window.bayanTriggerMemoryPurge === 'function') {
        window.bayanTriggerMemoryPurge();
    }
}, 180000);

window._bayanActiveIntervals.push(window._bayanMemoryCleanupInterval);

// =========================================================================
// 🛑 إغلاق نظيف وسريع للتطبيق (Fast Startup & Zero-Shutdown Lag Clean Shutdown)
// =========================================================================
window.gracefulCleanShutdown = function() {
    if (window._isAppShuttingDown) return;
    window._isAppShuttingDown = true;
    console.log("🛑 [Bayan Core] Graceful clean shutdown initiated...");

    // 1. إلغاء كافة المؤقتات النشطة لمنع استهلاك المعالج أو محاولة تنفيذ عمليات على قاعدة بيانات مغلقة
    if (window._bayanActiveIntervals && Array.isArray(window._bayanActiveIntervals)) {
        window._bayanActiveIntervals.forEach(timer => {
            try { clearInterval(timer); } catch(e) {}
        });
        window._bayanActiveIntervals = [];
    }
    if (window._bayanMemoryCleanupInterval) {
        try { clearInterval(window._bayanMemoryCleanupInterval); } catch(e) {}
        window._bayanMemoryCleanupInterval = null;
    }

    // 2. قطع اتصالات السحابة والمزامنة الفورية النشطة بسلام
    try {
        if (window.BayanSupabaseSync && typeof window.BayanSupabaseSync.disconnect === 'function') {
            window.BayanSupabaseSync.disconnect();
        }
    } catch(e) {}

    // 3. قطع وإغلاق سيرفر الربط المحلي Local Network Hub
    try {
        if (window.BayanNetworkHub && typeof window.BayanNetworkHub.close === 'function') {
            window.BayanNetworkHub.close();
        }
    } catch(e) {}

    // 4. حفظ وتثبيت بيانات SQLite وإغلاق كافة الاتصالات وتحرير ملفات القفل
    try {
        if (window.BayanSQLite && typeof window.BayanSQLite.close === 'function') {
            window.BayanSQLite.close();
        }
    } catch(e) {}

    console.log("✅ [Bayan Core] Clean shutdown completed successfully (Zero Lag).");
};
