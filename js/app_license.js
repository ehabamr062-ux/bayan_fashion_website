// ============================================================
//  نظام التراخيص وخطط الاشتراك وحماية الأجهزة (License & Plans)
// ============================================================

// دالة موحدة مركزية لحساب عدد الفواتير المستهلكة في النسخة التجريبية بدقة وحمايتها من التحايل
function getEffectiveTrialInvoicesCount() {
    let actualCount = 0;
    if (typeof transactions !== 'undefined' && Array.isArray(transactions)) {
        const ops = transactions.filter(t => t.type && (t.type.includes('بيع') || t.type.includes('شراء')) && !t.type.includes('مرتجع') && t.invoiceId);
        const uniqueIds = new Set(ops.map(t => t.invoiceId));
        actualCount = uniqueIds.size;
    }
    let storedMax = parseInt((typeof getStore === 'function' ? getStore('bayan_trial_max_invoices') : null) || '0', 10);

    // 🔒 صمام أمان: عداد فواتير التجربة تصاعدي دائماً ولا ينقص بحذف الفواتير
    if (actualCount > storedMax && typeof setStore === 'function') {
        storedMax = actualCount;
        setStore('bayan_trial_max_invoices', String(actualCount));
    }

    return Math.max(actualCount, storedMax);
}
window.getEffectiveTrialInvoicesCount = getEffectiveTrialInvoicesCount;

// الحد الأقصى الديناميكي لفواتير التجربة المجانية (الأساسي 200 + أي تمديد صادر من الإدارة عبر جوجل شيت)
function getTrialInvoicesMaxLimit() {
    const baseLimit = 200;
    let extra = 0;
    try {
        if (typeof getStore === 'function') {
            extra = parseInt(getStore('bayan_remote_extra_trial_limit') || '0', 10);
        }
    } catch (e) {}
    if (isNaN(extra) || extra < 0) extra = 0;
    return baseLimit + extra;
}
window.getTrialInvoicesMaxLimit = getTrialInvoicesMaxLimit;

// فحص هل الجهاز محظور عن بُعد من قبل الإدارة في Google Sheets
function isDeviceRemotelyBlocked() {
    try {
        if (typeof getStore === 'function') {
            return getStore('bayan_remote_blocked') === 'true';
        }
        return false;
    } catch (e) { return false; }
}
window.isDeviceRemotelyBlocked = isDeviceRemotelyBlocked;

// معالجة وتطبيق أوامر الإدارة الواردة عن بُعد من Google Sheets
window.applyRemoteAdminCommand = function (cmdData) {
    if (!cmdData || typeof cmdData !== 'object') return;
    const cmdType = String(cmdData.command || '').toUpperCase();

    // 1. أمر الحظر الفوري (Remote Block)
    if (cmdType === 'BLOCK') {
        const wasBlocked = isDeviceRemotelyBlocked();
        if (typeof setStore === 'function') {
            setStore('bayan_remote_blocked', 'true');
            if (cmdData.message) setStore('bayan_remote_block_msg', cmdData.message);
        }

        if (!wasBlocked) {
            console.warn("🛑 [Remote Control] Device has been REMOTELY BLOCKED by Admin.");
            if (typeof showCustomAlert === 'function') {
                showCustomAlert({
                    type: 'error',
                    titleText: '🛑 تم إيقاف صلاحية النظام بقرار الإدارة',
                    msg: cmdData.message || 'تم تعليق ترخيص وصلاحية هذا الجهاز بقرار من إدارة بَيَان POS.\nيرجى التواصل مع إدارة النظام والدعم الفني للاستفسار.',
                    confirmText: 'حسناً'
                });
            }
            if (typeof window.SubscriptionHistoryManager !== 'undefined' && typeof window.SubscriptionHistoryManager.renderTable === 'function') {
                window.SubscriptionHistoryManager.renderTable();
            }
        }
    } 
    // 2. أمر فك الحظر (Remote Unblock) أو تفريغ أمر الحظر من الشيت (NORMAL)
    else if (cmdType === 'UNBLOCK' || cmdType === 'NORMAL' || !cmdType) {
        const wasBlocked = isDeviceRemotelyBlocked();
        if (wasBlocked || cmdType === 'UNBLOCK') {
            if (typeof setStore === 'function') {
                setStore('bayan_remote_blocked', 'false');
                setStore('bayan_remote_block_msg', '');
            }

            console.log("✅ [Remote Control] Device unblocked by Admin (Command: " + (cmdType || 'NORMAL') + ").");
            if (typeof showToast === 'function') {
                showToast("✅ تم إلغاء حظر الجهاز واستعادة الصلاحية بنجاح!", "success");
            }
            if (typeof window.SubscriptionHistoryManager !== 'undefined' && typeof window.SubscriptionHistoryManager.renderTable === 'function') {
                window.SubscriptionHistoryManager.renderTable();
            }
        }
    } 
    // 3. أمر تمديد التجربة المجانية (Trial Extension)
    else if (cmdType === 'EXTEND_TRIAL') {
        // إذا كان الجهاز مشتركاً بالفعل في باقة مدفوعة (شهري / سنوي / مدى الحياة)، يتم تجاهل أمر تمديد التجربة تماماً
        const isPaidCustomer = (typeof getStore === 'function' && (
            getStore('bayan_trial_consumed') === 'true' || 
            getStore('bayan_has_subscribed_paid') === 'true'
        )) || (window.getBayanPlan && !window.getBayanPlan().includes('المجانية') && !window.getBayanPlan().includes('تجريب'));

        if (isPaidCustomer) {
            console.log("ℹ️ [Remote Control] Device is already on a paid subscription. Trial extension command ignored.");
            return;
        }

        const extra = parseInt(cmdData.extraLimit, 10) || 0;
        const currentExtra = parseInt((typeof getStore === 'function' ? getStore('bayan_remote_extra_trial_limit') : null) || '0', 10);
        const lastCelebratedExtra = parseInt((typeof getStore === 'function' ? getStore('bayan_last_celebrated_extra') : null) || '-1', 10);

        if (extra > 0) {
            if (typeof setStore === 'function') {
                setStore('bayan_remote_extra_trial_limit', String(extra));
            }

            const newTotal = (typeof getTrialInvoicesMaxLimit === 'function') ? getTrialInvoicesMaxLimit() : (200 + extra);
            const consumed = (typeof getEffectiveTrialInvoicesCount === 'function') ? getEffectiveTrialInvoicesCount() : 0;
            const remaining = Math.max(0, newTotal - consumed);

            console.log(`🎉 [Remote Control] Trial limit extended by ${extra} extra invoices (Total: ${newTotal}, Remaining: ${remaining}).`);

            // عرض نافذة التهنئة فقط إذا كانت هذه المنحة جديدة تماماً ولم يتم الاحتفال بها من قبل
            if (extra !== lastCelebratedExtra) {
                if (typeof setStore === 'function') {
                    setStore('bayan_last_celebrated_extra', String(extra));
                }
                if (typeof window.showTrialExtensionCelebrationModal === 'function') {
                    window.showTrialExtensionCelebrationModal({ extra, newTotal, consumed, remaining });
                } else if (typeof showToast === 'function') {
                    showToast(`🎉 تم تمديد فترة التجربة المجانية بـ ${extra} فاتورة إضافية من الإدارة!`, "success", 7000);
                }
            }

            if (typeof window.SubscriptionHistoryManager !== 'undefined' && typeof window.SubscriptionHistoryManager.renderTable === 'function') {
                window.SubscriptionHistoryManager.renderTable();
            }
        }
    }
    // 3.1 أمر تصفير أو إلغاء التمديد وإعادته للـ 200 الأساسية
    else if (cmdType === 'RESET_TRIAL') {
        const currentExtra = parseInt((typeof getStore === 'function' ? getStore('bayan_remote_extra_trial_limit') : null) || '0', 10);
        if (currentExtra > 0) {
            if (typeof setStore === 'function') {
                setStore('bayan_remote_extra_trial_limit', '0');
                setStore('bayan_last_celebrated_extra', '0');
            }
            if (typeof showToast === 'function') {
                showToast('ℹ️ تمت إعادة حد الفواتير التجريبية إلى الوضع الافتراضي (200 فاتورة).', 'info', 5000);
            }
            if (typeof window.SubscriptionHistoryManager !== 'undefined' && typeof window.SubscriptionHistoryManager.renderTable === 'function') {
                window.SubscriptionHistoryManager.renderTable();
            }
        }
    }
    // 4. أمر التفعيل عن بُعد (Remote Activation)
    else if (cmdType === 'ACTIVATE') {
        const plan = cmdData.plan || 'الباقة مدى الحياة';
        if (typeof LicenseService !== 'undefined' && typeof LicenseService.activatePlanRemotely === 'function') {
            LicenseService.activatePlanRemotely(plan);
        }
    }
};

// نافذة احتفالية فخمة عند منح رصيد فواتير إضافي من قبل المطور
window.showTrialExtensionCelebrationModal = function (details) {
    const modalId = 'trialExtensionCelebrationModal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    // إغلاق أي نافذة تنبيه سابقة خاصة بانتهاء الاشتراك إن كانت مفتوحة
    const alertModal = document.getElementById('alertModal');
    if (alertModal) alertModal.classList.add('hidden');

    const extra = details.extra || 0;
    const newTotal = details.newTotal || (200 + extra);
    const consumed = details.consumed || 0;
    const remaining = details.remaining || Math.max(0, newTotal - consumed);

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.88); z-index:999999999; display:flex; align-items:center; justify-content:center; direction:rtl; font-family:inherit;';

    modal.innerHTML = `
        <div style="background:linear-gradient(145deg, #ffffff, #f8fafc); border-radius:24px; padding:35px 25px; width:450px; max-width:92%; text-align:center; box-shadow:0 25px 60px rgba(0,0,0,0.35); border:2px solid #10b981; position:relative; overflow:hidden;">
            <div style="position:absolute; top:0; left:0; right:0; height:6px; background:linear-gradient(90deg, #10b981, #06b6d4, #3b82f6);"></div>
            
            <div style="font-size:3.5rem; margin-bottom:10px; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.1));">🎁✨</div>
            
            <h3 style="margin:0 0 8px 0; color:#0f172a; font-size:1.4rem; font-weight:900;">تهانينا! هدية خاصة من المطور 🚀</h3>
            <p style="color:#475569; font-size:0.92rem; margin-bottom:18px; line-height:1.6;">
                قام مطور وإدارة نظام <b style="color:#0f172a;">بَيَان فاشون POS</b> بمنحك رصيد فواتير إضافي لمواصلة تجربة النظام:
            </p>

            <div style="background:#ecfdf5; border:1.5px solid #a7f3d0; border-radius:16px; padding:16px 14px; margin-bottom:18px; text-align:right;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px dashed #6ee7b7; padding-bottom:8px;">
                    <span style="color:#065f46; font-size:0.95rem; font-weight:bold;">➕ الفواتير الإضافية الممنوحة:</span>
                    <span style="color:#047857; font-size:1.25rem; font-weight:900; font-family:monospace; background:#d1fae5; padding:2px 10px; border-radius:8px;">+${extra} فاتورة</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px dashed #6ee7b7; padding-bottom:8px;">
                    <span style="color:#065f46; font-size:0.92rem; font-weight:bold;">🎯 الحد الإجمالي الجديد:</span>
                    <span style="color:#0f172a; font-size:1.15rem; font-weight:900; font-family:monospace;">${newTotal} فاتورة</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:#065f46; font-size:0.92rem; font-weight:bold;">⏳ رصيدك المتبقي للإصدار الآن:</span>
                    <span style="color:#2563eb; font-size:1.25rem; font-weight:900; font-family:monospace; background:#e0f2fe; padding:2px 10px; border-radius:8px;">${remaining} فاتورة</span>
                </div>
            </div>

            <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:10px 14px; margin-bottom:20px; font-size:0.82rem; color:#92400e; line-height:1.5; font-weight:600; text-align:right;">
                ⚠️ <b>تنبيه هام:</b> سيتم قفل حفظ الفواتير تلقائياً فور استهلاك هذا الرصيد والوصول إلى الفاتورة رقم (${newTotal}).
            </div>

            <button onclick="document.getElementById('${modalId}').remove(); if(typeof showToast==='function') showToast('تم تفعيل الرصيد الإضافي بنجاح، يمكنك مواصلة البيع الآن!', 'success');" 
                style="background:linear-gradient(135deg, #059669, #10b981); color:#ffffff; border:none; padding:12px 25px; border-radius:12px; font-size:1rem; font-weight:bold; cursor:pointer; width:100%; box-shadow:0 10px 20px rgba(16, 185, 129, 0.3); transition:all 0.2s;">
                شكراً، متابعة إصدار الفواتير 🚀
            </button>
        </div>
    `;

    document.body.appendChild(modal);
};

// دالة التحقق من قرار الإدارة وفك الإيقاف فقط إذا وافقت الإدارة في جوجل شيت
window.checkRemoteUnblockNow = async function (btnElement) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.dataset.origHtml = btnElement.innerHTML;
        btnElement.innerHTML = '<span>⏳ جاري التحقق من خادم الإدارة...</span>';
        btnElement.style.opacity = '0.7';
    }

    try {
        if (!navigator.onLine) {
            if (typeof showToast === 'function') {
                showToast('⚠️ يرجى التأكد من اتصال الجهاز بالإنترنت للتحقق من خادم الإدارة!', 'warning');
            }
            return;
        }

        if (window.CloudTelemetry && typeof window.CloudTelemetry.checkRemoteCommandNow === 'function') {
            const result = await window.CloudTelemetry.checkRemoteCommandNow();
            if (result && result.command === 'BLOCK') {
                if (typeof showToast === 'function') {
                    showToast('🛑 ما زال هذا الجهاز معلقاً بقرار من الإدارة، يرجى التواصل مع الدعم الفني.', 'error', 7000);
                }
            } else if (!isDeviceRemotelyBlocked()) {
                if (typeof showToast === 'function') {
                    showToast('🎉 تم التحقق من الإدارة واستعادة صلاحية النظام بنجاح!', 'success');
                }
                const alertModal = document.getElementById('alertModal');
                if (alertModal) alertModal.classList.add('hidden');
            } else {
                if (typeof showToast === 'function') {
                    showToast('🛑 لم يصدر أمر فك حظر من الإدارة بعد.', 'warning');
                }
            }
        }
    } catch (e) {
        if (typeof showToast === 'function') {
            showToast('⚠️ تعذر الاتصال بخادم الإدارة حالياً، يرجى المحاولة لاحقاً.', 'error');
        }
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = btnElement.dataset.origHtml || '<span>🔄 التحقق من قرار الإدارة الآن</span>';
            btnElement.style.opacity = '1';
        }
    }
};

