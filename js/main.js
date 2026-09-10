/**
 * BAYAN POS FASHION - SHOWCASE WEBSITE INTERACTIVE LOGIC
 * High-performance Vanilla JavaScript for Modern UI/UX
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbarScroll();
  initMobileNav();
  initThemeToggle();
  initStatsCounter();
  initFeatureTabs();
  initMatrixSimulator();
  initFaqAccordion();
  initMockupClock();
  initScrollNavButtons();
  initSmartDownloadModal();
  initServiceWorkerAndAutoUpdate();
});

/* --------------------------------------------------------------------------
   1. STICKY NAVBAR ON SCROLL
   -------------------------------------------------------------------------- */
function initNavbarScroll() {
  const header = document.getElementById('mainHeader');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}

/* --------------------------------------------------------------------------
   2. MOBILE NAVIGATION DRAWER
   -------------------------------------------------------------------------- */
function initMobileNav() {
  const toggleBtn = document.getElementById('mobileNavToggle');
  const navMenu = document.getElementById('navMenu');
  if (!toggleBtn || !navMenu) return;

  toggleBtn.addEventListener('click', () => {
    navMenu.classList.toggle('show');
    const isExpanded = navMenu.classList.contains('show');
    toggleBtn.setAttribute('aria-expanded', isExpanded);
  });

  // Close menu on link click
  navMenu.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('show');
      toggleBtn.setAttribute('aria-expanded', 'false');
    });
  });

  // Close menu on click outside
  document.addEventListener('click', (e) => {
    if (!navMenu.contains(e.target) && !toggleBtn.contains(e.target) && navMenu.classList.contains('show')) {
      navMenu.classList.remove('show');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

/* --------------------------------------------------------------------------
   3. ANIMATED NUMBER COUNTERS (INTERSECTION OBSERVER)
   -------------------------------------------------------------------------- */
function initStatsCounter() {
  const statElements = document.querySelectorAll('.stat-number[data-count]');
  if (!statElements.length) return;

  const observerOptions = {
    threshold: 0.5
  };

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.getAttribute('data-count'));
        const prefix = el.getAttribute('data-prefix') || '';
        const suffix = el.getAttribute('data-suffix') || '';
        const isFloat = el.getAttribute('data-float') === 'true';
        
        animateCounter(el, target, prefix, suffix, isFloat);
        obs.unobserve(el);
      }
    });
  }, observerOptions);

  statElements.forEach(el => observer.observe(el));
}

function animateCounter(element, target, prefix, suffix, isFloat) {
  let start = 0;
  const duration = 1800;
  const frameRate = 1000 / 60;
  const totalFrames = Math.round(duration / frameRate);
  let frame = 0;

  const timer = setInterval(() => {
    frame++;
    const progress = easeOutExpo(frame / totalFrames);
    const current = start + (target - start) * progress;

    element.textContent = prefix + (isFloat ? current.toFixed(1) : Math.floor(current).toLocaleString()) + suffix;

    if (frame === totalFrames) {
      clearInterval(timer);
      element.textContent = prefix + (isFloat ? target.toFixed(1) : target.toLocaleString()) + suffix;
    }
  }, frameRate);
}

function easeOutExpo(x) {
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

/* --------------------------------------------------------------------------
   4. FEATURE TABS SWITCHER
   -------------------------------------------------------------------------- */
function initFeatureTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn[data-tab]');
  const tabPanels = document.querySelectorAll('.tab-content-panel');

  if (!tabButtons.length) return;

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTabId = btn.getAttribute('data-tab');

      // Update button states
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panel visibility
      tabPanels.forEach(panel => {
        if (panel.id === targetTabId) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });
}

/* --------------------------------------------------------------------------
   5. INTERACTIVE MATRIX SIMULATOR IN TAB 1
   -------------------------------------------------------------------------- */
function initMatrixSimulator() {
  const stockCells = document.querySelectorAll('.interactive-stock-cell');
  const totalCountElem = document.getElementById('matrixTotalPieces');

  if (!stockCells.length) return;

  stockCells.forEach(cell => {
    cell.addEventListener('click', () => {
      let currentVal = parseInt(cell.textContent.trim(), 10) || 0;
      currentVal = (currentVal + 1) > 25 ? 2 : currentVal + 1;
      cell.textContent = currentVal;
      
      // Update cell animation
      cell.style.transform = 'scale(1.25)';
      setTimeout(() => {
        cell.style.transform = '';
      }, 150);

      // Recalculate total
      let total = 0;
      stockCells.forEach(c => {
        total += parseInt(c.textContent.trim(), 10) || 0;
      });

      if (totalCountElem) {
        totalCountElem.textContent = total;
      }
    });
  });
}



