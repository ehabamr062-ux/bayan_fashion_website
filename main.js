const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// =========================================================================
// 🚀 1. تسريع الأداء وضبط كروت الشاشة المدمجة (Intel HD Graphics & Low-End POS Profile)
// =========================================================================
// 💾 تقليل العمليات الخلفية المجهدة للهارد الميكانيكي HDD
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,CalculateNativeWinOcclusion,SpareRendererForSitePerProcess');
// 🧠 ضبط استهلاك الذاكرة لمحرك V8 لتحفيز تنظيف الذاكرة التلقائي (GC) مبكراً
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=1024 --expose-gc');
// 🎮 حماية كروت الشاشة المدمجة القديمة (Intel HD) من تسريب الذاكرة والتجميد
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames');
app.commandLine.appendSwitch('enable-raster-multithread');
app.commandLine.appendSwitch('disable-breakpad');


const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('⚠️ نسخة أخرى من تطبيق Bayan POS تعمل بالفعل بالخلفية. إغلاق النسخة المكررة فوراً...');
    app.exit(0);
} else {
    app.on('second-instance', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

let openWindows = new Set();
let mainWindow;
let isQuitting = false;
let autoUpdater = null;
const isDev = !app.isPackaged;
const LICENSE_SECRET = 'BAYAN_POS_SECRET_KEY_2026';

function createWindow() {
    Menu.setApplicationMenu(null); // إلغاء القوائم الافتراضية

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#0f172a', // لون خلفية داكن أنيق ومتطابق مع هوية بيان بدلاً من الوميض الأبيض المزعج
        show: false, // لا تظهر النافذة إلا بعد اكتمال الرسم لمنع أي وميض أو شاشة معلقة
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false,
            devTools: true, // متاح في وضع التطوير والتجربة
            spellcheck: false, // تعطيل التدقيق الإملائي لتوفير الرامات والمعالج
            backgroundThrottling: true // إراحة المعالج وكارت الشاشة عند تصغير البرنامج
        },
        icon: path.join(__dirname, 'media', 'logo.ico')
    });

    // إظهار النافذة فور جاهزيتها
    win.once('ready-to-show', () => {
        if (!win.isDestroyed()) win.show();
    });

    // صمام أمان لظهور النافذة في حال تأخر حدث ready-to-show على الهاردات القديمة
    setTimeout(() => {
        if (!win.isDestroyed() && !win.isVisible()) {
            win.show();
        }
    }, 4000);

    // التعافي التلقائي في حال حدوث توقف
    win.webContents.on('render-process-gone', (event, details) => {
        console.error("⚠️ Renderer process gone:", details.reason);
        if (details.reason !== 'clean-exit') {
            win.reload();
        }
    });

    win.webContents.on('unresponsive', () => {
        console.warn("⚠️ [Main] Window is temporarily busy or unresponsive. Waiting for tasks to complete without reloading to preserve current invoice state.");
    });

    win.webContents.on('responsive', () => {
        console.log("✅ [Main] Window has recovered responsiveness.");
    });

    // نافذة إلكترون تدير التركيز والمربعات تلقائياً عبر نواة كروميوم بدون سرقة التركيز

    if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = win;
    }
    openWindows.add(win);

    win.loadFile(path.join(__dirname, 'index.html'));

    // 🔒 تحصين أمان النوافذ والروابط الخارجية (Electron Security Hardening)
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:|^mailto:|^tel:|^anydesk:/i.test(url)) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) {
            event.preventDefault();
            if (/^https?:|^mailto:|^tel:|^anydesk:/i.test(url)) {
                shell.openExternal(url);
            }
        }
    });

    // منع اختصارات لوحة المفاتيح الخاصة بالـ Console والـ Reload + توجيه اختصار Ctrl+N لفتح فاتورة بيع جديدة بأمان
    win.webContents.on('before-input-event', (event, input) => {
        const key = input.key.toLowerCase();
        
        // Ctrl+N لفتح تبويب فاتورة بيع جديدة بأمان داخل نفس النافذة لمنع تضارب قاعدة بيانات SQLite
        if (input.control && key === 'n') {
            event.preventDefault();
            if (win && !win.isDestroyed() && win.webContents) {
                win.webContents.send('trigger-new-invoice-tab');
            }
            return;
        }

        // فتح وإغلاق أدوات المطورين F12 أو Ctrl+Shift+I في بيئة التطوير (npm start)
        if (isDev && (input.key === 'F12' || (input.control && input.shift && key === 'i'))) {
            event.preventDefault();
            win.webContents.toggleDevTools();
            return;
        }

        // منع F12 و Ctrl+Shift+I و Ctrl+Shift+J و Ctrl+Shift+C و Ctrl+U في الإنتاج فقط
        if (!isDev && (
            input.key === 'F12' || 
            (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) ||
            (input.control && key === 'u')
        )) {
            event.preventDefault();
            return;
        }

        // إعادة التحميل في تطبيق إلكترون المثبت ديسكتوب عبر Ctrl+R
        if (input.control && key === 'r') {
            event.preventDefault();
            win.reload();
            return;
        }

        // منع إعادة التحميل العادية F5 لحماية شاشة الكاشير وسلة المبيعات من التفريغ بالخطأ
        if (input.key === 'F5') {
            event.preventDefault();
            return;
        }

        // F11 للشاشة الكاملة
        if (input.key === 'F11') {
            win.setFullScreen(!win.isFullScreen());
            event.preventDefault();
            return;
        }
    });

    // 🔒 منع القائمة المنبثقة بالزر الأيمن لمنع أي فحص للعناصر نهائياً (Inspect Element)
    win.webContents.on('context-menu', (e) => {
        e.preventDefault();
    });

    // 🔒 إغلاق أدوات المطور في النسخة النهائية المجمعة فقط
    if (!isDev) {
        win.webContents.on('devtools-opened', () => {
            win.webContents.closeDevTools();
        });
    }

    // إغلاق نظيف وسريع مع حماية البيانات غير المحفوظة والنسخ الاحتياطي التلقائي
    win.on('close', (event) => {
        if (isQuitting) {
            // تم إنهاء النسخ مسبقاً والموافقة على الخروج
            openWindows.delete(win);
            return;
        }

        // إذا كان هناك أكثر من نافذة فرعية مفتوحة، نسمح بإغلاق هذه النافذة فقط
        if (openWindows.size > 1) {
            openWindows.delete(win);
            return;
        }

        // 🔒 صمام الأمان: إيقاف الإغلاق المؤقت لمنح الريندرر وقتاً لحفظ النسخة وفحص البيانات غير المحفوظة
        event.preventDefault();

        try {
            if (!win.isDestroyed() && win.webContents) {
                win.webContents.send('trigger-backup-before-quit');
            } else {
                isQuitting = true;
                app.quit();
                return;
            }
        } catch (err) {
            console.error('Error sending trigger-backup-before-quit:', err);
            isQuitting = true;
            app.quit();
            return;
        }

        // صمام أمان زمني فائق السرعة في حال تعليق الريندرر (ثانية واحدة كحد أقصى للخروج الفوري Zero-Shutdown Lag)
        if (global.quitTimeout) clearTimeout(global.quitTimeout);
        global.quitTimeout = setTimeout(() => {
            isQuitting = true;
            app.exit(0);
        }, 1000);
    });

    win.on('closed', () => {
        openWindows.delete(win);
        if (openWindows.size === 0) {
            app.exit(0);
        }
    });

    // إدارة التحميلات الآمنة
    win.webContents.session.on('will-download', (event, item, webContents) => {
        item.setSaveDialogOptions({
            defaultPath: path.join(app.getPath('desktop'), item.getFilename())
        });
    });

    // 🔒 صمام الأمان الفولاذي: منع فتح أي نوافذ جديدة داخل بيئة Electron وتوجيه الروابط الآمنة للمتصفح الافتراضي مع السماح بنوافذ الطباعة المحلية
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url) || /^tel:/i.test(url) || /^anydesk:/i.test(url)) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        // السماح بنوافذ الطباعة المحلية الفارغة (about:blank) لضمان عدم توقف الطباعة نهائياً
        if (url === 'about:blank' || !url || url === '') {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    autoHideMenuBar: true,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    }
                }
            };
        }
        return { action: 'deny' };
    });

    // 🔒 صمام الأمان الفولاذي: منع الانتقال خارج واجهة البرنامج index.html نهائياً لحماية صلاحيات Node.js
    win.webContents.on('will-navigate', (event, url) => {
        try {
            const parsedUrl = new URL(url);
            const indexFilePath = path.resolve(__dirname, 'index.html').replace(/\\/g, '/').toLowerCase();
            let parsedPath = decodeURIComponent(parsedUrl.pathname).replace(/\\/g, '/').toLowerCase();
            if (process.platform === 'win32' && parsedPath.startsWith('/')) {
                parsedPath = parsedPath.slice(1);
            }
            let normalizedIndex = indexFilePath;
            if (process.platform === 'win32' && normalizedIndex.startsWith('/')) {
                normalizedIndex = normalizedIndex.slice(1);
            }

            // السماح فقط بالبقاء داخل index.html (التنقل بالهاش أو نفس مسار الصفحة)
            if (parsedUrl.protocol === 'file:' && (parsedPath === normalizedIndex || parsedPath.endsWith('/index.html'))) {
                return;
            }
        } catch (e) {
            // URL غير صالح
        }

        event.preventDefault();
        if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url) || /^tel:/i.test(url)) {
            shell.openExternal(url);
        }
    });

    return win;
}

