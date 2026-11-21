
// ================= نظام بَيَان POS - نقطة الانطلاق الفائقة (Instant Launch Initialization) =================
// يتم إظهار شاشة تسجيل الدخول فوراً في أجزاء من الثانية (Instant Paint)
// مع استمرار تحميل ومعالجة بيانات المنظومة في الخلفية بسلاسة تامة وبلا أي شاشة بيضاء

// ⚡ 1. الإظهار الفوري لشاشة تسجيل الدخول والخلفية (Instant Paint)
(async function instantLoginLaunch() {
    try {
        // تحميل وتطبيق الخلفية فوراً في أول جزء من الثانية
        if (typeof loadWallpaper === 'function') {
            loadWallpaper().catch(() => {});
        }

        // ⚡ قراءة الكاش السريع للمستخدمين فوراً في أول جزء من الملي ثانية لمنع أي ارتعاش أو وميض (بدون حفظ أي PIN)
        if ((!window.users || window.users.length === 0) && typeof localStorage !== 'undefined') {
            try {
                let cachedU = JSON.parse(localStorage.getItem('bayan_cached_users') || '[]');
                if (Array.isArray(cachedU) && cachedU.length > 0) {
                    // 🛡️ تطهير أمني فوري: إزالة أي رموز PIN كانت مخزنة في الكاش القديم
                    let cleaned = false;
                    cachedU = cachedU.map(u => {
                        if (u && u.pin !== undefined) {
                            cleaned = true;
                            const { pin, ...rest } = u;
                            return rest;
                        }
                        return u;
                    });
                    if (cleaned) {
                        try { localStorage.setItem('bayan_cached_users', JSON.stringify(cachedU)); } catch(ce) {}
                    }
                    window.users = cachedU;
                    if (typeof users !== 'undefined') users = cachedU;
                }
            } catch(e) {}
        }

        // 🚀 إظهار شاشة الدخول فوراً وبأقصى سرعة (Instant Paint)
        if (typeof initLogin === 'function' && !window.currentUser) {
            initLogin();
        }

        if (typeof initAppStore === 'function') {
            await initAppStore();
        }
        const targetDb = window.db || window.bayanDB;
        if (targetDb && targetDb.users) {
            const [uData, wData] = await Promise.all([
                targetDb.users.toArray().catch(() => []),
                targetDb.warehouses ? targetDb.warehouses.toArray().catch(() => []) : []
            ]);
            if (uData && uData.length > 0) {
                window.users = uData;
                if (typeof users !== 'undefined') users = uData;
                try {
                    // 🔒 أمان صارم: تخزين بيانات العرض فقط واستبعاد الـ PIN تماماً من localStorage
                    const safeCache = uData.map(u => ({ id: u.id, name: u.name, role: u.role, assignedWarehouse: u.assignedWarehouse }));
                    localStorage.setItem('bayan_cached_users', JSON.stringify(safeCache));
                } catch(e) {}
            }
            if (wData && wData.length > 0) {
                window.warehouses = wData;
                if (typeof warehouses !== 'undefined') warehouses = wData;
            }
        }
        // تحديث القوائم وتأكيد ظهور شاشة تسجيل الدخول بعد جاهزية البيانات
        if (typeof updateLoginUsersList === 'function') {
            updateLoginUsersList();
        }
        if (typeof initLogin === 'function' && !window.currentUser) {
            initLogin();
        }
        // 🚀 تشغيل محرك البيانات فوراً فقط في حال كانت هناك جلسة مستخدم نشطة ومسجلة مسبقاً
        if (window.currentUser && typeof window.startDataLoader === 'function') {
            window.startDataLoader();
        }
    } catch(e) {
        console.warn("Instant login display notice:", e);
        if (typeof initLogin === 'function' && !window.currentUser) {
            initLogin();
        }
        if (window.currentUser && typeof window.startDataLoader === 'function') {
            window.startDataLoader();
        }
    }
})();

// 🔄 2. محرك التحميل الذكي لبيانات المنظومة (Smart On-Demand Data Loader)
// يعمل فوراً عند تسجيل الدخول أو بهدوء في الخلفية بعد ظهور شاشة الدخول بـ 3.5 ثانية
window._isDataLoaderRunning = false;
window._dataLoaderPromise = null;

