/**
 * =========================================================================
 * 🚀 نظام بطاقة التحديث المتوهجة في شاشة تسجيل الدخول - Bayan POS System
 * =========================================================================
 * ملف مستقل وخاص بإدارة وعرض بطاقة التحديثات الجديدة بشاشة تسجيل الدخول
 * Version: 4.9.1
 * Architecture: Standalone Modular Component
 * =========================================================================
 */

(function initLoginUpdateCardModule() {
    'use strict';

    if (typeof window === 'undefined') return;

    // حالة البطاقة والنسخة المتوفرة
    const CardState = {
        isAvailable: false,
        version: null,
        releaseData: null,
        element: null
    };

    // =========================================================================
    // 1. حقن تنسيقات النيون والأنيميشن الفاخرة للبطاقة (Ultra-Premium CSS)
    // =========================================================================
    function injectCardStyles() {
        if (document.getElementById('bayan-login-update-card-styles')) return;

        const style = document.createElement('style');
        style.id = 'bayan-login-update-card-styles';
        style.textContent = `
            /* الحاوية الأساسية لبطاقة التحديث */
            #loginNewUpdateCard {
                display: none;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                height: 48px;
                box-sizing: border-box;
                background: linear-gradient(135deg, rgba(217, 119, 6, 0.45), rgba(15, 23, 42, 0.9));
                padding: 0 10px;
                border-radius: 14px;
                border: 1.5px solid rgba(245, 158, 11, 0.75);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45), 0 0 15px rgba(245, 158, 11, 0.35);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                cursor: pointer;
                transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1);
                user-select: none;
                position: relative;
                overflow: visible;
                animation: updateCardSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1), updateCardGlowPulse 2.4s infinite ease-in-out;
            }

            #loginNewUpdateCard:hover {
                transform: translateY(-2px) scale(1.02);
                border-color: #fbbf24;
                box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6), 0 0 25px rgba(245, 158, 11, 0.6);
            }

            #loginNewUpdateCard:active {
                transform: translateY(0) scale(0.99);
            }

            /* نبض وتوهج حدود البطاقة */
            @keyframes updateCardGlowPulse {
                0%, 100% {
                    border-color: rgba(245, 158, 11, 0.75);
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45), 0 0 14px rgba(245, 158, 11, 0.3);
                }
                50% {
                    border-color: #f59e0b;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 22px rgba(245, 158, 11, 0.65);
                }
            }

            /* حركة ظهور البطاقة لأول مرة */
            @keyframes updateCardSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-12px) scale(0.96);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            /* أيقونة الصاروخ وصندوق الأيقونة المضيء */
            .login-upd-icon-box {
                width: 33px;
                height: 33px;
                border-radius: 9px;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.15rem;
                box-shadow: 0 3px 10px rgba(245, 158, 11, 0.45);
                flex-shrink: 0;
                position: relative;
                animation: rocketFloat 2.2s infinite ease-in-out;
            }

            @keyframes rocketFloat {
                0%, 100% { transform: translateY(0) rotate(0deg); }
                50% { transform: translateY(-2px) rotate(-6deg); }
            }

            /* نقطة النبض الحية المباشرة (Beacon Dot) */
            .login-upd-live-beacon {
                position: absolute;
                top: -3px;
                right: -3px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #10b981;
                border: 2px solid #0f172a;
                box-shadow: 0 0 8px #10b981;
            }
            .login-upd-live-beacon::after {
                content: '';
                position: absolute;
                inset: -2px;
                border-radius: 50%;
                border: 1.5px solid #10b981;
                animation: beaconPing 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
            }

            @keyframes beaconPing {
                0% { transform: scale(1); opacity: 1; }
                100% { transform: scale(2.2); opacity: 0; }
            }

            /* شارة رقم الإصدار الفاخرة */
            .login-upd-ver-pill {
                font-size: 0.66rem;
                font-weight: 900;
                font-family: 'Cairo', monospace;
                background: #fef08a;
                color: #854d0e;
                padding: 1px 7px;
                border-radius: 6px;
                letter-spacing: 0.5px;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                border: 1px solid #fde047;
                display: inline-flex;
                align-items: center;
            }

            /* السهم التفاعلي الجانبي */
            .login-upd-chevron {
                color: #fbbf24;
                font-size: 1.15rem;
                font-weight: 900;
                margin-left: 2px;
                transition: transform 0.2s ease;
            }

            #loginNewUpdateCard:hover .login-upd-chevron {
                transform: translateX(-3px);
                color: #ffffff;
            }
        `;
        document.head.appendChild(style);
    }

    // =========================================================================
    // 2. إنشاء وتثبيت عنصر البطاقة داخل حاوية شاشة تسجيل الدخول
    // =========================================================================
    function createOrGetCardElement() {
        let card = document.getElementById('loginNewUpdateCard');
        if (card) return card;

        const container = document.getElementById('loginTopLeftContainer');
        if (!container) return null;

        card = document.createElement('div');
        card.id = 'loginNewUpdateCard';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('title', 'اضغط هنا لفتح نافذة التحديث المباشر وترقية النظام فوراً');

        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                <div class="login-upd-icon-box">
                    <span>🚀</span>
                    <div class="login-upd-live-beacon"></div>
                </div>
                <div style="text-align: right; line-height: 1.25;">
                    <div style="color: #ffffff; font-size: 0.82rem; font-weight: 900; letter-spacing: 0.3px; display: flex; align-items: center; gap: 6px;">
                        <span>تحديث جديد متاح</span>
                        <span id="loginUpdateVersionPill" class="login-upd-ver-pill">V4.9.1</span>
                    </div>
                    <div style="color: #fef08a; font-size: 0.67rem; font-weight: 800; margin-top: 1px;">
                        اضغط للترقية الفورية أو المعاينة ⚡
                    </div>
                </div>
            </div>
            <span class="login-upd-chevron">‹</span>
        `;

        // ربط حدث النقر
        card.addEventListener('click', handleCardClick);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick();
            }
        });

        // إضافة البطاقة للحاوية كعنصر رابع
        container.appendChild(card);
        CardState.element = card;
        return card;
    }

    // =========================================================================
    // 3. معالج النقر على بطاقة التحديث
    // =========================================================================
    function handleCardClick() {
        console.log('[LoginUpdateCard] Card clicked. Triggering official updater modal...');
        
        // تأثير اهتزاز لطيف
        if (CardState.element) {
            CardState.element.style.transform = 'scale(0.97)';
            setTimeout(() => {
                if (CardState.element) CardState.element.style.transform = '';
            }, 120);
        }

        // فتح نافذة التحديث الرسمية عبر نظام التحديث التلقائي
        if (typeof window.openBayanUpdateModal === 'function') {
            window.openBayanUpdateModal();
        } else if (typeof window.checkForBayanUpdatesManual === 'function') {
            window.checkForBayanUpdatesManual();
        } else if (typeof window.checkGitHubReleases === 'function') {
            window.checkGitHubReleases(true);
        } else if (typeof showToast === 'function') {
            showToast('🚀 جاري فتح شاشة التحديثات...', 'info');
        }
    }

    // =========================================================================
    // 4. الدوال العامة للتحكم بالبطاقة (Public API)
    // =========================================================================

    /**
     * إظهار بطاقة التحديث برقم الإصدار الجديد
     * @param {string} newVer رقم الإصدار الجديد
     * @param {object} releaseData بيانات إضافية اختيارية
     */
    window.showLoginUpdateCard = function(newVer, releaseData = null) {
        injectCardStyles();
        const card = createOrGetCardElement();
        if (!card) return;

        const cleanVer = String(newVer || '').replace(/^v+/i, '').trim();
        CardState.isAvailable = true;
        CardState.version = cleanVer;
        CardState.releaseData = releaseData;

        const pill = document.getElementById('loginUpdateVersionPill');
        if (pill) {
            pill.textContent = cleanVer ? `V${cleanVer}` : 'جديد ⚡';
        }

        card.style.display = 'flex';
        console.log(`[LoginUpdateCard] 🌟 Update card is now visible for version v${cleanVer}`);
    };

    /**
     * إخفاء بطاقة التحديث (عندما يكون النظام محدثاً)
     */
    window.hideLoginUpdateCard = function() {
        CardState.isAvailable = false;
        const card = document.getElementById('loginNewUpdateCard');
        if (card) {
            card.style.display = 'none';
        }
        console.log('[LoginUpdateCard] Card hidden (system is up to date).');
    };

    /**
     * دالة للمعاينة والاختبار الفوري في وضع التطوير
     * @param {string} demoVer رقم إصدار تجريبي للعرض
     */
    window.previewLoginUpdateCard = function(demoVer = '4.1.0') {
        window.showLoginUpdateCard(demoVer, { notes: 'إصدار تجريبي لمعاينة البطاقة في شاشة تسجيل الدخول' });
        if (typeof showToast === 'function') {
            showToast(`✨ تم تفعيل بطاقة التحديث التجريبية للإصدار V${demoVer}`, 'success');
        }
    };

    // =========================================================================
    // 5. التهيئة التلقائية والاستماع لأحداث النظام
    // =========================================================================
    function init() {
        injectCardStyles();
        createOrGetCardElement();

        // الاستماع لأي حدث تحديث متوفر يطلقه المحرك
        window.addEventListener('bayan-update-available', function(event) {
            const ver = event.detail && event.detail.version;
            if (ver) {
                window.showLoginUpdateCard(ver, event.detail);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الكائن العام
    window.BayanLoginUpdateCard = {
        show: window.showLoginUpdateCard,
        hide: window.hideLoginUpdateCard,
        preview: window.previewLoginUpdateCard,
        getState: () => ({ ...CardState })
    };

})();