// تهيئة التطبيق وإحالة الجلسة المكررة إلى النافذة المفتوحة
app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    } else {
        // 🛡️ صمام أمان: فتح النافذة فوراً إذا كانت العملية تعمل بالخلفية بدون واجهة
        createWindow();
    }
});

const os = require('os');

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // فحص التحديثات تلقائياً بهدوء بعد 3 دقائق من تشغيل التطبيق لضمان استقرار شاشة البيع وعدم تعليق مدخلات الكاشير
    setTimeout(() => {
        if (typeof isAutoUpdatesFrozenOnDisk === 'function' && isAutoUpdatesFrozenOnDisk()) {
            console.log('[Updater] 🔒 تخطي الفحص التلقائي عند بدء التشغيل: التحديثات مجمدة تماماً بناءً على اختيار العميل.');
            return;
        }
        if (autoUpdater) {
            autoUpdater.checkForUpdates().catch(err => {
                console.warn('Auto check for updates failed (safe to ignore if offline):', err.message);
            });
        }
    }, 180000);
});

app.on('window-all-closed', function () {
    app.exit(0);
});

// قنوات الاتصال (IPC) لفتح نافذة جديدة - تركيز النافذة الحالية وتوجيه الأمر لفتح فاتورة بيع جديدة بأمان
ipcMain.handle('open-new-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('trigger-new-invoice-tab');
        return true;
    }
    createWindow();
    return true;
});

// 📂 اختيار ملف نسخة احتياطية مع التوجيه المباشر لمجلد النسخ في AppData/Roaming/Bayan POS/backups
ipcMain.handle('select-backup-file', async () => {
    try {
        const backupDir = path.join(app.getPath('appData'), 'Bayan POS', 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const result = await dialog.showOpenDialog({
            title: 'اختر ملف النسخة الاحتياطية',
            defaultPath: backupDir,
            properties: ['openFile'],
            filters: [
                { name: 'نسخ احتياطية لنظام بيان (*.json)', extensions: ['json'] },
                { name: 'كافة الملفات (*.*)', extensions: ['*'] }
            ]
        });
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { canceled: true };
        }
        const chosenFile = result.filePaths[0];
        const content = fs.readFileSync(chosenFile, 'utf8');
        return {
            canceled: false,
            filePath: chosenFile,
            fileName: path.basename(chosenFile),
            fileSize: fs.statSync(chosenFile).size,
            content: content
        };
    } catch(err) {
        console.error("select-backup-file error:", err);
        return { error: err.message };
    }
});

// 📦 إدارة ومسار قاعدة بيانات SQLite على القرص الصلب
ipcMain.handle('get-sqlite-status', () => {
    try {
        const sqliteFile = path.join(os.homedir(), '.bayan_pos', 'bayan_pos.db');
        const exists = fs.existsSync(sqliteFile);
        let size = 0;
        if (exists) {
            size = fs.statSync(sqliteFile).size;
        }
        return {
            enabled: true,
            filePath: sqliteFile,
            exists: exists,
            sizeBytes: size,
            sizeFormatted: exists ? (size / 1024).toFixed(1) + ' KB' : '0 KB'
        };
    } catch (e) {
        return { enabled: true, error: e.message };
    }
});

