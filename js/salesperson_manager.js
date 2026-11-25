/**
 * =========================================================================
 * 🏷️ نظام إدارة السيلز (البائعين) وتقرير مبيعات السيلز - بَيَان POS فاشون
 * =========================================================================
 * يتيح للكاشير اختيار اسم موظف المبيعات (السيلز) على كل فاتورة بيع
 * بدون الحاجة لإنشاء حساب دخول أو كلمة مرور لكل موظف سيلز،
 * مع تقرير شهري/يومي دقيق لإجمالي مبيعات وعدد فواتير كل سيلز.
 * =========================================================================
 */

(function initSalespersonManager() {
    if (typeof window === 'undefined') return;

    const STORAGE_KEY = 'bayan_salespeople_list';
    const COMM_STORAGE_KEY = 'bayan_salespeople_comm_pct';

    function getSavedCommPct() {
        try {
            const raw = typeof getStore === 'function' ? getStore(COMM_STORAGE_KEY) : localStorage.getItem(COMM_STORAGE_KEY);
            const v = parseFloat(raw);
            return Number.isFinite(v) && v >= 0 ? v : 0;
        } catch (e) { return 0; }
    }

    function saveCommPct(val) {
        const clean = Number.isFinite(val) && val >= 0 ? val : 0;
        try {
            if (typeof setStore === 'function') setStore(COMM_STORAGE_KEY, String(clean));
            else localStorage.setItem(COMM_STORAGE_KEY, String(clean));
        } catch (e) { }
    }

    function safeGetList() {
        try {
            const raw = typeof getStore === 'function'
                ? getStore(STORAGE_KEY)
                : localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter(Boolean).map(s => String(s).trim()).filter(Boolean) : [];
        } catch (e) {
            return [];
        }
    }

    function safeSaveList(list) {
        const clean = [...new Set(list.map(s => String(s || '').trim()).filter(Boolean))];
        try {
            if (typeof setStore === 'function') {
                setStore(STORAGE_KEY, JSON.stringify(clean));
            } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
            }
        } catch (e) {
            console.error('[Salesperson] Failed to save list:', e);
        }
        return clean;
    }

    // دمج الأسماء المحفوظة مع أسماء الموظفين المسجلين في النظام (إن وجدوا)
    window.getAllSalespeople = function () {
        const saved = safeGetList();
        const fromEmployees = [];
        try {
            if (Array.isArray(window.employees)) {
                window.employees.forEach(emp => {
                    const n = emp && (emp.name || emp.fullName);
                    if (n && String(n).trim()) fromEmployees.push(String(n).trim());
                });
            }
        } catch (e) { }
        return [...new Set([...saved, ...fromEmployees])];
    };

    // تحديث القائمة المنسدلة (تفتح لأعلى Drop-Up) في شاشة البيع (POS)
    window.refreshPosSalespersonDropdown = function (selectedValue) {
        const inp = document.getElementById('posSalesperson');
        const lbl = document.getElementById('posSalespersonLabel');
        const menu = document.getElementById('posSalespersonDropUpMenu');
        if (!inp) return;

        const currentVal = selectedValue !== undefined ? String(selectedValue || '').trim() : String(inp.value || '').trim();
        inp.value = currentVal;

        if (lbl) {
            lbl.textContent = currentVal ? `🏷️ ${currentVal}` : '🏷️ السيلز: بدون';
        }

        if (menu) {
            const list = window.getAllSalespeople();
            if (currentVal && !list.includes(currentVal)) list.unshift(currentVal);

            const items = [
                { val: '', label: '⚪ بدون سيلز' },
                ...list.map(n => ({ val: n, label: `🏷️ ${n}` }))
            ];

            menu.innerHTML = items.map(it => {
                const isSel = it.val === currentVal;
                const safeVal = it.val.replace(/&/g, '&amp;').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const safeLbl = it.label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `
                    <button type="button" onclick="window.selectPosSalesperson('${safeVal}')"
                        style="width:100%; text-align:right; padding:8px 10px; border:none; border-radius:8px; margin-bottom:2px; cursor:pointer; font-family:inherit; font-size:0.84rem; font-weight:${isSel ? '900' : '800'}; background:${isSel ? '#d1fae5' : 'transparent'}; color:${isSel ? '#065f46' : '#0f172a'}; display:flex; align-items:center; justify-content:space-between;"
                        onmouseover="if(!${isSel})this.style.background='#f1f5f9'" onmouseout="if(!${isSel})this.style.background='transparent'">
                        <span>${safeLbl}</span>
                        ${isSel ? '<span style="color:#059669;">✓</span>' : ''}
                    </button>`;
            }).join('');
        }
    };

    window.selectPosSalesperson = function (val) {
        window.refreshPosSalespersonDropdown(val);
        const menu = document.getElementById('posSalespersonDropUpMenu');
        if (menu) menu.style.display = 'none';
    };

    window.togglePosSalespersonDropUp = function (e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('posSalespersonDropUpMenu');
        if (!menu) return;
        const isOpen = menu.style.display === 'block';
        if (!isOpen) {
            window.refreshPosSalespersonDropdown();
            menu.style.display = 'block';
        } else {
            menu.style.display = 'none';
        }
    };

    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('posSalespersonDropUpWrap');
        const menu = document.getElementById('posSalespersonDropUpMenu');
        if (menu && menu.style.display === 'block' && wrap && !wrap.contains(e.target)) {
            menu.style.display = 'none';
        }
    });

    // نافذة سريعة لإدارة أسماء السيلز (إضافة / حذف في ثانية واحدة)
    window.openSalespersonQuickManageModal = function () {
        const old = document.getElementById('bayanSalespersonManageOverlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'bayanSalespersonManageOverlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(2,18,14,0.72); backdrop-filter:blur(6px); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:16px; direction:rtl; font-family:Cairo,sans-serif;';

        function renderInner() {
            const saved = safeGetList();
            const listHtml = saved.length === 0
                ? '<div style="text-align:center; padding:22px; color:#64748b; font-weight:700; font-size:0.88rem;">لا توجد أسماء سيلز مضافة بعد — أضف أول اسم بالأعلى 👆</div>'
                : saved.map((name, i) => {
                    const safe = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    return `
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:8px;">
                            <span style="font-weight:800; color:#0f172a; font-size:0.92rem;">🏷️ ${safe}</span>
                            <button type="button" data-del-idx="${i}" style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; border-radius:8px; padding:4px 10px; font-weight:800; font-size:0.78rem; cursor:pointer; font-family:inherit;">حذف</button>
                        </div>`;
                }).join('');

            overlay.innerHTML = `
                <div style="background:#ffffff; width:430px; max-width:95vw; border-radius:22px; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,0.38); border:1.5px solid #a7f3d0;">
                    <div style="background:linear-gradient(135deg,#064e3b,#047857); padding:16px 20px; display:flex; align-items:center; justify-content:space-between; color:#ffffff;">
                        <div>
                            <div style="font-weight:900; font-size:1.05rem;">🏷️ إدارة أسماء السيلز (البائعين)</div>
                            <div style="font-size:0.75rem; color:#a7f3d0; font-weight:700;">بدون حسابات دخول أو كلمات مرور</div>
                        </div>
                        <button type="button" id="closeSpManageBtn" style="background:rgba(255,255,255,0.16); color:#fff; border:none; width:32px; height:32px; border-radius:10px; font-weight:900; cursor:pointer; font-size:1rem;">✕</button>
                    </div>
                    <div style="padding:18px 20px;">
                        <div style="display:flex; gap:8px; margin-bottom:14px;">
                            <input type="text" id="newSalespersonNameInput" placeholder="اكتب اسم السيلز (مثلاً: أحمد / سارة)..." style="flex:1; height:40px; padding:0 12px; border:1.5px solid #10b981; border-radius:10px; font-weight:800; font-family:inherit; font-size:0.9rem; outline:none;">
                            <button type="button" id="addSpSubmitBtn" style="background:linear-gradient(135deg,#10b981,#059669); color:#fff; border:none; border-radius:10px; padding:0 16px; font-weight:900; cursor:pointer; font-family:inherit; font-size:0.88rem;">+ إضافة</button>
                        </div>
                        <div style="max-height:240px; overflow-y:auto;">${listHtml}</div>
                    </div>
                </div>`;

            overlay.querySelector('#closeSpManageBtn').onclick = () => overlay.remove();
            const inp = overlay.querySelector('#newSalespersonNameInput');
            const addBtn = overlay.querySelector('#addSpSubmitBtn');

            const doAdd = () => {
                const val = (inp.value || '').trim();
                if (!val) return;
                const next = safeSaveList([...safeGetList(), val]);
                window.refreshPosSalespersonDropdown(val);
                renderInner();
                if (typeof showToast === 'function') showToast(`✅ تم إضافة السيلز "${val}" بنجاح`, 'success');
            };

            addBtn.onclick = doAdd;
            inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } };
            setTimeout(() => inp.focus(), 50);

            overlay.querySelectorAll('[data-del-idx]').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.getAttribute('data-del-idx'), 10);
                    const cur = safeGetList();
                    const removed = cur.splice(idx, 1)[0];
                    safeSaveList(cur);
                    window.refreshPosSalespersonDropdown('');
                    renderInner();
                    if (typeof showToast === 'function') showToast(`🗑️ تم حذف "${removed}" من قائمة السيلز`, 'info');
                };
            });
        }

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        renderInner();
    };

    // =========================================================================
    // 📊 نافذة تقرير مبيعات السيلز (البائعين) — يومي / أسبوعي / شهري / مخصص
    // =========================================================================
    window.openSalespersonReportModal = function () {
        const old = document.getElementById('bayanSalespersonReportOverlay');
        if (old) old.remove();

        const today = new Date().toISOString().split('T')[0];
        const firstOfMonth = today.slice(0, 8) + '01';

        const overlay = document.createElement('div');
        overlay.id = 'bayanSalespersonReportOverlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(2,18,14,0.78); backdrop-filter:blur(7px); z-index:9999998; display:flex; align-items:center; justify-content:center; padding:18px; direction:rtl; font-family:Cairo,sans-serif;';

        overlay.innerHTML = `
            <div style="background:#ffffff; width:860px; max-width:96vw; max-height:92vh; border-radius:24px; overflow:hidden; box-shadow:0 28px 70px rgba(0,0,0,0.45); border:1.5px solid #a7f3d0; display:flex; flex-direction:column;">
                <div style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#047857 100%); padding:18px 24px; display:flex; align-items:center; justify-content:space-between; color:#ffffff; flex-shrink:0;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:44px; height:44px; border-radius:14px; background:rgba(255,255,255,0.16); display:flex; align-items:center; justify-content:center; font-size:1.5rem;">🏷️</div>
                        <div>
                            <div style="font-weight:900; font-size:1.2rem;">تقرير مبيعات السيلز (البائعين)</div>
                            <div style="font-size:0.78rem; color:#a7f3d0; font-weight:700;">إجمالي مبيعات وعدد فواتير كل موظف سيلز لحساب التارجت والعمولات</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button type="button" id="spRepManageBtn" style="background:rgba(255,255,255,0.16); color:#fff; border:1px solid rgba(255,255,255,0.28); border-radius:10px; padding:7px 12px; font-weight:800; font-size:0.8rem; cursor:pointer; font-family:inherit;">⚙️ إدارة الأسماء</button>
                        <button type="button" id="spRepPrintBtn" style="background:#fbbf24; color:#0f172a; border:none; border-radius:10px; padding:7px 14px; font-weight:900; font-size:0.82rem; cursor:pointer; font-family:inherit;">🖨️ طباعة</button>
                        <button type="button" id="spRepCloseBtn" style="background:rgba(255,255,255,0.16); color:#fff; border:none; width:34px; height:34px; border-radius:10px; font-weight:900; cursor:pointer; font-size:1rem;">✕</button>
                    </div>
                </div>

                <div style="padding:14px 24px; background:#f0fdf4; border-bottom:1px solid #bbf7d0; display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; flex-shrink:0;">
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <label style="font-weight:800; font-size:0.82rem; color:#065f46;">من:</label>
                        <input type="date" id="spRepFrom" value="${firstOfMonth}" style="height:36px; padding:0 10px; border:1.5px solid #34d399; border-radius:10px; font-weight:800; font-family:inherit;">
                        <label style="font-weight:800; font-size:0.82rem; color:#065f46;">إلى:</label>
                        <input type="date" id="spRepTo" value="${today}" style="height:36px; padding:0 10px; border:1.5px solid #34d399; border-radius:10px; font-weight:800; font-family:inherit;">
                        <label style="font-weight:800; font-size:0.82rem; color:#065f46; margin-right:4px;">العمولة %:</label>
                        <input type="number" id="spRepCommPct" min="0" max="100" step="0.5" value="${getSavedCommPct()}" style="width:72px; height:36px; padding:0 8px; border:1.5px solid #f59e0b; border-radius:10px; font-weight:900; font-family:inherit; text-align:center; color:#b45309; background:#fffbeb;">
                        <button type="button" id="spRepApplyBtn" style="background:#059669; color:#fff; border:none; border-radius:10px; height:36px; padding:0 16px; font-weight:900; cursor:pointer; font-family:inherit; font-size:0.84rem;">🔍 عرض</button>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" class="sp-quick-range" data-range="today" style="background:#fff; color:#065f46; border:1px solid #a7f3d0; border-radius:8px; padding:5px 10px; font-weight:800; font-size:0.76rem; cursor:pointer; font-family:inherit;">اليوم</button>
                        <button type="button" class="sp-quick-range" data-range="month" style="background:#059669; color:#fff; border:1px solid #059669; border-radius:8px; padding:5px 10px; font-weight:800; font-size:0.76rem; cursor:pointer; font-family:inherit;">هذا الشهر</button>
                        <button type="button" class="sp-quick-range" data-range="all" style="background:#fff; color:#065f46; border:1px solid #a7f3d0; border-radius:8px; padding:5px 10px; font-weight:800; font-size:0.76rem; cursor:pointer; font-family:inherit;">الكل</button>
                    </div>
                </div>

                <div id="spRepBody" style="padding:18px 24px; overflow-y:auto; flex:1;"></div>
            </div>`;

        document.body.appendChild(overlay);

        function computeAndRender() {
            const fromVal = overlay.querySelector('#spRepFrom').value || '';
            const toVal = overlay.querySelector('#spRepTo').value || '';
            const commPct = Math.max(0, parseFloat(overlay.querySelector('#spRepCommPct')?.value) || 0);
            saveCommPct(commPct);
            const txs = Array.isArray(window.transactions) ? window.transactions : [];

            // تجميع حسب الفاتورة أولاً لمنع تكرار الإجمالي عند تعدد الأصناف في نفس الفاتورة
            const invoicesMap = new Map();
            txs.forEach(t => {
                if (!t || !t.type || !String(t.type).includes('بيع')) return;
                if (String(t.type).includes('مرتجع')) return;
                const dISO = String(t.dateISO || (t.date ? String(t.date).split(' ')[0] : '')).slice(0, 10);
                if (fromVal && dISO && dISO < fromVal) return;
                if (toVal && dISO && dISO > toVal) return;

                const invKey = String(t.invoiceId || t.id || Math.random());
                const spName = (t.salesperson && String(t.salesperson).trim()) ? String(t.salesperson).trim() : 'غير محدد (بدون سيلز)';
                const lineTotal = parseFloat(t.total) || 0;
                const lineQty = parseFloat(t.qty) || 0;

                if (!invoicesMap.has(invKey)) {
                    invoicesMap.set(invKey, {
                        invoiceId: t.invoiceId || '-',
                        date: dISO || (t.date || '-'),
                        partner: t.partner || 'عميل نقدي',
                        salesperson: spName,
                        total: lineTotal,
                        qty: lineQty
                    });
                } else {
                    const entry = invoicesMap.get(invKey);
                    entry.total += lineTotal;
                    entry.qty += lineQty;
                    if (entry.salesperson === 'غير محدد (بدون سيلز)' && spName !== 'غير محدد (بدون سيلز)') {
                        entry.salesperson = spName;
                    }
                }
            });

            // تجميع حسب السيلز مع الاحتفاظ بقائمة فواتير كل سيلز
            const spStats = new Map();
            let grandTotal = 0;
            let grandInvoices = 0;
            let grandCommission = 0;

            invoicesMap.forEach(inv => {
                grandTotal += inv.total;
                grandInvoices += 1;
                if (!spStats.has(inv.salesperson)) {
                    spStats.set(inv.salesperson, { name: inv.salesperson, invoices: 0, qty: 0, total: 0, list: [] });
                }
                const st = spStats.get(inv.salesperson);
                st.invoices += 1;
                st.qty += inv.qty;
                st.total += inv.total;
                st.list.push(inv);
            });

            const rows = Array.from(spStats.values()).sort((a, b) => b.total - a.total);
            rows.forEach(r => {
                const isUnassigned = r.name === 'غير محدد (بدون سيلز)';
                r.commission = isUnassigned ? 0 : (r.total * commPct) / 100;
                grandCommission += r.commission;
            });
            const topSp = rows.find(r => r.name !== 'غير محدد (بدون سيلز)') || rows[0];

            const summaryHtml = `
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin-bottom:18px;">
                    <div style="background:#ecfdf5; border:1.5px solid #a7f3d0; border-radius:16px; padding:14px 16px;">
                        <div style="font-size:0.76rem; color:#065f46; font-weight:800;">💰 إجمالي مبيعات الفترة</div>
                        <div style="font-size:1.25rem; font-weight:900; color:#047857; margin-top:4px;">${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</div>
                    </div>
                    <div style="background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:16px; padding:14px 16px;">
                        <div style="font-size:0.76rem; color:#1e40af; font-weight:800;">🧾 إجمالي الفواتير</div>
                        <div style="font-size:1.25rem; font-weight:900; color:#1d4ed8; margin-top:4px;">${grandInvoices} فاتورة</div>
                    </div>
                    <div style="background:#fffbeb; border:1.5px solid #fde68a; border-radius:16px; padding:14px 16px;">
                        <div style="font-size:0.76rem; color:#92400e; font-weight:800;">💸 إجمالي العمولات (${commPct}%)</div>
                        <div style="font-size:1.25rem; font-weight:900; color:#b45309; margin-top:4px;">${grandCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</div>
                    </div>
                    <div style="background:#fefce8; border:1.5px solid #fde047; border-radius:16px; padding:14px 16px;">
                        <div style="font-size:0.76rem; color:#854d0e; font-weight:800;">🏆 الأعلى مبيعاً</div>
                        <div style="font-size:0.98rem; font-weight:900; color:#a16207; margin-top:6px;">${topSp ? `${topSp.name} (${topSp.total.toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م)` : 'لا توجد بيانات'}</div>
                    </div>
                </div>`;

            const tableRows = rows.length === 0
                ? '<tr><td colspan="7" style="text-align:center; padding:32px; color:#64748b; font-weight:800;">لا توجد مبيعات مسجلة في هذه الفترة</td></tr>'
                : rows.map((r, i) => {
                    const pct = grandTotal > 0 ? ((r.total / grandTotal) * 100).toFixed(1) : '0.0';
                    const safeName = r.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const isUnassigned = r.name === 'غير محدد (بدون سيلز)';
                    return `
                        <tr style="border-bottom:1px solid #e2e8f0; background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                            <td style="padding:12px; font-weight:900; color:#475569; text-align:center;">${i + 1}</td>
                            <td style="padding:12px; font-weight:900;">
                                <button type="button" class="sp-open-details-btn" data-sp-idx="${i}" title="اضغط لعرض فواتير هذا السيلز بالتفصيل"
                                    style="background:none; border:none; padding:0; cursor:pointer; font-family:inherit; font-weight:900; font-size:0.9rem; color:${isUnassigned ? '#64748b' : '#065f46'}; text-decoration:underline; text-underline-offset:3px;">
                                    ${isUnassigned ? '⚪' : '🏷️'} ${safeName}
                                </button>
                            </td>
                            <td style="padding:12px; font-weight:800; text-align:center; color:#1e40af;">${r.invoices}</td>
                            <td style="padding:12px; font-weight:800; text-align:center; color:#0f172a;">${r.qty}</td>
                            <td style="padding:12px; font-weight:900; text-align:center; color:#047857;">${r.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</td>
                            <td style="padding:12px; font-weight:900; text-align:center; color:#b45309;">${r.commission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</td>
                            <td style="padding:12px; text-align:center;">
                                <span style="background:#dcfce7; color:#166534; padding:3px 10px; border-radius:999px; font-weight:900; font-size:0.78rem;">${pct}%</span>
                            </td>
                        </tr>`;
                }).join('');

            overlay.querySelector('#spRepBody').innerHTML = `
                ${summaryHtml}
                <div style="font-size:0.78rem; color:#475569; font-weight:700; margin-bottom:8px;">💡 اضغط على اسم أي سيلز في الجدول لعرض كشف فواتيره بالتفصيل:</div>
                <div style="border:1.5px solid #e2e8f0; border-radius:16px; overflow:hidden;">
                    <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                        <thead>
                            <tr style="background:#064e3b; color:#ffffff;">
                                <th style="padding:12px; text-align:center; width:46px;">#</th>
                                <th style="padding:12px; text-align:right;">اسم السيلز (البائع)</th>
                                <th style="padding:12px; text-align:center;">الفواتير</th>
                                <th style="padding:12px; text-align:center;">القطع</th>
                                <th style="padding:12px; text-align:center;">إجمالي المبيعات</th>
                                <th style="padding:12px; text-align:center;">العمولة (${commPct}%)</th>
                                <th style="padding:12px; text-align:center;">النسبة</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>`;

            // ربط الضغط على اسم السيلز لفتح كشف فواتيره بالتفصيل
            overlay.querySelectorAll('.sp-open-details-btn').forEach(btn => {
                btn.onclick = () => {
                    const row = rows[parseInt(btn.getAttribute('data-sp-idx'), 10)];
                    if (!row) return;
                    openSalespersonInvoicesDetailModal(row, commPct);
                };
            });
        }

        function openSalespersonInvoicesDetailModal(spRow, commPct) {
            const oldDet = document.getElementById('bayanSpInvoicesDetailOverlay');
            if (oldDet) oldDet.remove();
            const safeName = spRow.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const det = document.createElement('div');
            det.id = 'bayanSpInvoicesDetailOverlay';
            det.style.cssText = 'position:fixed; inset:0; background:rgba(2,18,14,0.8); backdrop-filter:blur(5px); z-index:9999999; display:flex; align-items:center; justify-content:center; padding:16px; direction:rtl; font-family:Cairo,sans-serif;';
            const invRows = spRow.list.map((inv, idx) => `
                <tr style="border-bottom:1px solid #e2e8f0; background:${idx % 2 === 0 ? '#fff' : '#f8fafc'};">
                    <td style="padding:10px; text-align:center; font-weight:800;">#${inv.invoiceId}</td>
                    <td style="padding:10px; text-align:center; font-weight:700; color:#475569;">${inv.date}</td>
                    <td style="padding:10px; font-weight:800; color:#0f172a;">${String(inv.partner).replace(/</g, '&lt;')}</td>
                    <td style="padding:10px; text-align:center; font-weight:800;">${inv.qty}</td>
                    <td style="padding:10px; text-align:center; font-weight:900; color:#047857;">${inv.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</td>
                </tr>`).join('');

            det.innerHTML = `
                <div style="background:#fff; width:680px; max-width:95vw; max-height:85vh; border-radius:20px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 24px 60px rgba(0,0,0,0.45); border:1.5px solid #a7f3d0;">
                    <div style="background:linear-gradient(135deg,#064e3b,#047857); padding:15px 20px; color:#fff; display:flex; align-items:center; justify-content:space-between;">
                        <div>
                            <div style="font-weight:900; font-size:1.05rem;">🧾 كشف فواتير السيلز: ${safeName}</div>
                            <div style="font-size:0.78rem; color:#a7f3d0; font-weight:700;">${spRow.invoices} فاتورة • إجمالي ${spRow.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م • عمولة (${commPct}%): ${spRow.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</div>
                        </div>
                        <button type="button" id="closeSpDetBtn" style="background:rgba(255,255,255,0.18); color:#fff; border:none; width:32px; height:32px; border-radius:10px; font-weight:900; cursor:pointer;">✕</button>
                    </div>
                    <div style="padding:16px 20px; overflow-y:auto; flex:1;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.86rem;">
                            <thead>
                                <tr style="background:#f1f5f9; color:#0f172a;">
                                    <th style="padding:10px; text-align:center;">رقم الفاتورة</th>
                                    <th style="padding:10px; text-align:center;">التاريخ</th>
                                    <th style="padding:10px; text-align:right;">العميل</th>
                                    <th style="padding:10px; text-align:center;">القطع</th>
                                    <th style="padding:10px; text-align:center;">الإجمالي</th>
                                </tr>
                            </thead>
                            <tbody>${invRows}</tbody>
                        </table>
                    </div>
                </div>`;
            det.querySelector('#closeSpDetBtn').onclick = () => det.remove();
            det.addEventListener('click', (e) => { if (e.target === det) det.remove(); });
            document.body.appendChild(det);
        }

        overlay.querySelector('#spRepCloseBtn').onclick = () => overlay.remove();
        overlay.querySelector('#spRepApplyBtn').onclick = computeAndRender;
        overlay.querySelector('#spRepCommPct').oninput = computeAndRender;
        overlay.querySelector('#spRepManageBtn').onclick = () => window.openSalespersonQuickManageModal();
        overlay.querySelector('#spRepPrintBtn').onclick = () => {
            const fromVal = overlay.querySelector('#spRepFrom').value || 'الكل';
            const toVal = overlay.querySelector('#spRepTo').value || 'الكل';
            const content = overlay.querySelector('#spRepBody').innerHTML;
            const win = window.open('', '_blank', 'width=900,height=700');
            if (!win) return;
            win.document.write(`<html dir="rtl" lang="ar"><head><title>تقرير مبيعات السيلز</title><style>body{font-family:Cairo,Segoe UI,sans-serif;padding:24px;color:#0f172a;}h2{margin:0 0 6px;color:#064e3b;}p{margin:0 0 18px;color:#475569;font-weight:700;}</style></head><body><h2>🏷️ تقرير مبيعات السيلز (البائعين)</h2><p>الفترة من: ${fromVal} إلى: ${toVal}</p>${content}</body></html>`);
            win.document.close();
            setTimeout(() => { win.print(); }, 250);
        };

        overlay.querySelectorAll('.sp-quick-range').forEach(btn => {
            btn.onclick = () => {
                const r = btn.getAttribute('data-range');
                if (r === 'today') {
                    overlay.querySelector('#spRepFrom').value = today;
                    overlay.querySelector('#spRepTo').value = today;
                } else if (r === 'month') {
                    overlay.querySelector('#spRepFrom').value = firstOfMonth;
                    overlay.querySelector('#spRepTo').value = today;
                } else {
                    overlay.querySelector('#spRepFrom').value = '';
                    overlay.querySelector('#spRepTo').value = '';
                }
                computeAndRender();
            };
        });

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        computeAndRender();
    };

    // تهيئة تلقائية عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.refreshPosSalespersonDropdown());
    } else {
        setTimeout(() => window.refreshPosSalespersonDropdown(), 100);
    }
})();