window.startDataLoader = function() {
    if (window._dataLoaderPromise) return window._dataLoaderPromise;
    window._isDataLoaderRunning = true;
    
    window._dataLoaderPromise = (async () => {
        try {
            console.log("🔄 [Bayan Engine] بدء تحميل ومزامنة بيانات المنظومة في الخلفية...");
            await loadData();
            // 0. فحص واستعادة رتبة المدير الأساسي وصمام الأمان التلقائي
            try {
                if (typeof users !== 'undefined' && Array.isArray(users) && users.length > 0) {
                    let primaryAdmin = users.find(u => u.id === 1 || u.id === '1') || users[0];
                    if (primaryAdmin && primaryAdmin.role !== 'admin') {
                        console.log("🛡️ [Safety Restore] استعادة رتبة المدير الأساسي كاملة تلقائياً...");
                        primaryAdmin.role = 'admin';
                        primaryAdmin.isFrozen = false;
                        if (!primaryAdmin.permissions) primaryAdmin.permissions = {};
                        if (!primaryAdmin.permissions.general) primaryAdmin.permissions.general = {};
                        primaryAdmin.permissions.general.settings = true;
                        primaryAdmin.permissions.general.users = true;
                        primaryAdmin.permissions.general.reports = true;
                        primaryAdmin.permissions.general.profits = true;
                        if (typeof saveData === 'function') saveData();
                        if (currentUser && (currentUser.id === primaryAdmin.id || currentUser.pin === primaryAdmin.pin)) {
                            currentUser.role = 'admin';
                            currentUser.permissions = primaryAdmin.permissions;
                        }
                    }
                }
            } catch(e) { console.warn("Admin auto-heal notice:", e); }

            // 0.1 تحميل الإعدادات والشعار بعد اكتمال جلب البيانات من SQLite
            if (typeof loadSettings === 'function') loadSettings();
            if (typeof applyBusinessTypeUI === 'function') applyBusinessTypeUI();
            if (typeof populatePaymentMethodSelects === 'function') populatePaymentMethodSelects();
            if (typeof populateWarehouseDropdowns === 'function') populateWarehouseDropdowns();
            let savedLogo = getStore('bayan_business_logo');
            // تنظيف الشعار التجريبي القديم غير المرغوب فيه واستعادة واجهة بيان الأصلية
            if (savedLogo && typeof savedLogo === 'string' && (savedLogo.startsWith('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgA') || !getStore('bayan_user_confirmed_custom_logo'))) {
                if (typeof removeStore === 'function') removeStore('bayan_business_logo');
                if (window.AppStore) delete window.AppStore['bayan_business_logo'];
                savedLogo = null;
            }
            if (typeof updateLogoDisplays === 'function') {
                updateLogoDisplays(savedLogo || null);
            }

            // 1. تحديث التوجيهات أو شاشة تسجيل الدخول
            if (currentUser) {
                console.log(`👤 أهلاً بك مجدداً: ${currentUser.name}`);
                if (typeof updateNotifications === 'function') updateNotifications();
                if (typeof window.updateHeaderWarehouseSelect === 'function') window.updateHeaderWarehouseSelect();
                const accSec = document.getElementById('accounts-section');
                if (accSec && !accSec.classList.contains('hidden') && typeof renderAccountsTable === 'function') {
                    renderAccountsTable();
                }
            } else {
                if (typeof updateLoginUsersList === 'function') {
                    updateLoginUsersList();
                }
                if (typeof initLogin === 'function' && !window.currentUser) {
                    initLogin();
                }
            }

            // 2. تحميل الخلفية في الخلفية بشكل غير معطل للواجهة
            if (typeof loadWallpaper === 'function') {
                loadWallpaper().catch(e => console.warn("Wallpaper load:", e));
            }

            // 3. تسجيل Service Worker للتشغيل الأوفلاين 100% ودعم التثبيت المباشر على الأندرويد (يتطلب خادم http/https)
            if ('serviceWorker' in navigator && !window.require && (location.protocol === 'http:' || location.protocol === 'https:')) {
                navigator.serviceWorker.register('./service-worker.js')
                    .then(reg => console.log('📱 Service Worker registered for Android/Web Offline Mode:', reg.scope))
                    .catch(err => console.warn('SW registration failed:', err));
            }

            // 4. صمام الأمان الفولاذي: إنشاء نسخة احتياطية تلقائية وفورية في الخلفية عند الترقية لإصدار جديد
            try {
                const lastVer = getStore('bayan_last_run_version');
                const curVer = window.appVersion || '5.1.5';
                if (lastVer && lastVer !== curVer) {
                    console.log(`🛡️ [Safety Shield] Version upgrade detected (${lastVer} ➔ ${curVer}). Creating automatic background backup...`);
                    if (typeof window.executeAutoBackupToFile === 'function') {
                        window.executeAutoBackupToFile(true, false).then(() => {
                            console.log('✅ Post-upgrade background safety backup created successfully.');
                        }).catch(err => console.warn('Post-upgrade backup notice:', err));
                    }
                }
                setStore('bayan_last_run_version', curVer);
            } catch (e) { }

            // 5. تشغيل مزامنة الشبكة المحلية والتابلت
            if (window.BayanNetworkHub && typeof window.BayanNetworkHub.init === 'function') {
                window.BayanNetworkHub.init().catch(e => console.warn('[NetworkHub] Init error:', e));
            }

            console.log("🚀 نظام بَيَان المتكامل جاهز للعمل بنجاح!");
        } catch(err) {
            console.warn("loadData error:", err);
        } finally {
            window._isDataLoaderRunning = false;
        }
    })();

    window.loadDataPromise = window._dataLoaderPromise;
    return window._dataLoaderPromise;
};