ipcMain.handle('open-sqlite-folder', () => {
    try {
        const sqliteDir = path.join(os.homedir(), '.bayan_pos');
        if (!fs.existsSync(sqliteDir)) {
            fs.mkdirSync(sqliteDir, { recursive: true });
        }
        const dbPath = path.join(sqliteDir, 'bayan_pos.db');
        if (fs.existsSync(dbPath)) {
            shell.showItemInFolder(dbPath);
        } else {
            shell.openPath(sqliteDir);
        }
        return true;
    } catch(e) {}
    return false;
});

// قنوات الاتصال (IPC)
ipcMain.on('save-backup-and-quit', (event, backupData) => {
    try {
        const desktopDir = app.getPath('desktop');
        const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '_');
        
        // ⚡ مع القواعد الضخمة: نسخ مباشر فائق السرعة لملف SQLite دون استهلاك الرام عبر قنوات IPC
        const os = require('os');
        const dbPath = path.join(os.homedir(), '.bayan_pos', 'bayan_pos.db');
        if (fs.existsSync(dbPath)) {
            const backupDbPath = path.join(desktopDir, `backup_pos_${timestamp}.db`);
            fs.copyFileSync(dbPath, backupDbPath);
            console.log('⚡ Direct SQLite backup saved to:', backupDbPath);
        } else if (backupData && typeof backupData === 'string' && backupData.trim().length > 0) {
            const backupPath = path.join(desktopDir, 'backup_pos_' + timestamp + '.json');
            fs.writeFileSync(backupPath, backupData, 'utf-8');
            console.log('Backup saved to', backupPath);
        }
    } catch (err) {
        console.error('Failed to save backup:', err);
    } finally {
        isQuitting = true;
        app.exit(0);
    }
});

ipcMain.on('cancel-quit', () => {
    if (global.quitTimeout) {
        clearTimeout(global.quitTimeout);
        global.quitTimeout = null;
    }
    isQuitting = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
        openWindows.add(mainWindow);
    }
    console.log('Quit cancelled by Renderer (unsaved data found).');
});

ipcMain.on('proceed-quit', () => {
    if (global.quitTimeout) {
        clearTimeout(global.quitTimeout);
        global.quitTimeout = null;
    }
    isQuitting = true;
    app.exit(0);
});

ipcMain.on('quit-directly', () => {
    if (global.quitTimeout) {
        clearTimeout(global.quitTimeout);
        global.quitTimeout = null;
    }
    isQuitting = true;
    app.exit(0);
});

// فتح الروابط الخارجية بأمان مع التحقق من الـ Protocol
ipcMain.handle('open-url', async (event, url) => {
    try {
        if (!url || typeof url !== 'string') return false;
        const cleanUrl = url.trim();
        // بروتوكول AnyDesk المباشر
        if (/^anydesk:/i.test(cleanUrl)) {
            await shell.openExternal(cleanUrl);
            return true;
        }
        // ✅ أمان: السماح فقط بـ http و https و mailto و tel ومنع أي بروتوكول آخر قد ينفّذ أوامر نظام
        const parsedUrl = new URL(cleanUrl);
        const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'anydesk:'];
        if (!allowedProtocols.includes(parsedUrl.protocol.toLowerCase())) {
            console.error('⚠️ محاولة فتح رابط غير مسموح: ' + cleanUrl);
            return false;
        }
        await shell.openExternal(parsedUrl.href);
        return true;
    } catch (err) {
        console.error('Failed to open URL:', err);
        return false;
    }
});

// 🖥️ فتح تطبيق AnyDesk والاتصال المباشر بالكود فوراً
ipcMain.handle('launch-anydesk', async (event, code) => {
    try {
        const cleanCode = String(code || '').replace(/[^a-zA-Z0-9@._-]/g, '').trim();
        const { spawn, exec } = require('child_process');
        const fs = require('fs');

        const possiblePaths = [
            'C:\\Program Files (x86)\\AnyDesk\\AnyDesk.exe',
            'C:\\Program Files\\AnyDesk\\AnyDesk.exe',
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'AnyDesk', 'AnyDesk.exe') : null,
            process.env.APPDATA ? path.join(process.env.APPDATA, 'AnyDesk', 'AnyDesk.exe') : null
        ].filter(Boolean);

        const anydeskExe = possiblePaths.find(p => fs.existsSync(p));

        if (anydeskExe) {
            const args = cleanCode ? [cleanCode] : [];
            const child = spawn(anydeskExe, args, { detached: true, stdio: 'ignore' });
            child.unref();
            return { success: true, method: 'direct_exe' };
        }

        // في حال عدم وجود المسار الثابت، استخدام بروتوكول anydesk أو أمر start
        const targetProtocol = cleanCode ? `anydesk:${cleanCode}` : 'anydesk:';
        try {
            await shell.openExternal(targetProtocol);
            return { success: true, method: 'protocol' };
        } catch (e) {
            exec(cleanCode ? `start anydesk ${cleanCode}` : 'start anydesk', (err) => {
                if (err) console.error('Error starting anydesk via start command:', err);
            });
            return { success: true, method: 'cmd' };
        }
    } catch (err) {
        console.error('Error launching AnyDesk:', err);
        return { success: false, error: err.message };
    }
});

// =========================================================================
// 🖨️ نظام الطباعة الصامتة المباشرة للإيصالات والفواتير (Direct Silent Printing)
// =========================================================================
ipcMain.handle('get-system-printers', async (event) => {
    try {
        const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
        if (!win || win.isDestroyed()) return [];
        const printers = await win.webContents.getPrintersAsync();
        return printers || [];
    } catch (err) {
        console.warn('[Printers] get-system-printers error:', err.message);
        return [];
    }
});

let _activePrintWin = null;
let _activePrintDestroyTimer = null;

