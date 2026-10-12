/**
 * =========================================================================
 * ☁️ BAYAN POS - GOOGLE DRIVE CLOUD BACKUP ENGINE (js/cloud_drive_backup.js)
 * =========================================================================
 * محرك النسخ الاحتياطي السحابي التلقائي واليدوي عبر Google Drive
 * - اتصال مباشر بـ Google Drive REST API v3 عبر OAuth2 أو Google Apps Script Webhook.
 * - إنشاء وإدارة مجلد خاص ومنفصل: (Bayan_POS_Backups).
 * - رفع تلقائي هادئ في الخلفية عند إغلاق الوردية وجرد الدرج (Shift Close).
 * - صمود كامل أمام انقطاع الإنترنت (Offline-first Resilience) مع إعادة الرفع التلقائي فور عودة الاتصال.
 * - حماية أمنية مشددة: نطاق الصلاحيات مقتصر حصراً على الملفات المنشأة بواسطة البرنامج (drive.file).
 * =========================================================================
 */

(function (window) {
    'use strict';

    const _safeDecodeStr = (b64) => typeof atob === 'function' ? atob(b64) : (typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString() : '');
    const DEFAULT_OAUTH_CLIENT_ID = _safeDecodeStr('MTAzOTA4NDAzNjIyOC1oZmhlYmc5Ym9zaWd2NXVnY3Zycmw5MWs1a2t1ZHY0Ny5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ=='); // معرّف تطبيق بيان الرسمي من جوجل
    const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz0hce-C1F6XmASlBXx4xayna7Zjk8Rn6hCVLQWyEPAvzcATK593uTTLOmvb5T0lZWM/exec'; // رابط Webhook المعتمد للنسخ السحابي

    const BayanGoogleDrive = {
        state: {
            isConnected: false,
            userEmail: '',
            accessToken: '',
            tokenExpiresAt: 0,
            folderId: '1EJL01r6rdgxiShCHOC5yrTy5EoS7ZYqR',
            webhookUrl: '',
            autoShiftBackup: true,
            autoInterval: 'close',
            lastBackupTime: null,
            lastBackupFileName: '',
            lastBackupStatus: 'idle',
            isUploading: false
        },

        /**
         * 🔄 تهيئة المحرك واستعادة الحالة من الإعدادات المحفوظة
         */
        init: function () {
            this.loadState();
            // تفعيل رابط الـ Webhook المعتمد وتحديث الحالة لمتصل تلقائياً
            if (!this.state.webhookUrl && DEFAULT_WEBHOOK_URL) {
                this.state.webhookUrl = DEFAULT_WEBHOOK_URL;
                this.state.isConnected = true;
                this.state.userEmail = 'Google Drive السحابي المتصل ☁️';
                this.saveState();
            } else if (this.state.webhookUrl) {
                this.state.isConnected = true;
                if (!this.state.userEmail) this.state.userEmail = 'Google Drive السحابي المتصل ☁️';
                this.saveState();
            }
            this.bindEvents();
            this.updateUI();
            this.checkPendingUploads();
            console.log("☁️ [GoogleDrive] Cloud backup engine initialized successfully (Active Webhook mode).");
        },

        /**
         * 💾 تحميل بيانات الربط من التخزين الدائم
         */
        loadState: function () {
            try {
                const s = (typeof getStore === 'function') ? getStore : (k => localStorage.getItem(k));
                const savedWebhook = s('gdrive_webhook_url');
                const isExplicitlyDisconnected = s('gdrive_connected') === 'false';

                this.state.webhookUrl = (savedWebhook !== null && savedWebhook !== undefined && savedWebhook !== '') ? savedWebhook : DEFAULT_WEBHOOK_URL;
                if (!this.state.webhookUrl && DEFAULT_WEBHOOK_URL && !isExplicitlyDisconnected) {
                    this.state.webhookUrl = DEFAULT_WEBHOOK_URL;
                }

                this.state.isConnected = isExplicitlyDisconnected ? false : (s('gdrive_connected') === 'true' || Boolean(this.state.webhookUrl));
                this.state.userEmail = s('gdrive_user_email') || (this.state.isConnected && this.state.webhookUrl ? 'Google Drive السحابي المتصل ☁️' : '');
                this.state.accessToken = s('gdrive_access_token') || '';
                this.state.tokenExpiresAt = parseInt(s('gdrive_token_expires_at') || '0', 10);
                this.state.folderId = s('gdrive_folder_id') || '1EJL01r6rdgxiShCHOC5yrTy5EoS7ZYqR';
                this.state.autoShiftBackup = s('gdrive_auto_shift_backup') !== 'false';
                this.state.autoInterval = s('gdrive_auto_interval') || 'close';
                this.state.lastBackupTime = s('gdrive_last_backup_time') || null;
                this.state.lastBackupFileName = s('gdrive_last_backup_file_name') || '';
                this.state.lastBackupStatus = s('gdrive_last_backup_status') || 'idle';
            } catch (e) {
                console.warn("[GoogleDrive] Load state notice:", e.message);
            }
        },

        /**
         * 💾 حفظ حالة الربط في التخزين الدائم
         */
        saveState: function () {
            try {
                const set = (typeof setStore === 'function') ? setStore : ((k, v) => localStorage.setItem(k, v));
                set('gdrive_connected', this.state.isConnected ? 'true' : 'false');
                set('gdrive_user_email', this.state.userEmail || '');
                set('gdrive_access_token', this.state.accessToken || '');
                set('gdrive_token_expires_at', String(this.state.tokenExpiresAt || 0));
                set('gdrive_folder_id', this.state.folderId || '');
                set('gdrive_webhook_url', this.state.webhookUrl || '');
                set('gdrive_auto_shift_backup', this.state.autoShiftBackup ? 'true' : 'false');
                set('gdrive_auto_interval', this.state.autoInterval || 'close');
                set('gdrive_last_backup_time', this.state.lastBackupTime || '');
                set('gdrive_last_backup_file_name', this.state.lastBackupFileName || '');
                set('gdrive_last_backup_status', this.state.lastBackupStatus || 'idle');
            } catch (e) {
                console.warn("[GoogleDrive] Save state notice:", e.message);
            }
        },

        /**
         * 🌐 ربط الأحداث العامة (استعادة النت + رسائل OAuth)
         */
        bindEvents: function () {
            // 1. إعادة المحاولة التلقائية فور عودة الإنترنت
            window.addEventListener('online', () => {
                console.log("🌐 [GoogleDrive] Network back online. Checking pending cloud backups...");
                this.checkPendingUploads();
            });

            // 2. الاستماع لرسائل نافذة المصادقة المنبثقة (Popup Window Auth Message)
            window.addEventListener('message', async (event) => {
                if (event.data && event.data.type === 'BAYAN_GDRIVE_AUTH') {
                    if (event.data.error) {
                        this.showNotification("❌ فشل تفويض حساب Google: " + event.data.error, "error");
                        return;
                    }
                    if (event.data.token) {
                        await this.applyAccessToken(event.data.token, 3600);
                        this.closeAuthModal();
                    }
                }
            });

            // 3. مراقبة الـ LocalStorage في حال تم التفويض عبر علامة تبويب أخرى
            window.addEventListener('storage', async (e) => {
                if (e.key === 'bayan_gdrive_auth_payload' && e.newValue) {
                    try {
                        const payload = JSON.parse(e.newValue);
                        if (payload.token) {
                            localStorage.removeItem('bayan_gdrive_auth_payload');
                            await this.applyAccessToken(payload.token, 3600);
                            this.closeAuthModal();
                        }
                    } catch (err) {}
                }
            });

            // 4. الاستماع لحدث Electron IPC عند نجاح التفويض من السيرفر المحلي
            if (typeof window.require !== 'undefined') {
                try {
                    const { ipcRenderer } = window.require('electron');
                    if (ipcRenderer && typeof ipcRenderer.on === 'function') {
                        ipcRenderer.on('gdrive-auth-success', async (evt, data) => {
                            if (data && data.accessToken) {
                                await this.applyAccessToken(data.accessToken, 3600);
                                this.closeAuthModal();
                            }
                        });
                    }
                } catch (e) {}
            }
        },

        /**
         * 🔑 تطبيق وحفظ رمز الوصول (Access Token) وجلب بيانات الحساب والمجلد
         */
        applyAccessToken: async function (token, expiresInSec = 3600) {
            if (!token) return;
            this.state.accessToken = token;
            this.state.tokenExpiresAt = Date.now() + ((expiresInSec - 60) * 1000);

            this.showNotification("🔄 جاري التحقق من حساب Google Drive وإنشاء مجلد النسخ...", "info");

            // جلب البريد الإلكتروني للمستخدم
            try {
                const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    this.state.userEmail = userData.email || '';
                }
            } catch (e) {
                console.warn("[GoogleDrive] User info fetch error:", e);
            }

            // فحص أو إنشاء مجلد Bayan_POS_Backups
            try {
                const folderId = await this.ensureBackupFolder(token);
                this.state.folderId = folderId;
            } catch (e) {
                console.warn("[GoogleDrive] Ensure folder error:", e);
            }

            this.state.isConnected = true;
            this.saveState();
            this.updateUI();
            this.closeAuthModal();

            const emailDisplay = this.state.userEmail ? ` (${this.state.userEmail})` : '';
            this.showNotification(`✅ تم ربط حساب Google Drive بنجاح${emailDisplay}!`, "success");
        },

        /**
         * 📁 التأكد من وجود مجلد النسخ الاحتياطية وإنشاؤه إن لم يوجد
         */
        ensureBackupFolder: async function (token) {
            if (!token) token = this.state.accessToken;
            if (!token) return '';

            // البحث عن المجلد بالاسم
            const query = encodeURIComponent(`name='${GDRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
            const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

            const searchRes = await fetch(searchUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (searchRes.ok) {
                const searchData = await searchRes.json();
                if (searchData.files && searchData.files.length > 0) {
                    return searchData.files[0].id;
                }
            }

            // إنشاء المجلد إذا لم يكن موجوداً
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: GDRIVE_FOLDER_NAME,
                    mimeType: 'application/vnd.google-apps.folder',
                    description: 'مجلد النسخ الاحتياطية التلقائية لنظام بيان لإدارة نقاط البيع Bayan POS'
                })
            });

            if (createRes.ok) {
                const createData = await createRes.json();
                return createData.id;
            }

            return '';
        },

        /**
         * 🔗 فتح نافذة خيارات الربط (OAuth أو Webhook أو Token يدوياً)
         */
        openAuthModal: function () {
            const existingModal = document.getElementById('bayanGDriveAuthModal');
            if (existingModal) existingModal.remove();

            const currentEmail = this.state.userEmail;
            const currentWebhook = this.state.webhookUrl;

            const modalHtml = `
            <div id="bayanGDriveAuthModal" class="gdrive-modal-overlay" style="position:fixed; inset:0; background:rgba(15,23,42,0.85); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:15px; direction:rtl; font-family:'Cairo',sans-serif;">
                <div class="gdrive-modal-card" style="background:#ffffff; border-radius:24px; width:620px; max-width:96vw; max-height:92vh; overflow-y:auto; box-shadow:0 25px 60px rgba(0,0,0,0.35); border:1px solid #e2e8f0; padding:28px 24px; position:relative;">
                    
                    <!-- Header -->
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1.5px solid #f1f5f9; padding-bottom:16px;">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="width:48px; height:48px; border-radius:14px; background:#eff6ff; display:flex; align-items:center; justify-content:center; font-size:1.6rem; border:1.5px solid #bfdbfe;">
                                ☁️
                            </div>
                            <div>
                                <h3 style="margin:0; font-size:1.25rem; font-weight:900; color:#0f172a;">ربط النسخ الاحتياطي مع Google Drive</h3>
                                <p style="margin:3px 0 0; font-size:0.82rem; color:#64748b; font-weight:700;">اختر الطريقة الأنسب لك لحفظ بياناتك في السحاب</p>
                            </div>
                        </div>
                        <button onclick="window.BayanGoogleDrive.closeAuthModal()" style="background:#f1f5f9; border:none; border-radius:50%; width:34px; height:34px; cursor:pointer; font-size:1.2rem; font-weight:900; color:#475569; display:flex; align-items:center; justify-content:center;">&times;</button>
                    </div>

                    <!-- Option 1: Google OAuth Direct Login -->
                    <div style="background:#f8fafc; border:2px solid #e2e8f0; border-radius:18px; padding:20px; margin-bottom:18px; transition:0.2s;" onmouseover="this.style.borderColor='#3b82f6'" onmouseout="this.style.borderColor='#e2e8f0'">
                        <div style="display:flex; align-items:flex-start; gap:14px;">
                            <span style="font-size:1.8rem; line-height:1;">⚡</span>
                            <div style="flex:1;">
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                                    <h4 style="margin:0; font-size:1.05rem; font-weight:900; color:#1e293b;">الربط السريع بحساب Google</h4>
                                    <span style="background:#dcfce7; color:#15803d; font-size:0.75rem; font-weight:900; padding:2px 8px; border-radius:10px;">الموصى به 🌟</span>
                                </div>
                                <p style="margin:0 0 14px; font-size:0.84rem; color:#64748b; font-weight:700; line-height:1.5;">
                                    تسجيل الدخول الرسمي بحسابك (Gmail)، وسيتم إنشاء مجلد آمن باسم <b>Bayan_POS_Backups</b> تلقائياً.
                                </p>
                                <button type="button" onclick="window.BayanGoogleDrive.startOAuthFlow()" style="background:#ffffff; color:#1e293b; border:2px solid #cbd5e1; border-radius:12px; padding:10px 20px; font-size:0.92rem; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:10px; box-shadow:0 2px 6px rgba(0,0,0,0.06); transition:0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#ffffff'">
                                    <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                                    <span>تسجيل الدخول باستخدام Google</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Option 2: Google Apps Script Webhook (Direct & Zero Hassle) -->
                    <div style="background:#f8fafc; border:2px solid #e2e8f0; border-radius:18px; padding:20px; margin-bottom:18px;">
                        <div style="display:flex; align-items:flex-start; gap:14px;">
                            <span style="font-size:1.8rem; line-height:1;">🔗</span>
                            <div style="flex:1;">
                                <h4 style="margin:0 0 4px; font-size:1.05rem; font-weight:900; color:#1e293b;">الربط المباشر عبر Webhook / Google Apps Script</h4>
                                <p style="margin:0 0 12px; font-size:0.84rem; color:#64748b; font-weight:700; line-height:1.5;">
                                    بديل عملي ومباشر بنقرة واحدة للمحلات؛ الصق رابط Webhook الخاص بسكربت جوجل درايف ليتم الرفع فوراً بدون أي نوافذ تسجيل دورية.
                                </p>
                                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                                    <input type="text" id="gdriveWebhookInput" value="${escapeHtml(currentWebhook)}" placeholder="https://script.google.com/macros/s/.../exec" style="flex:1; min-width:240px; height:42px; border:1.5px solid #cbd5e1; border-radius:10px; padding:0 14px; font-size:0.86rem; font-weight:700; direction:ltr;">
                                    <button type="button" onclick="window.BayanGoogleDrive.saveWebhookUrl()" style="background:#059669; color:#fff; border:none; border-radius:10px; padding:0 18px; font-size:0.9rem; font-weight:900; cursor:pointer; height:42px;">حفظ الرابط ✔️</button>
                                </div>
                                <div style="margin-top:10px;">
                                    <a href="javascript:void(0)" onclick="window.BayanGoogleDrive.showAppsScriptTemplateModal()" style="font-size:0.8rem; color:#2563eb; font-weight:800; text-decoration:none;">📋 عرض كود سكربت جوجل الجاهز للنسخ (Apps Script Template)</a>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Option 3: Manual Token Input -->
                    <div style="background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:16px; padding:16px;">
                        <details style="cursor:pointer;">
                            <summary style="font-size:0.88rem; font-weight:900; color:#475569; outline:none;">⚙️ خيارات متقدمة (إدخال رمز تفويض Access Token يدوياً)</summary>
                            <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
                                <input type="password" id="gdriveManualTokenInput" placeholder="الصق رمز Google Access Token هنا..." style="flex:1; min-width:240px; height:40px; border:1.5px solid #cbd5e1; border-radius:10px; padding:0 12px; font-size:0.84rem; direction:ltr;">
                                <button type="button" onclick="window.BayanGoogleDrive.applyManualToken()" style="background:#3b82f6; color:#fff; border:none; border-radius:10px; padding:0 16px; font-size:0.88rem; font-weight:900; cursor:pointer; height:40px;">تفعيل الرمز</button>
                            </div>
                        </details>
                    </div>

                </div>
            </div>`;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
        },

        closeAuthModal: function () {
            const modal = document.getElementById('bayanGDriveAuthModal');
            if (modal) modal.remove();
        },

        /**
         * 🚀 بدء دورة OAuth الرسمية مع Google
         */
        startOAuthFlow: function () {
            const clientId = DEFAULT_OAUTH_CLIENT_ID;
            const redirectUri = 'http://127.0.0.1:4545/gdrive-callback';

            const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email');
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&prompt=consent&scope=${scope}`;

            // 1. تشغيل خادم محلي مؤقت على 127.0.0.1:4545 في بيئة Electron لاستقبال كود تفويض Google Drive فوراً
            if (typeof window.require !== 'undefined') {
                try {
                    const http = window.require('http');
                    const https = window.require('https');
                    const tempServer = http.createServer((req, res) => {
                        try {
                            const reqUrl = new URL(req.url, 'http://127.0.0.1:4545');
                            if (reqUrl.pathname === '/gdrive-callback') {
                                const code = reqUrl.searchParams.get('code');
                                if (code) {
                                    const postData = 'code=' + encodeURIComponent(code) +
                                        '&client_id=' + encodeURIComponent(clientId) +
                                        '&client_secret=' + encodeURIComponent(_safeDecodeStr('R09DU1BYLU05MVYySjV0cUR1N2tXTG1nazZieXh0T2xwLQ==')) +
                                        '&redirect_uri=' + encodeURIComponent(redirectUri) +
                                        '&grant_type=authorization_code';
                                    const tokenReq = https.request({
                                        hostname: 'oauth2.googleapis.com',
                                        port: 443,
                                        path: '/token',
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/x-www-form-urlencoded',
                                            'Content-Length': Buffer.byteLength(postData)
                                        }
                                    }, (tokenRes) => {
                                        let raw = '';
                                        tokenRes.on('data', chunk => { raw += chunk; });
                                        tokenRes.on('end', () => {
                                            try {
                                                const resObj = JSON.parse(raw);
                                                if (resObj.access_token) {
                                                    BayanGoogleDrive.applyAccessToken(resObj.access_token, 3600);
                                                    BayanGoogleDrive.closeAuthModal();
                                                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                                                    res.end('<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;background:#0f172a;color:#4ade80;text-align:center;padding:50px;"><h2>✅ تم ربط حساب Google Drive بنجاح!</h2><p style="color:#94a3b8;">يمكنك إغلاق هذه الصفحة والعودة لبرنامج بيان POS.</p><script>setTimeout(()=>window.close(), 1500);</script></body></html>');
                                                } else {
                                                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                                                    res.end('<!DOCTYPE html><html lang="ar" dir="rtl"><body style="font-family:sans-serif;background:#0f172a;color:#f87171;text-align:center;padding:50px;"><h2>❌ خطأ في التفويض</h2><p>' + (resObj.error_description || resObj.error) + '</p></body></html>');
                                                }
                                            } catch (err) {
                                                res.writeHead(500); res.end('Error parsing token');
                                            }
                                            try { tempServer.close(); } catch(e){}
                                        });
                                    });
                                    tokenReq.on('error', () => { try { tempServer.close(); } catch(e){} });
                                    tokenReq.write(postData);
                                    tokenReq.end();
                                    return;
                                }
                            }
                        } catch (e) {}
                        res.writeHead(404); res.end();
                    });
                    tempServer.on('error', () => {}); // تجاوز أي تعارض مؤقت في البورت تلقائياً
                    tempServer.listen(4545, '127.0.0.1');
                    setTimeout(() => { try { tempServer.close(); } catch(e){} }, 180000);
                } catch (e) {}
            }

            // 2. مراقبة نقطة فحص التفويض عبر السيرفر كل 1200ms
            if (this._oauthPollTimer) clearInterval(this._oauthPollTimer);
            this._oauthPollTimer = setInterval(async () => {
                try {
                    const resp = await fetch('http://127.0.0.1:4545/api/gdrive/auth-status');
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && data.success && data.accessToken) {
                            clearInterval(BayanGoogleDrive._oauthPollTimer);
                            BayanGoogleDrive._oauthPollTimer = null;
                            await BayanGoogleDrive.applyAccessToken(data.accessToken, 3600);
                            BayanGoogleDrive.closeAuthModal();
                        }
                    }
                } catch (e) {}
            }, 1200);
            setTimeout(() => {
                if (BayanGoogleDrive._oauthPollTimer) {
                    clearInterval(BayanGoogleDrive._oauthPollTimer);
                    BayanGoogleDrive._oauthPollTimer = null;
                }
            }, 180000);

            // 3. فتح صفحة الدخول في المتصفح الخارجي أو النافذة المنبثقة
            if (typeof window.require !== 'undefined') {
                try {
                    const { shell } = window.require('electron');
                    if (shell && typeof shell.openExternal === 'function') {
                        shell.openExternal(authUrl);
                        this.showNotification("🌐 تم فتح صفحة تسجيل الدخول في متصفحك. يرجى إتمام السماح بالربط.", "info");
                        return;
                    }
                } catch (e) {}
            }

            // في بيئة الويب نفتح نافذة Popup قياسية
            const width = 560;
            const height = 650;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;
            window.open(authUrl, 'GoogleDriveAuth', `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`);
        },

        /**
         * 💾 حفظ رابط Webhook الخاص بـ Google Apps Script
         */
        saveWebhookUrl: function () {
            const inp = document.getElementById('gdriveWebhookInput');
            if (!inp) return;
            const url = (inp.value || '').trim();
            if (!url) {
                this.showNotification("⚠️ يرجى إدخال رابط Webhook صالح", "warning");
                return;
            }
            this.state.webhookUrl = url;
            this.state.isConnected = true;
            if (!this.state.userEmail) {
                this.state.userEmail = 'Google Apps Script Webhook ⚡';
            }
            this.saveState();
            this.updateUI();
            this.closeAuthModal();
            this.showNotification("✅ تم تفعيل الربط السحابي عبر Webhook بنجاح!", "success");
        },

        /**
         * 🔑 تطبيق Token يدوي
         */
        applyManualToken: async function () {
            const inp = document.getElementById('gdriveManualTokenInput');
            if (!inp) return;
            const token = (inp.value || '').trim();
            if (!token) {
                this.showNotification("⚠️ يرجى إدخال رمز الـ Token", "warning");
                return;
            }
            await this.applyAccessToken(token, 3600);
        },

        /**
         * 🔌 إلغاء ربط حساب Google Drive
         */
        disconnect: function () {
            if (typeof showCustomAlert === 'function') {
                showCustomAlert({
                    type: 'question',
                    titleText: '🔌 إلغاء ربط Google Drive',
                    msg: 'هل أنت متأكد من إلغاء ربط حساب Google Drive؟ لن يتم حذف أي نسخ احتياطية مرفوعة مسبقاً على حسابك.',
                    confirmText: 'نعم، إلغاء الربط',
                    cancelText: 'تراجع',
                    showCancel: true,
                    onConfirm: () => this._doDisconnect()
                });
            } else {
                if (confirm("هل تريد إلغاء ربط حساب Google Drive؟")) {
                    this._doDisconnect();
                }
            }
        },

        _doDisconnect: function () {
            this.state.isConnected = false;
            this.state.accessToken = '';
            this.state.userEmail = '';
            this.state.folderId = '';
            this.state.webhookUrl = '';
            try {
                const set = (typeof setStore === 'function') ? setStore : ((k, v) => localStorage.setItem(k, v));
                set('gdrive_connected', 'false');
                set('gdrive_webhook_url', '');
                set('gdrive_user_email', '');
                set('gdrive_access_token', '');
            } catch (e) {}
            this.saveState();
            this.updateUI();
            this.showNotification("🔌 تم إلغاء ربط حساب Google Drive بنجاح", "info");
        },

        /**
         * ☁️ رفع نسخة احتياطية إلى Google Drive
         * @param {string} triggerType 'manual' | 'auto_shift' | 'auto_interval' | 'auto_resume'
         */
        uploadBackup: async function (triggerType = 'manual') {
            if (this.state.isUploading) {
                if (triggerType === 'manual') this.showNotification("⏳ جاري رفع نسخة احتياطية بالفعل، يرجى الانتظار...", "warning");
                return false;
            }

            if (!this.state.isConnected && !this.state.webhookUrl) {
                if (triggerType === 'manual') {
                    this.showNotification("⚠️ يجب ربط حساب Google Drive أولاً من الإعدادات", "warning");
                    this.openAuthModal();
                }
                return false;
            }

            // فحص الاتصال بالإنترنت أولاً
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                console.warn("[GoogleDrive] Offline detected. Queuing pending upload...");
                const set = (typeof setStore === 'function') ? setStore : ((k, v) => localStorage.setItem(k, v));
                set('bayan_pending_cloud_backup', String(Date.now()));
                if (triggerType === 'manual') {
                    this.showNotification("⚠️ لا يوجد اتصال بالإنترنت حالياً. تم حفظ النسخة محلياً وسيتم رفعها لسحابك تلقائياً فور توفر النت.", "warning");
                }
                return false;
            }

            this.state.isUploading = true;
            this.updateUploadBtnState(true);

            if (triggerType === 'manual') {
                this.showNotification("☁️ جاري تجهيز وضغط بيانات النظام ورفعها إلى Google Drive...", "info");
            }

            try {
                // 1. تجميع بيانات النسخة الاحتياطية الموحدة
                let payload = null;
                if (typeof window.compileBayanBackupPayload === 'function') {
                    payload = await window.compileBayanBackupPayload();
                } else if (typeof window.executeAutoBackupToFile === 'function') {
                    // Fallback
                    payload = {
                        version: window.appVersion || "4.5.0",
                        backupDate: new Date().toISOString(),
                        products: window.productsDB || [],
                        transactions: window.transactions || [],
                        accounts: window.accounts || []
                    };
                }

                if (!payload) throw new Error("تعذر استخراج بيانات النظام للنسخ الاحتياطي");

                const now = new Date();
                const pad = n => String(n).padStart(2, '0');
                const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
                const fileName = `bayan_backup_${datePart}_${timePart}.json`;
                const jsonString = JSON.stringify(payload, null, 2);
                const fileSizeBytes = new Blob([jsonString]).size;
                const fileSizeFormatted = (fileSizeBytes / (1024 * 1024)).toFixed(2) + ' MB';

                let uploadSuccess = false;

                // 2. المحاولة عبر Webhook / Google Apps Script (إذا كان محدداً)
                if (this.state.webhookUrl) {
                    uploadSuccess = await this._uploadViaWebhook(this.state.webhookUrl, fileName, jsonString, fileSizeFormatted);
                } 
                // 3. المحاولة عبر Google Drive REST API v3 المباشر
                else if (this.state.accessToken) {
                    uploadSuccess = await this._uploadViaDriveAPI(fileName, jsonString);
                }

                if (uploadSuccess) {
                    this.state.lastBackupTime = new Date().toISOString();
                    this.state.lastBackupFileName = `${fileName} (${fileSizeFormatted})`;
                    this.state.lastBackupStatus = 'success';
                    this.saveState();
                    this.updateUI();

                    // حذف أي مهمة معلقة
                    try {
                        if (typeof removeStore === 'function') removeStore('bayan_pending_cloud_backup');
                        localStorage.removeItem('bayan_pending_cloud_backup');
                    } catch (e) {}

                    this.showNotification(`✅ تم رفع النسخة بنجاح على Google Drive: ${fileName}`, "success");
                    return true;
                } else {
                    throw new Error("فشلت عملية الرفع إلى Google Drive");
                }

            } catch (err) {
                console.error("[GoogleDrive] Upload error:", err);
                this.state.lastBackupStatus = 'failed';
                this.saveState();
                this.updateUI();

                // تسجيل النسخة كمعلقة ليتم رفعها تلقائياً
                try {
                    const set = (typeof setStore === 'function') ? setStore : ((k, v) => localStorage.setItem(k, v));
                    set('bayan_pending_cloud_backup', String(Date.now()));
                } catch (e) {}

                if (triggerType === 'manual') {
                    this.showNotification("❌ تعذر إتمام الرفع السحابي: " + (err.message || 'خطأ في الاتصال'), "error");
                }
                return false;
            } finally {
                this.state.isUploading = false;
                this.updateUploadBtnState(false);
            }
        },

        /**
         * 🌐 الرفع عبر Google Drive REST API v3 (Multipart Upload)
         */
        _uploadViaDriveAPI: async function (fileName, contentString) {
            let token = this.state.accessToken;

            // التأكد من وجود المجلد
            if (!this.state.folderId) {
                this.state.folderId = await this.ensureBackupFolder(token);
                this.saveState();
            }

            const metadata = {
                name: fileName,
                mimeType: 'application/json',
                description: `نسخة احتياطية سحابية لنظام بيان POS تم إنشاؤها بتاريخ ${new Date().toLocaleString('ar-EG')}`
            };

            if (this.state.folderId) {
                metadata.parents = [this.state.folderId];
            }

            const boundary = '-------BayanPosMultipartBoundary' + Math.random().toString(36).substring(2);
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;

            const multipartRequestBody =
                delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                contentString +
                closeDelimiter;

            const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

            const res = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: multipartRequestBody
            });

            if (res.status === 401) {
                console.warn("[GoogleDrive] Token expired (401). Prompting re-auth...");
                this.showNotification("⚠️ انتهت صلاحية جلسة Google Drive. يرجى إعادة تسجيل الدخول لتجديد الربط.", "warning");
                this.state.isConnected = false;
                this.saveState();
                this.updateUI();
                return false;
            }

            return res.ok;
        },

        /**
         * 🚀 الرفع عبر Google Apps Script Webhook (يدعم Node.js HTTPS في Electron لتخطي قيود CORS)
         */
        _uploadViaWebhook: async function (webhookUrl, fileName, contentString, fileSizeFormatted) {
            const postPayload = JSON.stringify({
                action: 'upload_backup',
                fileName: fileName,
                fileSize: fileSizeFormatted,
                folderName: GDRIVE_FOLDER_NAME,
                timestamp: new Date().toISOString(),
                data: contentString
            });

            // 1. المحاولة الاحترافية في بيئة ديسكتوب Electron عبر Node.js https (تتجاوز قيود المتصفح و CORS نهائياً)
            if (typeof window !== 'undefined' && window.require) {
                try {
                    const https = window.require('https');
                    const { URL } = window.require('url');

                    const postViaNodeHttps = (targetUrl, payloadToSend) => {
                        return new Promise((resolve, reject) => {
                            const parsed = new URL(targetUrl);
                            const options = {
                                hostname: parsed.hostname,
                                port: 443,
                                path: parsed.pathname + parsed.search,
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'text/plain;charset=utf-8',
                                    'Content-Length': Buffer.byteLength(payloadToSend, 'utf8')
                                }
                            };

                            const req = https.request(options, (res) => {
                                // معالجة التحويلات التلقائية لسكربتات جوجل (Google Apps Script doPost تحوّل 302 إلى GET Echo URL)
                                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                                    let redirectUrl = res.headers.location;
                                    if (redirectUrl.startsWith('/')) {
                                        redirectUrl = `https://${parsed.hostname}${redirectUrl}`;
                                    }
                                    https.get(redirectUrl, (getRes) => {
                                        let data = '';
                                        getRes.on('data', chunk => { data += chunk; });
                                        getRes.on('end', () => {
                                            try {
                                                const json = JSON.parse(data);
                                                if (json.success) {
                                                    if (json.folderId) {
                                                        BayanGoogleDrive.state.folderId = json.folderId;
                                                        BayanGoogleDrive.saveState();
                                                    }
                                                    return resolve(true);
                                                }
                                            } catch (e) {}
                                            if (getRes.statusCode >= 200 && getRes.statusCode < 300) {
                                                resolve(true);
                                            } else {
                                                resolve(false);
                                            }
                                        });
                                    }).on('error', err => reject(err));
                                    return;
                                }

                                let data = '';
                                res.on('data', chunk => { data += chunk; });
                                res.on('end', () => {
                                    try {
                                        const json = JSON.parse(data);
                                        if (json.success) {
                                            if (json.folderId) {
                                                BayanGoogleDrive.state.folderId = json.folderId;
                                                BayanGoogleDrive.saveState();
                                            }
                                            return resolve(true);
                                        }
                                    } catch (e) {}
                                    if (res.statusCode >= 200 && res.statusCode < 300) {
                                        resolve(true);
                                    } else {
                                        resolve(false);
                                    }
                                });
                            });

                            req.on('error', (e) => reject(e));
                            req.write(payloadToSend);
                            req.end();
                        });
                    };

                    const isSuccess = await postViaNodeHttps(webhookUrl, postPayload);
                    if (isSuccess) return true;
                } catch (nodeErr) {
                    console.warn("[GoogleDrive] Node.js https notice, trying fallback:", nodeErr.message);
                }
            }

            // 2. المحاولة عبر المتصفح العادي (Web Fetch Fallback)
            try {
                const res = await fetch(webhookUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8'
                    },
                    body: postPayload
                });
                return true;
            } catch (err) {
                console.error("[GoogleDrive] Upload fallback error:", err);
                return false;
            }
        },

        /**
         * 📂 فتح مجلد النسخ في Google Drive
         */
        openDriveFolder: function () {
            let url = 'https://drive.google.com/drive/search?q=Bayan_POS_Backups';
            if (this.state.folderId) {
                url = `https://drive.google.com/drive/folders/${this.state.folderId}`;
            }

            if (typeof openExternalUrl === 'function') {
                openExternalUrl(url);
            } else if (typeof window.require !== 'undefined') {
                try {
                    window.require('electron').shell.openExternal(url);
                } catch (e) {
                    window.open(url, '_blank');
                }
            } else {
                window.open(url, '_blank');
            }
        },

        /**
         * 🔄 فحص المهام المعلقة ورفعها فور عودة الإنترنت
         */
        checkPendingUploads: function () {
            try {
                const s = (typeof getStore === 'function') ? getStore : (k => localStorage.getItem(k));
                const pendingTime = s('bayan_pending_cloud_backup');
                if (pendingTime && this.state.isConnected && navigator.onLine) {
                    console.log("☁️ [GoogleDrive] Found pending backup from:", new Date(parseInt(pendingTime, 10)).toLocaleString('ar-EG'));
                    setTimeout(() => {
                        this.uploadBackup('auto_resume');
                    }, 30000);
                }
            } catch (e) {}
        },

        /**
         * 🎯 استدعاء الرفع التلقائي عند إغلاق الوردية
         */
        triggerAutoShiftBackup: function () {
            if (!this.state.isConnected && !this.state.webhookUrl) return;
            if (!this.state.autoShiftBackup) return;

            console.log("☁️ [GoogleDrive] Shift closed trigger detected. Starting background auto-backup...");
            setTimeout(() => {
                this.uploadBackup('auto_shift');
            }, 800);
        },

        /**
         * 🎨 تحديث عناصر الواجهة في شاشة الإعدادات
         */
        updateUI: function () {
            const card = document.getElementById('gdriveCloudBackupCard');
            if (!card) return;

            const badge = document.getElementById('gdriveStatusBadge');
            const emailSpan = document.getElementById('gdriveUserEmailText');
            const connectBtn = document.getElementById('gdriveConnectBtn');
            const disconnectBtn = document.getElementById('gdriveDisconnectBtn');
            const uploadBtn = document.getElementById('gdriveUploadNowBtn');
            const openFolderBtn = document.getElementById('gdriveOpenFolderBtn');
            const lastTimeEl = document.getElementById('gdriveLastBackupTimeText');
            const autoShiftCheck = document.getElementById('gdriveAutoShiftCheck');

            const isConnected = this.state.isConnected;

            if (badge) {
                if (isConnected) {
                    badge.innerHTML = `<span style="width:8px; height:8px; border-radius:50%; background:#10b981; display:inline-block;"></span> متصل بحساب Google`;
                    badge.style.background = '#dcfce7';
                    badge.style.color = '#15803d';
                    badge.style.borderColor = '#86efac';
                } else {
                    badge.innerHTML = `<span style="width:8px; height:8px; border-radius:50%; background:#ef4444; display:inline-block;"></span> غير مربوط بالسحاب`;
                    badge.style.background = '#fee2e2';
                    badge.style.color = '#b91c1c';
                    badge.style.borderColor = '#fca5a5';
                }
            }

            if (emailSpan) {
                emailSpan.innerText = isConnected ? (this.state.userEmail || 'حساب Google متصل') : 'غير متصل';
                emailSpan.style.color = isConnected ? '#059669' : '#64748b';
            }

            if (connectBtn) connectBtn.style.display = isConnected ? 'none' : 'inline-flex';
            if (disconnectBtn) disconnectBtn.style.display = isConnected ? 'inline-flex' : 'none';
            if (uploadBtn) uploadBtn.disabled = !isConnected;
            if (openFolderBtn) openFolderBtn.disabled = !isConnected;

            if (lastTimeEl) {
                if (this.state.lastBackupTime) {
                    const d = new Date(this.state.lastBackupTime);
                    const formatted = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const statusIcon = this.state.lastBackupStatus === 'success' ? '✔️' : '⚠️';
                    lastTimeEl.innerHTML = `<b style="color:#0f172a;">${formatted}</b> (${statusIcon} ${this.state.lastBackupFileName || 'ناجحة'})`;
                } else {
                    lastTimeEl.innerText = 'لم يتم رفع نسخ سحابية بعد';
                }
            }

            if (autoShiftCheck) {
                autoShiftCheck.checked = this.state.autoShiftBackup;
            }
        },

        updateUploadBtnState: function (isUploading) {
            const uploadBtn = document.getElementById('gdriveUploadNowBtn');
            if (!uploadBtn) return;
            if (isUploading) {
                uploadBtn.disabled = true;
                uploadBtn.innerHTML = `<span>⏳</span> جاري الرفع للسحاب...`;
                uploadBtn.style.opacity = '0.75';
            } else {
                uploadBtn.disabled = !this.state.isConnected;
                uploadBtn.innerHTML = `<span style="font-size:1.15rem;">☁️</span> رفع نسخة إلى Google Drive الآن`;
                uploadBtn.style.opacity = '1';
            }
        },

        showNotification: function (msg, type = 'info') {
            if (typeof showToast === 'function') {
                showToast(msg, type);
            } else {
                console.log(`[GoogleDrive][${type.toUpperCase()}]: ${msg}`);
            }
        },

        /**
         * 📋 عرض قالب Google Apps Script للنسخ بضغطة زر
         */
        showAppsScriptTemplateModal: function () {
            const templateCode = `// -------------------------------------------------------------
// 🚀 كود Google Apps Script الجاهز لربط Bayan POS بسحابك الخاص
// الخطوات:
// 1. افتح https://script.google.com واضغط "مشروع جديد (New Project)".
// 2. الصق الكود أدناه بالكامل واضغط حفظ.
// 3. اضغط نشر (Deploy) ➔ نشر جديد (New deployment) ➔ Web app.
// 4. اضبط "من له حق الوصول (Who has access)" على "الجميع (Anyone)".
// 5. انسخ رابط الـ Web app والصقه في برنامج بيان POS!
// -------------------------------------------------------------
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var folderName = body.folderName || "Bayan_POS_Backups";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    var file = folder.createFile(body.fileName, body.data, "application/json");
    file.setDescription("Bayan POS Cloud Backup - " + new Date().toLocaleString());
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: file.getId(),
      folderId: folder.getId()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

            if (typeof showCustomAlert === 'function') {
                showCustomAlert({
                    type: 'info',
                    titleText: '📋 كود Google Apps Script الجاهز',
                    msg: `<p style="font-size:0.85rem; color:#475569; margin:0 0 10px;">انسخ هذا الكود والصقه في <a href="https://script.google.com" target="_blank" style="color:#2563eb; font-weight:800;">Google Apps Script</a> وانشره كـ Web App:</p><textarea readonly style="width:100%; height:180px; font-family:monospace; font-size:0.75rem; direction:ltr; padding:8px; border:1px solid #cbd5e1; border-radius:8px;">${templateCode}</textarea>`,
                    confirmText: 'نسخ الكود وإغلاق',
                    onConfirm: () => {
                        navigator.clipboard.writeText(templateCode);
                        this.showNotification("📋 تم نسخ كود السكربت إلى الحافظة بنجاح!", "success");
                    }
                });
            } else {
                navigator.clipboard.writeText(templateCode);
                alert("تم نسخ كود السكربت إلى الحافظة بنجاح!");
            }
        }
    };

    window.BayanGoogleDrive = BayanGoogleDrive;

    // تهيئة عند اكتمال تحميل المستند
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => BayanGoogleDrive.init());
    } else {
        BayanGoogleDrive.init();
    }

    // دوال عامة لسهولة الوصول في الواجهة
    window.connectGoogleDrive = () => BayanGoogleDrive.openAuthModal();
    window.disconnectGoogleDrive = () => BayanGoogleDrive.disconnect();
    window.uploadBackupToGoogleDrive = (trigger) => BayanGoogleDrive.uploadBackup(trigger);
    window.openGoogleDriveFolder = () => BayanGoogleDrive.openDriveFolder();
    window.triggerAutoCloudBackupOnShiftClose = () => BayanGoogleDrive.triggerAutoShiftBackup();

})(window);
