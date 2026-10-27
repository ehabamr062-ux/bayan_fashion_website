/**
 * Bayan POS Security & Utility Module (v4.5.7 Enterprise Edition)
 * نظام الأمان والتشفير المتقدم لرموز الدخول والجلسات مع التوافقية العكسية 100%
 */
(function () {
    let _nodeCrypto = null;
    try {
        if (typeof window !== 'undefined' && window.require) {
            _nodeCrypto = window.require('crypto');
        } else if (typeof require !== 'undefined') {
            _nodeCrypto = require('crypto');
        }
    } catch (e) { }

    // 🔒 ملح محمول ثابت ومخصص للنسخ الاحتياطية لفك الارتباط بعتاد جهاز محدد ومنع قفل الـ PIN
    const PORTABLE_BACKUP_SALT = 'B@Y4N_PORTABLE_BACKUP_SALT_2026';

    window.BayanSecurity = {
        PORTABLE_BACKUP_SALT: PORTABLE_BACKUP_SALT,

        // تشفير خفيف للبيانات الحساسة (Legacy Obfuscation)
        obfuscate: function (str) {
            if (!str) return '';
            try {
                return btoa(encodeURIComponent(str).split('').reverse().join(''));
            } catch (e) {
                return str;
            }
        },
        // فك التشفير (Legacy Deobfuscation)
        deobfuscate: function (str) {
            if (!str) return '';
            try {
                return decodeURIComponent(atob(str).split('').reverse().join(''));
            } catch (e) {
                return str;
            }
        },

        // 🔒 خوارزمية تشفير محسنة (Legacy Masking v1/v2)
        _secureTransform: function (str, key = 0x5A) {
            if (!str) return '';
            let out = '';
            for (let i = 0; i < str.length; i++) {
                out += String.fromCharCode(str.charCodeAt(i) ^ (key + (i % 7)));
            }
            return btoa(encodeURIComponent(out));
        },
        _secureRestore: function (b64, key = 0x5A) {
            if (!b64) return '';
            try {
                const str = decodeURIComponent(atob(b64));
                let out = '';
                for (let i = 0; i < str.length; i++) {
                    out += String.fromCharCode(str.charCodeAt(i) ^ (key + (i % 7)));
                }
                return out;
            } catch (e) {
                return '';
            }
        },

        // 🔒 خوارزمية تشفير متطورة v3 بمفتاح سري مشتق ومتعدد الطبقات
        _secureTransformV3: function (str) {
            if (!str) return '';
            const SECRET = "BAYAN_POS_SECRET_KEY_2026";
            let out = '';
            for (let i = 0; i < str.length; i++) {
                const sChar = SECRET.charCodeAt(i % SECRET.length);
                const charCode = str.charCodeAt(i);
                const shifted = (charCode ^ (sChar + ((i * 13) % 47))) ^ 0x9B;
                out += String.fromCharCode(shifted);
            }
            return btoa(encodeURIComponent(out));
        },
        _secureRestoreV3: function (b64) {
            if (!b64) return '';
            try {
                const SECRET = "BAYAN_POS_SECRET_KEY_2026";
                const str = decodeURIComponent(atob(b64));
                let out = '';
                for (let i = 0; i < str.length; i++) {
                    const sChar = SECRET.charCodeAt(i % SECRET.length);
                    const shifted = str.charCodeAt(i);
                    const charCode = (shifted ^ 0x9B) ^ (sChar + ((i * 13) % 47));
                    out += String.fromCharCode(charCode);
                }
                return out;
            } catch (e) {
                return '';
            }
        },

        // 🛡️ استخراج بصمة عتاد الجهاز مع Salt عالي التعقيد لربط التشفير بالجهاز
        _getMachineSalt: function () {
            let hwid = '';
            try {
                if (typeof getStore === 'function') {
                    hwid = getStore('bayan_hwid') || getStore('bayan_master_hwid') || getStore('bayan_machine_id') || '';
                } else if (typeof localStorage !== 'undefined') {
                    hwid = localStorage.getItem('bayan_hwid') || localStorage.getItem('bayan_master_hwid') || localStorage.getItem('bayan_machine_id') || '';
                }
            } catch (e) { }
            return "B@Y4N_HW_SALT_" + (hwid || 'BAYAN_DEFAULT_TERMINAL_2026');
        },

        // ⚡ خوارزمية SHA-256 النقية في حال عدم توفر مكتبة Node crypto
        _pureSha256: function (ascii) {
            function rightRotate(value, amount) {
                return (value >>> amount) | (value << (32 - amount));
            }
            let i, j;
            let result = '';
            const words = [];
            const asciiBitLength = ascii.length * 8;
            let hash = [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
            ];
            const k = [
                0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
                0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
                0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
                0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
                0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
                0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
                0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
            ];
            words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
            words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

            for (i = 0; i < ascii.length; i++) {
                words[i >> 2] |= ascii.charCodeAt(i) << ((3 - (i % 4)) * 8);
            }

            const w = new Array(64);
            for (let chunk = 0; chunk < words.length; chunk += 16) {
                let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
                let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

                for (i = 0; i < 64; i++) {
                    if (i < 16) {
                        w[i] = words[chunk + i] | 0;
                    } else {
                        const gamma0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                        const gamma1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                        w[i] = ((w[i - 16] + gamma0) | 0) + ((w[i - 7] + gamma1) | 0);
                    }

                    const ch = (e & f) ^ (~e & g);
                    const maj = (a & b) ^ (a & c) ^ (b & c);
                    const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
                    const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);

                    const temp1 = (((h + sigma1) | 0) + ((ch + k[i]) | 0) + w[i]) | 0;
                    const temp2 = (sigma0 + maj) | 0;

                    h = g;
                    g = f;
                    f = e;
                    e = (d + temp1) | 0;
                    d = c;
                    c = b;
                    b = a;
                    a = (temp1 + temp2) | 0;
                }

                hash[0] = (hash[0] + a) | 0;
                hash[1] = (hash[1] + b) | 0;
                hash[2] = (hash[2] + c) | 0;
                hash[3] = (hash[3] + d) | 0;
                hash[4] = (hash[4] + e) | 0;
                hash[5] = (hash[5] + f) | 0;
                hash[6] = (hash[6] + g) | 0;
                hash[7] = (hash[7] + h) | 0;
            }

            for (i = 0; i < 8; i++) {
                for (j = 3; j >= 0; j--) {
                    const byteVal = (hash[i] >> (j * 8)) & 255;
                    result += (byteVal < 16 ? '0' : '') + byteVal.toString(16);
                }
            }
            return result;
        },

        // توليد بصمة SHA-256 آمنة
        _sha256Hex: function (str) {
            if (_nodeCrypto && typeof _nodeCrypto.createHash === 'function') {
                return _nodeCrypto.createHash('sha256').update(String(str)).digest('hex');
            }
            return this._pureSha256(String(str));
        },

        // مقارنة نصوص ثابتة التوقيت (Constant-Time Comparison) لمنع هجمات التوقيت
        _timingSafeEqual: function (a, b) {
            const sA = String(a || '');
            const sB = String(b || '');
            if (_nodeCrypto && typeof _nodeCrypto.timingSafeEqual === 'function') {
                const bufA = Buffer.from(sA);
                const bufB = Buffer.from(sB);
                if (bufA.length === bufB.length) {
                    return _nodeCrypto.timingSafeEqual(bufA, bufB);
                }
            }
            let mismatch = sA.length === sB.length ? 0 : 1;
            const len = Math.max(sA.length, sB.length);
            for (let i = 0; i < len; i++) {
                const charA = i < sA.length ? sA.charCodeAt(i) : 0;
                const charB = i < sB.length ? sB.charCodeAt(i) : 0;
                mismatch |= (charA ^ charB);
            }
            return mismatch === 0;
        },

        // 🔒 تشفير متقدم v4 بمعيار AES-256-CBC مع بصمة العتاد أو ملح مخصص
        _encryptV4: function (plainText, customSalt = null) {
            const salt = customSalt || this._getMachineSalt();
            if (_nodeCrypto && typeof _nodeCrypto.createCipheriv === 'function') {
                try {
                    const key = _nodeCrypto.createHash('sha256').update("BAYAN_AES_KEY_2026_" + salt).digest();
                    const iv = _nodeCrypto.randomBytes(16);
                    const cipher = _nodeCrypto.createCipheriv('aes-256-cbc', key, iv);
                    let encrypted = cipher.update(plainText, 'utf8', 'hex');
                    encrypted += cipher.final('hex');
                    return iv.toString('hex') + ':' + encrypted;
                } catch (e) {
                    console.warn('[Security] AES-256 encrypt notice:', e);
                }
            }
            return this._secureTransformV3(salt + plainText);
        },

        // 🔓 فك تشفير v4 بمعيار AES-256-CBC مع دعم الملح المخصص
        _decryptV4: function (payload, customSalt = null) {
            const salt = customSalt || this._getMachineSalt();
            if (_nodeCrypto && typeof _nodeCrypto.createDecipheriv === 'function') {
                try {
                    const parts = payload.split(':');
                    if (parts.length === 2 && parts[0].length === 32) {
                        const iv = Buffer.from(parts[0], 'hex');
                        const key = _nodeCrypto.createHash('sha256').update("BAYAN_AES_KEY_2026_" + salt).digest();
                        const decipher = _nodeCrypto.createDecipheriv('aes-256-cbc', key, iv);
                        let decrypted = decipher.update(parts[1], 'hex', 'utf8');
                        decrypted += decipher.final('utf8');
                        return decrypted;
                    }
                } catch (e) {
                    // فشل فك التشفير بسبب عدم تطابق الملح (Wrong Salt / Bad Decrypt)
                    return null;
                }
            }
            try {
                const restored = this._secureRestoreV3(payload);
                if (restored && typeof restored === 'string' && restored.startsWith(salt)) {
                    return restored.substring(salt.length);
                }
            } catch (e) {}
            return null;
        },

        // 🛡️ دالة مساعدة داخلية لفك تشفير PIN باستخدام ملح محدد والتحقق من التوقيع الأمني
        _decryptPinWithSalt: function (encPin, salt) {
            if (!encPin) return '';
            const sEnc = String(encPin).trim();
            if (!sEnc.startsWith('ENC:')) return sEnc;

            const PIN_SALT = "B@Y4N_SEC_2026_#";

            // 1. الإصدار الأحدث ENC:v4:
            if (sEnc.startsWith('ENC:v4:')) {
                try {
                    const raw = sEnc.substring(7);
                    const restored = this._decryptV4(raw, salt);
                    if (restored && typeof restored === 'string' && restored.startsWith(PIN_SALT)) {
                        return restored.substring(PIN_SALT.length);
                    }
                } catch (e) {}
                return null;
            }

            // 2. الإصدار ENC:v3:
            if (sEnc.startsWith('ENC:v3:')) {
                try {
                    const raw = sEnc.substring(7);
                    const restored = this._secureRestoreV3(raw);
                    if (restored && typeof restored === 'string' && restored.startsWith(PIN_SALT)) {
                        return restored.substring(PIN_SALT.length);
                    }
                } catch (e) {}
                return null;
            }

            // 3. الإصدار ENC:v2:
            if (sEnc.startsWith('ENC:v2:')) {
                try {
                    const raw = sEnc.substring(7);
                    const restored = this._secureRestore(raw);
                    if (restored && typeof restored === 'string' && restored.startsWith(PIN_SALT)) {
                        return restored.substring(PIN_SALT.length);
                    }
                } catch (e) {}
                return null;
            }

            // 4. الإصدار القديم ENC:
            try {
                const LEGACY_SALT = "B@Y4N_2026_";
                const raw = sEnc.substring(4);
                const decrypted = this.deobfuscate(raw);
                if (decrypted && typeof decrypted === 'string' && decrypted.startsWith(LEGACY_SALT)) {
                    return decrypted.substring(LEGACY_SALT.length);
                }
            } catch (e) {}
            return null;
        },

        // 🔒 تشفير متقدم بمعيار AES-256 لرمز PIN لحفظه بأمان في قاعدة البيانات مع إمكانية استعادته وعرضه للمدير
        encryptPin: function (pin) {
            if (pin === null || pin === undefined || pin === '') return '';
            const sPin = String(pin).trim();
            if (sPin.startsWith('ENC:v4:')) return sPin; // محمي بالفعل بتشفير AES-256 الأحدث

            let cleanPin = sPin;
            if (sPin.startsWith('ENC:') || sPin.startsWith('HASH:v1:')) {
                cleanPin = this.decryptPin(sPin);
            }
            if (!cleanPin) return sPin;

            const PIN_SALT = "B@Y4N_SEC_2026_#";
            try {
                return 'ENC:v4:' + this._encryptV4(PIN_SALT + cleanPin, PORTABLE_BACKUP_SALT);
            } catch (e) {
                return 'ENC:v3:' + this._secureTransformV3(PIN_SALT + cleanPin);
            }
        },

        // 🔒 تشفير مخصص ومحمول لرمز PIN خاص بالنسخ الاحتياطية (Portable Backup PIN)
        encryptPinForBackup: function (plainPin) {
            if (plainPin === null || plainPin === undefined || plainPin === '') return '';
            const sPin = String(plainPin).trim();
            let cleanPin = sPin;
            if (sPin.startsWith('ENC:')) {
                cleanPin = this.decryptPin(sPin);
            }
            if (!cleanPin) return '';

            const PIN_SALT = "B@Y4N_SEC_2026_#";
            try {
                return 'ENC:v4:' + this._encryptV4(PIN_SALT + cleanPin, PORTABLE_BACKUP_SALT);
            } catch (e) {
                return 'ENC:v3:' + this._secureTransformV3(PIN_SALT + cleanPin);
            }
        },

        // 🔓 فك تشفير آمن ومرتب لرموز الـ PIN المسترجعة من ملفات النسخ الاحتياطية
        decryptPinFromBackup: function (cipherText) {
            if (cipherText === null || cipherText === undefined) return '';
            const sCipher = String(cipherText).trim();
            if (sCipher === '') return '';

            // ثالثاً: إذا كان النص أصلاً أرقاماً أو نصاً صريحاً غير مشفر (لا يبدأ بـ ENC:)
            if (!sCipher.startsWith('ENC:')) {
                return sCipher;
            }

            // أولاً: محاولة فك التشفير باستخدام الملح المحمول الثابت المخصص للنسخ الاحتياطية
            let decrypted = this._decryptPinWithSalt(sCipher, PORTABLE_BACKUP_SALT);
            if (decrypted !== null && typeof decrypted === 'string') {
                return decrypted;
            }

            // ثانياً: إذا فشل، محاولة فك التشفير بملح الجهاز الحالي (لدعم النسخ المأخوذة سابقاً من نفس الجهاز)
            decrypted = this._decryptPinWithSalt(sCipher, this._getMachineSalt());
            if (decrypted !== null && typeof decrypted === 'string') {
                return decrypted;
            }

            // في حال تعذر فك التشفير بالملحين، إرجاع null لمنع حفظ نص تالف
            return null;
        },

        // 🔓 فك تشفير رمز PIN للتحقق في الذاكرة وإظهاره للمدير (يدعم كافة إصدارات ENC والهاش HASH:v1: والتشفير المتداخل)
        decryptPin: function (encPin) {
            if (!encPin) return '';
            let sEnc = String(encPin).trim();
            if (!sEnc.startsWith('ENC:') && !sEnc.startsWith('HASH:v1:') && !sEnc.startsWith('v4:') && !sEnc.startsWith('v3:') && !sEnc.startsWith('v2:')) return sEnc; // غير مشفر، قيمة بنص صريح

            // حلقة أمان لفك أي طبقات تشفير متداخلة أو مزدوجة (Nested / Double Encryption Guard)
            let loopGuard = 0;
            while (loopGuard++ < 5) {
                if (sEnc.startsWith('v4:') || sEnc.startsWith('v3:') || sEnc.startsWith('v2:')) {
                    sEnc = 'ENC:' + sEnc;
                }

                // 1. فك التجزئة HASH:v1: واستعادة الرقم السري الصريح فوراً
                if (sEnc.startsWith('HASH:v1:')) {
                    const parts = sEnc.split(':');
                    if (parts.length === 4) {
                        const salt = parts[2];
                        const expectedHash = parts[3];

                        // فحص فائق السرعة للأرقام الأكثر شيوعاً
                        const quickPins = ['1234', '1001', '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '123456', '12345', '101', '2026', '2025', '2024', '1122', '1212', '4321', '0123'];
                        for (let i = 0; i < quickPins.length; i++) {
                            const qp = quickPins[i];
                            const hp = this._sha256Hex(qp + ':' + salt + ':' + PORTABLE_BACKUP_SALT);
                            if (this._timingSafeEqual(hp, expectedHash)) return qp;
                            const hm = this._sha256Hex(qp + salt + this._getMachineSalt());
                            if (this._timingSafeEqual(hm, expectedHash)) return qp;
                        }

                        // فحص كافة أرقام PIN المكونة من 4 خانات (0000 إلى 9999)
                        for (let i = 0; i <= 9999; i++) {
                            const c4 = (i < 10 ? '000' : (i < 100 ? '00' : (i < 1000 ? '0' : ''))) + i;
                            const hp = this._sha256Hex(c4 + ':' + salt + ':' + PORTABLE_BACKUP_SALT);
                            if (this._timingSafeEqual(hp, expectedHash)) return c4;
                            const hm = this._sha256Hex(c4 + salt + this._getMachineSalt());
                            if (this._timingSafeEqual(hm, expectedHash)) return c4;
                        }

                        // فحص الأرقام من 1 إلى 999
                        for (let i = 0; i <= 999; i++) {
                            const c = String(i);
                            const hp = this._sha256Hex(c + ':' + salt + ':' + PORTABLE_BACKUP_SALT);
                            if (this._timingSafeEqual(hp, expectedHash)) return c;
                            const hm = this._sha256Hex(c + salt + this._getMachineSalt());
                            if (this._timingSafeEqual(hm, expectedHash)) return c;
                        }
                    }
                    return '';
                }

                if (!sEnc.startsWith('ENC:')) break;

                // 2. فك تشفير الإصدارات المشفرة ثنائياً بمفتاح AES-256
                let decrypted = this._decryptPinWithSalt(sEnc, PORTABLE_BACKUP_SALT);
                if (decrypted === null || typeof decrypted !== 'string') {
                    const machineSalt = this._getMachineSalt();
                    decrypted = this._decryptPinWithSalt(sEnc, machineSalt);
                }

                if (decrypted !== null && typeof decrypted === 'string' && decrypted !== sEnc) {
                    sEnc = decrypted;
                } else {
                    break;
                }
            }

            return sEnc;
        },

        // 🔑 تجزئة آمنة أحادية الاتجاه لرمز PIN (One-way Salted Hash)
        hashPin: function (pin, customSalt) {
            if (!pin) return '';
            const sPin = String(pin).trim();
            const salt = customSalt || (Math.random().toString(36).substring(2, 10) + Date.now().toString(36));
            const hash = this._sha256Hex(sPin + ':' + salt + ':' + PORTABLE_BACKUP_SALT);
            return 'HASH:v1:' + salt + ':' + hash;
        },

        // ✅ دالة التحقق المباشر الآمن من صحة الـ PIN (بمقارنة ثابتة التوقيت والتوافق الكامل)
        verifyPin: function (enteredPin, storedPin) {
            if (enteredPin === null || enteredPin === undefined || storedPin === null || storedPin === undefined) return false;
            const cleanEntered = String(enteredPin).trim();
            const cleanStored = String(storedPin).trim();
            if (!cleanEntered || !cleanStored) return false;

            // 1. التحقق من التجزئة أحادية الاتجاه HASH:v1:
            if (cleanStored.startsWith('HASH:v1:')) {
                const parts = cleanStored.split(':');
                if (parts.length === 4) {
                    const salt = parts[2];
                    const expectedHash = parts[3];
                    // فحص التجزئة المحمولة المحدثة
                    const hashPortable = this._sha256Hex(cleanEntered + ':' + salt + ':' + PORTABLE_BACKUP_SALT);
                    if (this._timingSafeEqual(hashPortable, expectedHash)) return true;
                    // التوافق مع التجزئة بملح العتاد المحلي القديم إن وجد
                    const hashMachine = this._sha256Hex(cleanEntered + salt + this._getMachineSalt());
                    if (this._timingSafeEqual(hashMachine, expectedHash)) return true;
                }
                return false;
            }

            // 2. التحقق من التطابق المباشر
            if (this._timingSafeEqual(cleanStored, cleanEntered)) return true;

            // 3. فك التشفير مع دعم كافة الإصدارات v4 و v3 و v2 و v1
            const plain = this.decryptPin(cleanStored);
            return this._timingSafeEqual(String(plain).trim(), cleanEntered);
        },

        // 🔒 التحقق الآمن والمباشر من رمز PIN المدير من قاعدة البيانات دون كشفه في الذاكرة
        verifyAdminPin: async function (enteredPin) {
            if (enteredPin === null || enteredPin === undefined || String(enteredPin).trim() === '') return false;
            const clean = String(enteredPin).trim();
            const targetDb = window.db || window.bayanDB;
            if (targetDb && targetDb.users && typeof targetDb.users.toArray === 'function') {
                try {
                    const allUsers = await targetDb.users.toArray();
                    const admins = (allUsers || []).filter(u => u && (u.role === 'admin' || u.id === 1 || u.id === '1') && !u.isFrozen);
                    for (const a of admins) {
                        if (a && a.pin && this.verifyPin(clean, a.pin)) {
                            return true;
                        }
                    }
                } catch (e) {
                    console.warn('[Security] verifyAdminPin db query notice:', e);
                }
            }
            return false;
        },

        // التحقق من سلامة الجلسة وصلاحية المستخدم
        validateSession: function () {
            const user = window.currentUser;
            if (!user && document.getElementById('loginModal') && document.getElementById('loginModal').style.display === 'none') {
                if (typeof window.showLoginScreen === 'function') window.showLoginScreen();
            }
        }
    };

    // فحص سلامة الجلسة دورياً كل دقيقة لترشيد موارد المعالج والذاكرة
    setInterval(function () {
        if (window.BayanSecurity && typeof window.BayanSecurity.validateSession === 'function') {
            window.BayanSecurity.validateSession();
        }
    }, 60000);
})();