ipcMain.handle('print-receipt-silent', async (event, payload) => {
    return new Promise(async (resolve) => {
        // تنظيف أي نافذة طباعة معلقة سابقة فوراً لمنع تراكم نوافذ Chromium في الرام
        if (_activePrintDestroyTimer) {
            clearTimeout(_activePrintDestroyTimer);
            _activePrintDestroyTimer = null;
        }
        if (_activePrintWin && !_activePrintWin.isDestroyed()) {
            try { _activePrintWin.destroy(); } catch (e) {}
            _activePrintWin = null;
        }

        let printWin = null;
        let resolved = false;
        let tempReceiptFile = null;

        const cleanup = (res, delayDestroy = false) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutTimer);
                resolve(res);

                // ⏱️ مهلة آمنة (2 ثانية فقط) في الخلفية قبل إغلاق نافذة الطباعة لضمان انتهاء Spooler ويندوز
                if (delayDestroy) {
                    _activePrintDestroyTimer = setTimeout(() => {
                        if (printWin && !printWin.isDestroyed()) {
                            try { printWin.destroy(); } catch (e) {}
                            if (_activePrintWin === printWin) _activePrintWin = null;
                        }
                        if (tempReceiptFile) {
                            try { if (fs.existsSync(tempReceiptFile)) fs.unlinkSync(tempReceiptFile); } catch (e) {}
                        }
                    }, 2000);
                } else {
                    if (printWin && !printWin.isDestroyed()) {
                        try { printWin.destroy(); } catch (e) {}
                        if (_activePrintWin === printWin) _activePrintWin = null;
                    }
                    if (tempReceiptFile) {
                        try { if (fs.existsSync(tempReceiptFile)) fs.unlinkSync(tempReceiptFile); } catch (e) {}
                    }
                }
            }
        };

        const timeoutTimer = setTimeout(() => {
            cleanup({ success: false, error: 'Print operation timed out' }, false);
        }, 20000);

        try {
            const { html, printerName } = payload || {};
            if (!html || typeof html !== 'string' || !html.trim()) {
                return cleanup({ success: false, error: 'No invoice HTML provided' }, false);
            }

            const os = require('os');
            tempReceiptFile = path.join(os.tmpdir(), `bayan_receipt_${Date.now()}_${Math.floor(Math.random() * 1000)}.html`);
            await fs.promises.writeFile(tempReceiptFile, html, 'utf8');

            printWin = new BrowserWindow({
                show: false,
                width: 350,
                height: 800,
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    backgroundThrottling: false // الحفاظ على سرعة المعالجة لنافذة الطباعة المخفية فقط
                }
            });
            _activePrintWin = printWin;

            printWin.webContents.on('did-fail-load', (_e, code, desc) => {
                cleanup({ success: false, error: desc || 'Failed to load receipt HTML' }, false);
            });

            printWin.webContents.on('did-finish-load', async () => {
                try {
                    // ⏱️ مهلة آمنة ومؤكدة (400ms) لاكتمال تفريغ الـ DOM ورسم الخطوط على كرت الشاشة
                    // بدلاً من requestAnimationFrame المعطل في النوافذ المخفية
                    await new Promise(r => setTimeout(r, 400));

                    const renderStatus = await printWin.webContents.executeJavaScript(`
                        (() => {
                            return {
                                scrollHeight: document.body.scrollHeight || 0,
                                textLen: (document.body.innerText || '').trim().length
                            };
                        })()
                    `).catch(() => ({ scrollHeight: 0, textLen: 0 }));

                    // حماية صارمة: منع إرسال أمر طباعة لمستند فارغ
                    if (!renderStatus || renderStatus.textLen === 0) {
                        console.warn('[Print Silent] Refusing to print empty document content');
                        return cleanup({ success: false, error: 'Invoice content is blank' }, false);
                    }

                    let targetDevice = (printerName && String(printerName).trim()) || '';

                    // إذا لم يتم تحديد طابعة محددة بالاسم، البحث الذكي عن طابعة الكاشير والإيصالات الحرارية (مثل XP-80C)
                    if (!targetDevice) {
                        try {
                            const printers = await printWin.webContents.getPrintersAsync();
                            const receiptPrinter = printers.find(p => /XP-80|80C|Xprinter|POS|Receipt|Thermal|Cashier|58|80/i.test(p.name));
                            if (receiptPrinter) {
                                targetDevice = receiptPrinter.name;
                            } else {
                                const defaultPrinter = printers.find(p => p.isDefault);
                                if (defaultPrinter) targetDevice = defaultPrinter.name;
                            }
                        } catch (pe) {
                            console.warn('[Print Silent] getPrintersAsync fallback notice:', pe.message);
                        }
                    }

                    const printOptions = {
                        silent: true,
                        printBackground: true,
                        margins: { marginType: 'none' }
                    };

                    if (targetDevice) {
                        printOptions.deviceName = targetDevice;
                    }

                    console.log(`[Print Silent] 🖨️ Printing silently to: "${targetDevice || 'Default Printer'}"`);

                    printWin.webContents.print(printOptions, (success, failureReason) => {
                        if (!success) {
                            console.warn('[Print Silent] Print failed:', failureReason);
                            cleanup({ success: false, error: failureReason }, false);
                        } else {
                            console.log('[Print Silent] Print job sent successfully ✅');
                            cleanup({ success: true, deviceName: targetDevice }, true);
                        }
                    });
                } catch (printErr) {
                    cleanup({ success: false, error: printErr.message }, false);
                }
            });

            printWin.loadFile(tempReceiptFile);

        } catch (err) {
            console.error('[Print Silent] Handler error:', err);
            cleanup({ success: false, error: err.message }, false);
        }
    });
});

// =========================================================================
// 🔒 نظام التراخيص المحصن والأمان المشفر (Secure Licensing & Signature Core)
// =========================================================================

// دالة التحقق الرياضي الصارم من كود التفعيل ومطابقته لمعرف الجهاز
function verifyActivationCodeIntegrity(code, machineId) {
    if (!code || !machineId) return false;
    const sCode = String(code).trim().toUpperCase();
    const sMachineId = String(machineId).trim().toUpperCase();

    // 1. التنسيق الزمني الأحدث: BYN-DDMMYY-PLAN-HASH8
    const parts = sCode.split('-');
    if (parts.length === 4 && parts[0] === 'BYN') {
        const dateStr = parts[1];
        const planChar = parts[2];
        const providedHash = parts[3];
        const payload = dateStr + planChar;
        const expectedHashFull = crypto.createHmac('sha256', LICENSE_SECRET).update(sMachineId + payload).digest('hex').substring(0, 8).toUpperCase();
        return providedHash === expectedHashFull;
    }

    // 2. التنسيق السابق: BYN-XXXX-XXXX-XXXX-XXXX
    const legacyPlans = ['MONTHLY', 'ANNUAL', 'LIFETIME', 'p1', 'p2', 'p3', 'p4', 'trial', 'monthly', 'annual', 'lifetime', 'standard', 'pro', 'enterprise'];
    for (const p of legacyPlans) {
        const hash16 = crypto.createHmac('sha256', LICENSE_SECRET).update(sMachineId + p).digest('hex').substring(0, 16).toUpperCase();
        const expectedCode1 = `BYN-${hash16.substring(0, 4)}-${hash16.substring(4, 8)}-${hash16.substring(8, 12)}-${hash16.substring(12, 16)}`;
        if (sCode === expectedCode1 || sCode === hash16 || sCode === `BYN-${hash16}`) {
            return true;
        }
    }

    return false;
}