/* --------------------------------------------------------------------------
   7. INTERACTIVE FAQ ACCORDION
   -------------------------------------------------------------------------- */
function initFaqAccordion() {
  const faqHeaders = document.querySelectorAll('.faq-header');

  faqHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const parentItem = header.closest('.faq-item');
      const body = parentItem.querySelector('.faq-body');
      const isActive = parentItem.classList.contains('active');

      // Close all other items
      document.querySelectorAll('.faq-item').forEach(item => {
        if (item !== parentItem) {
          item.classList.remove('active');
          const itemBody = item.querySelector('.faq-body');
          if (itemBody) itemBody.style.maxHeight = null;
        }
      });

      // Toggle current
      if (isActive) {
        parentItem.classList.remove('active');
        body.style.maxHeight = null;
      } else {
        parentItem.classList.add('active');
        body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });
}


/* --------------------------------------------------------------------------
   9. REAL-TIME MOCKUP CLOCK
   -------------------------------------------------------------------------- */
function initMockupClock() {
  const clockElem = document.getElementById('mockupLiveClock');
  if (!clockElem) return;

  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clockElem.textContent = `${hours}:${minutes}:${seconds}`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

/* --------------------------------------------------------------------------
   10. THEME TOGGLE (LIGHT & DARK MODE)
   -------------------------------------------------------------------------- */
function initThemeToggle() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (!toggleBtn) return;

  // الوضع الافتراضي للزوار الجدد هو الوضع الفاتح (Light Mode)
  const savedTheme = localStorage.getItem('bayan_website_theme') || 'light';
  applyTheme(savedTheme);

  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    localStorage.setItem('bayan_website_theme', newTheme);
  });

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      toggleBtn.innerHTML = '🌙';
      toggleBtn.setAttribute('title', 'تفعيل الوضع الداكن');
      toggleBtn.setAttribute('aria-label', 'تفعيل الوضع الداكن');
    } else {
      document.documentElement.removeAttribute('data-theme');
      toggleBtn.innerHTML = '☀️';
      toggleBtn.setAttribute('title', 'تفعيل الوضع الفاتح');
      toggleBtn.setAttribute('aria-label', 'تفعيل الوضع الفاتح');
    }
  }
}

/* --------------------------------------------------------------------------
   8. FLOATING SCROLL NAVIGATION (UP & DOWN ARROWS)
   -------------------------------------------------------------------------- */
function initScrollNavButtons() {
  const scrollDock = document.getElementById('scrollNavDock');
  const btnUp = document.getElementById('scrollNavUp');
  const btnDown = document.getElementById('scrollNavDown');

  if (!scrollDock || !btnUp || !btnDown) return;

  function updateScrollButtonsState() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

    // يظهر زر الصعود للأعلى بعد النزول 180px
    if (scrollY > 180) {
      btnUp.classList.add('visible');
    } else {
      btnUp.classList.remove('visible');
    }

    // يختفي زر النزول للأسفل عند الاقتراب من نهاية الصفحة
    if (scrollY >= maxScroll - 120) {
      btnDown.classList.add('hidden');
    } else {
      btnDown.classList.remove('hidden');
    }
  }

  // حركة صعود ونزول انسيابية فائقة السرعة وهادئة ومريحة للعين (Silky Smooth & Fast)
  function smoothScrollTo(targetPosition, duration = 580) {
    const startPosition = window.pageYOffset || document.documentElement.scrollTop;
    const distance = targetPosition - startPosition;
    let startTime = null;

    function step(currentTime) {
      if (!startTime) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);

      // دالة تسارع وتباطؤ انسيابية فائقة النعومة والهدوء (EaseInOutQuintic)
      const ease = progress < 0.5
        ? 16 * Math.pow(progress, 5)
        : 1 - Math.pow(-2 * progress + 2, 5) / 2;

      window.scrollTo(0, startPosition + distance * ease);

      if (timeElapsed < duration) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  btnUp.addEventListener('click', (e) => {
    e.preventDefault();
    smoothScrollTo(0, 580);
  });

  btnDown.addEventListener('click', (e) => {
    e.preventDefault();
    const bottomPosition = document.documentElement.scrollHeight - window.innerHeight;
    smoothScrollTo(bottomPosition, 580);
  });

  window.addEventListener('scroll', updateScrollButtonsState, { passive: true });
  updateScrollButtonsState();
}