window.unblockDeviceLocally = function () {
    console.warn("🔒 [Security] تم إلغاء وتعطيل فك الحظر المحلي لحماية النظام. قرار فك الحظر يتم مركزياً من خادم الإدارة فقط.");
    if (typeof showToast === 'function') {
        showToast('🔒 فك الحظر يتم مركزياً من إدارة النظام فقط.', 'warning');
    }
};

// دالة الفحص اللحظي المباشر لأوامر المطور بضغطة زر
window.checkRemoteGrantNow = async function (btnElement) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.dataset.origHtml = btnElement.innerHTML;
        btnElement.innerHTML = '<span>⏳ جاري فحص أوامر المطور من السيرفر...</span>';
        btnElement.style.opacity = '0.7';
    }

    try {
        if (!navigator.onLine) {
            if (typeof showToast === 'function') showToast('⚠️ يرجى التأكد من اتصال الجهاز بالإنترنت أولاً!', 'warning');
            return;
        }

        if (window.CloudTelemetry && typeof window.CloudTelemetry.checkRemoteCommandNow === 'function') {
            const result = await window.CloudTelemetry.checkRemoteCommandNow();
            if (result && result.command === 'EXTEND_TRIAL' && result.extraLimit > 0) {
                return;
            } else if (result && result.command === 'ACTIVATE') {
                if (typeof showToast === 'function') showToast('🎉 تم تفعيل باقتك عن بُعد بنجاح!', 'success');
                const alertModal = document.getElementById('alertModal');
                if (alertModal) alertModal.classList.add('hidden');
                return;
            } else {
                if (typeof showToast === 'function') {
                    showToast('ℹ️ لم يتم العثور على أمر تمديد جديد مسجل لهذا الجهاز في جدول الإدارة حتى الآن.', 'info', 6000);
                }
            }
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('⚠️ تعذر الاتصال بخادم الإدارة، يرجى المحاولة بعد قليل.', 'error');
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = btnElement.dataset.origHtml || '<span>🔄 التحقق من تمديد فواتير من المطور الآن</span>';
            btnElement.style.opacity = '1';
        }
    }
};