// دالة داخلية موحدة لتوليد التوقيع بعد التحقق الصارم
function internalVerifyAndSign({ plan, expiry, machineId, code, isInternalAuth }) {
    const cleanPlan = String(plan || '').trim();
    const cleanHwid = String(machineId || '').trim().toUpperCase();
    const cleanCode = String(code || '').trim().toUpperCase();

    // 1. السماح بالباقة التجريبية المجانية الافتراضية
    const isFreeTrial = cleanPlan === 'باقة نسخة المجانية' || cleanPlan.includes('مجانية');

    // 2. التحقق من كود التفعيل الحقيقي للجهاز
    const isCodeValid = verifyActivationCodeIntegrity(cleanCode, cleanHwid);

    // 3. التحقق من التفويض الداخلي المعتمد (تفعيل سحابي إداري أو استعادة باك أب مصرح)
    const isAuthorizedInternal = Boolean(isInternalAuth && (cleanCode === 'REMOTELY_ACTIVATED_CLOUD' || cleanCode === 'BACKUP_RESTORE_AUTHORIZED'));

    if (!isFreeTrial && !isCodeValid && !isAuthorizedInternal) {
        console.warn(`🛑 [License Shield] تم حظر محاولة توليد ترخيص غير مصرح بها! كود: "${cleanCode}" | خطة: "${cleanPlan}" | جهاز: "${cleanHwid}"`);
        return { success: false, signature: '', error: 'UNAUTHORIZED_OR_INVALID_CODE' };
    }

    const dataString = cleanPlan + '_' + (expiry || '') + '_' + cleanHwid;
    const signature = crypto.createHmac('sha256', LICENSE_SECRET).update(dataString).digest('hex').substring(0, 16).toUpperCase();
    return { success: true, signature };
}

// معالج التحقق والتوقيع الآمن الصارم المشترط لكود تفعيل حقيقي
ipcMain.handle('verify-and-sign-license', (event, payload) => {
    try {
        return internalVerifyAndSign(payload || {});
    } catch (err) {
        console.error('Failed to verify and sign license in Main Process:', err);
        return { success: false, signature: '', error: err.message };
    }
});

// تأمين معالج generate-license-signature القديم لمنع التوليد الأعمى من الكونسول
ipcMain.handle('generate-license-signature', (event, plan, expiry, machineId, code) => {
    try {
        // حظر التمرير الحر لـ isInternalAuth من الكونسول لقطع ثغرة توليد التراخيص الوهمية
        const res = internalVerifyAndSign({ plan, expiry, machineId, code, isInternalAuth: false });
        return res.signature || '';
    } catch (err) {
        console.error('Failed to generate signature in Main Process:', err);
        return '';
    }
});

// معالج التحقق من التوقيع في Main Process المعزول عن كونسول الواجهة
ipcMain.handle('verify-license-signature', (event, plan, expiry, machineId, userSig) => {
    try {
        if (!userSig || !plan || !machineId) return false;
        const dataString = String(plan).trim() + '_' + (expiry || '') + '_' + String(machineId).trim().toUpperCase();
        const expectedSig = crypto.createHmac('sha256', LICENSE_SECRET).update(dataString).digest('hex').substring(0, 16).toUpperCase();
        return userSig === expectedSig;
    } catch (err) {
        console.error('Failed to verify signature in Main Process:', err);
        return false;
    }
});

ipcMain.handle('hash-activation-payload', (event, payload) => {
    try {
        return crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').substring(0, 16).toUpperCase();
    } catch (err) {
        console.error('Failed to hash activation payload:', err);
        return '';
    }
});

// =========================================================================
// 📁 1. نظام إدارة مجلد والنسخ الاحتياطية (Smart Backup System)
// =========================================================================

// =========================================================================
// 📁 1. نظام مسار البيانات والتخزين الموحد (AppData/Roaming/Bayan POS)
// =========================================================================
const userDataPath = path.join(app.getPath('appData'), 'Bayan POS');
app.setPath('userData', userDataPath);
if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}

// 🔒 استرجاع وتوليد كود الجهاز المشفر الثابت وغير القابل للتغيير (Hardware UUID / Machine GUID)
ipcMain.handle('get-hardware-uuid', () => {
    try {
        const keyFile = path.join(userDataPath, 'device_hwid.key');
        if (fs.existsSync(keyFile)) {
            const saved = fs.readFileSync(keyFile, 'utf8').trim();
            if (saved && /^BNC-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(saved)) {
                return saved.toUpperCase();
            }
        }

        let rawGuid = '';
        if (process.platform === 'win32') {
            try {
                const { execSync } = require('child_process');
                const out = execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'ignore'],
                    timeout: 2000
                });
                const match = out.match(/MachineGuid\s+REG_SZ\s+([a-fA-F0-9-]+)/i);
                if (match && match[1]) rawGuid = match[1].trim();
            } catch(e) {}
        }

        if (!rawGuid) {
            rawGuid = `${os.hostname()}_${os.platform()}_${os.arch()}_${os.cpus()[0]?.model || 'CPU'}`;
        }

        const hash = crypto.createHash('sha256').update(rawGuid).digest('hex').toUpperCase();
        const part1 = hash.substring(0, 4);
        const part2 = hash.substring(4, 8);
        const hwid = `BNC-${part1}-${part2}`;

        try {
            fs.writeFileSync(keyFile, hwid, 'utf8');
        } catch(e) {}

        return hwid;
    } catch(err) {
        console.warn('[Main] get-hardware-uuid fallback:', err.message);
        return null;
    }
});