/* --------------------------------------------------------------------------
   11. SERVICE WORKER & REAL-TIME AUTO-UPDATE SYSTEM
   -------------------------------------------------------------------------- */
function initServiceWorkerAndAutoUpdate() {
  // يعمل السيرفس ووركر فقط عبر بروتوكول http أو https (أو سيرفر محلي)
  // عند فتح الملف مباشرة عبر المتصفح (file://) يتم التخطي بهدوء لتجنب تحذيرات المتصفح
  const isSupportedProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  if (!isSupportedProtocol) {
    return;
  }

  // 1. تسجيل السيرفس ووركر وتتبع التحديثات
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          // فحص التحديثات مباشرة عند كل فتح للموقع
          reg.update();

          // الاستماع لوجود نسخة جديدة قيد التثبيت
          reg.addEventListener('updatefound', () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.addEventListener('statechange', () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // تفعيل فوري بدون انتظار
                  installingWorker.postMessage({ action: 'skipWaiting' });
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });

      // عند استلام السيرفس ووركر الجديد للتحكم، يتم تحديث الصفحة فوراً
      let isRefreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!isRefreshing) {
          isRefreshing = true;
          window.location.reload();
        }
      });
    });
  }

  // 2. فحص ملف version.json لكشف التحديثات اللحظية وحذف الكاش القديم
  checkAppVersion();
  // إعادة الفحص كل دقيقتين في حال ترك الصفحة مفتوحة
  setInterval(checkAppVersion, 2 * 60 * 1000);
}

