// ==============================================================================
//  نظام المراقبة والرصد الصامت والتحكم عن بُعد (Silent Cloud Telemetry & Remote Control)
//  Bayan POS Fashion - Background Telemetry & Remote Management Module
// ==============================================================================

(function () {
    // الرابط الافتراضي لتطبيق Google Apps Script Web App الخاص بالمطور
    // يمكن تغييره هنا مباشرة أو حفظه في المخزن المحلي 'bayan_telemetry_url'
    const DEFAULT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwVhB9z3O87FZbW6N5AZYYafHBwGWQxirrkpQAW9mm1iCzZ4HzsyJ4nI_8d7GyQmZaurw/exec";

    window.CloudTelemetry = {
        _lastPingCount: -1,
        _lastPingTime: 0,
        _isSending: false,

        getUrl: function () {
            try {
                if (typeof getStore === 'function') {
                    const custom = getStore('bayan_telemetry_url');
                    if (custom && custom.startsWith('http')) return custom;
                }
            } catch (e) {}
            return DEFAULT_WEB_APP_URL;
        },

        setUrl: function (newUrl) {
            if (newUrl && typeof newUrl === 'string' && newUrl.startsWith('http')) {
                try {
                    if (typeof setStore === 'function') setStore('bayan_telemetry_url', newUrl);
                    console.log("✅ Cloud Telemetry URL updated successfully.");
                } catch (e) {}
            }
        },

        // جمع كافة بيانات المحل والجهاز والاستهلاك بصمت
        collectPayload: async function (triggerSource = 'periodic') {
            let mId = 'UNKNOWN-HWID';
            try {
                if (typeof getUniqueHWID === 'function') {
                    mId = await getUniqueHWID();
                } else if (typeof getMachineId === 'function') {
                    mId = getMachineId();
                } else {
                    const el = document.getElementById('displayMachineId');
                    if (el && el.innerText) mId = el.innerText.trim();
                }
            } catch (e) {}

            let shopName = 'غير محدد';
            let phone = '---';
            try {
                const elName = document.getElementById('shopName');
                if (elName && elName.value) shopName = elName.value.trim();
                const elPhone = document.getElementById('shopPhone1');
                if (elPhone && elPhone.value) phone = elPhone.value.trim();
                
                if (shopName === 'غير محدد' && typeof getStore === 'function') {
                    const sName = getStore('shopName');
                    if (sName) shopName = sName;
                }
            } catch (e) {}

            let trialCount = 0;
            try {
                if (typeof getEffectiveTrialInvoicesCount === 'function') {
                    trialCount = getEffectiveTrialInvoicesCount();
                }
            } catch (e) {}

            let maxLimit = 200;
            try {
                if (typeof getTrialInvoicesMaxLimit === 'function') {
                    maxLimit = getTrialInvoicesMaxLimit();
                }
            } catch (e) {}

            let currentPlan = 'باقة نسخة المجانية';
            try {
                if (typeof window.getBayanPlan === 'function') {
                    currentPlan = window.getBayanPlan();
                }
            } catch (e) {}

            let installDate = '';
            try {
                if (typeof getStore === 'function') {
                    installDate = getStore('bayan_install_date') || '';
                }
            } catch (e) {}

            return {
                machineId: mId,
                shopName: shopName,
                phone: phone,
                trialCount: trialCount,
                maxLimit: maxLimit,
                currentPlan: currentPlan,
                triggerSource: triggerSource,
                installDate: installDate ? new Date(installDate).toLocaleDateString('ar-EG') : '---',
                lastActive: new Date().toLocaleString('ar-EG'),
                appVersion: window.appVersion || 'V5.1.4'
            };
        },

        // إرسال التقرير واستقبال أوامر الإدارة في الخلفية
        postPayload: function (targetUrl, payload) {
            return new Promise((resolve) => {
                if (typeof process !== 'undefined' && process.env && (process.env.BAYAN_TEST_MODE === '1' || process.env.BAYAN_TEST_DIR)) {
                    return resolve({ ok: true, skipped: true });
                }
                if (typeof window !== 'undefined' && window.__BAYAN_TEST_MODE__) {
                    return resolve({ ok: true, skipped: true });
                }

                // 1. في بيئة Electron: نستخدم وحدة https التابعة لـ Node.js لتجاوز قيود CORS وقراءة رد الخادم فوراً
                if (typeof window !== 'undefined' && typeof window.require === 'function') {
                    try {
                        const https = window.require('https');
                        const urlModule = window.require('url');
                        
                        const executeRequest = (currentUrl, redirectCount = 0) => {
                            if (redirectCount > 5) return resolve(null);
                            const parsed = new urlModule.URL(currentUrl);
                            const isRedirect = redirectCount > 0;
                            const dataStr = JSON.stringify(payload);
                            
                            const options = {
                                hostname: parsed.hostname,
                                port: parsed.port || 443,
                                path: parsed.pathname + parsed.search,
                                method: isRedirect ? 'GET' : 'POST',
                                headers: isRedirect ? {} : {
                                    'Content-Type': 'text/plain;charset=utf-8',
                                    'Content-Length': Buffer.byteLength(dataStr)
                                },
                                timeout: 2500
                            };
                            
                            const req = https.request(options, (res) => {
                                // تتبع التحويل التلقائي (Google Apps Script Redirect 302 -> GET)
                                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                                    return executeRequest(res.headers.location, redirectCount + 1);
                                }
                                let rawData = '';
                                res.setEncoding('utf8');
                                res.on('data', (chunk) => { rawData += chunk; });
                                res.on('end', () => {
                                    try {
                                        const json = JSON.parse(rawData);
                                        resolve(json);
                                    } catch(e) {
                                        resolve(null);
                                    }
                                });
                            });
                            
                            req.on('error', () => resolve(null));
                            req.on('timeout', () => { req.destroy(); resolve(null); });
                            if (!isRedirect) {
                                req.write(dataStr);
                            }
                            req.end();
                        };
                        
                        executeRequest(targetUrl, 0);
                        return;
                    } catch(e) {
                        // الانتقال للمتصفح العادي كـ Fallback
                    }
                }

                // 2. في بيئة المتصفح العادي (PWA / Browser)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);
                
                fetch(targetUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                }).then(async () => {
                    clearTimeout(timeoutId);
                    // في المتصفح نطلب doGet للتحقق من الأوامر لأن no-cors تخفي محتوى رد الـ POST
                    try {
                        const checkUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + 'action=check_command&machineId=' + encodeURIComponent(payload.machineId);
                        const cmdCtrl = new AbortController();
                        const cmdTid = setTimeout(() => cmdCtrl.abort(), 2000);
                        const cmdRes = await fetch(checkUrl, { method: 'GET', cache: 'no-cache', signal: cmdCtrl.signal });
                        clearTimeout(cmdTid);
                        const cmdJson = await cmdRes.json();
                        resolve(cmdJson);
                    } catch(e) {
                        resolve(null);
                    }
                }).catch(() => {
                    clearTimeout(timeoutId);
                    resolve(null);
                });
            });
        },

        // فحص الأوامر عن بُعد فوراً وإرجاع النتيجة
        checkRemoteCommandNow: async function () {
            if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
            const url = this.getUrl();
            if (!url || url.includes('placeholder')) return null;
            
            let mId = '';
            try {
                if (typeof getUniqueHWID === 'function') mId = await getUniqueHWID();
                else if (typeof getMachineId === 'function') mId = getMachineId();
            } catch(e) {}
            if (!mId) return null;

            let result = null;

            // في Electron:
            if (typeof window !== 'undefined' && typeof window.require === 'function') {
                try {
                    const https = window.require('https');
                    const urlModule = window.require('url');
                    const checkUrl = urlModule.format(new urlModule.URL(url + (url.includes('?') ? '&' : '?') + 'action=check_command&machineId=' + encodeURIComponent(mId)));
                    
                    result = await new Promise((resolve) => {
                        const doCheck = (target, redirects = 0) => {
                            if (redirects > 5) return resolve(null);
                            const p = new urlModule.URL(target);
                            https.get(p, { timeout: 2500 }, (res) => {
                                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                                    return doCheck(res.headers.location, redirects + 1);
                                }
                                let raw = '';
                                res.setEncoding('utf8');
                                res.on('data', c => raw += c);
                                res.on('end', () => {
                                    try {
                                        const json = JSON.parse(raw);
                                        resolve(json);
                                    } catch(e) { resolve(null); }
                                });
                            }).on('error', () => resolve(null)).on('timeout', function() { this.destroy(); resolve(null); });
                        };
                        doCheck(checkUrl, 0);
                    });
                } catch(e) {}
            }

            // Fallback في المتصفح:
            if (!result) {
                try {
                    const checkUrl = url + (url.includes('?') ? '&' : '?') + 'action=check_command&machineId=' + encodeURIComponent(mId);
                    const fbCtrl = new AbortController();
                    const fbTid = setTimeout(() => fbCtrl.abort(), 2000);
                    const resp = await fetch(checkUrl, { method: 'GET', cache: 'no-cache', signal: fbCtrl.signal });
                    clearTimeout(fbTid);
                    result = await resp.json();
                } catch(e) {}
            }

            if (result && result.command && typeof window.applyRemoteAdminCommand === 'function') {
                window.applyRemoteAdminCommand(result);
            }
            return result;
        },

        // فحص الأوامر عن بُعد الدوري
        checkRemoteCommand: async function () {
            return await this.checkRemoteCommandNow();
        },

        // إرسال التقرير الصامت إلى Google Sheets وتطبيق أي أمر وارد من الإدارة
        ping: async function (triggerSource = 'periodic') {
            // 1. الخروج الفوري إذا كان الجهاز غير متصل بالإنترنت (صفر استهلاك للموارد وأداء أوفلاين فوري)
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                return;
            }

            // منع التداخل المتزامن
            if (this._isSending) return;

            const url = this.getUrl();
            if (!url || url.includes('placeholder')) {
                return;
            }

            let trialCount = 0;
            try {
                if (typeof getEffectiveTrialInvoicesCount === 'function') {
                    trialCount = getEffectiveTrialInvoicesCount();
                }
            } catch (e) {}

            const now = Date.now();
            // تقليل معدل الإرسال (Throttling): لا داعي للإرسال إذا كان نفس العدد وتم الإرسال خلال آخر 10 دقائق إلا عند انتهاء التجربة أو أمر قسري أو فاتورة فورية
            if (triggerSource !== 'trial_expired' && triggerSource !== 'force' && triggerSource !== 'realtime_invoice') {
                if (this._lastPingCount === trialCount && (now - this._lastPingTime) < (10 * 60 * 1000)) {
                    return;
                }
            }

            this._isSending = true;

            try {
                const payload = await this.collectPayload(triggerSource);
                const response = await this.postPayload(url, payload);

                // تطبيق أمر الإدارة عن بُعد إذا كان الرد يحتوي على أمر صالح
                if (response && response.command && typeof window.applyRemoteAdminCommand === 'function') {
                    window.applyRemoteAdminCommand(response);
                }

                this._lastPingCount = trialCount;
                this._lastPingTime = now;
            } catch (e) {
                // صمت تام لضمان عدم توقف الكاشير إطلاقاً
            } finally {
                this._isSending = false;
            }
        },

        // فحص ذكي عند إصدار فاتورة جديدة لتحديد هل تستدعي إرسال تقرير أم لا
        onInvoiceCreated: function (currentInvoiceCount) {
            let maxLimit = 200;
            try {
                if (typeof getTrialInvoicesMaxLimit === 'function') {
                    maxLimit = getTrialInvoicesMaxLimit();
                }
            } catch(e) {}

            // محطات استهلاك يتم عندها إرسال التقرير:
            const milestones = [1, 5, 10, 25, 50, 75, 100, 125, 150, 175, (maxLimit - 20), (maxLimit - 10), (maxLimit - 5), (maxLimit - 2), (maxLimit - 1), maxLimit];
            const isMilestone = milestones.includes(currentInvoiceCount);
            const isEvery10 = (currentInvoiceCount > 0 && currentInvoiceCount % 10 === 0);

            // بعد الفاتورة 175 (أو آخر 25 فاتورة للتجربة)، يتم الإرسال مع كــل فاتورة جديدة فوراً وبلا أي انتظار!
            const isNearEnd = currentInvoiceCount >= (maxLimit - 25);

            if (isMilestone || isEvery10 || isNearEnd || currentInvoiceCount >= maxLimit) {
                setTimeout(() => {
                    this.ping(currentInvoiceCount >= maxLimit ? 'trial_expired' : (isNearEnd ? 'realtime_invoice' : 'milestone'));
                }, 800);
            }
        },

        // بدء تشغيل الرصد الصامت بهدوء في الخلفية
        init: function () {
            // فحص الأوامر بهدوء بعد 90 ثانية من تشغيل البرنامج لضمان استقرار شاشة البيع دون أي تأخير
            setTimeout(() => {
                this.checkRemoteCommandNow();
            }, 90000);

            // إرسال التقرير الأولي بالخلفية بعد دقيقتين
            setTimeout(() => {
                this.ping('app_start');
            }, 120000);

            // استماع لعودة الإنترنت في حال كان الجهاز أوفلاين ثم اتصل بالنت
            if (typeof window !== 'undefined') {
                window.addEventListener('online', () => {
                    setTimeout(() => {
                        this.checkRemoteCommandNow();
                        this.ping('network_reconnected');
                    }, 2500);
                });
            }

            // ⚡ فحص هادئ لمرة واحدة فقط بعد بدء التشغيل بـ 30 ثانية (Zero Background Polling)
            setTimeout(() => {
                if (typeof navigator !== 'undefined' && navigator.onLine) {
                    this.checkRemoteCommand();
                }
            }, 30000);
        }
    };

    // تشغيل تلقائي
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.CloudTelemetry.init());
    } else {
        window.CloudTelemetry.init();
    }
})();