const backupDir = path.join(userDataPath, 'backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

// دالة الهجرة الآمنة لنقل الملفات من المجلدات القديمة إلى AppData/Roaming/Bayan POS/backups
function autoMigrateLegacyBackups() {
    try {
        const legacyDirs = [
            path.join(os.homedir(), 'Downloads'),
            path.join(os.homedir(), 'bayan_backups'),
            path.join(__dirname, 'bayan_backups'),
            path.join(process.cwd(), 'bayan_backups'),
            path.join(process.cwd(), 'backups')
        ];

        legacyDirs.forEach(dir => {
            if (fs.existsSync(dir) && dir !== backupDir) {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    if ((file.startsWith('backup_pos_') || file.startsWith('backup_complete_')) && (file.endsWith('.json') || file.endsWith('.db'))) {
                        const src = path.join(dir, file);
                        const dest = path.join(backupDir, file);
                        if (!fs.existsSync(dest)) {
                            fs.copyFileSync(src, dest);
                            console.log(`📦 Synced backup file: ${file} -> ${dest}`);
                        }
                        // حذف الملفات القديمة فقط إذا لم تكن في مجلد التنزيلات
                        if (dir !== path.join(os.homedir(), 'Downloads')) {
                            try { fs.unlinkSync(src); } catch (e) {}
                        }
                    }
                });
                try {
                    if (dir !== path.join(os.homedir(), 'Downloads')) {
                        const remaining = fs.readdirSync(dir);
                        if (remaining.length === 0) {
                            fs.rmdirSync(dir);
                            console.log(`🧹 Cleaned up legacy backup folder: ${dir}`);
                        }
                    }
                } catch (e) {}
            }
        });
    } catch (err) {
        console.warn("⚠️ Legacy backup migration warning:", err.message);
    }
}
// تشغيل فحص ونقل النسخ الاحتياطية القديمة بعد 10 ثوانٍ في الخلفية بهدوء لعدم تعطيل إقلاع البرنامج نهائياً
setTimeout(() => {
    try {
        autoMigrateLegacyBackups();
    } catch(e) {
        console.warn("Background backup migration:", e);
    }
}, 10000);

// الحصول على المسار الحقيقي لمجلد النسخ الاحتياطية
ipcMain.handle('get-backup-dir', () => {
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
});

// حفظ نسخة احتياطية مباشرة في مجلد النظام عبر IPC (غير متزامن Asynchronous لمنع أي تجميد للواجهة)
ipcMain.handle('save-backup-data', async (_e, payload) => {
    try {
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const pad = (n) => String(n).padStart(2, '0');
        const d = new Date();
        const timestamp = `${d.getFullYear()}_${pad(d.getMonth()+1)}_${pad(d.getDate())}__${pad(d.getHours())}_${pad(d.getMinutes())}_${pad(d.getSeconds())}`;
        const prefix = payload?.isManual ? 'backup_pos_manual_' : 'backup_pos_auto_';
        const fileName = `${prefix}${timestamp}.json`;
        const filePath = path.join(backupDir, fileName);
        await fs.promises.writeFile(filePath, payload?.dataStr || '{}', 'utf8');

        // إذا كان النسخ يدوياً، نقوم بحفظ نسخة إضافية فورية على سطح المكتب Desktop ليجدها العميل أمامه مباشرة
        if (payload?.isManual) {
            try {
                const desktopDir = app.getPath('desktop');
                const desktopFilePath = path.join(desktopDir, fileName);
                await fs.promises.writeFile(desktopFilePath, payload?.dataStr || '{}', 'utf8');
                console.log("Manual backup also saved to Desktop:", desktopFilePath);
            } catch(deskErr) {
                console.warn("Could not save copy to desktop:", deskErr);
            }
        }

        // 🌟 حفظ نسخة ثنائية مباشرة وفورية من ملف SQLite الأصلي bayan_pos.db (0ms وبدون استهلاك ذاكرة)
        try {
            const os = require('os');
            const sqliteOriginalPath = path.join(os.homedir(), '.bayan_pos', 'bayan_pos.db');
            if (fs.existsSync(sqliteOriginalPath)) {
                const dbBackupName = `${prefix}${timestamp}.db`;
                const dbBackupPath = path.join(backupDir, dbBackupName);
                await fs.promises.copyFile(sqliteOriginalPath, dbBackupPath);
                console.log("Direct SQLite binary backup saved:", dbBackupPath);
            }
        } catch(dbCopyErr) {
            console.warn("SQLite direct copy notice:", dbCopyErr.message);
        }

        return { success: true, filePath, fileName, backupDir };
    } catch (err) {
        console.error("save-backup-data IPC error:", err);
        return { success: false, error: err.message };
    }
});

// ⚡ نسخ احتياطي فوري ومباشر لملف قاعدة البيانات SQLite (في 0.05 ثانية وبدون أي استهلاك للرام وبدون أقفال)
ipcMain.handle('save-sqlite-direct-backup', async (_e, payload) => {
    try {
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const pad = (n) => String(n).padStart(2, '0');
        const d = new Date();
        const timestamp = `${d.getFullYear()}_${pad(d.getMonth()+1)}_${pad(d.getDate())}__${pad(d.getHours())}_${pad(d.getMinutes())}_${pad(d.getSeconds())}`;
        const prefix = payload?.isManual ? 'backup_pos_manual_' : 'backup_pos_auto_';
        const fileName = `${prefix}${timestamp}.db`;
        const filePath = path.join(backupDir, fileName);

        const os = require('os');
        const sqliteOriginalPath = path.join(os.homedir(), '.bayan_pos', 'bayan_pos.db');
        const sqliteBakPath = path.join(os.homedir(), '.bayan_pos', 'bayan_pos.db.bak');

        let copied = false;
        // محاولة النسخ أولاً من ملف الداتابيز الرئيسي
        if (fs.existsSync(sqliteOriginalPath)) {
            try {
                await fs.promises.copyFile(sqliteOriginalPath, filePath);
                copied = true;
            } catch(copyErr) {
                console.warn("[save-sqlite-direct-backup] Primary db copy busy, attempting fallback to .bak:", copyErr.message);
            }
        }

        // إذا كان الملف الرئيسي مشغولاً بنظام WAL أو القفل، ننسخ من ملف الطوارئ (.bak) المحدث بنجاح
        if (!copied && fs.existsSync(sqliteBakPath)) {
            try {
                await fs.promises.copyFile(sqliteBakPath, filePath);
                copied = true;
            } catch(bakErr) {
                console.error("[save-sqlite-direct-backup] Fallback copy error:", bakErr.message);
            }
        }

        if (copied) {
            // إذا كان النسخ يدوياً، ننسخ نسخة إضافية إلى سطح المكتب مباشرة من الملف الذي تم حفظه
            if (payload?.isManual) {
                try {
                    let desktopDir = '';
                    try { desktopDir = app.getPath('desktop'); } catch(e) {}
                    if (!desktopDir || !fs.existsSync(desktopDir)) {
                        desktopDir = path.join(os.homedir(), 'Desktop');
                    }
                    if (fs.existsSync(desktopDir)) {
                        const desktopFilePath = path.join(desktopDir, fileName);
                        await fs.promises.copyFile(filePath, desktopFilePath);
                    }
                } catch(dErr) {
                    console.warn("[save-sqlite-direct-backup] Desktop copy notice:", dErr.message);
                }
            }
            return { success: true, filePath, fileName, backupDir };
        }
        return { success: false, error: 'SQLite database file not found or inaccessible' };
    } catch (err) {
        console.error("save-sqlite-direct-backup error:", err);
        return { success: false, error: err.message };
    }
});