async function checkAppVersion() {
  try {
    const timestamp = Date.now();
    const res = await fetch(`./version.json?t=${timestamp}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });

    if (!res.ok) return;
    const data = await res.json();
    const serverVersion = data.version;
    const localVersion = localStorage.getItem('bayan_site_version');

    if (!localVersion) {
      localStorage.setItem('bayan_site_version', serverVersion);
      return;
    }

    if (localVersion !== serverVersion) {
      console.log(`[Update] New version detected: ${serverVersion} (Current: ${localVersion})`);
      localStorage.setItem('bayan_site_version', serverVersion);

      // مسح كافة الكاش القديم
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(k => caches.delete(k)));
      }

      // إشعار المستخدم أو التحديث التلقائي الفوري
      showUpdateNotification(serverVersion);
    }
  } catch (e) {
    // خطأ صامت في حال انقطاع النت
  }
}

function showUpdateNotification(newVersion) {
  const existingToast = document.getElementById('bayan-update-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'bayan-update-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    border: 2px solid #10b981;
    border-radius: 14px;
    padding: 16px 20px;
    box-shadow: 0 12px 30px rgba(0,0,0,0.5), 0 0 20px rgba(16,185,129,0.3);
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 14px;
    direction: rtl;
    font-family: inherit;
  `;

  toast.innerHTML = `
    <span style="font-size: 1.5rem;">🚀</span>
    <div>
      <div style="color: #fff; font-weight: 800; font-size: 0.95rem;">تم إطلاق تحديث جديد للموقع (v${newVersion})!</div>
      <div style="color: #94a3b8; font-size: 0.8rem;">جاري تحديث البيانات تلقائياً للحصول على أحدث المميزات...</div>
    </div>
    <button id="toastReloadBtn" style="
      background: #10b981;
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 8px;
      font-weight: 800;
      cursor: pointer;
      font-size: 0.85rem;
      margin-right: 8px;
    ">تحديث الآن</button>
  `;

  document.body.appendChild(toast);

  document.getElementById('toastReloadBtn').addEventListener('click', () => {
    window.location.reload(true);
  });

  // إعادة التحميل التلقائي بعد ثانيتين
  setTimeout(() => {
    window.location.reload(true);
  }, 2000);
}

/* --------------------------------------------------------------------------
   12. SMART DOWNLOAD & LEAD REGISTRATION MODAL WITH VALIDATION & GOOGLE SHEETS
   -------------------------------------------------------------------------- */
// رابط جوجل شيت Web App التلقائي الخاص ببرنامج بيان فاشن
window.BAYAN_GOOGLE_SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwzsifgFLbSuFPsj4z22Gtp_Is3d5Zy6MphKW_IHydcesLqD6Vc0q8a4NgX7-oC16fn/exec';

function initSmartDownloadModal() {
  const modalBackdrop = document.getElementById('downloadModalBackdrop');
  const closeBtn = document.getElementById('closeDownloadModalBtn');
  const leadForm = document.getElementById('downloadLeadForm');
  const modalTitle = document.getElementById('modalTitle');
  const platformTitle = document.getElementById('modalPlatformTitle');
  const leadPlatformInput = document.getElementById('leadSelectedPlatform');
  const modalAlertBox = document.getElementById('modalAlertBox');
  const modalSuccessState = document.getElementById('modalSuccessState');
  const btnResetState = document.getElementById('btnResetModalState');

  // Fields
  const inputFullName = document.getElementById('leadFullName');
  const inputStoreName = document.getElementById('leadStoreName');
  const selectBusinessField = document.getElementById('leadBusinessField');
  const selectCountryCode = document.getElementById('leadCountryCode');
  const inputPhoneNumber = document.getElementById('leadPhoneNumber');
  const phoneHelperHint = document.getElementById('phoneHelperHint');
  const btnSubmit = document.getElementById('btnSubmitLeadForm');

  if (!modalBackdrop || !leadForm) return;

  // إرشادات أرقام الهواتف التلقائية لكل دولة
  const COUNTRY_CONFIGS = {
    EG: {
      name: 'مصر',
      prefix: '+20',
      hint: 'تنسيق مصر: 11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015 (أو بدون الصفر: 10/11/12/15)',
      // يبدأ بـ 010, 011, 012, 015 ومكون من 11 رقماً أو بدون الصفر 10 أرقام
      validate: (cleanNum) => {
        return /^(0?1[0125][0-9]{8})$/.test(cleanNum);
      },
      normalize: (num) => {
        let clean = num.replace(/[^0-9]/g, '');
        if (clean.startsWith('20') && clean.length >= 12) clean = clean.substring(2);
        if (clean.startsWith('0020')) clean = clean.substring(4);
        return clean;
      }
    },
    SA: {
      name: 'السعودية',
      prefix: '+966',
      hint: 'تنسيق السعودية: 9 أو 10 أرقام تبدأ بـ 05 أو 5 (مثال: 0512345678)',
      validate: (cleanNum) => {
        return /^(0?5[0-9]{8})$/.test(cleanNum);
      },
      normalize: (num) => {
        let clean = num.replace(/[^0-9]/g, '');
        if (clean.startsWith('966')) clean = clean.substring(3);
        if (clean.startsWith('00966')) clean = clean.substring(5);
        return clean;
      }
    },
    AE: {
      name: 'الإمارات',
      prefix: '+971',
      hint: 'تنسيق الإمارات: يبدأ بـ 05 أو 5 ومكون من 9 أرقام (مثال: 0501234567)',
      validate: (cleanNum) => {
        return /^(0?5[0-9]{8})$/.test(cleanNum);
      },
      normalize: (num) => {
        let clean = num.replace(/[^0-9]/g, '');
        if (clean.startsWith('971')) clean = clean.substring(3);
        if (clean.startsWith('00971')) clean = clean.substring(5);
        return clean;
      }
    },
    KW: {
      name: 'الكويت',
      prefix: '+965',
      hint: 'تنسيق الكويت: 8 أرقام يبدأ بـ 5 أو 6 أو 9 (مثال: 51234567)',
      validate: (cleanNum) => {
        return /^([569][0-9]{7})$/.test(cleanNum);
      },
      normalize: (num) => {
        let clean = num.replace(/[^0-9]/g, '');
        if (clean.startsWith('965')) clean = clean.substring(3);
        return clean;
      }
    },
    IQ: {
      name: 'العراق',
      prefix: '+964',
      hint: 'تنسيق العراق: 10 أو 11 رقماً يبدأ بـ 07 أو 7 (مثال: 07801234567)',
      validate: (cleanNum) => {
        return /^(0?7[3-9][0-9]{8})$/.test(cleanNum);
      },
      normalize: (num) => {
        let clean = num.replace(/[^0-9]/g, '');
        if (clean.startsWith('964')) clean = clean.substring(3);
        return clean;
      }
    },
    SD: {
      name: 'السودان',
      prefix: '+249',
      hint: 'تنسيق السودان: 9 أو 10 أرقام يبدأ بـ 09 أو 9 أو 01 (مثال: 0912345678)',
      validate: (cleanNum) => {
        return /^(0?[91][0-9]{8})$/.test(cleanNum);
      },
      normalize: (num) => {
        let clean = num.replace(/[^0-9]/g, '');
        if (clean.startsWith('249')) clean = clean.substring(3);
        return clean;
      }
    },
    JO: {
      name: 'الأردن',
      prefix: '+962',
      hint: 'تنسيق الأردن: 9 أو 10 أرقام يبدأ بـ 07 أو 7 (مثال: 0791234567)',
      validate: (cleanNum) => {
        return /^(0?7[789][0-9]{7})$/.test(cleanNum);
      },
      normalize: (num) => {
        let clean = num.replace(/[^0-9]/g, '');
        if (clean.startsWith('962')) clean = clean.substring(3);
        return clean;
      }
    },
    LY: {
      name: 'ليبيا',
      prefix: '+218',
      hint: 'تنسيق ليبيا: يبدأ بـ 09 أو 9 ومكون من 9-10 أرقام (مثال: 0912345678)',
      validate: (cleanNum) => {
        return /^(0?9[1-6][0-9]{7})$/.test(cleanNum);
      },
      normalize: (num) => {
        let clean = num.replace(/[^0-9]/g, '');
        if (clean.startsWith('218')) clean = clean.substring(3);
        return clean;
      }
    },
    OTHER: {
      name: 'دولة أخرى',
      prefix: '',
      hint: 'يرجى إدخال رقم هاتف حقيقي مع المفتاح الدولي (بين 8 إلى 15 رقماً)',
      validate: (cleanNum) => {
        return /^[0-9]{8,15}$/.test(cleanNum);
      },
      normalize: (num) => {
        return num.replace(/[^0-9]/g, '');
      }
    }
  };

  // تحديث التلميح عند تغيير الدولة
  if (selectCountryCode && phoneHelperHint) {
    selectCountryCode.addEventListener('change', () => {
      const selected = selectCountryCode.value;
      const conf = COUNTRY_CONFIGS[selected] || COUNTRY_CONFIGS.OTHER;
      phoneHelperHint.textContent = conf.hint;
      // إعادة فحص الرقم المدخل إذا كان موجوداً
      if (inputPhoneNumber.value.trim().length > 0) {
        validateField(inputPhoneNumber, () => validatePhone(inputPhoneNumber.value, selected), 'errLeadPhoneNumber');
      }
    });
  }

  // فتح المودال من أي زر في الموقع
  document.querySelectorAll('.open-download-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const platform = btn.getAttribute('data-platform') || 'all';
      openModalWithPlatform(platform);
    });
  });

  // إغلاق المودال
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop.classList.contains('show')) {
      closeModal();
    }
  });

  function openModalWithPlatform(platform) {
    leadPlatformInput.value = platform;
    
    // تخصيص العناوين بحسب المنصة
    if (platform === 'windows') {
      platformTitle.textContent = 'تحميل نسخة الويندوز (PC / Electron)';
    } else if (platform === 'android') {
      platformTitle.textContent = 'تحميل نسخة التابلت والأندرويد (PWA / Tablet)';
    } else if (platform === 'server') {
      platformTitle.textContent = 'طلب سيرفر المزامنة والربط الشبكي';
    } else {
      platformTitle.textContent = 'تحميل وتجربة منظومة بيان فاشن';
    }

    // فحص هل العميل سجل مسبقاً بنفس الجهاز؟ (منع التكرار الذكي عبر IndexedDB)
    modalBackdrop.classList.add('show');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // فحص فوري وسريع لقاعدة بيانات IndexedDB
    getExistingRegistration().then(existingRegistration => {
      if (existingRegistration) {
        showSuccessScreen(existingRegistration, true);
      } else {
        showFormScreen();
      }
    });
  }

  function closeModal() {
    modalBackdrop.classList.remove('show');
    modalBackdrop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function showFormScreen() {
    leadForm.style.display = 'flex';
    modalSuccessState.style.display = 'none';
    clearAlert();
  }

  function showSuccessScreen(leadData, isReturningUser = false) {
    leadForm.style.display = 'none';
    modalSuccessState.style.display = 'block';

    const welcomeMsg = document.getElementById('successWelcomeMsg');
    if (welcomeMsg && leadData) {
      if (isReturningUser) {
        welcomeMsg.innerHTML = `
          أهلاً بك مجدداً يا <strong>${escapeHtml(leadData.fullName)}</strong> (متجر: <strong>${escapeHtml(leadData.storeName)}</strong>).<br>
          بياناتك مسجلة مسبقاً بنجاح في قاعدة البيانات! يمكنك متابعة التحميل والتثبيت فوراً:
        `;
      } else {
        welcomeMsg.innerHTML = `
          تم تسجيل متجر <strong>${escapeHtml(leadData.storeName)}</strong> بنجاح باسم <strong>${escapeHtml(leadData.fullName)}</strong>.<br>
          يمكنك الآن النقر على زر التحميل أدناه لبدء تثبيت النظام فوراً:
        `;
      }
    }
  }

  // زر تعديل البيانات أو تسجيل نشاط آخر
  if (btnResetState) {
    btnResetState.addEventListener('click', () => {
      showFormScreen();
      showAlert('يرجى ملاحظة أنه لا يمكن تكرار تسجيل نفس رقم الهاتف، يمكنك تعديل البيانات أو استخدام رقم فرع آخر.', 'warning');
    });
  }

  // دوال التحقق المباشر عند الكتابة (Live Validation)
  inputFullName.addEventListener('blur', () => {
    validateField(inputFullName, () => inputFullName.value.trim().length >= 3, 'errLeadFullName');
  });

  inputStoreName.addEventListener('blur', () => {
    validateField(inputStoreName, () => inputStoreName.value.trim().length >= 2, 'errLeadStoreName');
  });

  selectBusinessField.addEventListener('change', () => {
    validateField(selectBusinessField, () => selectBusinessField.value !== '', 'errLeadBusinessField');
  });

  inputPhoneNumber.addEventListener('input', () => {
    // إزالة أي حروف غير أرقام وعلامة الزائد
    inputPhoneNumber.value = inputPhoneNumber.value.replace(/[^0-9+]/g, '');
  });

  inputPhoneNumber.addEventListener('blur', () => {
    const country = selectCountryCode.value;
    validateField(inputPhoneNumber, () => validatePhone(inputPhoneNumber.value, country), 'errLeadPhoneNumber');
  });

  function validateField(element, validatorFn, errorMsgId) {
    const isValid = validatorFn();
    const errorMsgEl = document.getElementById(errorMsgId);

    if (!isValid) {
      element.classList.add('is-invalid');
      if (errorMsgEl) errorMsgEl.classList.add('visible');
      return false;
    } else {
      element.classList.remove('is-invalid');
      if (errorMsgEl) errorMsgEl.classList.remove('visible');
      return true;
    }
  }

  function validatePhone(phoneVal, countryKey) {
    if (!phoneVal || phoneVal.trim() === '') return false;
    const conf = COUNTRY_CONFIGS[countryKey] || COUNTRY_CONFIGS.OTHER;
    const normalized = conf.normalize(phoneVal.trim());
    return conf.validate(normalized);
  }

  // معالجة إرسال النموذج (Submit)
  // مؤقت للحد من السبام (Rate-Limiting Protection)
  let lastSubmitTimestamp = 0;

  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    // 1. فحص مصيدة البوتات (Anti-Bot Honeypot)
    const honeypot = document.getElementById('securityHoneypotField');
    if (honeypot && honeypot.value.trim() !== '') {
      console.warn('Spam bot detected and blocked.');
      return;
    }

    // 2. حماية من الهجمات المتكررة (Rate Limiting - حد أدنى ثانيتين بين المحاولات)
    const now = Date.now();
    if (now - lastSubmitTimestamp < 2000) {
      showAlert('يرجى الانتظار لحظات قليلة قبل تكرار المحاولة.', 'warning');
      return;
    }
    lastSubmitTimestamp = now;

    const fullName = sanitizeInput(inputFullName.value).substring(0, 60);
    const storeName = sanitizeInput(inputStoreName.value).substring(0, 70);
    const businessField = sanitizeInput(selectBusinessField.value).substring(0, 50);
    const countryKey = sanitizeInput(selectCountryCode.value).substring(0, 10);
    const rawPhone = inputPhoneNumber.value.trim().substring(0, 20);
    const platform = sanitizeInput(leadPlatformInput.value || 'windows').substring(0, 20);

    // فحص الصلاحية لكل الحقول
    const isNameValid = validateField(inputFullName, () => fullName.length >= 3, 'errLeadFullName');
    const isStoreValid = validateField(inputStoreName, () => storeName.length >= 2, 'errLeadStoreName');
    const isFieldValid = validateField(selectBusinessField, () => businessField !== '', 'errLeadBusinessField');
    const isPhoneValid = validateField(inputPhoneNumber, () => validatePhone(rawPhone, countryKey), 'errLeadPhoneNumber');

    if (!isNameValid || !isStoreValid || !isFieldValid || !isPhoneValid) {
      showAlert('يرجى تصحيح الحقول المحددة باللون الأحمر والتأكد من صحة رقم الهاتف وفقاً لكود الدولة.', 'error');
      return;
    }

    const conf = COUNTRY_CONFIGS[countryKey] || COUNTRY_CONFIGS.OTHER;
    const cleanPhone = conf.normalize(rawPhone);
    const fullPhoneFormatted = (conf.prefix ? conf.prefix + ' ' : '') + cleanPhone;

    // 3. الدالة الذكية لمنع التكرار (Duplicate Prevention System عبر IndexedDB)
    // منع تكرار نفس رقم الهاتف أو نفس المحل
    const registeredDatabase = await getStoredRegistrations();
    const isDuplicatePhone = registeredDatabase.some(record => record.cleanPhone === cleanPhone);

    if (isDuplicatePhone) {
      showAlert(`عفواً! رقم الهاتف (${cleanPhone}) مسجل لدينا بالفعل مسبقاً. لا يمكن تسجيل نفس الرقم أكثر من مرة! يمكنك تحميل البرنامج مباشرة أدناه.`, 'warning');
      
      const existingLead = registeredDatabase.find(r => r.cleanPhone === cleanPhone);
      setTimeout(() => {
        showSuccessScreen(existingLead || { fullName, storeName }, true);
      }, 1500);
      return;
    }

    // تفعيل حالة التحميل للزر
    setSubmittingState(true);

    const leadRecord = {
      id: 'LEAD_' + Date.now(),
      fullName,
      storeName,
      businessField,
      country: conf.name,
      countryCode: countryKey,
      rawPhone,
      cleanPhone,
      fullPhoneFormatted,
      platform,
      registeredAt: new Date().toISOString(),
      registeredAtFormatted: new Date().toLocaleString('ar-EG'),
      userAgent: navigator.userAgent
    };

    // 2. حفظ البيانات في IndexedDB قاعدة بيانات المتصفح
    await saveLeadLocally(leadRecord);

    // 3. إرسال البيانات إلى Google Sheets عبر الـ Webhook (إذا وُجد)
    try {
      await sendLeadToGoogleSheets(leadRecord);
    } catch (err) {
      console.warn('Google Sheets Webhook note:', err);
    }

    setSubmittingState(false);
    showAlert('تم حفظ بياناتك بنجاح! جاري تحويلك لروابط التحميل...', 'warning');

    setTimeout(() => {
      showSuccessScreen(leadRecord, false);
    }, 600);
  });

  function setSubmittingState(isSubmitting) {
    const btnText = btnSubmit.querySelector('.btn-text');
    const btnSpinner = btnSubmit.querySelector('.btn-spinner');

    if (isSubmitting) {
      btnSubmit.disabled = true;
      if (btnText) btnText.textContent = 'جاري التحقق وحفظ البيانات...';
      if (btnSpinner) btnSpinner.style.display = 'inline-block';
    } else {
      btnSubmit.disabled = false;
      if (btnText) btnText.textContent = 'تأكيد البيانات والانتقال للتحميل 📥';
      if (btnSpinner) btnSpinner.style.display = 'none';
    }
  }

  function showAlert(msg, type = 'error') {
    if (!modalAlertBox) return;
    modalAlertBox.className = `modal-alert-box alert-${type}`;
    modalAlertBox.innerHTML = `
      <span style="font-size: 1.2rem;">${type === 'error' ? '⚠️' : 'ℹ️'}</span>
      <span>${escapeHtml(msg)}</span>
    `;
    modalAlertBox.style.display = 'flex';
  }

  function clearAlert() {
    if (!modalAlertBox) return;
    modalAlertBox.style.display = 'none';
    modalAlertBox.innerHTML = '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/`/g, '&#x60;')
      .replace(/\//g, '&#x2F;');
  }

  function sanitizeInput(str) {
    if (!str) return '';
    return String(str).trim().replace(/[<>'"`;\(\)\{\}\$]/g, '');
  }

  // =========================================================================
  // نظام التخزين الاحترافي فائق القوة: IndexedDB (BayanLeadsDB)
  // قاعدة بيانات حقيقية داخل المتصفح لا تُمسح مع الكاش وتتحمل ملايين السجلات
  // =========================================================================
  const IDB_NAME = 'BayanFashion_LeadsDB';
  const IDB_VERSION = 1;
  const IDB_STORE = 'leads';

  function openBayanDatabase() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          const store = db.createObjectStore(IDB_STORE, { keyPath: 'cleanPhone' });
          store.createIndex('registeredAt', 'registeredAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  // جلب كافة السجلات المسجلة من IndexedDB (مع التوافق مع localStorage)
  async function getStoredRegistrations() {
    try {
      const db = await openBayanDatabase();
      if (db) {
        return new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const store = tx.objectStore(IDB_STORE);
          const req = store.getAll();
          req.onsuccess = () => {
            const results = req.result || [];
            // دمج ذكي مع أي بيانات سابقة من localStorage
            try {
              const legacy = JSON.parse(localStorage.getItem('bayan_leads_db') || '[]');
              legacy.forEach(item => {
                if (!results.some(r => r.cleanPhone === item.cleanPhone)) {
                  results.push(item);
                }
              });
            } catch (e) {}
            resolve(results);
          };
          req.onerror = () => resolve(getFallbackRegistrations());
        });
      }
    } catch (e) {}
    return getFallbackRegistrations();
  }

  function getFallbackRegistrations() {
    try {
      const data = localStorage.getItem('bayan_leads_db');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  async function getExistingRegistration() {
    const list = await getStoredRegistrations();
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async function saveLeadLocally(record) {
    // 1. الحفظ في قاعدة بيانات IndexedDB
    try {
      const db = await openBayanDatabase();
      if (db) {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(record);
      }
    } catch (e) {
      console.error('Error saving to IndexedDB:', e);
    }

    // 2. نسخة احتياطية إضافية في localStorage لضمان الأمان المضاعف
    try {
      const currentList = getFallbackRegistrations();
      if (!currentList.some(r => r.cleanPhone === record.cleanPhone)) {
        currentList.push(record);
      }
      localStorage.setItem('bayan_leads_db', JSON.stringify(currentList));
      localStorage.setItem('bayan_registered_lead', JSON.stringify(record));
    } catch (e) {}
  }

  // دالة الإرسال إلى Google Sheets
  async function sendLeadToGoogleSheets(lead) {
    const webhookUrl = window.BAYAN_GOOGLE_SHEET_WEBHOOK_URL;
    
    // إذا لم يكن الرابط موجوداً بعد، نحفظه في طابور محلي للإرسال التلقائي لاحقاً
    if (!webhookUrl) {
      console.log('Google Sheet URL not configured yet. Lead saved in local queue:', lead);
      return;
    }

    const payload = {
      timestamp: lead.registeredAtFormatted,
      fullName: lead.fullName,
      storeName: lead.storeName,
      businessField: lead.businessField,
      country: lead.country,
      phone: lead.fullPhoneFormatted,
      platform: lead.platform,
      ip: '',
      userAgent: lead.userAgent
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors', // لضمان العمل مع Google Apps Script بدون مشاكل CORS
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Failed to send to Google Sheet webhook:', err);
    }
  }
}