// ================= سجل الاشتراكات والتراخيص والمراقبة الحية (Subscription History & Monitor Engine) =================
window.SubscriptionHistoryManager = {
    getHistory: function () {
        let history = [];
        try {
            const raw = (typeof getStore === 'function') ? getStore('bayan_subscription_history') : null;
            if (raw) history = JSON.parse(raw);
        } catch (e) {
            history = [];
        }
        if (!Array.isArray(history)) history = [];
        return history;
    },

    saveHistory: function (history) {
        try {
            const str = JSON.stringify(history);
            if (typeof setStore === 'function') setStore('bayan_subscription_history', str);
        } catch (e) {
            console.error("Error saving subscription history:", e);
        }
    },

    // المزامنة الحية والذكية مع تراخيص النظام واشتراكات الجهاز (Live Monitor & System Sync)
    syncWithSystem: function () {
        let history = this.getHistory();

        // 1. قراءة بيانات الترخيص من النظام
        let licenseInfo = null;
        try {
            const rawLic = typeof getStore === 'function' ? getStore('license_info') : null;
            if (rawLic) licenseInfo = JSON.parse(rawLic);
        } catch (e) { }

        // فحص هل العميل اشترك مسبقاً أو حالياً في أي باقة مدفوعة (شهري، سنوي، مدى الحياة)
        const storedTrialConsumed = (typeof getStore === 'function' && (getStore('bayan_trial_consumed') === 'true' || getStore('bayan_has_subscribed_paid') === 'true'));
        const hasPaidInHistory = history.some(h => (h.id > 1) || (h.plan && !h.plan.includes('تجريب') && !h.plan.includes('المجانية')));
        const hasPaidInLic = (licenseInfo && licenseInfo.plan && licenseInfo.plan !== 'باقة نسخة المجانية' && licenseInfo.plan !== 'Blocked');
        const hasPaidInStore = (typeof getStore === 'function' && getStore('bayan_current_plan') && getStore('bayan_current_plan') !== 'باقة نسخة المجانية' && getStore('bayan_current_plan') !== 'Blocked');
        const hasActiveLicPlan = (window.activeLicense && window.activeLicense.plan && window.activeLicense.plan !== 'باقة نسخة المجانية' && window.activeLicense.plan !== 'Blocked');
        const hasUsedCodes = (typeof getStore === 'function' && (() => {
            try {
                const u = JSON.parse(getStore('bayan_used_license_codes') || '[]');
                return Array.isArray(u) && u.length > 0;
            } catch(e) { return false; }
        })());

        // إذا كان الجهاز قد قام بالترقية لأي باقة مدفوعة، تُعتبر التجربة مغلقة للأبد
        const hasSubscribedPaid = !!(storedTrialConsumed || hasPaidInHistory || hasPaidInLic || hasPaidInStore || hasActiveLicPlan || hasUsedCodes);

        if (hasSubscribedPaid && typeof setStore === 'function') {
            setStore('bayan_trial_consumed', 'true');
            setStore('bayan_has_subscribed_paid', 'true');
        }

        // تحديد اسم الباقة المدفوعة المسجلة
        let paidPlanName = (licenseInfo && licenseInfo.plan && licenseInfo.plan !== 'باقة نسخة المجانية' && licenseInfo.plan !== 'Blocked' ? licenseInfo.plan : null) || 
                          (typeof getStore === 'function' && getStore('bayan_current_plan') && getStore('bayan_current_plan') !== 'باقة نسخة المجانية' && getStore('bayan_current_plan') !== 'Blocked' ? getStore('bayan_current_plan') : null) || 
                          (hasActiveLicPlan ? window.activeLicense.plan : null);

        if (hasSubscribedPaid && !paidPlanName) {
            const existing = history.find(h => (h.id > 1) || (h.plan && !h.plan.includes('تجريب')));
            paidPlanName = (existing && existing.plan) ? existing.plan : 'الباقة الشهرية';
        }

        let currentPlan = hasSubscribedPaid ? (paidPlanName || 'الباقة الشهرية') : 
                          ((licenseInfo && licenseInfo.plan) || (typeof window.getBayanPlan === 'function' ? window.getBayanPlan() : null) || 'باقة نسخة المجانية');

        let expiryDateStr = (licenseInfo && licenseInfo.expiry) || 
                            (typeof window.getBayanExpiry === 'function' ? window.getBayanExpiry() : null) || 
                            (typeof getStore === 'function' ? getStore('bayan_expiry_date') : null) || '';

        const installDate = (typeof getStore === 'function' ? getStore('bayan_install_date') : null) || 
                            (licenseInfo && licenseInfo.activationDate) || 
                            new Date().toISOString();

        const activationDate = (licenseInfo && licenseInfo.activationDate) || 
                               (typeof getStore === 'function' ? getStore('bayan_install_date') : null) || 
                               installDate;

        let licenseCode = (licenseInfo && licenseInfo.code) || '';
        if (!licenseCode && typeof getStore === 'function') {
            try {
                const used = JSON.parse(getStore('bayan_used_license_codes') || '[]');
                if (Array.isArray(used) && used.length > 0) licenseCode = used[used.length - 1];
            } catch (e) {}
        }

        const isPlanValid = (typeof window.isSubscriptionValid === 'function') ? window.isSubscriptionValid() : true;

        // حساب عدد الفواتير المستهلكة في النسخة التجريبية بدقة
        let trialInvoicesCount = 0;
        const storedTrialFinal = typeof getStore === 'function' ? getStore('bayan_trial_final_count') : null;
        if (storedTrialFinal) {
            trialInvoicesCount = parseInt(storedTrialFinal, 10) || 0;
        } else {
            if (hasSubscribedPaid && typeof transactions !== 'undefined' && Array.isArray(transactions) && activationDate) {
                const actTime = new Date(activationDate).getTime();
                const trialOps = transactions.filter(t => {
                    if (!t.invoiceId || (t.type && t.type.includes('مرتجع'))) return false;
                    if (t.date) {
                        const tTime = new Date(t.date).getTime();
                        return tTime <= (actTime + 60000);
                    }
                    return true;
                });
                const uniqueIds = new Set(trialOps.map(t => t.invoiceId));
                trialInvoicesCount = uniqueIds.size;
            }
            if (trialInvoicesCount === 0 && typeof getEffectiveTrialInvoicesCount === 'function') {
                trialInvoicesCount = getEffectiveTrialInvoicesCount();
            }
            if (hasSubscribedPaid && trialInvoicesCount > 0 && typeof setStore === 'function') {
                setStore('bayan_trial_final_count', String(trialInvoicesCount));
            }
        }

        // ================= 2. فحص وضبط السجل رقم 1: النسخة التجريبية =================
        const dynamicTrialLimit = (typeof getTrialInvoicesMaxLimit === 'function') ? getTrialInvoicesMaxLimit() : 200;
        const isBlocked = (typeof isDeviceRemotelyBlocked === 'function') && isDeviceRemotelyBlocked();

        let trialRecord = history.find(h => h.id === 1 || h.isTrial);
        if (!trialRecord) {
            trialRecord = {
                id: 1,
                isTrial: true,
                plan: 'النسخة التجريبية المجانية',
                code: hasSubscribedPaid ? `استُهلكت ${trialInvoicesCount} فاتورة` : `تجريبية (${trialInvoicesCount}/${dynamicTrialLimit} فاتورة)`,
                startDate: installDate,
                expiryDate: hasSubscribedPaid ? activationDate : `حد ${dynamicTrialLimit} فاتورة`,
                status: isBlocked ? 'محظورة' : (hasSubscribedPaid ? 'مكتملة' : (trialInvoicesCount >= dynamicTrialLimit ? 'منتهية' : 'نشطة')),
                consumedInvoices: trialInvoicesCount,
                notes: isBlocked ? '⛔ تم تعليق هذا الجهاز بقرار من الإدارة' : (hasSubscribedPaid ? `استُهلكت ${trialInvoicesCount} فاتورة فقط وأغلقت التجربة نهائياً للاشتراك` : `تم استهلاك ${trialInvoicesCount} من أصل ${dynamicTrialLimit} فاتورة`)
            };
            history.unshift(trialRecord);
        } else {
            trialRecord.isTrial = true;
            trialRecord.plan = 'النسخة التجريبية المجانية';
            trialRecord.consumedInvoices = trialInvoicesCount;
            trialRecord.startDate = trialRecord.startDate || installDate;

            if (isBlocked) {
                trialRecord.status = 'محظورة';
                trialRecord.code = `⛔ محظور (${trialInvoicesCount}/${dynamicTrialLimit})`;
                trialRecord.notes = 'تم تعليق هذا الجهاز بقرار من الإدارة';
            } else if (hasSubscribedPaid) {
                // التجربة أغلقت للأبد بالترقية ولا يمكن أن تكون نشطة إطلاقاً
                trialRecord.status = 'مكتملة';
                trialRecord.code = `استُهلكت ${trialInvoicesCount} فاتورة`;
                trialRecord.expiryDate = activationDate;
                trialRecord.notes = `استُهلكت ${trialInvoicesCount} فاتورة فقط وأغلقت التجربة نهائياً للاشتراك`;
            } else {
                trialRecord.status = (trialInvoicesCount >= dynamicTrialLimit) ? 'منتهية' : 'نشطة';
                trialRecord.code = `تجريبية (${trialInvoicesCount}/${dynamicTrialLimit} فاتورة)`;
                trialRecord.expiryDate = `حد ${dynamicTrialLimit} فاتورة`;
                trialRecord.notes = `تم استهلاك ${trialInvoicesCount} من أصل ${dynamicTrialLimit} فاتورة`;
            }
        }

        // ================= 3. فحص وضبط السجلات المدفوعة (الباقة الشهرية / السنوية / مدى الحياة) =================
        if (hasSubscribedPaid && paidPlanName) {
            let paidRecord = history.find(h => (h.id > 1) || (h.plan && !h.plan.includes('تجريب')));

            let isCurrentExpired = false;
            if (paidPlanName.includes('حياة') || paidPlanName.includes('احترافية')) {
                isCurrentExpired = false;
            } else if (expiryDateStr) {
                isCurrentExpired = (new Date() > new Date(expiryDateStr));
            } else {
                isCurrentExpired = !isPlanValid;
            }

            const currentStatus = isCurrentExpired ? 'منتهية' : 'نشطة';

            if (!paidRecord) {
                paidRecord = {
                    id: 2,
                    plan: paidPlanName,
                    code: licenseCode || 'ترخيص معتمد 🔑',
                    startDate: activationDate,
                    expiryDate: expiryDateStr || (paidPlanName.includes('حياة') ? 'مدى الحياة ♾️' : ''),
                    status: currentStatus,
                    notes: isCurrentExpired ? 'انتهت فترة صلاحية الاشتراك' : 'اشتراك سارٍ ونشط'
                };
                history.push(paidRecord);
            } else {
                paidRecord.plan = paidPlanName;
                paidRecord.status = currentStatus;
                if (expiryDateStr) paidRecord.expiryDate = expiryDateStr;
                if (licenseCode && licenseCode !== 'ترخيص معتمد 🔑') paidRecord.code = licenseCode;
                paidRecord.notes = isCurrentExpired ? 'انتهت فترة صلاحية الاشتراك' : 'اشتراك سارٍ ونشط';
            }
        }

        // مراقبة تواريخ جميع السجلات: إذا كان هناك سجل سابق تاريخه انتهى يتم تحديثه
        history.forEach(item => {
            if (item.id > 1 && item.expiryDate && !item.expiryDate.includes('حياة') && !item.expiryDate.includes('فاتورة')) {
                try {
                    const exp = new Date(item.expiryDate);
                    if (new Date() > exp) {
                        item.status = 'منتهية';
                    }
                } catch (e) {}
            }
        });

        // إعادة ترقيم المعرفات
        history.forEach((item, index) => {
            item.id = index + 1;
        });

        this.saveHistory(history);
        return history;
    },

    addRecord: function (record) {
        let history = this.syncWithSystem();
        // إغلاق أي اشتراك نشط سابق
        history.forEach(item => {
            if (item.status === 'نشطة') {
                item.status = 'مكتملة';
            }
        });

        const nextId = history.length + 1;
        const newRecord = {
            id: nextId,
            plan: record.plan || 'باقة غير محددة',
            code: record.code || 'ترخيص معتمد 🔑',
            startDate: record.startDate || new Date().toISOString(),
            expiryDate: record.expiryDate || '',
            status: record.status || 'نشطة',
            notes: record.notes || ''
        };
        history.push(newRecord);
        this.saveHistory(history);
        this.renderTable();
        return newRecord;
    },

    renderTable: function () {
        const tbody = document.getElementById('subscriptionHistoryTableBody');
        if (!tbody) return;

        // تنفيذ المزامنة الحية قبل كل عرض لضمان دقة البيانات 100%
        const history = this.syncWithSystem();
        const hasSubscribedPaid = (typeof getStore === 'function' && (getStore('bayan_trial_consumed') === 'true' || getStore('bayan_has_subscribed_paid') === 'true'));

        tbody.innerHTML = '';

        history.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #cbd5e1';
            tr.style.transition = '0.2s';
            tr.style.background = '#ffffff';

            let statusBadge = '';
            if (item.isTrial || item.plan.includes('تجريب') || item.plan.includes('المجانية')) {
                if (hasSubscribedPaid || item.status === 'مكتملة') {
                    statusBadge = `<span style="background: #f1f5f9; color: #475569; border: 1.5px solid #cbd5e1; padding: 4px 12px; border-radius: 50px; font-weight: 950; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 5px;">⚪ مغلقة نهائياً (تمت الترقية)</span>`;
                } else if (item.status === 'نشطة') {
                    statusBadge = `<span style="background: #ecfdf5; color: #047857; border: 1.5px solid #10b981; padding: 4px 12px; border-radius: 50px; font-weight: 950; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 5px;">🟢 نشطة حالياً</span>`;
                } else {
                    statusBadge = `<span style="background: #fef2f2; color: #b91c1c; border: 1.5px solid #ef4444; padding: 4px 12px; border-radius: 50px; font-weight: 950; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 5px;">🔴 استُهلكت كاملة</span>`;
                }
            } else {
                if (item.status === 'نشطة') {
                    statusBadge = `<span style="background: #ecfdf5; color: #047857; border: 1.5px solid #10b981; padding: 4px 12px; border-radius: 50px; font-weight: 950; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 5px;">🟢 نشطة حالياً</span>`;
                } else {
                    statusBadge = `<span style="background: #fef2f2; color: #b91c1c; border: 1.5px solid #ef4444; padding: 4px 12px; border-radius: 50px; font-weight: 950; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 5px;">🔴 منتهية الصلاحية</span>`;
                }
            }

            let startFormatted = item.startDate ? new Date(item.startDate).toLocaleDateString('ar-EG') : '---';
            let expiryFormatted = item.expiryDate;
            if (item.expiryDate && !item.expiryDate.includes('فاتورة') && !item.expiryDate.includes('مدى الحياة') && !item.expiryDate.includes('ترقية')) {
                try {
                    const d = new Date(item.expiryDate);
                    if (!isNaN(d.getTime())) {
                        expiryFormatted = d.toLocaleDateString('ar-EG');
                    }
                } catch (e) {}
            }

            let planIcon = '📦';
            if (item.plan.includes('تجريب') || item.plan.includes('المجانية')) planIcon = '🌱';
            else if (item.plan.includes('شهر') || item.plan.includes('الأساسية')) planIcon = '⚡';
            else if (item.plan.includes('سنو') || item.plan.includes('المتقدمة')) planIcon = '🚀';
            else if (item.plan.includes('حياة') || item.plan.includes('الاحترافية')) planIcon = '👑';

            // تخصيص خانة كود التفعيل لتوضيح الفواتير المستهلكة في التجربة أو كود التفعيل الرسمي
            let codeDisplay = '';
            if (item.isTrial || item.plan.includes('تجريب') || item.plan.includes('المجانية')) {
                const countVal = item.consumedInvoices || (typeof getEffectiveTrialInvoicesCount === 'function' ? getEffectiveTrialInvoicesCount() : 0);
                if (hasSubscribedPaid || item.status === 'مكتملة') {
                    codeDisplay = `<span style="background: #f1f5f9; color: #1e293b; padding: 3px 8px; border-radius: 6px; font-weight: 900; font-size: 0.84rem; border: 1px solid #cbd5e1;">استُهلكت ${countVal} فاتورة</span>`;
                } else {
                    codeDisplay = `<span style="background: #ecfdf5; color: #047857; padding: 3px 8px; border-radius: 6px; font-weight: 900; font-size: 0.84rem; border: 1px solid #a7f3d0;">${countVal} من 200 فاتورة</span>`;
                }
            } else {
                codeDisplay = `<span style="font-family: monospace; font-weight: 950; color: #0f172a; font-size: 0.92rem; direction: ltr; display: inline-block; letter-spacing: 0.5px;">${item.code || 'ترخيص معتمد 🔑'}</span>`;
            }

            tr.innerHTML = `
                <td style="padding: 12px 14px; text-align: center; font-weight: 950; color: #0f172a; font-size: 0.95rem;">${item.id}</td>
                <td style="padding: 12px 14px; font-weight: 950; color: #0f172a; font-size: 0.95rem;">
                    <span style="margin-left: 6px;">${planIcon}</span> ${item.plan}
                </td>
                <td style="padding: 12px 14px; text-align: center;">${codeDisplay}</td>
                <td style="padding: 12px 14px; text-align: center; font-weight: 950; color: #0f172a; font-size: 0.92rem;">${startFormatted}</td>
                <td style="padding: 12px 14px; text-align: center; font-weight: 950; color: ${item.status === 'منتهية' ? '#dc2626' : (item.status === 'نشطة' ? '#047857' : '#475569')}; font-size: 0.92rem;">${expiryFormatted || '---'}</td>
                <td style="padding: 12px 14px; text-align: center;">${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    }
};

function showSubscription() {
    const modal = document.getElementById('subscriptionModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.setProperty('display', 'flex', 'important');
    }
    const closeBtn = document.getElementById('closeSubBtn');
    if (closeBtn) closeBtn.style.display = 'flex';

    // ⚡ تفريغ خيط المعالجة فوراً لتظهر النافذة للمستخدم في 0ms بدون أي تعليق
    setTimeout(() => {
        _populateSubscriptionModalDetails();
    }, 10);
}
window.showSubscription = showSubscription;

function _populateSubscriptionModalDetails() {
    // حساب فواتير التجربة مرة واحدة فقط واستخدام نفس النتيجة في كامل الدالة لمنع تكرار الفحص الثقيل
    const invoiceCount = getEffectiveTrialInvoicesCount();

    const currentPlan = window.getBayanPlan();
    const isPlanValid = (typeof window.isSubscriptionValid === 'function') ? window.isSubscriptionValid() : true;

    const currentPlanEl = document.getElementById('currentPlanText');
    if (currentPlanEl) {
        if (currentPlan === 'باقة نسخة المجانية') {
            if (invoiceCount >= 200) {
                currentPlanEl.innerHTML = `<span style="color: #ef4444; font-weight: 950;">باقة نسخة المجانية (انتهت التجربة 🛑)</span>`;
            } else {
                currentPlanEl.innerHTML = `<span style="color: #4ade80; font-weight: 950;">باقة نسخة المجانية (سارية 🌱)</span>`;
            }
        } else {
            if (isPlanValid) {
                currentPlanEl.innerHTML = `<span style="color: #4ade80; font-weight: 950;">${currentPlan} (نشطة وسارية ✓)</span>`;
            } else {
                currentPlanEl.innerHTML = `<span style="color: #ef4444; font-weight: 950;">${currentPlan} (انتهت صلاحية الاشتراك 🛑)</span>`;
            }
        }
    }

    const trialCountEl = document.getElementById('trialInvoicesCount');
    if (trialCountEl) trialCountEl.innerText = invoiceCount;

    const trialStatusEl = document.getElementById('trialStatusText');
    const hasEverSubscribed = (typeof getStore === 'function') && (
        getStore('bayan_trial_consumed') === 'true' || 
        getStore('bayan_has_subscribed_paid') === 'true' ||
        (currentPlan !== 'باقة نسخة المجانية' && currentPlan !== 'Blocked')
    );

    if (trialStatusEl) {
        if (hasEverSubscribed) {
            trialStatusEl.innerText = 'الحالة: مغلقة نهائياً (تمت الترقية) ✓';
            trialStatusEl.style.color = '#64748b'; // Closed
        } else if (currentPlan === 'باقة نسخة المجانية') {
            if (invoiceCount >= 200) {
                trialStatusEl.innerText = 'الحالة: انتهت (200/200)';
                trialStatusEl.style.color = '#ef4444'; // Red
            } else {
                trialStatusEl.innerText = `الحالة: نشطة (متبقي ${200 - invoiceCount} فاتورة)`;
                trialStatusEl.style.color = '#10b981'; // Green
            }
        } else {
            trialStatusEl.innerText = 'الحالة: مغلقة نهائياً (تمت الترقية) ✓';
            trialStatusEl.style.color = '#64748b';
        }
    }

    // Reset all cards styling cleanly
    const allCards = document.querySelectorAll('.plan-card');
    allCards.forEach(card => {
        card.classList.remove('plan-active-emerald', 'plan-expired-card', 'plan-active-purple', 'active-plan', 'hide-featured-badge');
        card.style.border = '';
        card.style.boxShadow = '';
        card.style.transform = '';
        const marker = card.querySelector('.active-marker');
        if (marker) {
            marker.style.display = 'none';
            marker.style.background = '';
            marker.innerText = 'بـاقتـك الـحـالـيـة ⚡';
        }

        const subBtn = card.querySelector('.sub-btn');
        if (subBtn && card.id !== 'plan-باقة نسخة المجانية') {
            subBtn.innerText = 'اشترك الآن';
            subBtn.style.background = '';
            subBtn.style.boxShadow = '';
            subBtn.style.cursor = 'pointer';
            subBtn.disabled = false;
        }
    });

    // تحديد كارت الباقة الحالية بدقة عبر المسميات المختلفة
    let cardId = '';
    if (hasEverSubscribed && (currentPlan === 'باقة نسخة المجانية' || !currentPlan)) {
        // إذا كان العميل قد اشترك مسبقاً، فنحدد باقته السابقة (الأساسية/الشهرية) وليس كارت المجاني
        cardId = 'plan-الباقة الأساسية';
    } else if (currentPlan === 'باقة نسخة المجانية' || currentPlan.includes('مجانية') || currentPlan.includes('تجريب')) cardId = 'plan-باقة نسخة المجانية';
    else if (currentPlan.includes('شهر') || currentPlan.includes('الأساسية')) cardId = 'plan-الباقة الأساسية';
    else if (currentPlan.includes('سنو') || currentPlan.includes('المتقدمة')) cardId = 'plan-الباقة المتقدمة';
    else if (currentPlan.includes('حياة') || currentPlan.includes('احترافية')) cardId = 'plan-الباقة الاحترافية';

    if (cardId) {
        const activeCard = document.getElementById(cardId);
        if (activeCard) {
            const marker = activeCard.querySelector('.active-marker');
            const subBtn = activeCard.querySelector('.sub-btn');

            if (cardId === 'plan-باقة نسخة المجانية') {
                if (hasEverSubscribed) {
                    activeCard.classList.add('plan-expired-card');
                    if (marker) {
                        marker.style.display = 'block';
                        marker.innerText = 'مغلقة نهائياً (تم الترقية) 🔒';
                        marker.style.background = '#64748b';
                    }
                } else {
                    if (invoiceCount >= 200) {
                        activeCard.classList.add('plan-expired-card');
                        if (marker) {
                            marker.style.display = 'block';
                            marker.innerText = 'انتهت فترة التجربة 🛑';
                            marker.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
                        }
                    } else {
                        activeCard.classList.add('plan-active-emerald');
                        if (marker) {
                            marker.style.display = 'block';
                            marker.innerText = 'بـاقتـك الـحـالـيـة (تجريبية) ⚡';
                            marker.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                        }
                    }
                }
            } else if (isPlanValid) {
                // حالة الباقة المدفوعة السارية والنشطة
                activeCard.classList.add('plan-active-emerald');
                // إخفاء شارة الأكثر مبيعاً إذا كانت هي الباقة السنوية لمنع التداخل والتراكب
                if (cardId === 'plan-الباقة المتقدمة') {
                    activeCard.classList.add('hide-featured-badge');
                }
                if (marker) {
                    marker.style.display = 'block';
                    marker.innerText = 'بـاقتـك الـحـالـيـة (سارية) ⚡';
                    marker.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                }
                if (subBtn) {
                    subBtn.innerText = 'أنت مشترك بالفعل ✓';
                    subBtn.style.background = '#047857';
                    subBtn.style.cursor = 'not-allowed';
                    subBtn.disabled = true;
                }
            } else {
                // حالة الباقة المنتهية (Expired): فك القفل فوراً والسماح بالتجديد
                activeCard.classList.add('plan-expired-card');
                if (cardId === 'plan-الباقة المتقدمة') {
                    activeCard.classList.add('hide-featured-badge');
                }
                if (marker) {
                    marker.style.display = 'block';
                    marker.innerText = '⚠️ انتهت صلاحية هذه الباقة';
                    marker.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
                }
                if (subBtn) {
                    subBtn.innerText = '🔄 تجديد الاشتراك الآن';
                    subBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                    subBtn.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.4)';
                    subBtn.style.cursor = 'pointer';
                    subBtn.disabled = false;
                }
            }
        }
    }

    // تحديث جدول سجل الاشتراكات والتراخيص
    if (window.SubscriptionHistoryManager && typeof window.SubscriptionHistoryManager.renderTable === 'function') {
        window.SubscriptionHistoryManager.renderTable();
    }

    // مزامنة حالة أسعار الباقات (محلي أو سحابي)
    if (typeof window.syncSubscriptionPricingDisplay === 'function') {
        window.syncSubscriptionPricingDisplay();
    }
}
window._populateSubscriptionModalDetails = _populateSubscriptionModalDetails;

function activateFreeMonth() {
    const msg = 'ℹ️ لتفعيل أو تجديد الاشتراك، يرجى إدخال كود التفعيل المعتمد الصادر من إدارة النظام.';
    if (typeof showToast === 'function') {
        showToast(msg, 'info');
    } else {
        alert(msg);
    }
}

function showMyPlanDetails() {
    const modal = document.getElementById('myPlanModal');
    if (!modal) return;

    const isClient = (typeof window.BayanNetworkHub !== 'undefined' && !window.BayanNetworkHub.isMasterServer);
    const hwid = (isClient ? getStore('bayan_master_hwid') : null) || getStore('bayan_master_hwid') || getStore('bayan_hwid') || getStore('bayan_machine_id') || 'غير محدد';
    const hwidEl = document.getElementById('modalSubHwid');
    if (hwidEl) hwidEl.innerText = hwid;

    const currentPlan = window.getBayanPlan();
    const planEl = document.getElementById('modalSubPlan');
    if (planEl) planEl.innerText = currentPlan;

    const expiryDateStr = window.getBayanExpiry();
    const installDateStr = (window.activeLicense && window.activeLicense.activationDate) || getStore('bayan_install_date') || new Date().toISOString();
    const startDate = new Date(installDateStr);

    const startEl = document.getElementById('modalSubStartDate');
    const usedEl = document.getElementById('modalSubDaysUsed');
    const countdownEl = document.getElementById('modalSubCountdown');
    const lblUsed = document.getElementById('lblUsed');
    const lblRemaining = document.getElementById('lblRemaining');

    const rowExp = document.getElementById('rowSubExpiryDate');
    const expEl = document.getElementById('modalSubExpiryDate');

    if (currentPlan === 'باقة نسخة المجانية') {
        if (startEl) startEl.innerText = startDate.toLocaleDateString('ar-EG');
        if (rowExp) rowExp.style.display = 'none';
        // الاعتماد على الدالة المركزية الموحدة لضمان التطابق 100% مع شاشة الباقات
        const invoiceCount = getEffectiveTrialInvoicesCount();
        if (lblUsed) lblUsed.innerHTML = '🧾 الفواتير المستخدمة';
        if (lblRemaining) lblRemaining.innerHTML = '⏳ الفواتير المتبقية';
        if (usedEl) usedEl.innerText = invoiceCount + ' فاتورة';
        if (countdownEl) {
            const left = Math.max(0, 200 - invoiceCount);
            countdownEl.innerText = left + ' فاتورة متبقية';
            countdownEl.style.color = left > 50 ? 'var(--primary-color)' : 'red';
        }
    } else if (expiryDateStr && !currentPlan.includes('حياة') && !currentPlan.includes('احترافية')) {
        const expDate = new Date(expiryDateStr);
        if (startEl) startEl.innerText = startDate.toLocaleDateString('ar-EG');
        if (expEl) expEl.innerText = expDate.toLocaleDateString('ar-EG');
        if (rowExp) rowExp.style.display = 'flex';

        if (lblUsed) lblUsed.innerHTML = '⏳ حالة الباقة';
        if (lblRemaining) lblRemaining.innerHTML = '🔄 الأيام المتبقية';

        const diffTime = expDate - new Date();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (usedEl) usedEl.innerText = diffDays > 0 ? 'نشطة' : 'منتهية';

        if (countdownEl) {
            if (diffDays <= 0) {
                countdownEl.innerText = 'منتهي الصلاحية 🛑';
                countdownEl.style.color = 'red';
            } else if (diffDays > 3650) {
                countdownEl.innerText = 'نسخة مرخصة للأبد ♾️';
                countdownEl.style.color = 'var(--accent-gold)';
            } else {
                countdownEl.innerText = diffDays + ' يوم متبقي';
                countdownEl.style.color = diffDays > 5 ? 'var(--primary-color)' : 'red';
            }
        }
    } else {
        if (startEl) startEl.innerText = startDate.toLocaleDateString('ar-EG');
        if (rowExp) rowExp.style.display = 'none';
        if (lblUsed) lblUsed.innerHTML = '⏳ الأيام المستخدمة';
        if (lblRemaining) lblRemaining.innerHTML = '🔄 الأيام المتبقية';
        const diffTime = Math.abs(new Date() - startDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (usedEl) usedEl.innerText = diffDays + ' يوم';
        if (countdownEl) {
            if (currentPlan === 'الباقة الأساسية' || currentPlan === 'الباقة الشهرية' || currentPlan.includes('شهر')) {
                const left = Math.max(0, 30 - diffDays);
                countdownEl.innerText = left + ' يوم متبقي';
                countdownEl.style.color = left > 5 ? 'var(--primary-color)' : 'red';
            } else if (currentPlan === 'الباقة المتقدمة' || currentPlan === 'الباقة السنوية' || currentPlan.includes('سنو')) {
                const left = Math.max(0, 365 - diffDays);
                countdownEl.innerText = left + ' يوم متبقي';
                countdownEl.style.color = left > 30 ? 'var(--primary-color)' : 'red';
            } else if (currentPlan.includes('احترافية') || currentPlan.includes('حياة')) {
                countdownEl.innerText = 'نسخة مرخصة للأبد ♾️';
                countdownEl.style.color = 'var(--accent-gold)';
                if (usedEl) usedEl.innerText = 'نشطة ودائمة ✓';
            }
        }
    }

    const transferPhone = getStore('bayan_sub_transfer_phone') || '';
    const phoneInput = document.getElementById('modalSubTransferPhone');
    if (phoneInput) phoneInput.value = transferPhone;

    // تحديث بطاقة المزامنة السحابية في نافذة اشتراكي المطورة
    const cloudStatusEl = document.getElementById('modalSubCloudStatus');
    const cloudExpEl = document.getElementById('modalSubCloudExpiryText');
    if (cloudStatusEl) {
        if (typeof window.isCloudSyncAllowed === 'function' && window.isCloudSyncAllowed()) {
            cloudStatusEl.innerHTML = '<span style="color: #059669; font-weight: 800;">مفعلة ونشطة 🟢</span>';
            const serverExp = (typeof getStore === 'function') ? getStore('bayan_cloud_server_expiry') : null;
            if (cloudExpEl && serverExp) {
                try {
                    const d = new Date(serverExp);
                    cloudExpEl.innerText = 'تجديد السيرفر: ' + d.toLocaleDateString('ar-EG');
                    cloudExpEl.style.color = '#047857';
                } catch(e) { cloudExpEl.innerText = ''; }
            } else if (cloudExpEl) {
                cloudExpEl.innerText = 'سيرفر سحابي متصل';
                cloudExpEl.style.color = '#047857';
            }
        } else {
            cloudStatusEl.innerHTML = '<span style="color: #64748b; font-weight: 800;">باقة أوفلاين 💻</span>';
            if (cloudExpEl) {
                cloudExpEl.innerText = 'المزامنة السحابية غير مشمولة';
                cloudExpEl.style.color = '#94a3b8';
            }
        }
    }

    modal.classList.remove('hidden');
}

// 🔒 رمز أمان داخلي خاص بالتفويض السحابي والعمليات النظامية لمنع التلاعب عبر الكونسول
const INTERNAL_CLOUD_AUTH_SYMBOL = (typeof Symbol !== 'undefined') 
    ? Symbol('BAYAN_INTERNAL_CLOUD_AUTH') 
    : ('BAYAN_AUTH_' + Math.random().toString(36).substring(2));

async function verifyAndActivateLicense() {
    const inputEl = document.getElementById('activationCodeInput');
    if (!inputEl) return;
    let code = inputEl.value.trim().toUpperCase();
    if (!code) {
        if (typeof showToast === 'function') showToast("⚠️ الرجاء إدخال كود التفعيل", "warning");
        else alert("الرجاء إدخال كود التفعيل");
        return;
    }

    // فحص منع تكرار تفعيل نفس الكود
    let currentLicense = null;
    try {
        currentLicense = JSON.parse(getStore('license_info'));
    } catch (e) { }

    let usedCodes = [];
    try {
        usedCodes = JSON.parse(getStore('bayan_used_license_codes') || '[]');
    } catch (e) { }

    // إذا كان نفس الكود مفعلاً وسارياً بالفعل حالياً
    if (currentLicense && currentLicense.code === code && currentLicense.expiry) {
        const curExp = new Date(currentLicense.expiry);
        if (curExp > new Date()) {
            const expFormatted = curExp.toLocaleDateString('ar-EG');
            const msg = `⚠️ هذا الكود مفعّل وسارٍ بالفعل على هذا الجهاز (${currentLicense.plan}) حتى تاريخ ${expFormatted}، ولا حاجة لإعادة تفعيله!`;
            if (typeof showToast === 'function') showToast(msg, 'warning');
            else alert(msg);
            return;
        }
    }

    // إذا كان الكود تم استخدامه واستهلاكه مسبقاً
    if (usedCodes.includes(code)) {
        const msg = "❌ عذراً، هذا الكود تم استخدامه واستهلاكه مسبقاً على هذا الجهاز! يرجى تجديد الاشتراك للحصول على كود جديد.";
        if (typeof showToast === 'function') showToast(msg, 'error');
        else alert(msg);
        return;
    }

    const isClient = (typeof window.BayanNetworkHub !== 'undefined' && !window.BayanNetworkHub.isMasterServer);
    const mId = (isClient ? getStore('bayan_master_hwid') : null) || (window.getUniqueHWID ? await window.getUniqueHWID() : '') || getStore('bayan_master_hwid') || getStore('bayan_hwid') || getStore('bayan_machine_id') || '';
    const secret = (typeof LicenseService !== 'undefined' && LicenseService._getSecretKey) 
        ? LicenseService._getSecretKey() 
        : String.fromCharCode(66, 65, 89, 65, 78, 95, 80, 79, 83, 95, 83, 69, 67, 82, 69, 84, 95, 75, 69, 89, 95, 50, 48, 50, 54);

    const plans = [
        { name: "الباقة الشهرية", id: "MONTHLY" },
        { name: "الباقة السنوية", id: "ANNUAL" },
        { name: "الباقة مدى الحياة", id: "LIFETIME" }
    ];

    let matchedPlan = null;
    let hashGenerator;

    try {
        if (typeof require !== "undefined") {
            const { ipcRenderer } = require('electron');
            hashGenerator = async (dataStr) => {
                return await ipcRenderer.invoke('hash-activation-payload', dataStr);
            };
        }
    } catch (e) { }

    if (!hashGenerator && window.crypto && window.crypto.subtle) {
        try {
            const msgEncoder = new TextEncoder();
            const keyData = msgEncoder.encode(secret);
            const cryptoKey = await window.crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
            hashGenerator = async (dataStr) => {
                const data = msgEncoder.encode(dataStr);
                const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, data);
                const hashArray = Array.from(new Uint8Array(signature));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
                return hashHex.substring(0, 16);
            };
        } catch (e) { }
    }

    if (!hashGenerator) {
        try {
            const sha256 = function (r) { function n(r, n) { return r >>> n | r << 32 - n } for (var t, e, o = Math.pow, f = o(2, 32), h = "length", a = "", u = [], c = 8 * r[h], v = sha256.h = sha256.h || [], i = sha256.k = sha256.k || [], l = i[h], s = {}, C = 2; 64 > l; C++)if (!s[C]) { for (t = 0; 313 > t; t += C)s[t] = C; v[l] = o(C, .5) * f | 0, i[l++] = o(C, 1 / 3) * f | 0 } for (r += "\x80"; r[h] % 64 - 56;)r += "\x00"; for (t = 0; t < r[h]; t++) { if (e = r.charCodeAt(t), e >> 8) return; u[t >> 2] |= e << 24 - t % 4 * 8 } for (u[u[h]] = c / f | 0, u[u[h]] = c, e = 0; e < u[h];) { var g = u.slice(e, e += 16), d = v; for (v = v.slice(0, 8), t = 0; 64 > t; t++) { var w = g[t - 15], A = g[t - 2], p = v[0], m = v[4], S = v[7] + (n(m, 6) ^ n(m, 11) ^ n(m, 25)) + (m & v[5] ^ ~m & v[6]) + i[t] + (g[t] = 16 > t ? g[t] : g[t - 16] + (n(w, 7) ^ n(w, 18) ^ w >>> 3) + g[t - 7] + (n(A, 17) ^ n(A, 19) ^ A >>> 10) | 0), b = (n(p, 2) ^ n(p, 13) ^ n(p, 22)) + (p & v[1] ^ p & v[2] ^ v[1] & v[2]); v = [S + b | 0].concat(v), v[4] = v[4] + S | 0 } for (t = 0; 8 > t; t++)v[t] = v[t] + d[t] | 0 } for (t = 0; 8 > t; t++)for (e = 3; e + 1; e--) { var y = v[t] >> 8 * e & 255; a += (16 > y ? 0 : "") + y.toString(16) } return a };
            const hmacSha256 = (key, msg) => {
                const blockSize = 64;
                let keyBytes = [];
                for (let i = 0; i < key.length; i++) keyBytes.push(key.charCodeAt(i));
                if (keyBytes.length > blockSize) {
                    const h = sha256(key);
                    keyBytes = [];
                    for (let i = 0; i < h.length; i += 2) keyBytes.push(parseInt(h.substr(i, 2), 16));
                }
                while (keyBytes.length < blockSize) keyBytes.push(0);
                let o_key_pad = "", i_key_pad = "";
                for (let i = 0; i < blockSize; i++) {
                    o_key_pad += String.fromCharCode(keyBytes[i] ^ 0x5c);
                    i_key_pad += String.fromCharCode(keyBytes[i] ^ 0x36);
                }
                const hexToBin = (h) => { let s = ""; for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16)); return s; };
                return sha256(o_key_pad + hexToBin(sha256(i_key_pad + msg))).toUpperCase();
            };
            hashGenerator = async (dataStr) => hmacSha256(secret, dataStr).substring(0, 16);
        } catch (e) { }
    }

    if (!hashGenerator) {
        if (typeof showToast === "function") showToast("❌ عذراً، وظيفة التفعيل غير متاحة في هذه البيئة.", "error");
        else alert("عذراً، وظيفة التفعيل غير متاحة في هذه البيئة.");
        return;
    }

    // New Time-based Expiry Logic
    const parts = code.split("-");
    if (parts.length === 4 && parts[0] === "BYN") {
        const dateStr = parts[1]; // DDMMYY
        const planChar = parts[2]; // M, A, L
        const providedHash = parts[3]; // HASH8

        const payload = dateStr + planChar;
        const expectedHashFull = await hashGenerator(mId + payload);
        const expectedHash = expectedHashFull.substring(0, 8);

        if (providedHash === expectedHash) {
            let planName = "الباقة الشهرية (أوفلاين)";
            let isCloudPlan = false;
            let cloudServerExpiryISO = '';

            const pCharUpper = planChar.toUpperCase();
            if (pCharUpper === "A") {
                planName = "الباقة السنوية (أوفلاين)";
            } else if (pCharUpper === "L") {
                planName = "الباقة مدى الحياة (أوفلاين)";
            } else if (pCharUpper === "CM" || pCharUpper === "MC") {
                planName = "الباقة الشهرية (مزامنة سحابية)";
                isCloudPlan = true;
            } else if (pCharUpper === "CA" || pCharUpper === "AC") {
                planName = "الباقة السنوية (مزامنة سحابية)";
                isCloudPlan = true;
            } else if (pCharUpper === "CL" || pCharUpper === "LC") {
                planName = "الباقة مدى الحياة (مع سنة سحابي)";
                isCloudPlan = true;
            } else if (pCharUpper === "CS") {
                planName = "تجديد السيرفر السحابي (سنوي)";
                isCloudPlan = true;
            }

            // Parse Date
            const dd = parseInt(dateStr.substring(0, 2), 10);
            const mm = parseInt(dateStr.substring(2, 4), 10) - 1;
            const yy = parseInt("20" + dateStr.substring(4, 6), 10);
            const expiryDate = new Date(yy, mm, dd);
            expiryDate.setHours(23, 59, 59, 999);

            const isLifetime = (pCharUpper === "L" || pCharUpper === "CL" || pCharUpper === "LC" || planName.includes("حياة") || planName.includes("احترافية"));
            let expiryISO = isLifetime ? '' : expiryDate.toISOString();

            // معالجة فترة وصلاحية السيرفر السحابي
            if (isCloudPlan) {
                if (pCharUpper === "CL" || pCharUpper === "LC") {
                    // باقة مدى الحياة السحابية تمنح سنة كاملة حرة للسيرفر السحابي من تاريخ التفعيل
                    const sExp = new Date();
                    sExp.setDate(sExp.getDate() + 365);
                    sExp.setHours(23, 59, 59, 999);
                    cloudServerExpiryISO = sExp.toISOString();
                } else if (pCharUpper === "CS") {
                    // كود تجديد سنوي للسيرفر السحابي
                    const prevServerExp = getStore('bayan_cloud_server_expiry');
                    const baseDate = (prevServerExp && new Date(prevServerExp) > new Date()) ? new Date(prevServerExp) : new Date();
                    baseDate.setDate(baseDate.getDate() + 365);
                    baseDate.setHours(23, 59, 59, 999);
                    cloudServerExpiryISO = baseDate.toISOString();
                    // إذا كان العميل يمتلك باقة مفعلة مسبقاً، نحافظ على نوع باقته الأساسية
                    const prevPlan = getStore('bayan_current_plan');
                    if (prevPlan && prevPlan !== 'باقة نسخة المجانية' && prevPlan !== 'Blocked') {
                        planName = prevPlan.includes('سحاب') ? prevPlan : (prevPlan + ' + سيرفر سحابي');
                    }
                } else {
                    cloudServerExpiryISO = expiryDate.toISOString();
                }
            }

            if (!isLifetime && pCharUpper !== "CS" && new Date() > expiryDate) {
                if (typeof showToast === "function") showToast("❌ هذا الكود منتهي الصلاحية.", "error");
                else alert("❌ هذا الكود منتهي الصلاحية.");
                return;
            }

            await LicenseService.saveLicenseLocally(planName, expiryISO, code, INTERNAL_CLOUD_AUTH_SYMBOL);
            setStore('bayan_trial_consumed', 'true');
            setStore('bayan_has_subscribed_paid', 'true');
            setStore('bayan_current_plan', planName);
            setStore('bayan_expiry_date', expiryISO);
            setStore('bayan_activation_date', new Date().toISOString());

            if (isCloudPlan) {
                setStore('bayan_cloud_sync_licensed', 'true');
                if (cloudServerExpiryISO) {
                    setStore('bayan_cloud_server_expiry', cloudServerExpiryISO);
                }
            } else {
                setStore('bayan_cloud_sync_licensed', 'false');
                if (typeof removeStore === 'function') removeStore('bayan_cloud_server_expiry');
                else localStorage.removeItem('bayan_cloud_server_expiry');
            }

            // إضافة الكود لقائمة الأكواد المستهلكة
            if (!usedCodes.includes(code)) {
                usedCodes.push(code);
                setStore('bayan_used_license_codes', JSON.stringify(usedCodes));
            }

            // توثيق الاشتراك في سجل الاشتراكات والتراخيص المطور
            if (window.SubscriptionHistoryManager && typeof window.SubscriptionHistoryManager.addRecord === 'function') {
                window.SubscriptionHistoryManager.addRecord({
                    plan: planName,
                    code: code,
                    startDate: new Date().toISOString(),
                    expiryDate: isLifetime ? 'مدى الحياة ♾️' : (isCloudPlan && cloudServerExpiryISO ? cloudServerExpiryISO : expiryDate.toISOString()),
                    status: 'نشطة'
                });
            }

            const successNotice = isCloudPlan 
                ? `🎉 تم التفعيل بنجاح! أهلاً بك في ${planName} (المزامنة السحابية مفعّلة ☁️)`
                : `🎉 تم التفعيل بنجاح! أهلاً بك في ${planName}`;
            if (typeof showToast === "function") showToast(successNotice, "success");
            else alert(successNotice);

            const modal = document.getElementById("subscriptionModal");
            if (modal) modal.classList.add("hidden");

            const currentPlanEl = document.getElementById("currentPlanText");
            if (currentPlanEl) currentPlanEl.innerText = planName;

            setTimeout(() => location.reload(), 1500);
            return;
        }
    }

    // Fallback for old codes
    for (let p of plans) {
        const dataStr = mId + p.id;
        const hash16 = await hashGenerator(dataStr);

        const expectedCode1 = `BYN-${hash16.substring(0, 4)}-${hash16.substring(4, 8)}-${hash16.substring(8, 12)}-${hash16.substring(12, 16)}`;
        const expectedCode2 = hash16;

        if (code === expectedCode1 || code === expectedCode2 || code === `BYN-${expectedCode2}`) {
            matchedPlan = p.name;
            break;
        }
    }

    if (matchedPlan) {
        setStore("bayan_current_plan", matchedPlan);
        setStore("bayan_install_date", new Date().toISOString());
        setStore("bayan_active", "true");
        setStore('bayan_trial_consumed', 'true');
        setStore('bayan_has_subscribed_paid', 'true');

        const isLifetime = (matchedPlan.includes("حياة") || matchedPlan.includes("احترافية"));
        let legacyExpiry = '';
        if (!isLifetime) {
            const exp = new Date();
            if (matchedPlan.includes('شهر') || matchedPlan.includes('الأساسية')) {
                exp.setDate(exp.getDate() + 30);
            } else if (matchedPlan.includes('سنو') || matchedPlan.includes('المتقدمة')) {
                exp.setDate(exp.getDate() + 365);
            }
            exp.setHours(23, 59, 59, 999);
            legacyExpiry = exp.toISOString();
        }

        setStore('bayan_expiry_date', legacyExpiry);
        setStore('bayan_activation_date', new Date().toISOString());

        if (typeof LicenseService !== 'undefined' && LicenseService.saveLicenseLocally) {
            await LicenseService.saveLicenseLocally(matchedPlan, legacyExpiry, code, INTERNAL_CLOUD_AUTH_SYMBOL);
        }

        if (window.SubscriptionHistoryManager && typeof window.SubscriptionHistoryManager.addRecord === 'function') {
            window.SubscriptionHistoryManager.addRecord({
                plan: matchedPlan,
                code: code,
                startDate: new Date().toISOString(),
                expiryDate: isLifetime ? 'مدى الحياة ♾️' : legacyExpiry,
                status: 'نشطة'
            });
        }

        if (typeof showToast === "function") showToast(`🎉 تم التفعيل بنجاح! أهلاً بك في ${matchedPlan}`, "success");
        else alert(`تم التفعيل بنجاح! 🎉\nأهلاً بك في ${matchedPlan}.`);

        const modal = document.getElementById("subscriptionModal");
        if (modal) modal.classList.add("hidden");

        const currentPlanEl = document.getElementById("currentPlanText");
        if (currentPlanEl) currentPlanEl.innerText = matchedPlan;
        setTimeout(() => location.reload(), 1500);
    } else {
        if (typeof showToast === "function") showToast("❌ كود التفعيل غير صحيح، يرجى التأكد من كتابته بشكل سليم.", "error");
        else alert("كود التفعيل غير صحيح، يرجى التأكد من كتابته بشكل سليم.");
    }
}
window.verifyAndActivateLicense = verifyAndActivateLicense;

// دالة توليد أكواد التفعيل الرسمية للإدارة
window.generateBayanLicenseKey = async function () {
    return { success: false, message: "⚠️ وظيفة توليد التراخيص محصورة بأداة الإدارة المستقلة فقط لدواعي الأمان." };
};
function closeSubscription() {
    document.getElementById('subscriptionModal').classList.add('hidden');
}

// =========================================================================
// 🕒 نظام التحقق الذكي والإصلاح الذاتي لتوقيت الجهاز (Network Time Self-Healing)
// =========================================================================
let _isVerifyingNetworkTime = false;

window.verifyAndHealClockTampering = async function () {
    if (_isVerifyingNetworkTime) return false;
    _isVerifyingNetworkTime = true;

    try {
        let serverDateStr = null;

        // 1. المحاولة الأولى: عبر هيدر Date من سيرفر Supabase المدمج في النظام
        try {
            const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
            const res = await fetch('https://kxhhdskmpaiitsojwcgu.supabase.co/rest/v1/', {
                method: 'HEAD',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
            if (timeoutId) clearTimeout(timeoutId);
            if (res && res.headers && res.headers.get) {
                serverDateStr = res.headers.get('date');
            }
        } catch (e1) {}

        // 2. المحاولة الثانية: عبر google.com كبديل احتياطي
        if (!serverDateStr) {
            try {
                const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
                const res = await fetch('https://www.google.com', {
                    method: 'HEAD',
                    cache: 'no-store',
                    mode: 'no-cors',
                    signal: controller ? controller.signal : undefined
                });
                if (timeoutId) clearTimeout(timeoutId);
                if (res && res.headers && res.headers.get) {
                    serverDateStr = res.headers.get('date');
                }
            } catch (e2) {}
        }

        // 3. في بيئة Electron: استخدام مكتبة https مباشرة لضمان قراءة هيدر Date دون قيود المتصفح
        if (!serverDateStr && typeof window !== 'undefined' && window.require) {
            try {
                const https = window.require('https');
                serverDateStr = await new Promise((resolve) => {
                    const req = https.request('https://kxhhdskmpaiitsojwcgu.supabase.co/rest/v1/', {
                        method: 'HEAD',
                        timeout: 3500
                    }, (res) => {
                        resolve(res.headers ? (res.headers['date'] || null) : null);
                    });
                    req.on('error', () => resolve(null));
                    req.on('timeout', () => { req.destroy(); resolve(null); });
                    req.end();
                });
            } catch (e3) {}
        }

        if (!serverDateStr) {
            console.warn("ℹ️ [Clock Healing] تعذر الحصول على وقت السيرفر من الإنترنت في الوقت الحالي (العمل بنمط أوفلاين).");
            return false;
        }

        const serverTime = new Date(serverDateStr).getTime();
        if (isNaN(serverTime) || serverTime <= 0) {
            return false;
        }

        // حفظ آخر وقت سيرفر موثوق
        if (typeof setStore === 'function') {
            setStore('bayan_last_verified_server_time', serverTime.toString());
        }
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('bayan_last_verified_server_time', serverTime.toString());
        }

        const currentLocal = Date.now();
        const diffMs = Math.abs(currentLocal - serverTime);

        // شرط الإصلاح الذاتي: تطابق وقت الجهاز الحالي مع وقت السيرفر بهامش تسامح منطقي ±30 دقيقة
        const TOLERANCE_MS = 30 * 60 * 1000;
        if (diffMs <= TOLERANCE_MS) {
            console.log(`✅ [Clock Self-Healing] تم إثبات صحة ساعة الجهاز عبر الإنترنت (فارق: ${(diffMs / 1000).toFixed(1)} ثانية). جاري تصحيح القفزة السابقة...`);

            // 1. تصحيح وتخفيض القيمة المسجلة إلى الوقت الفعلي الحالي
            if (typeof setStore === 'function') {
                setStore('bayan_max_seen_timestamp', currentLocal.toString());
            }
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('bayan_max_seen_timestamp', currentLocal.toString());
            }

            // 2. فك قفل التلاعب
            window.clockTampered = false;

            // 3. إزالة أي نافذة تنبيه أو قفل خاص بالساعة
            const alertModal = document.getElementById('alertModal');
            if (alertModal && alertModal.innerText && alertModal.innerText.includes('تاريخ')) {
                alertModal.classList.add('hidden');
            }

            if (typeof showToast === 'function') {
                showToast("✅ تم التحقق من توقيت الجهاز عبر الإنترنت وإلغاء قفل الساعة بنجاح!", "success", 5000);
            }
            return true;
        } else {
            console.warn(`⚠️ [Clock Check] وقت الجهاز يختلف عن وقت السيرفر بأكثر من 30 دقيقة (فارق: ${(diffMs / 60000).toFixed(1)} دقيقة).`);
            return false;
        }
    } catch (err) {
        console.warn("⚠️ [Clock Healing Error]:", err);
        return false;
    } finally {
        _isVerifyingNetworkTime = false;
    }
};

// فحص وإصلاح استباقي في الخلفية عند بدء تشغيل التطبيق في حال وجود تضارب سابق مسجل بالساعة
setTimeout(() => {
    try {
        const nTime = Date.now();
        const mTimeStr = (typeof getStore === 'function' ? getStore('bayan_max_seen_timestamp') : null) || (typeof localStorage !== 'undefined' ? localStorage.getItem('bayan_max_seen_timestamp') : null);
        const mTime = mTimeStr ? parseInt(mTimeStr, 10) : 0;
        if (mTime > 0 && nTime < (mTime - 300000)) {
            if (typeof window.verifyAndHealClockTampering === 'function') {
                window.verifyAndHealClockTampering().catch(() => {});
            }
        }
    } catch(e) {}
}, 3000);

window.isSubscriptionValid = function (actionType = 'invoice') {
    const nowTime = Date.now();
    const maxSeenTimeStr = (typeof getStore === 'function' ? getStore('bayan_max_seen_timestamp') : null) || (typeof localStorage !== 'undefined' ? localStorage.getItem('bayan_max_seen_timestamp') : null);
    let maxSeenTime = maxSeenTimeStr ? parseInt(maxSeenTimeStr, 10) : 0;

    // إذا تم تأخير ساعة الجهاز للخلف بأكثر من 5 دقائق (300000 مللي ثانية)
    if (maxSeenTime > 0 && nowTime < (maxSeenTime - 300000)) {
        window.clockTampered = true;
        // 🔄 استدعاء التحقق والإصلاح الذاتي من وقت الإنترنت تلقائياً
        if (typeof window.verifyAndHealClockTampering === 'function') {
            window.verifyAndHealClockTampering().catch(() => {});
        }
        return false;
    } else {
        window.clockTampered = false;
        if (nowTime > maxSeenTime) {
            let shouldUpdate = true;
            // 🛡️ حماية ضد القفزات المستقبلية الوهمية (مثل أعطال بطارية اللوحة الأم CMOS أو خطأ تاريخ يدوي)
            const lastServerTimeStr = (typeof getStore === 'function' ? getStore('bayan_last_verified_server_time') : null) || (typeof localStorage !== 'undefined' ? localStorage.getItem('bayan_last_verified_server_time') : null);
            if (lastServerTimeStr) {
                const lastServerTime = parseInt(lastServerTimeStr, 10);
                if (!isNaN(lastServerTime) && lastServerTime > 0 && (nowTime - lastServerTime) > (48 * 3600 * 1000)) {
                    // قفزة مستقبلية شاذة بأكثر من 48 ساعة عن آخر وقت سيرفر موثوق
                    shouldUpdate = false;
                    if (typeof window.verifyAndHealClockTampering === 'function') {
                        window.verifyAndHealClockTampering().catch(() => {});
                    }
                }
            } else if (maxSeenTime > 0 && (nowTime - maxSeenTime) > (30 * 24 * 3600 * 1000)) {
                // قفزة مستقبلية شاذة بأكثر من شهر دفعة واحدة
                shouldUpdate = false;
                if (typeof window.verifyAndHealClockTampering === 'function') {
                    window.verifyAndHealClockTampering().catch(() => {});
                }
            }

            if (shouldUpdate) {
                if (typeof setStore === 'function') setStore('bayan_max_seen_timestamp', nowTime.toString());
                if (typeof localStorage !== 'undefined') localStorage.setItem('bayan_max_seen_timestamp', nowTime.toString());
            }
        }
    }

    // 0. التحقق من الحظر عن بُعد الصادر من الإدارة عبر Google Sheets
    if (typeof isDeviceRemotelyBlocked === 'function' && isDeviceRemotelyBlocked()) {
        return false;
    }

    // استخراج الباقة الحقيقية للجهاز بطبقات أمان متعددة
    const currentPlan = (typeof window.getBayanPlan === 'function') ? window.getBayanPlan() : ((window.activeLicense && window.activeLicense.plan) || 'باقة نسخة المجانية');

    // فحص هل سبق للجهاز الاشتراك في أي باقة مدفوعة
    const hasEverSubscribed = (typeof getStore === 'function') && (
        getStore('bayan_trial_consumed') === 'true' || 
        getStore('bayan_has_subscribed_paid') === 'true' ||
        (currentPlan !== 'باقة نسخة المجانية' && currentPlan !== 'Blocked')
    );

    // 1. الباقات مدى الحياة (Lifetime Packages) - سارية للأبد وبلا أي انقطاع
    if (currentPlan === 'الباقة مدى الحياة' || currentPlan === 'الباقة الاحترافية' || currentPlan.includes('حياة') || currentPlan.includes('احترافية')) {
        return true;
    }

    // 2. الباقات الزمنية المدفوعة (الشهرية والسنوية) - فواتير مفتوحة غير محدودة طوال فترة الصلاحية
    if (currentPlan.includes('شهر') || currentPlan.includes('الأساسية') || currentPlan.includes('سنو') || currentPlan.includes('المتقدمة')) {
        const expiryDateStr = (window.activeLicense && window.activeLicense.expiry) || 
                              (typeof window.getBayanExpiry === 'function' ? window.getBayanExpiry() : null) || 
                              (typeof getStore === 'function' ? getStore('bayan_expiry_date') : null);

        if (expiryDateStr) {
            const expDate = new Date(expiryDateStr);
            if (!isNaN(expDate.getTime()) && nowTime > expDate.getTime()) {
                return false; // انتهت صلاحية الفترة الزمنية للباقة
            }
            return true; // سارية ونشطة وفواتيرها غير محدودة
        } else {
            const actDateStr = getStore('bayan_activation_date') || getStore('bayan_install_date');
            if (actDateStr) {
                const startDate = new Date(actDateStr);
                const diffDays = Math.floor(Math.abs(nowTime - startDate.getTime()) / (1000 * 60 * 60 * 24));
                if ((currentPlan.includes('شهر') || currentPlan.includes('الأساسية')) && diffDays > 30) return false;
                if ((currentPlan.includes('سنو') || currentPlan.includes('المتقدمة')) && diffDays > 365) return false;
            }
            return true;
        }
    }

    // 3. باقة نسخة المجانية (Trial Version)
    if (currentPlan === 'باقة نسخة المجانية' || !hasEverSubscribed) {
        if (hasEverSubscribed) {
            // المشترك السابق لا يمكنه استخدام التجربة المجانية نهائياً
            return false;
        }

        const effectiveCount = getEffectiveTrialInvoicesCount();
        const dynamicLimit = (typeof getTrialInvoicesMaxLimit === 'function') ? getTrialInvoicesMaxLimit() : 200;

        // إذا تم استهلاك الحد الأقصى للفواتير، يتم قفل الفواتير والعمليات
        if (effectiveCount >= dynamicLimit) return false;

        if (actionType === 'receipt') {
            const rCount = transactions.filter(t => t.type && t.type.includes('قبض') && t.invoiceId).length;
            if (rCount >= 75) return false;
        } else if (actionType === 'disbursement') {
            const dCount = transactions.filter(t => t.type && t.type.includes('صرف') && t.invoiceId).length;
            if (dCount >= 75) return false;
        }

        return true;
    }

    return true;
};

window.enforceSubscriptionCheck = function (actionType = 'invoice') {
    // 0. فحص الحظر الصادر عن بُعد من Google Sheets أولاً
    if (typeof isDeviceRemotelyBlocked === 'function' && isDeviceRemotelyBlocked()) {
        const blockMsg = (typeof getStore === 'function' ? getStore('bayan_remote_block_msg') : null) || 
            'تم تعليق ترخيص وصلاحية هذا الجهاز بقرار من إدارة بَيَان POS.\n\nيرجى التواصل مع إدارة النظام والدعم الفني للاستفسار والمتابعة.';
        
        const richMsg = `${blockMsg.replace(/\n/g, '<br>')}<br><br>
        <div style="margin-top:14px; text-align:center;">
            <button type="button" onclick="window.checkRemoteUnblockNow(this)" style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:900; font-size:0.92rem; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(16,185,129,0.35); transition:0.2s;">
                <span>🔄 التحقق من قرار الإدارة وسريان الاشتراك</span>
            </button>
        </div>`;

        if (typeof showCustomAlert === 'function') {
            showCustomAlert({
                type: 'error',
                titleText: '🛑 تم إيقاف النظام بقرار من الإدارة',
                msg: richMsg,
                confirmText: 'عرض خيارات الاشتراك 💎',
                onConfirm: () => {
                    if (typeof toggleSubscriptionModal === 'function') toggleSubscriptionModal(true);
                }
            });
        } else {
            alert("🛑 " + blockMsg);
            if (typeof toggleSubscriptionModal === 'function') toggleSubscriptionModal(true);
        }
        return false;
    }

    if (window.clockTampered) {
        if (typeof window.verifyAndHealClockTampering === 'function') {
            window.verifyAndHealClockTampering().catch(() => {});
        }
        if (typeof showCustomAlert === 'function') {
            showCustomAlert({
                type: 'error',
                titleText: '🛑 تحذير أمني: تم رصد تغيير في تاريخ الجهاز!',
                msg: 'تم رصد إرجاع تاريخ أو ساعة الكمبيوتر للخلف برمجياً.\n\nلحماية أمان المنظومة والسجلات المالية، يرجى ضبط تاريخ وساعة الجهاز بالشكل الصحيح للاستمرار في إجراء وحفظ العمليات والفواتير.\n\n💡 إذا كانت الساعة مضبوطة الآن بالشكل الصحيح، اضغط على زر التحقق بالأسفل لإلغاء القفل فوراً.',
                confirmText: 'التحقق وإلغاء القفل عبر الإنترنت 🌐',
                onConfirm: async () => {
                    if (typeof window.verifyAndHealClockTampering === 'function') {
                        const healed = await window.verifyAndHealClockTampering();
                        if (!healed && typeof showToast === 'function') {
                            showToast("⚠️ يرجى التأكد من اتصال الإنترنت وضبط تاريخ وساعة الويندوز الحالية بدقة.", "warning", 6000);
                        }
                    }
                }
            });
        } else {
            alert("🛑 تحذير أمني: يرجى ضبط تاريخ وساعة جهاز الكمبيوتر بشكل صحيح.");
        }
        return false;
    }

    if (!window.isSubscriptionValid(actionType)) {
        const currentPlan = (typeof window.getBayanPlan === 'function') ? window.getBayanPlan() : ((window.activeLicense && window.activeLicense.plan) || 'باقة نسخة المجانية');
        const dynamicLimit = (typeof getTrialInvoicesMaxLimit === 'function') ? getTrialInvoicesMaxLimit() : 200;

        const hasEverSubscribed = (typeof getStore === 'function') && (
            getStore('bayan_trial_consumed') === 'true' || 
            getStore('bayan_has_subscribed_paid') === 'true' ||
            (currentPlan !== 'باقة نسخة المجانية' && currentPlan !== 'Blocked')
        );

        let msg = '';

        // إذا كان العميل تجريبياً فقط ولم يشترك قط في أي باقة مدفوعة
        if (!hasEverSubscribed && currentPlan === 'باقة نسخة المجانية') {
            msg = `لقد استهلكت كامل رصيدك في النسخة التجريبية المجانية (${dynamicLimit} فاتورة).<br><br>حفظ الفواتير والعمليات الجديدة مقفل حالياً.<br>إذا تواصلت مع المطور لمنحك فواتير إضافية، اضغط على زر التحقق أدناه فور تسجيله للأمر:<br>
            <div style="margin-top:14px; text-align:center;">
                <button type="button" onclick="window.checkRemoteGrantNow(this)" style="background:#0284c7; color:#fff; border:none; padding:10px 18px; border-radius:10px; font-weight:bold; font-size:0.9rem; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(2,132,199,0.3); transition:0.2s;">
                    <span>🔄 التحقق من رصيد إضافي من المطور الآن</span>
                </button>
            </div>`;
            if (window.CloudTelemetry && typeof window.CloudTelemetry.ping === 'function') {
                window.CloudTelemetry.ping('trial_expired');
            }
        } else {
            // العميل مشترك في باقة مدفوعة وانتهت مدتها الزمنية (شهري / سنوي)
            msg = `لقد انتهت فترة صلاحية اشتراكك الحالي (${currentPlan}).<br><br>يمكنك تصفح التقارير وطباعة السجلات ومراجعة الحسابات والأصناف بكل حرية، ولكن لحفظ فواتير وعمليات جديدة يرجى تجديد الاشتراك.`;
        }

        if (typeof showCustomAlert === 'function') {
            showCustomAlert({
                type: 'error',
                titleText: '🛑 انتهت صلاحية الاشتراك الحالي',
                msg: msg,
                confirmText: 'عرض الباقات والاشتراك 💎',
                onConfirm: () => {
                    if (typeof toggleSubscriptionModal === 'function') toggleSubscriptionModal(true);
                }
            });
        } else {
            alert("انتهت صلاحية الباقة: " + msg);
            if (typeof toggleSubscriptionModal === 'function') toggleSubscriptionModal(true);
        }
        return false;
    }
    return true;
};

// تسجيل استهلاك فاتورة جديدة في الباقة التجريبية مع حماية ضد حذف الفواتير القديمة
window.registerTrialInvoiceCreation = function () {
    try {
        const currentPlan = window.getBayanPlan ? window.getBayanPlan() : 'باقة نسخة المجانية';
        if (currentPlan === 'باقة نسخة المجانية') {
            let count = 0;
            if (typeof transactions !== 'undefined' && Array.isArray(transactions)) {
                const ops = transactions.filter(t => t.type && (t.type.includes('بيع') || t.type.includes('شراء')) && !t.type.includes('مرتجع') && t.invoiceId);
                const uniqueIds = new Set(ops.map(t => t.invoiceId));
                count = uniqueIds.size;
            }
            const storedMax = parseInt((typeof getStore === 'function' ? getStore('bayan_trial_max_invoices') : null) || '0', 10);
            const newMax = getEffectiveTrialInvoicesCount();
            const dynamicLimit = (typeof getTrialInvoicesMaxLimit === 'function') ? getTrialInvoicesMaxLimit() : 200;
            if (typeof setStore === 'function') setStore('bayan_trial_max_invoices', String(newMax));

            // إرسال تحديث صامت في الخلفية إلى Google Sheets إذا توفر إنترنت
            if (window.CloudTelemetry && typeof window.CloudTelemetry.onInvoiceCreated === 'function') {
                window.CloudTelemetry.onInvoiceCreated(newMax);
            }

            // تنبيهات مبكرة عند الاقتراب من الحد النهائي
            if (newMax === (dynamicLimit - 20) || newMax === (dynamicLimit - 5)) {
                if (typeof showToast === 'function') {
                    showToast(`⚠️ تنبيه: استهلكت ${newMax} من أصل ${dynamicLimit} فاتورة تجريبية. يرجى الترقية قريباً!`, 'warning');
                }
            } else if (newMax >= dynamicLimit) {
                if (typeof showToast === 'function') {
                    showToast(`🛑 تنبيه: لقد استهلكت كامل رصيد الفواتير المجانية (${dynamicLimit}/${dynamicLimit}). تم إيقاف حفظ الفواتير الجديدة.`, 'error');
                }
            }
        }
    } catch (e) {
        console.error("Error in registerTrialInvoiceCreation:", e);
    }
};

// ================= خدمة التراخيص المحمية (LicenseService) =================
// ✅ أمان: حماية window.activeLicense من التعديل المباشر عبر الكونسول
// يستخدم Object.defineProperty لجعل الخاصية للقراءة فقط من الخارج
(function () {
    // قراءة أولية متزامنة من التخزين (إن وجدت) لتهيئة الكائن فوراً ومنع الـ Race Condition عند الإقلاع
    let initPlan = 'باقة نسخة المجانية';
    let initExpiry = '';
    try {
        if (typeof getStore === 'function') {
            const raw = getStore('license_info');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.plan) {
                    initPlan = parsed.plan;
                    initExpiry = parsed.expiry || '';
                }
            } else if (getStore('bayan_current_plan')) {
                initPlan = getStore('bayan_current_plan');
                initExpiry = getStore('bayan_expiry_date') || '';
            }
        }
    } catch(e) {}

    let _licenseData = { plan: initPlan, expiry: initExpiry, isValid: true };
    Object.defineProperty(window, 'activeLicense', {
        get: function () { return Object.assign({}, _licenseData); }, // إرجاع نسخة مجمّدة
        set: function (val) {
            // السماح بالتعيين فقط من داخل LicenseService (يُتحقق منه بالـ call stack)
            // اي محاولة خارجية ستُسجَّل وتُتجاهل بصمت
            const stack = new Error().stack || '';
            if (stack.includes('verifyLicense') || stack.includes('saveLicenseLocally') || stack.includes('LicenseService')) {
                _licenseData = val;
            } else {
                console.warn('🛑 محاولة تعديل الترخيص من مصدر غير مصرح!');
            }
        },
        configurable: false
    });
})();

window.LicenseService = {
    // جلب المفتاح السري الداخلي المشفر دون كشفه كنص صريح في الـ Global Scope
    _getSecretKey: function () {
        const bytes = [66, 65, 89, 65, 78, 95, 80, 79, 83, 95, 83, 69, 67, 82, 69, 84, 95, 75, 69, 89, 95, 50, 48, 50, 54];
        return String.fromCharCode.apply(null, bytes);
    },

    // حساب الهاش المشفر للتحقق الاحتياطي بالمتصفح
    _calcLocalPayloadHash: async function (dataStr) {
        if (typeof require !== 'undefined') {
            try {
                const { ipcRenderer } = require('electron');
                const h = await ipcRenderer.invoke('hash-activation-payload', dataStr);
                if (h) return h;
            } catch (e) {}
        }
        if (window.crypto && window.crypto.subtle) {
            try {
                const secret = this._getSecretKey();
                const msgEncoder = new TextEncoder();
                const cryptoKey = await window.crypto.subtle.importKey("raw", msgEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
                const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, msgEncoder.encode(dataStr));
                return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase().substring(0, 16);
            } catch (e) {}
        }
        return '';
    },

    // حساب التوقيع الرقمي للترخيص (محلياً عند عدم توفر Electron)
    _calcLocalSignature: async function (plan, expiry, machineId) {
        const dataString = `${plan}_${expiry || ''}_${machineId}`;
        const hash = await this._calcLocalPayloadHash(dataString);
        if (hash) return hash;
        // Fallback bitwise hash
        const secret = this._getSecretKey();
        let h1 = 0, h2 = 0;
        for (let i = 0; i < dataString.length; i++) {
            h1 = ((h1 << 5) - h1) + dataString.charCodeAt(i);
            h1 = h1 & h1;
        }
        for (let i = 0; i < secret.length; i++) {
            h2 = ((h2 << 5) - h2) + secret.charCodeAt(i);
            h2 = h2 & h2;
        }
        return Math.abs(h1 ^ h2).toString(16).toUpperCase();
    },

    // التحقق الرياضي الصارم من صحة كود التفعيل ومطابقته للجهاز
    checkActivationCodeValidity: async function (code, machineId, expectedPlan = '') {
        if (!code || typeof code !== 'string') return false;
        const cleanCode = code.trim().toUpperCase();
        const cleanHwid = String(machineId || '').trim().toUpperCase();

        // 1. التحقق عبر Main Process المعزول (البيئة الأساسية والآمنة)
        if (typeof require !== 'undefined') {
            try {
                const { ipcRenderer } = require('electron');
                const testRes = await ipcRenderer.invoke('verify-and-sign-license', {
                    plan: expectedPlan || 'VERIFY_CHECK',
                    expiry: 'CHECK',
                    machineId: cleanHwid,
                    code: cleanCode,
                    isInternalAuth: false
                });
                if (testRes && testRes.success) return true;
                if (testRes && testRes.error) return false;
            } catch (e) {
                console.warn("Main process code validation check error:", e);
            }
        }

        // 2. التحقق الاحتياطي بالخوارزمية الرياضية (في المتصفح)
        const parts = cleanCode.split('-');
        if (parts.length === 4 && parts[0] === 'BYN') {
            const dateStr = parts[1];
            const planChar = parts[2];
            const providedHash = parts[3];
            const payload = dateStr + planChar;
            const fullHash = await this._calcLocalPayloadHash(cleanHwid + payload);
            return Boolean(fullHash && fullHash.substring(0, 8).toUpperCase() === providedHash.toUpperCase());
        }

        // النمط القديم: BYN-XXXX-XXXX-XXXX-XXXX
        const legacyPlans = ["MONTHLY", "ANNUAL", "LIFETIME"];
        for (let pid of legacyPlans) {
            const fullHash = await this._calcLocalPayloadHash(cleanHwid + pid);
            if (fullHash) {
                const expCode1 = `BYN-${fullHash.substring(0, 4)}-${fullHash.substring(4, 8)}-${fullHash.substring(8, 12)}-${fullHash.substring(12, 16)}`;
                if (cleanCode === expCode1 || cleanCode === fullHash.substring(0, 16) || cleanCode === `BYN-${fullHash.substring(0, 16)}`) return true;
            }
        }
        return false;
    },

    // توليد التوقيع الرقمي الآمن (يشترط تفويضاً أو كود تفعيل صحيح)
    generateLicenseSignature: async function (plan, expiry, machineId, code = '', isInternalAuth = false) {
        if (typeof require !== 'undefined') {
            try {
                const { ipcRenderer } = require('electron');
                const res = await ipcRenderer.invoke('verify-and-sign-license', {
                    plan: plan,
                    expiry: expiry,
                    machineId: machineId,
                    code: code,
                    isInternalAuth: Boolean(isInternalAuth)
                });
                if (res && res.success && res.signature) return res.signature;
            } catch (e) {
                console.warn("Secure Main Process IPC not available, trying local fallback", e);
            }
        }
        return await this._calcLocalSignature(plan, expiry, machineId);
    },

    // التحقق من صحة توقيع الترخيص المخزن في Main Process المعزول
    verifyLicenseSignature: async function (plan, expiry, machineId, signature) {
        if (!signature) return false;
        if (typeof require !== 'undefined') {
            try {
                const { ipcRenderer } = require('electron');
                const isValid = await ipcRenderer.invoke('verify-license-signature', plan, expiry, machineId, signature);
                if (typeof isValid === 'boolean') return isValid;
            } catch (e) {
                console.warn("verify-license-signature IPC failed, using fallback:", e);
            }
        }
        const expected = await this._calcLocalSignature(plan, expiry, machineId);
        return Boolean(expected && signature.toUpperCase() === expected.toUpperCase());
    },

    // حفظ الترخيص محلياً مع التحقق الأمني الصارم لمنع استغلال الكونسول
    saveLicenseLocally: async function (plan, expiry, code = '', authToken = null) {
        const stack = (new Error().stack || '');

        // الحالات المصرح بها نظامياً فقط:
        const isCloudAuthorized = (authToken === INTERNAL_CLOUD_AUTH_SYMBOL && code === 'REMOTELY_ACTIVATED_CLOUD');
        const isDirectActivation = (authToken === INTERNAL_CLOUD_AUTH_SYMBOL && (stack.includes('verifyAndActivateLicense') || stack.includes('app_license.js')));
        const isBackupRestore = (code === 'BACKUP_RESTORE_AUTHORIZED' || stack.includes('restoreDataFromContent') || stack.includes('app_backup.js'));
        const isFreeTrial = (plan === 'باقة نسخة المجانية' && (!code || code === 'TRIAL'));

        const machineId = (window.getUniqueHWID ? await window.getUniqueHWID() : '') || (typeof getStore === 'function' ? (getStore('bayan_hwid') || getStore('bayan_machine_id')) : '') || 'LOCAL_DEVICE';

        let isAuthorized = false;
        if (isCloudAuthorized || isDirectActivation || isBackupRestore || isFreeTrial) {
            isAuthorized = true;
        } else if (code && code.trim().length > 0) {
            // التحقق الرياضي الصارم من كود التفعيل الممرر لمنع الأكواد الوهمية مثل FREE_CRACK
            isAuthorized = await this.checkActivationCodeValidity(code, machineId, plan);
        }

        if (!isAuthorized) {
            console.warn("🛑 [LicenseShield Alert] تم حظر محاولة غير مصرح بها لتفعيل أو تزوير ترخيص من الكونسول:", { plan, code });
            if (typeof showToast === 'function') {
                showToast("🛑 تنبيه أمني: محاولة تفعيل غير صالحة تم حظرها ومنعها!", "error");
            } else if (typeof alert === 'function') {
                alert("🛑 تنبيه أمني: محاولة تفعيل غير صالحة تم حظرها ومنعها!");
            }
            return false;
        }

        const isInternalAuth = isCloudAuthorized || isDirectActivation || isBackupRestore || isFreeTrial;
        const signature = await this.generateLicenseSignature(plan, expiry, machineId, code, isInternalAuth);

        if (!signature) {
            console.warn("🛑 [LicenseShield Alert] تم رفض توقيع الترخيص من النواة الآمنة.");
            return false;
        }

        const licenseInfo = {
            id: 'license_info',
            plan: plan,
            expiry: expiry,
            code: code,
            machineId: machineId,
            signature: signature,
            activationDate: new Date().toISOString(),
            lastValidation: new Date().toISOString()
        };

        if (typeof setStore === 'function') {
            setStore('license_info', JSON.stringify(licenseInfo));
        } else {
            localStorage.setItem('license_info', JSON.stringify(licenseInfo));
        }

        window.activeLicense = {
            plan: plan,
            expiry: expiry,
            code: code,
            isValid: true
        };
        return true;
    },

    activatePlanRemotely: async function (plan) {
        try {
            let expiry = '';
            if (plan.includes('شهر')) {
                const d = new Date();
                d.setDate(d.getDate() + 30);
                expiry = d.toISOString();
            } else if (plan.includes('سنو')) {
                const d = new Date();
                d.setDate(d.getDate() + 365);
                expiry = d.toISOString();
            } else {
                expiry = '2099-12-31T23:59:59.999Z';
            }
            await this.saveLicenseLocally(plan, expiry, 'REMOTELY_ACTIVATED_CLOUD', INTERNAL_CLOUD_AUTH_SYMBOL);
            if (typeof setStore === 'function') {
                setStore('bayan_trial_consumed', 'true');
                setStore('bayan_has_subscribed_paid', 'true');
                setStore('bayan_current_plan', plan);
                setStore('bayan_activation_date', new Date().toISOString());
                if (expiry) setStore('bayan_expiry_date', expiry);

                if (plan.includes('سحاب') || plan.includes('Cloud')) {
                    setStore('bayan_cloud_sync_licensed', 'true');
                    if (expiry && !plan.includes('حياة')) {
                        setStore('bayan_cloud_server_expiry', expiry);
                    } else if (plan.includes('حياة')) {
                        const sExp = new Date();
                        sExp.setDate(sExp.getDate() + 365);
                        sExp.setHours(23, 59, 59, 999);
                        setStore('bayan_cloud_server_expiry', sExp.toISOString());
                    }
                } else {
                    setStore('bayan_cloud_sync_licensed', 'false');
                }
            }
            if (typeof SubscriptionHistoryManager !== 'undefined' && SubscriptionHistoryManager.syncWithSystem) {
                SubscriptionHistoryManager.syncWithSystem();
                SubscriptionHistoryManager.renderTable();
            }
            console.log("👑 [Remote Control] Plan activated remotely:", plan);
            if (typeof showToast === 'function') {
                showToast(`👑 مبروك! تم تفعيل (${plan}) عن بُعد من الإدارة بنجاح!`, "success", 8000);
            }
        } catch(e) {
            console.error("Error activating plan remotely:", e);
        }
    },

    verifyLicense: async function () {
        // 1. إذا كان هذا الجهاز جهازاً فرعياً أو متصفحاً مقترناً بالسيرفر، يتحقق من ترخيص السيرفر الرئيسي
        const isClient = (typeof window.BayanNetworkHub !== 'undefined' && !window.BayanNetworkHub.isMasterServer) || 
                         (window.location.protocol !== 'file:' && !window.electronAPI && !(window.process && window.process.versions && window.process.versions.electron));
        if (isClient) {
            try {
                const rawMasterLic = getStore('bayan_master_license');
                if (rawMasterLic) {
                    const mLic = typeof rawMasterLic === 'string' ? JSON.parse(rawMasterLic) : rawMasterLic;
                    if (mLic && mLic.plan && mLic.plan !== 'Blocked') {
                        window.activeLicense = {
                            plan: mLic.plan,
                            expiry: mLic.expiry || '',
                            isValid: true,
                            activationDate: mLic.activationDate || new Date().toISOString()
                        };
                        return true;
                    }
                }
            } catch(e) {}
        }

        const machineId = (isClient ? getStore('bayan_master_hwid') : null) || (window.getUniqueHWID ? await window.getUniqueHWID() : '') || getStore('bayan_master_hwid') || getStore('bayan_hwid') || getStore('bayan_machine_id') || 'LOCAL_DEVICE';

        let licenseInfo = null;
        try {
            licenseInfo = JSON.parse(getStore('license_info'));
        } catch (e) { }

        if (!licenseInfo) {
            // فحص هل العميل مشترك مسبقاً في باقة مدفوعة قبل افتراض الباقة المجانية
            const hasPaidStored = (typeof getStore === 'function') && (
                getStore('bayan_trial_consumed') === 'true' || 
                getStore('bayan_has_subscribed_paid') === 'true' ||
                (getStore('bayan_current_plan') && getStore('bayan_current_plan') !== 'باقة نسخة المجانية' && getStore('bayan_current_plan') !== 'Blocked')
            );
            const savedPlan = (typeof getStore === 'function' ? getStore('bayan_current_plan') : null) || (hasPaidStored ? 'الباقة الشهرية' : 'باقة نسخة المجانية');
            const savedExpiry = (typeof getStore === 'function' ? getStore('bayan_expiry_date') : '') || '';
            const recoveredPlan = hasPaidStored ? savedPlan : 'باقة نسخة المجانية';

            const sig = await this.generateLicenseSignature(recoveredPlan, savedExpiry, machineId, '', true);

            licenseInfo = {
                id: 'license_info',
                plan: recoveredPlan,
                expiry: savedExpiry,
                machineId: machineId,
                signature: sig,
                activationDate: (typeof getStore === 'function' ? (getStore('bayan_activation_date') || getStore('bayan_install_date')) : null) || new Date().toISOString(),
                lastValidation: new Date().toISOString()
            };
            setStore('license_info', JSON.stringify(licenseInfo));
        }

        const isSigValid = await this.verifyLicenseSignature(licenseInfo.plan, licenseInfo.expiry, machineId, licenseInfo.signature);

        if (!isSigValid || licenseInfo.machineId !== machineId) {
            // فحص هل سبق للجهاز الاشتراك في أي باقة مدفوعة
            const hasEverSubscribed = (typeof getStore === 'function') && (
                getStore('bayan_trial_consumed') === 'true' || 
                getStore('bayan_has_subscribed_paid') === 'true' ||
                (licenseInfo.plan && licenseInfo.plan !== 'باقة نسخة المجانية' && licenseInfo.plan !== 'Blocked') ||
                (getStore('bayan_current_plan') && getStore('bayan_current_plan') !== 'باقة نسخة المجانية' && getStore('bayan_current_plan') !== 'Blocked')
            );

            const trialInvoices = typeof getEffectiveTrialInvoicesCount === 'function' ? getEffectiveTrialInvoicesCount() : 0;
            const isTrialEligible = (!hasEverSubscribed) && (trialInvoices < 200);
            const isPairedTerminal = (typeof getStore === 'function' && getStore('bayan_client_is_paired') === 'true');

            // 1. إذا كان المستخدم مشتركاً في باقة مدفوعة وانتهت، يتم الحفاظ التام على باقته المدفوعة وتاريخ انتهائها لمنع تحويله للمجانية
            if (hasEverSubscribed && licenseInfo.plan && licenseInfo.plan !== 'باقة نسخة المجانية' && licenseInfo.plan !== 'Blocked') {
                console.log("🔒 Preserving paid subscription plan:", licenseInfo.plan);
                const sig = await this.generateLicenseSignature(licenseInfo.plan, licenseInfo.expiry, machineId, licenseInfo.code || '', true);
                licenseInfo.machineId = machineId;
                licenseInfo.signature = sig;
                setStore('license_info', JSON.stringify(licenseInfo));
            } else if (!hasEverSubscribed && (licenseInfo.plan === 'باقة نسخة المجانية' || !licenseInfo.plan || isTrialEligible || isPairedTerminal)) {
                // 2. إذا كان مستخدماً جديداً ولم يشترك قط في أي باقة مدفوعة
                console.log("🛠️ Auto-repairing license for current machine ID (Trial)...");
                const freePlan = 'باقة نسخة المجانية';
                const freeExpiry = '';
                const sig = await this.generateLicenseSignature(freePlan, freeExpiry, machineId, '', true);

                licenseInfo = {
                    id: 'license_info',
                    plan: freePlan,
                    expiry: freeExpiry,
                    machineId: machineId,
                    signature: sig,
                    activationDate: licenseInfo.activationDate || new Date().toISOString(),
                    lastValidation: new Date().toISOString()
                };
                setStore('license_info', JSON.stringify(licenseInfo));
            } else {
                console.error("🛑 License tampered or machine ID mismatch!");
                window.activeLicense = {
                    plan: 'Blocked',
                    expiry: '',
                    isValid: false
                };
                return false;
            }
        }

        const isLifetime = (licenseInfo.plan === 'الباقة مدى الحياة' || licenseInfo.plan === 'الباقة الاحترافية' || (licenseInfo.plan && (licenseInfo.plan.includes('حياة') || licenseInfo.plan.includes('احترافية'))));
        if (!isLifetime && licenseInfo.expiry && licenseInfo.plan !== 'باقة نسخة المجانية') {
            const expDate = new Date(licenseInfo.expiry);
            if (new Date() > expDate) {
                window.activeLicense = {
                    plan: licenseInfo.plan,
                    expiry: licenseInfo.expiry,
                    isValid: false
                };
                if (window.SubscriptionHistoryManager && typeof window.SubscriptionHistoryManager.syncWithSystem === 'function') {
                    window.SubscriptionHistoryManager.syncWithSystem();
                }
                return false;
            }
        }

        window.activeLicense = {
            plan: licenseInfo.plan,
            expiry: isLifetime ? '' : licenseInfo.expiry,
            isValid: true
        };

        if (window.SubscriptionHistoryManager && typeof window.SubscriptionHistoryManager.syncWithSystem === 'function') {
            window.SubscriptionHistoryManager.syncWithSystem();
        }

        return true;
    }
};

// ================= خدمة النسخ الاحتياطي التلقائي المطور (BackupService) =================
window.BackupService = {
    createAutoBackup: async function () {
        try {
            // تفريغ أي نسخ متراكمة قديمة من جدول db.backups لتخفيف قاعدة بيانات SQLite فوراً
            if (typeof db !== 'undefined' && db && db.backups) {
                try { await db.backups.clear(); } catch(ce) {}
            }

            // استخدام المحرك الفعلي المطور للنسخ إلى ملفات AppData الخارجية دون استهلاك رامات وقاعدة بيانات المتصفح
            if (typeof window.executeAutoBackupToFile === 'function') {
                return await window.executeAutoBackupToFile(true, false);
            }
        } catch (e) {
            console.error("❌ Failed to create auto backup:", e);
        }
    },

    rotateBackups: async function () {
        try {
            if (typeof db !== 'undefined' && db && db.backups) {
                await db.backups.clear();
            }
        } catch (e) {}
    }
};

window.getBayanPlan = function () {
    if (window.activeLicense && window.activeLicense.plan) {
        return window.activeLicense.plan;
    }
    // فحص ترخيص الماستر المشترك للأجهزة الفرعية
    if (typeof getStore === 'function') {
        try {
            const rawMaster = getStore('bayan_master_license');
            if (rawMaster) {
                const m = typeof rawMaster === 'string' ? JSON.parse(rawMaster) : rawMaster;
                if (m && m.plan && m.plan !== 'Blocked') {
                    return m.plan;
                }
            }
        } catch(e) {}
    }
    // فحص ترخيص الجهاز المحلي من license_info
    if (typeof getStore === 'function') {
        try {
            const lic = JSON.parse(getStore('license_info'));
            if (lic && lic.plan && lic.plan !== 'Blocked') {
                return lic.plan;
            }
        } catch(e) {}
        const storedPlan = getStore('bayan_current_plan');
        if (storedPlan && storedPlan !== 'Blocked') return storedPlan;

        // إذا كان قد اشترك مسبقاً في باقة مدفوعة وانتهت
        if (getStore('bayan_has_subscribed_paid') === 'true' || getStore('bayan_trial_consumed') === 'true') {
            try {
                if (window.SubscriptionHistoryManager && typeof window.SubscriptionHistoryManager.getHistory === 'function') {
                    const hist = window.SubscriptionHistoryManager.getHistory();
                    const lastPaid = hist.slice().reverse().find(h => h.id > 1 || (h.plan && !h.plan.includes('المجانية') && !h.plan.includes('تجريب')));
                    if (lastPaid && lastPaid.plan) return lastPaid.plan;
                }
            } catch(e) {}
            return getStore('bayan_current_plan') || 'الباقة الشهرية';
        }
    }
    return 'باقة نسخة المجانية';
};

window.getBayanExpiry = function () {
    if (window.activeLicense && window.activeLicense.expiry) {
        return window.activeLicense.expiry;
    }
    // فحص تاريخ انتهاء ترخيص الماستر المشترك للأجهزة الفرعية
    if (typeof getStore === 'function') {
        try {
            const rawMaster = getStore('bayan_master_license');
            if (rawMaster) {
                const m = typeof rawMaster === 'string' ? JSON.parse(rawMaster) : rawMaster;
                if (m && m.expiry) {
                    return m.expiry;
                }
            }
        } catch(e) {}
        try {
            const lic = JSON.parse(getStore('license_info'));
            if (lic && lic.expiry) return lic.expiry;
        } catch(e) {}
        const storedExp = getStore('bayan_expiry_date');
        if (storedExp) return storedExp;
    }
    return '';
};

// ================= ☁️ فحص تراخيص المزامنة السحابية (Cloud Sync Authorization) =================
window.isCloudSyncAllowed = function () {
    // 0. التحقق من الحظر عن بُعد الصادر من الإدارة
    if (typeof isDeviceRemotelyBlocked === 'function' && isDeviceRemotelyBlocked()) {
        return false;
    }
    // 1. التحقق من التلاعب بساعة النظام
    if (window.clockTampered) {
        return false;
    }

    // 2. التحقق من الباقة الحالية
    const currentPlan = (typeof window.getBayanPlan === 'function') ? window.getBayanPlan() : '';
    if (!currentPlan || currentPlan === 'باقة نسخة المجانية' || currentPlan.includes('مجانية') || currentPlan.includes('تجريب')) {
        return false;
    }

    // 3. التحقق من سريان الاشتراك العام للبرنامج
    const isPlanValid = (typeof window.isSubscriptionValid === 'function') ? window.isSubscriptionValid() : true;
    if (!isPlanValid) {
        return false;
    }

    // 4. التحقق من ترخيص ميزة المزامنة السحابية (حظر باقات الأوفلاين حظراً قاطعاً)
    if (currentPlan.includes('أوفلاين') || currentPlan.toLowerCase().includes('offline')) {
        return false; // باقة أوفلاين صريحة - ممنوع المزامنة السحابية نهائياً
    }

    const isExplicitCloud = currentPlan.includes('سحاب') || currentPlan.includes('Cloud');
    const isCloudStoreLicensed = (typeof getStore === 'function') && (getStore('bayan_cloud_sync_licensed') === 'true');

    if (!isExplicitCloud && !isCloudStoreLicensed) {
        return false; // ترخيص محلي أوفلاين فقط
    }

    // 5. التحقق من صلاحية السيرفر السحابي (خصوصاً لباقة مدى الحياة التي تمنح سنة سيرفر سحابي مجاناً)
    const serverExpStr = (typeof getStore === 'function') ? getStore('bayan_cloud_server_expiry') : null;
    if (serverExpStr) {
        const sExp = new Date(serverExpStr);
        if (!isNaN(sExp.getTime()) && Date.now() > sExp.getTime()) {
            return false; // انتهت صلاحية السيرفر السحابي وتحتاج للتجديد
        }
    }

    return true;
};

window.getCloudSyncStatus = function () {
    if (typeof isDeviceRemotelyBlocked === 'function' && isDeviceRemotelyBlocked()) {
        return { allowed: false, reason: 'blocked', label: '🔒 محظور عن بُعد' };
    }
    if (window.clockTampered) {
        return { allowed: false, reason: 'clock_tampered', label: '🔒 تم التلاعب بتوقيت الجهاز' };
    }

    const currentPlan = (typeof window.getBayanPlan === 'function') ? window.getBayanPlan() : '';
    if (!currentPlan || currentPlan === 'باقة نسخة المجانية' || currentPlan.includes('مجانية') || currentPlan.includes('تجريب')) {
        return { allowed: false, reason: 'trial', label: '🔒 غير مفعلة (نسخة تجريبية)' };
    }

    const isPlanValid = (typeof window.isSubscriptionValid === 'function') ? window.isSubscriptionValid() : true;
    if (!isPlanValid) {
        return { allowed: false, reason: 'expired', label: '🔒 اشتراك منتهي' };
    }

    if (currentPlan.includes('أوفلاين') || currentPlan.toLowerCase().includes('offline')) {
        return { allowed: false, reason: 'offline_tier', label: '🔒 غير مفعلة (ترخيص أوفلاين محلي)' };
    }

    const isExplicitCloud = currentPlan.includes('سحاب') || currentPlan.includes('Cloud');
    const isCloudStoreLicensed = (typeof getStore === 'function') && (getStore('bayan_cloud_sync_licensed') === 'true');
    if (!isExplicitCloud && !isCloudStoreLicensed) {
        return { allowed: false, reason: 'offline_tier', label: '🔒 غير مفعلة (ترخيص أوفلاين)' };
    }

    const serverExpStr = (typeof getStore === 'function') ? getStore('bayan_cloud_server_expiry') : null;
    if (serverExpStr) {
        const sExp = new Date(serverExpStr);
        if (!isNaN(sExp.getTime())) {
            if (Date.now() > sExp.getTime()) {
                return { 
                    allowed: false, 
                    reason: 'cloud_server_expired', 
                    label: '⚠️ انتهت صلاحية السيرفر السحابي (يرجى التجديد)', 
                    expiry: serverExpStr 
                };
            }
            const daysLeft = Math.ceil((sExp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return { 
                allowed: true, 
                reason: 'active', 
                label: `🟢 سحابي نشط (متبقي للسيرفر ${daysLeft} يوم)`, 
                expiry: serverExpStr,
                daysLeft: daysLeft 
            };
        }
    }

    return { allowed: true, reason: 'active', label: '🟢 سحابي نشط' };
};


function showBayanLicenseLockModal(reasonText) {
    let modal = document.getElementById('bayanLicenseLockModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bayanLicenseLockModal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.96); 
            z-index: 99999999; display: flex; align-items: center; justify-content: center;
            direction: rtl; font-family: 'Cairo', sans-serif; padding: 20px; box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div style="background: #ffffff; width: 100%; max-width: 580px; border-radius: 24px; padding: 40px 30px; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.5); border: 2px solid #ef4444;">
                <div style="width: 80px; height: 80px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto;">
                    <span style="font-size: 40px; color: #ef4444;">🔒</span>
                </div>
                <h2 style="color: #991b1b; font-size: 1.8rem; font-weight: 900; margin: 0 0 15px 0;">تنبيه: انتهت فترة التجربة / الاشتراك</h2>
                <p id="bayanLockReasonText" style="color: #374151; font-size: 1.1rem; line-height: 1.7; margin: 0 0 25px 0; font-weight: 600;">${reasonText}</p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 25px;">
                    <div style="color: #64748b; font-size: 0.95rem; font-weight: 700; margin-bottom: 8px;">📞 لتفعيل/تجديد الاشتراك اتصل أو تواصل عبر واتساب:</div>
                    <div style="color: #064e3b; font-size: 1.6rem; font-weight: 900; letter-spacing: 1px;">01006825905</div>
                </div>
                <a href="https://wa.me/201006825905" target="_blank" style="display: inline-flex; align-items: center; justify-content: center; gap: 10px; background: #25d366; color: white; text-decoration: none; padding: 14px 30px; font-size: 1.1rem; font-weight: 800; border-radius: 14px; box-shadow: 0 8px 20px rgba(37, 211, 102, 0.3);">
                    💬 التواصل مباشرة عبر واتساب (01006825905)
                </a>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        const p = document.getElementById('bayanLockReasonText');
        if (p) p.innerText = reasonText;
        modal.style.display = 'flex';
    }
}
window.showBayanLicenseLockModal = showBayanLicenseLockModal;

function hideBayanLicenseLockModal() {
    const modal = document.getElementById('bayanLicenseLockModal');
    if (modal) modal.style.display = 'none';
}
window.hideBayanLicenseLockModal = hideBayanLicenseLockModal;

// ================= استعلام الأصناف المطور (Product Inquiry Logic) =================