// ⚡ استرجاع فوري ومباشر لملف قاعدة البيانات SQLite (.db) في 0.1 ثانية
ipcMain.handle('restore-sqlite-direct-backup', async (_e, srcFilePath) => {
    try {
        if (!srcFilePath || !fs.existsSync(srcFilePath)) {
            return { success: false, error: 'ملف النسخة الاحتياطية غير موجود على القرص' };
        }
        const os = require('os');
        const sqliteOriginalPath = path.join(os.homedir(), '.bayan_pos', 'bayan_pos.db');
        const dir = path.dirname(sqliteOriginalPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // حفظ نسخة طوارئ من الملف الحالي أولاً
        if (fs.existsSync(sqliteOriginalPath)) {
            try {
                await fs.promises.copyFile(sqliteOriginalPath, sqliteOriginalPath + '.before_restore.bak');
            } catch(bakErr) {}
        }

        // 🛡️ صمام أمان حاسم: تنظيف ملفات الـ WAL و SHM القديمة لمنع تضارب أو تلف قاعدة البيانات المسترجعة
        const walPath = sqliteOriginalPath + '-wal';
        const shmPath = sqliteOriginalPath + '-shm';
        try { if (fs.existsSync(walPath)) fs.unlinkSync(walPath); } catch (_) {}
        try { if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath); } catch (_) {}

        await fs.promises.copyFile(srcFilePath, sqliteOriginalPath);
        console.log("⚡ [Direct SQLite Restore] تم استعادة ملف قاعدة البيانات بنجاح من:", srcFilePath);
        return { success: true };
    } catch (err) {
        console.error("restore-sqlite-direct-backup error:", err);
        return { success: false, error: err.message };
    }
});

// فتح مجلد النسخ الاحتياطية بـ shell.openPath() أو explorer.exe المباشر
ipcMain.handle('open-backup-folder', async () => {
    try {
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        // مزامنة أي نسخ جديدة نزلت في مجلد التنزيلات أولاً لكي تظهر فوراً للمستخدم
        autoMigrateLegacyBackups();

        const openErr = await shell.openPath(backupDir);
        if (openErr) {
            console.warn("shell.openPath warning, using explorer fallback:", openErr);
            const { exec } = require('child_process');
            exec(`explorer.exe "${backupDir}"`);
        }
        return true;
    } catch (err) {
        console.error("Failed to open backup path, fallback to explorer:", err);
        try {
            const { exec } = require('child_process');
            exec(`explorer.exe "${backupDir}"`);
            return true;
        } catch (e2) {
            return false;
        }
    }
});

// إدارة وتدوير النسخ الاحتياطية الاحتفاظ بأحدث N (الافتراضي 30) وحذف الأقدم تلقائياً
ipcMain.handle('rotate-backups', async (event, maxKeep = 30) => {
    try {
        if (!fs.existsSync(backupDir)) return { success: true, count: 0 };

        const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('backup_pos_') && (f.endsWith('.json') || f.endsWith('.db')))
            .map(f => {
                const fp = path.join(backupDir, f);
                const stat = fs.statSync(fp);
                return { name: f, path: fp, time: stat.mtimeMs };
            })
            .sort((a, b) => b.time - a.time);

        let deleted = 0;
        if (files.length > maxKeep) {
            const toDelete = files.slice(maxKeep);
            for (const fileObj of toDelete) {
                fs.unlinkSync(fileObj.path);
                deleted++;
            }
            console.log(`🧹 Rotated backup folder: deleted ${deleted} old file(s).`);
        }
        return { success: true, count: files.length, deleted: deleted };
    } catch (err) {
        console.error("Failed to rotate backup files:", err);
        return { success: false, error: err.message };
    }
});

// =========================================================================
// 🔒 سياسة تجميد وإيقاف التحديثات التلقائية المباشرة (Auto-Updates Policy Storage)
// =========================================================================
function getUpdatePolicyFilePath() {
    try {
        return path.join(app.getPath('userData'), 'update-policy.json');
    } catch (e) {
        return null;
    }
}

function isAutoUpdatesFrozenOnDisk() {
    try {
        const p = getUpdatePolicyFilePath();
        if (p && fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            const data = JSON.parse(content);
            return data && (data.autoUpdatesDisabled === true || data.disabled === true);
        }
    } catch (e) {
        console.warn('[Updater] Could not read update-policy.json:', e.message);
    }
    return false;
}

function setAutoUpdatesFrozenOnDisk(disabled) {
    try {
        const p = getUpdatePolicyFilePath();
        if (p) {
            fs.writeFileSync(p, JSON.stringify({
                autoUpdatesDisabled: !!disabled,
                version: app.getVersion(),
                updatedAt: new Date().toISOString()
            }, null, 2), 'utf8');
            console.log(`[Updater] 🔒 تم حفظ سياسة التحديثات على القرص: ${disabled ? 'مجمدة ومقفولة' : 'مفعلة'}`);
            return true;
        }
    } catch (e) {
        console.error('[Updater] Could not write update-policy.json:', e.message);
    }
    return false;
}