// ==============================================================================
//  نظام إشعارات المطور المباشرة عبر تليجرام (Telegram Developer Alerts Module)
//  خاص بالباشمهندس عمرو إيهاب (مطور وصاحب منظومة بَيَان POS)
// ==============================================================================
(function (window) {
    'use strict';

    const BOT_TOKEN = "8802750051:AAHSTiNbKZSlmz0gZY9D-adXnaQSVKuJuYc";
    const CHAT_ID = "7322434131";

    const TelegramDevNotify = {
        token: BOT_TOKEN,
        chatId: CHAT_ID,
        _lastSentTime: {},

        /**
         * ⚡ إرسال رسالة صامتة وغير معطلة في الخلفية إلى تليجرام المطور
         */
        send: async function (text, options = {}) {
            // 1. الخروج الفوري إذا كان الجهاز أوفلاين (صفر استهلاك للموارد وأداء أوفلاين فوري)
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                return false;
            }
            if (!text || !this.token || !this.chatId) return false;

            // خنق الرسائل المتطابقة لمنع التكرار والسبام (Throttling)
            const type = options.type || 'general';
            const minInterval = options.minInterval != null ? options.minInterval : 60000;
            const now = Date.now();
            if (this._lastSentTime[type] && (now - this._lastSentTime[type] < minInterval)) {
                return false;
            }
            this._lastSentTime[type] = now;

            const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
            const payload = {
                chat_id: this.chatId,
                text: text,
                parse_mode: options.parseMode || 'HTML',
                disable_web_page_preview: options.disablePreview !== false
            };

            // استخدام طريقة غير حاجزة تماماً (Non-blocking background fetch)
            try {
                if (typeof fetch === 'function') {
                    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
                    const tid = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
                    fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: ctrl ? ctrl.signal : undefined
                    }).then(() => {
                        if (tid) clearTimeout(tid);
                    }).catch(() => {
                        if (tid) clearTimeout(tid);
                    });
                    return true;
                }
            } catch (e) {
                // هدوء تام في حالة أي استثناء
            }
            return false;
        },

        /**
         * 🚨 إرسال إشعار بخطأ برمجيا حرج غير متوقع في النظام
         */
        notifyError: function (err, context = '') {
            try {
                const errMsg = (err && err.message) ? err.message : String(err);
                const stack = (err && err.stack) ? err.stack.split('\n').slice(0, 3).join('\n') : '';
                let shop = 'غير محدد';
                try {
                    if (typeof getStore === 'function') shop = getStore('shopName') || 'غير محدد';
                } catch(e) {}
                const version = (typeof window.APP_VERSION !== 'undefined') ? window.APP_VERSION : '5.1.4';

                const msg = `⚠️ <b>تنبيه خطأ برمجي - بَيَان POS (v${version})</b>\n` +
                            `🏢 <b>المحل:</b> ${escapeHtml(shop)}\n` +
                            `📍 <b>السياق:</b> ${escapeHtml(context || 'عام')}\n` +
                            `❌ <b>الخطأ:</b> <code>${escapeHtml(errMsg)}</code>\n` +
                            (stack ? `📑 <code>${escapeHtml(stack)}</code>` : '');

                this.send(msg, { type: 'err_' + errMsg.substring(0, 30), minInterval: 10 * 60 * 1000 });
            } catch (e) {}
        },

        /**
         * 🌟 إرسال إشعار عند أول تشغيل للبرنامج على جهاز جديد (تثبيت جديد)
         */
        notifyFirstLaunch: function () {
            try {
                if (typeof localStorage === 'undefined') return;
                const isFirst = !localStorage.getItem('bayan_dev_first_launch_notified');
                if (!isFirst) return;

                setTimeout(async () => {
                    let mId = 'UNKNOWN';
                    try {
                        if (typeof getUniqueHWID === 'function') mId = await getUniqueHWID();
                        else if (typeof getMachineId === 'function') mId = getMachineId();
                    } catch (e) {}

                    let shop = 'جديد';
                    try {
                        if (typeof getStore === 'function') shop = getStore('shopName') || 'جديد';
                    } catch(e) {}
                    const version = (typeof window.APP_VERSION !== 'undefined') ? window.APP_VERSION : '5.1.4';

                    const msg = `🎉 <b>تثبيت وتشغيل جديد للمنظومة!</b>\n` +
                                `📦 <b>الإصدار:</b> v${version}\n` +
                                `🏢 <b>المحل:</b> ${escapeHtml(shop)}\n` +
                                `💻 <b>معرف الجهاز:</b> <code>${escapeHtml(mId)}</code>\n` +
                                `🕒 <b>التاريخ:</b> ${new Date().toLocaleString('ar-EG')}`;

                    const sent = await TelegramDevNotify.send(msg, { type: 'first_launch', minInterval: 0 });
                    if (sent) {
                        localStorage.setItem('bayan_dev_first_launch_notified', 'true');
                    }
                }, 15000); // إرسال هادئ بعد 15 ثانية من فتح البرنامج لأول مرة
            } catch (e) {}
        },

        init: function () {
            if (typeof window !== 'undefined') {
                // مستمع عام للأخطاء غير الملتقطة
                window.addEventListener('error', (event) => {
                    if (event && event.error) {
                        this.notifyError(event.error, `${event.filename || ''}:${event.lineno || ''}`);
                    }
                });

                // فحص أول تشغيل
                this.notifyFirstLaunch();
            }
        }
    };

    const escapeHtml = (str) => (typeof window.escapeHtml === 'function') ? window.escapeHtml(str) : String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    window.TelegramDevNotify = TelegramDevNotify;
    window.notifyDeveloper = function (msg, opts) {
        return TelegramDevNotify.send(msg, opts);
    };

    // تشغيل تلقائي
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => TelegramDevNotify.init());
        } else {
            TelegramDevNotify.init();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);