// ⏱️ صمام أمان لبدء التحميل في الخلفية فقط إذا كان المستخدم مسجلاً لدخوله بالفعل مسبقاً
setTimeout(() => {
    if (window.currentUser && typeof window.startDataLoader === 'function') {
        window.startDataLoader();
    }
}, 1000);

// =========================================================================
// 📱 معالج تثبيت تطبيق الأندرويد والهواتف الذكية (PWA Install Prompt)
// =========================================================================
let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    console.log('📱 PWA Install Prompt captured.');

    // إظهار كارت تنبيه التثبيت للأندرويد والمتصفح بعد ثانيتين
    setTimeout(() => {
        if (!document.getElementById('pwa-android-install-banner') && !sessionStorage.getItem('pwa_banner_dismissed')) {
            const banner = document.createElement('div');
            banner.id = 'pwa-android-install-banner';
            banner.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; left: 20px; max-width: 480px; margin: 0 auto;
                background: linear-gradient(145deg, #1e113a, #0f172a); border: 2px solid rgba(212, 175, 55, 0.6);
                border-radius: 20px; padding: 14px 18px; color: white; z-index: 999999;
                box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(147, 51, 234, 0.3);
                display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
                direction: rtl; font-family: 'Cairo', sans-serif; animation: pwaSlideUp 0.4s ease;
                transition: opacity 0.25s ease, transform 0.25s ease;
            `;
            banner.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; flex: 1 1 200px; min-width: 0;">
                    <img src="media/bayan_logo.png" style="width:44px; height:44px; border-radius:12px; border:1.5px solid rgba(255,255,255,0.2); box-shadow:0 4px 12px rgba(0,0,0,0.3); flex-shrink: 0;" alt="Logo">
                    <div style="min-width: 0;">
                        <div style="font-weight:900; font-size:0.95rem; color:#ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">تثبيت تطبيق بَيَان POS 📱</div>
                        <div style="font-size:0.75rem; color:#cbd5e1; font-weight:700;">ثبّت التطبيق ليعمل بدون إنترنت كبرنامج أصلي</div>
                    </div>
                </div>
                <div style="display:flex; gap:10px; align-items:center; justify-content: flex-end; flex-shrink: 0;">
                    <button id="btnPwaInstallNow" style="padding:9px 18px; border-radius:12px; background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; font-weight:900; font-size:0.86rem; cursor:pointer; font-family:'Cairo',sans-serif; box-shadow:0 4px 15px rgba(16,185,129,0.4); transition:0.2s; white-space: nowrap;">
                        تثبيت الآن
                    </button>
                    <button id="btnPwaDismiss" title="إغلاق التنبيه" aria-label="إغلاق" style="width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.15); border:1.5px solid rgba(255,255,255,0.35); color:#ffffff; font-size:1.2rem; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s ease; box-shadow:0 2px 6px rgba(0,0,0,0.25); flex-shrink: 0;" onmouseover="this.style.background='rgba(239,68,68,0.35)'; this.style.borderColor='#ef4444'; this.style.color='#fecaca';" onmouseout="this.style.background='rgba(255,255,255,0.15)'; this.style.borderColor='rgba(255,255,255,0.35)'; this.style.color='#ffffff';">✕</button>
                </div>
            `;
            document.body.appendChild(banner);

            const closeBanner = () => {
                banner.style.opacity = '0';
                banner.style.transform = 'translateY(15px)';
                setTimeout(() => banner.remove(), 250);
            };

            document.getElementById('btnPwaInstallNow').addEventListener('click', async () => {
                if (deferredPwaPrompt) {
                    deferredPwaPrompt.prompt();
                    const { outcome } = await deferredPwaPrompt.userChoice;
                    console.log(`PWA user response: ${outcome}`);
                    deferredPwaPrompt = null;
                    closeBanner();
                }
            });

            document.getElementById('btnPwaDismiss').addEventListener('click', () => {
                sessionStorage.setItem('pwa_banner_dismissed', 'true');
                try { localStorage.setItem('pwa_banner_dismissed', 'true'); } catch (e) { }
                closeBanner();
            });
        }
    }, 2000);
});

// =========================================================================
// 🔒 نظام الأمان: تم إغلاق أي اختصارات تجاوزية لحماية خصوصية الحسابات والأرباح
// =========================================================================