// =========================================================================
// 🚀 2. نظام التحديثات التلقائية المباشرة بالخلفية (Electron Auto Updater)
// =========================================================================
try {
    const { autoUpdater: updater } = require('electron-updater');
    autoUpdater = updater;
    autoUpdater.autoDownload = false; // التنزيل بالخلفية عند طلب المستخدم فقط
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on('checking-for-update', () => {
        console.log('[Updater] Checking for updates...');
        if (mainWindow) mainWindow.webContents.send('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
        if (isAutoUpdatesFrozenOnDisk()) {
            console.log('[Updater] 🔒 تم حجب إشعار توفر التحديث لأن التحديثات التلقائية مجمدة ومقفولة.');
            return;
        }
        console.log('[Updater] Update available:', info ? info.version : 'unknown');
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('update-available', {
                currentVersion: app.getVersion(),
                newVersion: info ? info.version : '',
                releaseNotes: info ? (info.releaseNotes || 'تحسينات جديدة وتحديثات أمان مستقرة.') : '',
                releaseDate: info ? (info.releaseDate || '') : '',
                files: info ? (info.files || []) : []
            });
        }
    });

    autoUpdater.on('update-not-available', (info) => {
        console.log('[Updater] Update not available. Current app version is latest:', info ? info.version : app.getVersion());
        if (mainWindow) mainWindow.webContents.send('update-not-available');
    });

    autoUpdater.on('error', (err) => {
        const errorMsg = err ? (err.message || String(err)) : 'Unknown updater error';
        console.error('[Updater] Error:', errorMsg);
        if (mainWindow) mainWindow.webContents.send('update-error', errorMsg);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const pct = Math.round(progressObj.percent || 0);
        console.log(`[Updater] Download progress: ${pct}% | Transferred: ${progressObj.transferred} / ${progressObj.total}`);
        if (mainWindow) {
            mainWindow.webContents.send('update-download-progress', {
                percent: pct,
                transferred: progressObj.transferred || 0,
                total: progressObj.total || 0,
                bytesPerSecond: progressObj.bytesPerSecond || 0
            });
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('[Updater] Download completed. Update downloaded successfully:', info ? info.version : '');
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', {
                version: info ? info.version : '',
                releaseNotes: info ? info.releaseNotes : ''
            });
        }
    });

} catch (e) {
    console.warn('[Updater] electron-updater not loaded:', e.message);
}

ipcMain.handle('get-auto-updates-policy', () => {
    return { frozen: isAutoUpdatesFrozenOnDisk() };
});

ipcMain.handle('set-auto-updates-policy', (_event, disabled) => {
    const success = setAutoUpdatesFrozenOnDisk(disabled);
    return { success, frozen: !!disabled };
});

ipcMain.handle('check-for-updates', async () => {
    console.log('[Updater] Triggering check-for-updates via IPC...');
    if (isAutoUpdatesFrozenOnDisk()) {
        console.log('[Updater] 🔒 Check blocked via IPC: Auto-updates are frozen.');
        return { success: false, frozen: true, message: 'التحديثات التلقائية مجمدة ومقفولة بناءً على رغبة العميل.' };
    }
    if (!autoUpdater) return { success: false, message: 'AutoUpdater not ready' };
    try {
        const checkResult = await autoUpdater.checkForUpdates();
        console.log('[Updater] checkResult version:', checkResult && checkResult.updateInfo ? checkResult.updateInfo.version : 'N/A');
        return { success: true, updateInfo: checkResult ? checkResult.updateInfo : null };
    } catch (err) {
        console.error("[Updater] Check updates failed:", err.message);
        if (mainWindow) mainWindow.webContents.send('update-error', err.message);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('start-download-update', async () => {
    console.log('[Updater] Download started via IPC...');
    if (!autoUpdater) return { success: false, error: 'AutoUpdater not ready' };
    try {
        if (mainWindow) {
            mainWindow.webContents.send('trigger-auto-backup-before-update');
        }
        // إجبار فحص التحديثات إذا لم يكن كائن updateInfo مخزناً لضمان بدء التنزيل فوراً
        if (!autoUpdater.updateInfo) {
            console.log('[Updater] updateInfo is null, running checkForUpdates before download...');
            await autoUpdater.checkForUpdates();
        }
        console.log('[Updater] Calling autoUpdater.downloadUpdate()...');
        await autoUpdater.downloadUpdate();
        console.log('[Updater] autoUpdater.downloadUpdate() initiated.');
        return { success: true };
    } catch (err) {
        console.error("[Updater] downloadUpdate failed:", err.message);
        if (mainWindow) mainWindow.webContents.send('update-error', err.message);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('quit-and-install-update', () => {
    console.log('[Updater] quit-and-install-update requested via IPC.');
    if (autoUpdater) {
        if (mainWindow) {
            mainWindow.webContents.send('trigger-auto-backup-before-update');
        }
        setTimeout(() => {
            isQuitting = true;
            autoUpdater.quitAndInstall(false, true);
        }, 800);
    }
});

try { ipcMain.removeHandler('get-app-version'); } catch(e) {}
ipcMain.handle('get-app-version', () => {
    return app.getVersion() || '4.9.6';
});

// =========================================================================
// 🧹 حارس الذاكرة لنواة إلكترون وتفريغ الكاش (Memory Guard & Cache Trimmer)
// =========================================================================
try { ipcMain.removeHandler('bayan-trim-memory'); } catch(e) {}
ipcMain.handle('bayan-trim-memory', async () => {
    try {
        if (typeof global.gc === 'function') {
            global.gc();
        }
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && mainWindow.webContents.session) {
            await mainWindow.webContents.session.clearCache();
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// تنظيف صامت دوري كل 30 دقيقة لنواة إلكترون لتحرير الذاكرة غير المستخدمة لنظام التشغيل
setInterval(() => {
    try {
        if (typeof global.gc === 'function') {
            global.gc();
        }
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && mainWindow.webContents.session) {
            mainWindow.webContents.session.clearCache().catch(() => {});
        }
    } catch (_) {}
}, 30 * 60 * 1000);

// =========================================================================
// ☁️ Terminal Mode: Standalone High-Speed SQLite (Prepared for Supabase)
// =========================================================================