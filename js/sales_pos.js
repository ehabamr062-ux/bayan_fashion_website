// ============================================================
//  شاشة ونقاط البيع، الكاشير، وحساب الفواتير (POS & Cashier Engine)
// ============================================================
function handleGeneralAccountSearch(query, inputId, resultsId) {

    const resultsDiv = document.getElementById(resultsId);

    resultsDiv.innerHTML = '';

    // إظهار/إخفاء زر الحذف (X)

    const clearBtn = document.getElementById(inputId + 'Clear');

    if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';

    if (!query) {

        resultsDiv.style.display = 'none';

        // تصفير الرصيد عند مسح الاسم

        const balId = (inputId === 'receiptCustomer') ? 'receiptAccountBalance' : 'disburseAccountBalance';

        const balEl = document.getElementById(balId);

        if (balEl) balEl.innerText = '0.00';

        return;

    }

    // البحث بالاسم أو الكود
    const queryLower = query.toLowerCase();
    const filtered = accounts.filter(a => (a.name && a.name.toLowerCase().includes(queryLower)) || (a.code && a.code.toString().includes(query)));

    // إذا تم كتابة اسم حساب مطابق تماماً، يتم حديث الرصيد فوراً
    const exactMatch = accounts.find(a => a.name.trim().toLowerCase() === query.trim().toLowerCase());
    if (exactMatch && (inputId === 'receiptCustomer' || inputId === 'disbursePayee')) {
        const bal = typeof getAccountBalance === 'function' ? getAccountBalance(exactMatch.name) : (exactMatch.balance || 0);
        const formattedBal = (bal < 0 ? '-' : '') + Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 2 });
        const balId = (inputId === 'receiptCustomer') ? 'receiptAccountBalance' : 'disburseAccountBalance';
        const balEl = document.getElementById(balId);
        if (balEl) balEl.innerText = formattedBal;
    }

    if (filtered.length > 0) {

        resultsDiv.style.display = 'block';

        filtered.slice(0, 40).forEach(a => {

            const div = document.createElement('div');

            div.className = 'result-item';

            const safeName = (typeof escapeHtml === 'function') ? escapeHtml(a.name) : a.name;
            div.innerHTML = `<span>${safeName}</span> <span class="stock-badge">${a.type === 'client' ? 'عميل' : (a.type === 'supplier' ? 'مورد' : a.type)}</span>`;

            div.onclick = () => {

                document.getElementById(inputId).value = a.name;

                resultsDiv.style.display = 'none';

                // إظهار زر X للمسح

                if (clearBtn) clearBtn.style.display = 'block';

                // تحديث الرصيد للمعلومات فقط

                if (inputId === 'receiptCustomer' || inputId === 'disbursePayee') {
                    const bal = typeof getAccountBalance === 'function' ? getAccountBalance(a.name) : (a.balance || 0);
                    const formattedBal = (bal < 0 ? '-' : '') + Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 2 });
                    const balId = (inputId === 'receiptCustomer') ? 'receiptAccountBalance' : 'disburseAccountBalance';
                    const balEl = document.getElementById(balId);
                    if (balEl) balEl.innerText = formattedBal;
                }

            };

            resultsDiv.appendChild(div);

        });

    } else {

        // خيار الإضافة السريعة مع حماية تامة ضد XSS
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '';

        const safeQuery = (typeof escapeHtml === 'function') ? escapeHtml(query) : query;
        const quickItem = document.createElement('div');
        quickItem.className = 'result-item';
        quickItem.style.cssText = 'color:var(--main-green); font-weight:bold; justify-content:center; cursor:pointer;';
        quickItem.innerHTML = `<span>➕ إضافة سريع: ${safeQuery}</span>`;
        quickItem.onclick = () => quickAddAccount(query);
        resultsDiv.appendChild(quickItem);

    }

}

function clearAccountSearch(inputId, balanceId) {

    const input = document.getElementById(inputId);

    if (input) {

        input.value = '';

        input.focus();

    }

    if (document.getElementById(balanceId)) document.getElementById(balanceId).innerText = '0.00';

    if (document.getElementById(inputId + 'Clear')) document.getElementById(inputId + 'Clear').style.display = 'none';

    const resultsId = (inputId === 'receiptCustomer') ? 'receiptSearchResults' : 'disburseSearchResults';

    const resultsDiv = document.getElementById(resultsId);

    if (resultsDiv) {

        resultsDiv.innerHTML = '';

        resultsDiv.style.display = 'none';

    }

}

async function handleCustomerSearch(query) {

    const resultsDiv = document.getElementById('customerSearchResults');

    resultsDiv.innerHTML = '';

    if (!query) { resultsDiv.style.display = 'none'; return; }

    // البحث بالاسم أو الكود مباشرة في المصفوفة المحلية لسرعة الاستجابة
    const queryLower = (query || '').toLowerCase();
    const combined = (window.BayanInvoiceEngine && typeof BayanInvoiceEngine.searchAccounts === 'function')
        ? BayanInvoiceEngine.searchAccounts(query, 'client')
        : accounts.filter(a =>
            (a.name && a.name.toLowerCase().includes(queryLower)) ||
            (a.code && a.code.toString().includes(queryLower)) ||
            (a.mobile && a.mobile.includes(queryLower))
        );

    if (combined.length > 0) {

        resultsDiv.style.display = 'block';

        combined.slice(0, 40).forEach(a => {

            const div = document.createElement('div');

            div.className = 'result-item';

            const safeName = (typeof escapeHtml === 'function') ? escapeHtml(a.name) : a.name;
            div.innerHTML = `<span>${safeName}</span> <span class="stock-badge">${a.type === 'client' ? 'عميل' : (a.type === 'mixed' ? 'مشترك' : 'حساب')}</span>`;

            div.onclick = () => {

                document.getElementById('customerName').value = a.name;

                resultsDiv.style.display = 'none';

                // تحديث مستوى السعر تلقائياً بناءً على بيانات العميل (فقط إذا لم يكن مثبتاً بالدبوس 📌)
                if (typeof isPriceLevelPinned === 'function' && !isPriceLevelPinned()) {
                    if (a.priceLevel === 'wholesale') {
                        const pl = document.getElementById('salesPriceLevel');
                        if (pl) {
                            pl.value = 'wholesale';
                            updateCartPriceLevel();
                        }
                    } else {
                        const pl = document.getElementById('salesPriceLevel');
                        if (pl) {
                            pl.value = 'retail';
                            updateCartPriceLevel();
                        }
                    }
                }

                updateHeaderPartnerInfo();

                // تحديث المتغير العالمي عند اختيار العميل

                currentSessionSelectedAddress = (a.address || '').split(/[|,]/)[0];

                if (typeof calculateChange === 'function') calculateChange();

                if (typeof checkAccountFrozenAndAlert === 'function') {
                    checkAccountFrozenAndAlert(a);
                }

            };

            resultsDiv.appendChild(div);

        });

    } else {

        // خيار إضافة عميل جديد مع حماية تامة ضد XSS
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '';

        const safeQuery = (typeof escapeHtml === 'function') ? escapeHtml(query) : query;
        const quickItem = document.createElement('div');
        quickItem.className = 'result-item';
        quickItem.style.cssText = 'color:var(--main-green); font-weight:bold; justify-content:center; cursor:pointer;';
        quickItem.innerHTML = `<span>➕ إضافة عميل جديد: ${safeQuery}</span>`;
        quickItem.onclick = () => quickAddAccount(query);
        resultsDiv.appendChild(quickItem);

    }

}

function quickAddAccount(name) {

    openNewAccountModal();

    document.getElementById('accName').value = name;

    // إخفاء قوائم البحث المفتوحة

    document.querySelectorAll('.search-results').forEach(el => el.style.display = 'none');

}

// ================= تحديث شارات وبيانات شريك الفاتورة في الهيدر =================
function updateSalesHeaderPartnerInfo() {
    const sPB = document.getElementById('salesPartnerBadge');
    const sCode = document.getElementById('customerCodeDisplay');
    const sBalance = document.getElementById('customerBalanceDisplay');

    if (sPB && document.getElementById('customerName')) {
        const name = document.getElementById('customerName').value || '---';
        sPB.innerText = '👤 عميل: ' + name;

        const acc = (typeof accounts !== 'undefined' && Array.isArray(accounts)) ? accounts.find(a => a.name === name) : null;
        if (acc) {
            if (sCode) sCode.innerText = acc.code || '---';
            if (sBalance) {
                const bal = typeof getAccountBalance === 'function' ? getAccountBalance(name) : (acc.balance || 0);
                sBalance.innerText = bal.toFixed(2);

                let priorBal = bal;
                let activeSalesInvId = null;
                if (window.editingInvoiceId) {
                    activeSalesInvId = String(window.editingInvoiceId).trim();
                } else if (window._posCurrentNavState && window._posCurrentNavState.invoiceId) {
                    activeSalesInvId = String(window._posCurrentNavState.invoiceId).trim();
                } else if (typeof tabStates !== 'undefined' && typeof activeTabId !== 'undefined' && tabStates[activeTabId] && tabStates[activeTabId].viewingInvoiceId) {
                    activeSalesInvId = String(tabStates[activeTabId].viewingInvoiceId).trim();
                }

                if (activeSalesInvId && typeof window.isGenericCashPartner === 'function' && !window.isGenericCashPartner(name)) {
                    const allTx = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : (window.transactions || []);
                    const headTx = allTx.find(t => String(t.invoiceId) === String(activeSalesInvId) && (t.isInvoiceHead || (t.type && (t.type.includes('بيع') || t.type.includes('مبيعات')))));
                    if (headTx && headTx.prevBalance !== undefined && headTx.prevBalance !== null && !isNaN(parseFloat(headTx.prevBalance))) {
                        priorBal = parseFloat(headTx.prevBalance);
                    } else if (typeof getHistoricalPartnerBalance === 'function') {
                        priorBal = getHistoricalPartnerBalance(name, activeSalesInvId);
                    } else if (typeof getAccountBalance === 'function') {
                        priorBal = getAccountBalance(name, activeSalesInvId);
                    }
                }

                if (document.getElementById('prevBalanceDisplay')) {
                    document.getElementById('prevBalanceDisplay').innerText = priorBal.toFixed(2);
                    if (priorBal < -0.001) {
                        document.getElementById('prevBalanceDisplay').style.color = '#dc2626';
                    } else {
                        document.getElementById('prevBalanceDisplay').style.color = '#000000';
                    }
                    document.getElementById('prevBalanceDisplay').style.fontWeight = '900';
                    if (typeof calculateTotals === 'function') calculateTotals();
                }

                sBalance.style.fontWeight = '900';
                sBalance.style.color = (bal > 0) ? '#15803d' : (bal < 0 ? '#dc2626' : '#000000');
                sBalance.parentElement.style.backgroundColor = (bal > 0) ? '#dcfce7' : (bal < 0 ? '#fee2e2' : '#fef2f2');
            }
        } else {
            if (sCode) sCode.innerText = '---';
            if (sBalance) {
                sBalance.innerText = '0.00';
                sBalance.style.color = '#000000';
                sBalance.style.fontWeight = '900';
                sBalance.parentElement.style.backgroundColor = '#fef2f2';
            }
            if (document.getElementById('prevBalanceDisplay')) {
                document.getElementById('prevBalanceDisplay').innerText = '0.00';
                document.getElementById('prevBalanceDisplay').style.color = '#000000';
                document.getElementById('prevBalanceDisplay').style.fontWeight = '900';
                if (typeof calculateTotals === 'function') calculateTotals();
            }
        }
    }
}
window.updateSalesHeaderPartnerInfo = updateSalesHeaderPartnerInfo;

function updateHeaderPartnerInfo() {
    updateSalesHeaderPartnerInfo();
    if (typeof window.updatePurchaseHeaderPartnerInfo === 'function') {
        window.updatePurchaseHeaderPartnerInfo();
    }
}
window.updateHeaderPartnerInfo = updateHeaderPartnerInfo;

// ================= نظام التنقل في البحث بالكيبورد =================

let searchSelectedIndex = -1;
let purchaseSearchSelectedIndex = -1;

let currentHeaderProductId = null; let currentHeaderUnit = null; // لتتبع الصنف المختار حالياً في الهيدر قبل الحفظ

// دالة لاختيار الصنف وتعبئة بياناته في الهيدر (المربعات الملونة) قبل الحفظ

async function selectProductToHeader(productId) {
    const product = (typeof productsDB !== 'undefined' && Array.isArray(productsDB))
        ? productsDB.find(p => p.id === productId || p.id == productId)
        : await db.products.get(productId);

    if (!product) return;

    // إذا كان الصنف تشكيلة فاشون بها مقاسات أو ألوان، نفتح نافذة المقاسات واللون فوراً لاختيارها أولاً
    const isVariantsActive = !document.body.classList.contains('bayan-variants-disabled') && (document.body.classList.contains('bayan-variants-enabled') || (product.variants && product.variants.length > 0));
    if (isVariantsActive && product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        const resultsDiv = document.getElementById('searchResults');
        if (resultsDiv) resultsDiv.style.display = 'none';
        if (typeof showVariantSelectionModal === 'function') {
            showVariantSelectionModal(product, 'sales');
            return;
        }
    }

    currentHeaderProductId = productId; // تخزين الـ ID الحالي
    window._pendingSalesVariant = null;

    const resultsDiv = document.getElementById('searchResults');
    const pSearch = document.getElementById('productSearch');
    const hQty = document.getElementById('headerQty');
    const hPrice = document.getElementById('headerPrice');

    // 1. كتابة اسم الصنف في مربع البحث

    if (pSearch) pSearch.value = product.name;

    // 2. تحديد السعر التلقائي بناءً على مستوى السعر

    if (hPrice) {

        const priceLevelSelect = document.getElementById('salesPriceLevel');

        const priceLevel = priceLevelSelect ? priceLevelSelect.value : 'retail';

        // البحث عن وحدة البيع الافتراضية إذا وُجدت

        let defaultPrice = product.price;

        if (product.units && product.units.length > 1) {

            const resultsDiv = document.getElementById('searchResults'); if (resultsDiv) resultsDiv.style.display = 'none';

            showUnitSelectionModal(product, 'sales-header');

            return; // Stop here, the modal will complete the action

        } else if (product.units && product.units.length === 1) {

            const defUnit = product.units[0];

            defaultPrice = (priceLevel === 'wholesale') ? (defUnit.wholesale || defUnit.price) : defUnit.price;

            currentHeaderUnit = defUnit;

        } else {

            defaultPrice = (priceLevel === 'wholesale') ? (product.wholesale || product.price) : product.price;

            currentHeaderUnit = null;

        }

        hPrice.value = parseFloat(defaultPrice).toFixed(2);

    }

    // 3. تصفير الكمية لـ 1 والتركيز عليها (دورة الإنتر تبدأ هنا)

    if (hQty) {

        hQty.value = 1;

        hQty.focus();

        setTimeout(() => hQty.select(), 10);

    }

    // 4. إخفاء نتائج البحث

    if (resultsDiv) resultsDiv.style.display = 'none';

    return;

}

async function handleSearch(query) {

    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) return;

    searchSelectedIndex = -1; // إعادة تصغير المؤشر عند كل كتابة جديدة

    // فك أي حجب برمجي أو كلاس hidden فوراً
    resultsDiv.classList.remove('hidden');
    resultsDiv.style.setProperty('overflow', 'visible', 'important');
    resultsDiv.style.setProperty('max-height', 'none', 'important');
    resultsDiv.style.setProperty('border', 'none', 'important');
    resultsDiv.style.setProperty('background', 'transparent', 'important');
    resultsDiv.style.setProperty('box-shadow', 'none', 'important');

    // إذا تمت معالجة مسح باركود للتو عبر السكانر، نتجاهل كود البحث هنا لمنع الازدواجية
    if (typeof window.isBayanRecentScan === 'function' && window.isBayanRecentScan()) {
        resultsDiv.style.display = 'none';
        const sInp = document.getElementById('productSearch');
        if (sInp) sInp.value = '';
        return;
    }

    if (!query || !query.trim()) {
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'none';
        return;
    }

    // 2. البحث الحي الموحد بالاسم أو الباركود أو الكود عبر محرك البحث السريع المباشر (LIMIT 30)
    const filtered = (typeof window.searchProductsRanked === 'function')
        ? window.searchProductsRanked(query, { limit: 30 })
        : (typeof window.BayanSQLite !== 'undefined' && window.BayanSQLite && typeof window.BayanSQLite.searchProductsFast === 'function' && window.BayanSQLite.db)
            ? window.BayanSQLite.searchProductsFast(query, 30)
            : (productsDB || []).filter(p => (p.name && p.name.includes(query)) || (p.barcode && String(p.barcode).includes(query))).slice(0, 30);

    if (typeof window.renderProductSearchResultsPanel === 'function') {
        window.renderProductSearchResultsPanel(resultsDiv, query, filtered, {
            resultsDivId: 'searchResults',
            title: '🔍 نتائج البحث',
            priceKey: 'price',
            priceLabel: '💰 سعر البيع',
            onSelectFn: 'selectProductToHeader',
            quickAddFn: 'quickAddProduct',
            mode: 'sales'
        });
        return;
    }
}

// دالة جديدة للتحكم في الأسهم والإنتر داخل مربع البحث
const setupProductSearchKeydown = () => {
    const psElem = document.getElementById('productSearch');
    if (psElem && !psElem._hasKeydown) {
        psElem._hasKeydown = true;
        psElem.addEventListener('keydown', function (e) {
        const resultsDiv = document.getElementById('searchResults');
        if (!resultsDiv || resultsDiv.style.display === 'none') return;
        const items = resultsDiv.querySelectorAll('.pos-search-row, .search-item, .result-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            searchSelectedIndex = (searchSelectedIndex + 1) % items.length;
            updateSearchSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            searchSelectedIndex = (searchSelectedIndex - 1 + items.length) % items.length;
            updateSearchSelection(items);
        } else if (e.key === 'Enter') {
            if (searchSelectedIndex > -1 && items[searchSelectedIndex]) {
                e.preventDefault();
                e.stopPropagation();
                items[searchSelectedIndex].click();
            }
        } else if (e.key === 'Escape') {
            resultsDiv.style.display = 'none';
        }
    });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupProductSearchKeydown);
} else {
    setupProductSearchKeydown();
}

// إغلاق نافذة البحث عند النقر خارجها في أي مكان بالشاشة
document.addEventListener('click', function (e) {
    const resultsDiv = document.getElementById('searchResults');
    const psElem = document.getElementById('productSearch');
    if (resultsDiv && resultsDiv.style.display !== 'none') {
        if (!resultsDiv.contains(e.target) && e.target !== psElem) {
            resultsDiv.style.display = 'none';
        }
    }
});

function updateSearchSelection(items) {
    items.forEach((item, index) => {
        if (index === searchSelectedIndex) {
            item.style.background = '#eff6ff';
            item.style.borderRight = '5px solid #3b82f6';
            item.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.15)';
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.style.background = '';
            item.style.borderRight = 'none';
            item.style.boxShadow = 'none';
        }
    });
}

function fillSalesHeaderWithUnit(product, unit) {

    currentHeaderProductId = product.id;

    currentHeaderUnit = unit;

    const resultsDiv = document.getElementById('searchResults');

    const pSearch = document.getElementById('productSearch');

    const hQty = document.getElementById('headerQty');

    const hPrice = document.getElementById('headerPrice');

    if (pSearch) pSearch.value = product.name;

    if (hPrice) {

        const priceLevelSelect = document.getElementById('salesPriceLevel');

        const priceLevel = priceLevelSelect ? priceLevelSelect.value : 'retail';

        let p = (priceLevel === 'wholesale') ? (unit.wholesale || unit.price) : unit.price;

        hPrice.value = parseFloat(p).toFixed(2);

    }

    if (hQty) {

        hQty.value = 1;

        hQty.focus();

        setTimeout(() => hQty.select(), 10);

    }

    if (resultsDiv) resultsDiv.style.display = 'none';

}

async function handleSearchEnter(query, event, forceAdd = false) {
    // إذا كان مسح باركود تم بواسطة السكانر المركزي للتو، نتجاهل ضغطة Enter الزائدة
    if (typeof window.isBayanRecentScan === 'function' && window.isBayanRecentScan()) {
        const sInp = document.getElementById('productSearch');
        if (sInp) sInp.value = '';
        const rDiv = document.getElementById('searchResults');
        if (rDiv) rDiv.style.display = 'none';
        return;
    }

    const cleanQuery = String(query || '').trim();

    if (!forceAdd && typeof currentHeaderProductId !== 'undefined' && currentHeaderProductId) {
        const selectedProd = productsDB.find(p => p.id === currentHeaderProductId);
        if (selectedProd && String(selectedProd.name).trim() === cleanQuery) {
            forceAdd = true;
        }
    }

    if (forceAdd && typeof currentHeaderProductId !== 'undefined' && currentHeaderProductId) {
        const pendingVariant = window._pendingSalesVariant || null;
        addToCart(currentHeaderProductId, typeof currentHeaderUnit !== 'undefined' ? currentHeaderUnit : null, pendingVariant);
        window._pendingSalesVariant = null;
        return;
    }

    if (!query || query.trim() === "") return;

    // فحص الباركود الدقيق التلقائي فوراً
    if (typeof window.dispatchSearchBarcode === 'function') {
        if (window.dispatchSearchBarcode(cleanQuery, 'sales')) return;
    }

    const resultsDiv = document.getElementById('searchResults');

    // ⚡ فحص فوري فائق السرعة O(1) عبر الفهرس المباشر للباركود والكود وتشكيلات المقاسات (0ms)
    let matchingVariant = null;
    let pInDB = null;

    const barcodeMap = (typeof window.getBarcodeToProductMap === 'function') ? window.getBarcodeToProductMap() : null;
    const codeMap = (typeof window.getCodeToProductMap === 'function') ? window.getCodeToProductMap() : null;
    const cleanLower = cleanQuery.toLowerCase();
    const normClean = (typeof window.normalizeSearchQuery === 'function') ? window.normalizeSearchQuery(cleanQuery) : cleanLower;

    if (barcodeMap) {
        const directProd = barcodeMap.get(cleanLower) || (normClean ? barcodeMap.get(normClean) : null);
        if (directProd && !directProd.isDeleted) {
            pInDB = directProd;
            if (pInDB.variants && Array.isArray(pInDB.variants)) {
                matchingVariant = pInDB.variants.find(v => v.barcode && (String(v.barcode).trim().toLowerCase() === cleanLower || (normClean && String(v.barcode).trim() === normClean))) || null;
            }
        }
    }
    if (!pInDB && codeMap) {
        const directProd = codeMap.get(cleanLower) || (normClean ? codeMap.get(normClean) : null);
        if (directProd && !directProd.isDeleted) {
            pInDB = directProd;
            if (pInDB.variants && Array.isArray(pInDB.variants)) {
                matchingVariant = pInDB.variants.find(v => v.code && (String(v.code).trim().toLowerCase() === cleanLower || (normClean && String(v.code).trim() === normClean))) || null;
            }
        }
    }

    // 1. بحث احتياطي في باركود تشكيلات المقاسات والألوان (في حال لم يكن في الفهرس)
    if (!pInDB && typeof productsDB !== 'undefined' && Array.isArray(productsDB)) {
        pInDB = productsDB.find(p => {
            if (p.variants && Array.isArray(p.variants)) {
                const vFound = p.variants.find(v => v.barcode && String(v.barcode).trim() === cleanQuery);
                if (vFound) {
                    matchingVariant = vFound;
                    return true;
                }
            }
            return false;
        });
    }

    // إذا لم نجد في الذاكرة، نبحث فوراً في SQLite عبر الفهرس السريع حتى لو كانت الذاكرة تحمل الأصناف تدريجياً
    if (!pInDB && typeof db !== 'undefined' && db.products) {
        try {
            let foundP = await db.products.where('barcode').equals(cleanQuery).first();
            if (!foundP) {
                foundP = await db.products.where('code').equals(cleanQuery).first();
            }
            if (foundP) {
                pInDB = foundP;
                if (foundP.variants && Array.isArray(foundP.variants)) {
                    matchingVariant = foundP.variants.find(v => v.barcode && String(v.barcode).trim() === cleanQuery) || null;
                }
            } else if (window.BayanSQLite && window.BayanSQLite.db) {
                // البحث في الفهرس السريع المباشر (B-Tree) بالباركود و ID وكود الصنف
                const stmt = window.BayanSQLite.db.prepare("SELECT * FROM products WHERE barcode = ? OR CAST(id AS TEXT) = ? OR json_extract(raw_json, '$.code') = ? LIMIT 1");
                stmt.bind([cleanQuery, cleanQuery, cleanQuery]);
                if (stmt.step()) {
                    const rawObj = stmt.getAsObject();
                    const parsed = (window.BayanSQLite && typeof window.BayanSQLite._reconstructRow === 'function')
                        ? window.BayanSQLite._reconstructRow(rawObj)
                        : rawObj;
                    if (parsed) {
                        pInDB = parsed;
                        if (parsed.variants && Array.isArray(parsed.variants)) {
                            matchingVariant = parsed.variants.find(v => v.barcode && String(v.barcode).trim() === cleanQuery) || null;
                        }
                    }
                }
                stmt.free();
            }
            if (pInDB && typeof productsDB !== 'undefined' && Array.isArray(productsDB)) {
                const exIdx = productsDB.findIndex(x => x.id === pInDB.id);
                if (exIdx !== -1) productsDB[exIdx] = pInDB;
                else productsDB.push(pInDB);
            }
        } catch (err) {
            console.warn("DB variant search error:", err);
        }
    }

    if (pInDB && matchingVariant) {
        // إذا كان مسح باركود مقاس محدد، نضيفه للسلة فوراً بتفاصيله
        const addRes = addToCart(pInDB.id, null, matchingVariant);
        if (resultsDiv) resultsDiv.style.display = 'none';
        const searchInput = document.getElementById('productSearch');
        if (searchInput && addRes !== false) searchInput.value = '';
        return;
    }

    // 2. البحث المطابق الدقيق بالاسم التام أو الباركود الأساسي أو الكود
    if (!pInDB) {
        const normClean = (typeof window.normalizeSearchQuery === 'function')
            ? window.normalizeSearchQuery(cleanQuery)
            : cleanQuery.trim().toLowerCase();

        // فحص تطابق الاسم التام أولاً (مثل صنف اسمه "14")
        pInDB = productsDB.find(p => {
            const pNorm = (typeof window.normalizeSearchQuery === 'function')
                ? window.normalizeSearchQuery(p.name)
                : String(p.name || '').trim().toLowerCase();
            return pNorm === normClean;
        });
    }

    if (!pInDB) {
        pInDB = productsDB.find(p => String(p.barcode || '').trim() === cleanQuery || String(p.code || '').trim() === cleanQuery);
    }

    // 3. بحث عميق في باركود الوحدات
    if (!pInDB) {
        pInDB = productsDB.find(p => p.units && p.units.some(u => String(u.unitBarcode || '').trim() === cleanQuery));
    }

    // 4. إذا لم نجد تطابقاً كاملاً، نبحث بمحرك البحث المرتب
    if (!pInDB) {
        const matches = (typeof window.searchProductsRanked === 'function')
            ? window.searchProductsRanked(cleanQuery, { limit: 10 })
            : productsDB.filter(p => (p.name && p.name.toLowerCase().includes(cleanQuery.toLowerCase())));
        
        if (matches.length === 1) {
            pInDB = matches[0];
        } else if (matches.length > 1) {
            // يوجد أكثر من منتج يحمل نفس الكلمة (مثلاً "جزمه")، نترك المستخدم يختار من القائمة المنسدلة
            return;
        }
    }

    if (pInDB) {
        // إذا كان للموديل مقاسات وألوان ونظام المقاسات مفعل، نفتح نافذة الاختيار السريع
        const isVariantsActive = !document.body.classList.contains('bayan-variants-disabled') && (document.body.classList.contains('bayan-variants-enabled') || (pInDB.variants && pInDB.variants.length > 0));
        if (isVariantsActive && pInDB.variants && Array.isArray(pInDB.variants) && pInDB.variants.length > 0) {
            showVariantSelectionModal(pInDB, 'sales');
            if (resultsDiv) resultsDiv.style.display = 'none';
            const searchInput = document.getElementById('productSearch');
            if (searchInput) searchInput.value = '';
            return;
        }

        // إذا كان مسح باركود مباشر لمنتج قياسي، ينزل في السلة فوراً ويفضي الخانة لضرب الصنف التالي
        const isExactBarcode = (pInDB.barcode && String(pInDB.barcode).trim() === cleanQuery);
        if (isExactBarcode && (!pInDB.units || pInDB.units.length <= 1)) {
            addToCart(pInDB.id);
            if (resultsDiv) resultsDiv.style.display = 'none';
            const searchInput = document.getElementById('productSearch');
            if (searchInput) searchInput.value = '';
            return;
        }

        // إذا تم البحث اليدوي بالاسم أو الكود، نعبي الخانات أولاً ونركز على الكمية
        selectProductToHeader(pInDB.id);
    } else {

        // الصنف غريب (غير موجود)

        showCustomAlert({

            titleText: '⚠️ صنف غير مسمى',

            msg: `الباركود أو الاسم (${query}) غير مسجل في قاعدة البيانات، هل تريد إضافته الآن؟`,

            type: 'question',

            showCancel: true,

            confirmText: 'نعم، إضافة صنف',

            cancelText: 'إلغاء',

            onConfirm: () => {

                document.getElementById('productSearch').value = '';

                quickAddProduct(query, 'sales');

            }

        });

    }

}

let pendingAddToCartProduct = null;

let unitModalSelectedIndex = 0;

let unitModalContext = 'sales';

function closeUnitSelectionModal() {

    document.getElementById('unitSelectionModal').classList.add('hidden');

    pendingAddToCartProduct = null;

    window.removeEventListener('keydown', handleUnitModalKeydown);

    // إعادة التركيز للمكان الصحيح بناءً على القسم المفتوح لضمان سرعة الإدخال

    if (unitModalContext === 'purchase') {

        const hQty = document.getElementById('purchaseHeaderQty');

        if (hQty) {

            hQty.focus();

            hQty.select();

        }

    } else {

        const searchId = (unitModalContext === 'sales') ? 'productSearch' : 'purchaseSearch';

        const searchInput = document.getElementById(searchId);

        if (searchInput) searchInput.focus();

    }

}

function handleUnitModalKeydown(e) {
    if (!e || typeof e.key !== 'string') return;

    const modal = document.getElementById('unitSelectionModal');

    if (modal.classList.contains('hidden')) return;

    const cards = document.querySelectorAll('.unit-option-card');

    if (cards.length === 0) return;

    if (e.key === 'ArrowDown') {

        e.preventDefault();

        unitModalSelectedIndex = (unitModalSelectedIndex + 1) % cards.length;

        updateUnitModalSelection(cards);

    } else if (e.key === 'ArrowUp') {

        e.preventDefault();

        unitModalSelectedIndex = (unitModalSelectedIndex - 1 + cards.length) % cards.length;

        updateUnitModalSelection(cards);

    } else if (e.key === 'Enter') {

        e.preventDefault();

        // التأكد من تحديد الكارد أولاً ثم تنفيذ الضغط على زر التأكيد

        const targetCard = cards[unitModalSelectedIndex];

        if (targetCard) {

            targetCard.click();

            setTimeout(() => {

                const confirmBtn = document.getElementById('confirmUnitBtn');

                if (confirmBtn) confirmBtn.click();

            }, 10);

        }

    } else if (e.key === 'Escape') {

        e.preventDefault();

        closeUnitSelectionModal();

    }

}

function updateUnitModalSelection(cards) {

    cards.forEach((card, idx) => {

        if (idx === unitModalSelectedIndex) {

            card.classList.add('selected');

            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        } else {

            card.classList.remove('selected');

        }

    });

}

function addToCart(productId, preSelectedUnit = null, preSelectedVariant = null) {
    const product = productsDB.find(p => p.id === productId);
    if (!product) return false;

    const effVariant = preSelectedVariant || window._pendingSalesVariant || null;

    const activeWH = ((typeof currentUser !== 'undefined' && currentUser && currentUser.warehouseName) ? currentUser.warehouseName : 'المخزن الرئيسي').trim();
    const prodAvail = typeof getWarehouseStock === 'function' ? getWarehouseStock(product.name, activeWH) : (parseFloat(product.stock) || 0);
    const varAvail = effVariant ? ((effVariant.warehouseStocks && effVariant.warehouseStocks[activeWH] !== undefined) ? (parseFloat(effVariant.warehouseStocks[activeWH]) || 0) : (parseFloat(effVariant.stock) || 0)) : 0;

    if (prodAvail <= 0 && (!effVariant || varAvail <= 0)) {
        showToast("⚠️ تنبيه: المنتج (" + product.name + ") غير متوفر في المخزن الحالي (" + activeWH + ")!", "warning");
    }

    // إذا لم يكن هناك مقاس محدد مسبقاً وكان للمنتج مقاسات وألوان، نفتح نافذة الاختيار السريع
    const isVariantsActive = !document.body.classList.contains('bayan-variants-disabled') && (document.body.classList.contains('bayan-variants-enabled') || (product.variants && product.variants.length > 0));
    if (isVariantsActive && !effVariant && product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        showVariantSelectionModal(product, 'sales');
        return false;
    }

    if (preSelectedUnit) {
        return completeAddToCart(product, preSelectedUnit, effVariant);
    }

    if (product.units && product.units.length > 1) {
        showUnitSelectionModal(product, 'sales');
        return false;
    }

    const defUnit = (product.units && product.units.length > 0) ? product.units[0] : null;
    return completeAddToCart(product, defUnit, effVariant);
}

function completeAddToCart(product, selectedUnit, selectedVariant = null, customQty = null, customPrice = null) {
    const productId = product.id;

    // ميزة إدخال الكمية والسعر من الهيدر أو من باركود الميزان مباشرة
    const hQtyInput = document.getElementById('headerQty');
    const hPriceInput = document.getElementById('headerPrice');
    const hQty = (customQty !== null && customQty !== undefined && customQty > 0) 
        ? customQty 
        : (hQtyInput ? (parseFloat(hQtyInput.value) || 1) : 1);
    const hPrice = (customPrice !== null && customPrice !== undefined)
        ? customPrice
        : ((hPriceInput && hPriceInput.value) ? parseFloat(hPriceInput.value) : null);

    if (hQty <= 0) {
        showToast("⚠️ يرجى إدخال كمية صحيحة أكبر من الصفر!", "warning");
        return false;
    }

    const effVariant = selectedVariant || window._pendingSalesVariant || null;
    const vSize = effVariant ? (effVariant.size || '') : '';
    const vColor = effVariant ? (effVariant.color || '') : '';

    const activeWH = ((typeof currentUser !== 'undefined' && currentUser && currentUser.warehouseName) ? currentUser.warehouseName : 'المخزن الرئيسي').trim();

    // توحيد الوحدة الافتراضية إذا لم تكن محددة وكان للمنتج وحدات
    if (!selectedUnit && product.units && product.units.length > 0) {
        selectedUnit = product.units.find(u => u.isBaseUnit) || product.units[0];
    }
    const factor = selectedUnit ? (parseFloat(selectedUnit.factor) || 1) : 1;
    let availBaseStock = 0;
    if (effVariant) {
        if (effVariant.warehouseStocks && typeof effVariant.warehouseStocks === 'object' && effVariant.warehouseStocks[activeWH] !== undefined) {
            availBaseStock = parseFloat(effVariant.warehouseStocks[activeWH]) || 0;
        } else if (activeWH === 'المخزن الرئيسي' || !effVariant.warehouseStocks || Object.keys(effVariant.warehouseStocks).length === 0) {
            availBaseStock = parseFloat(effVariant.stock) || 0;
        } else {
            availBaseStock = (effVariant.warehouseStocks && effVariant.warehouseStocks[activeWH] !== undefined)
                ? (parseFloat(effVariant.warehouseStocks[activeWH]) || 0)
                : (parseFloat(effVariant.stock) || 0);
        }
    } else {
        if (typeof getWarehouseStock === 'function') {
            availBaseStock = getWarehouseStock(product.name, activeWH);
        } else if (product.warehouseStocks && product.warehouseStocks[activeWH] !== undefined) {
            availBaseStock = parseFloat(product.warehouseStocks[activeWH]) || 0;
        } else if (activeWH === 'المخزن الرئيسي' || !product.warehouseStocks || Object.keys(product.warehouseStocks).length === 0) {
            availBaseStock = parseFloat(product.stock) || 0;
        } else {
            availBaseStock = (product.warehouseStocks && product.warehouseStocks[activeWH] !== undefined)
                ? (parseFloat(product.warehouseStocks[activeWH]) || 0)
                : (parseFloat(product.stock) || 0);
        }
    }

    // في وضع التعديل: استرداد الكمية الأصلية المحجوزة في الفاتورة لهذا الصنف وتشكيلته لإتاحتها
    let originalQtyInInvoice = 0;
    if (typeof isEditMode !== 'undefined' && isEditMode && typeof editingOriginalItems !== 'undefined' && Array.isArray(editingOriginalItems)) {
        const cleanAttrPre = (val) => {
            const s = String(val || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
            if (!s || s === 'قياسي' || s === 'موحد' || s === 'عام' || s === '-') return '';
            return s;
        };
        const cPreSize = cleanAttrPre(vSize);
        const cPreColor = cleanAttrPre(vColor);

        const matchedOriginals = editingOriginalItems.filter(orig => {
            const origName = orig.product || orig.name || '';
            const origId = (orig.productId != null && orig.productId !== '') ? orig.productId : orig.id;
            const isProdMatch = (origName && (origName === product.name || origName === product.id)) || 
                                (origId != null && (String(origId) === String(product.id) || String(origId) === String(product.name)));
            if (!isProdMatch) return false;

            const oSize = cleanAttrPre(orig.selectedSize || orig.size);
            const oColor = cleanAttrPre(orig.selectedColor || orig.color);
            return oSize === cPreSize && oColor === cPreColor;
        });
        matchedOriginals.forEach(orig => {
            const origFactor = parseFloat(orig.unitFactor) || 1;
            originalQtyInInvoice += (parseFloat(orig.qty) || 0) * origFactor;
        });
    }

    const maxAvailInUnit = (availBaseStock + originalQtyInInvoice) / factor;

    // دالة مساعدة لمعايرة المقاسات والألوان وتوحيد القيم الافتراضية
    const cleanAttr = (val) => {
        const s = String(val || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
        if (!s || s === 'قياسي' || s === 'موحد' || s === 'عام' || s === '-') return '';
        return s;
    };
    const cSize = cleanAttr(vSize);
    const cColor = cleanAttr(vColor);
    const vBarcode = effVariant && effVariant.barcode ? String(effVariant.barcode).trim() : '';

    // البحث الذكي عن الصنف الموجود مسبقاً في السلة (الدمج المباشر)
    const existingItem = cart.find(item => {
        // 1. الأولوية المطلقة لتطابق الباركود الفريد للتشكيلة
        if (vBarcode) {
            const itemCode = String(item.code || '').trim();
            const itemVarBarcode = (item.selectedVariant && item.selectedVariant.barcode) ? String(item.selectedVariant.barcode).trim() : '';
            if (itemCode === vBarcode || itemVarBarcode === vBarcode) {
                return true;
            }
        }
        // 2. التطابق برقم الصنف مع معايرة المقاس واللون والوحدة
        const isSameProd = (item.id === productId || String(item.id) === String(productId) || item.name === product.name);
        if (!isSameProd) return false;

        const itUnitName = item.selectedUnit ? (item.selectedUnit.unitName || item.selectedUnit) : (product.unit || 'قطعة');
        const selUnitName = selectedUnit ? (selectedUnit.unitName || selectedUnit) : (product.unit || 'قطعة');
        if (itUnitName !== selUnitName) return false;

        const itSize = cleanAttr(item.selectedSize || item.size || (item.selectedVariant ? item.selectedVariant.size : ''));
        const itColor = cleanAttr(item.selectedColor || item.color || (item.selectedVariant ? item.selectedVariant.color : ''));

        return itSize === cSize && itColor === cColor;
    });

    // 🛡️ الحراسة التراكمية الفورية للمخزون: حساب إجمالي ما هو موجود بالسلة مسبقاً لهذا الصنف والتشكيلة
    let currentInCartBaseQty = 0;
    cart.forEach(item => {
        let isMatch = false;
        if (vBarcode) {
            const itemCode = String(item.code || '').trim();
            const itemVarBarcode = (item.selectedVariant && item.selectedVariant.barcode) ? String(item.selectedVariant.barcode).trim() : '';
            if (itemCode === vBarcode || itemVarBarcode === vBarcode) isMatch = true;
        }
        if (!isMatch) {
            const isSameProd = (item.id === productId || String(item.id) === String(productId) || item.name === product.name);
            if (isSameProd) {
                const itSize = cleanAttr(item.selectedSize || item.size || (item.selectedVariant ? item.selectedVariant.size : ''));
                const itColor = cleanAttr(item.selectedColor || item.color || (item.selectedVariant ? item.selectedVariant.color : ''));
                if (itSize === cSize && itColor === cColor) {
                    isMatch = true;
                }
            }
        }
        if (isMatch) {
            const itFactor = parseFloat(item.unitFactor) || 1;
            currentInCartBaseQty += (parseFloat(item.qty) || 0) * itFactor;
        }
    });

    const newAdditionBaseQty = hQty * factor;
    const totalRequestedBaseQty = currentInCartBaseQty + newAdditionBaseQty;

    // 🛑 منع صارم: رفض الإضافة فوراً إذا تجاوز الإجمالي التراكمي في السلة رصيد المخزن المتاح + الكمية المحجوزة أصلاً في الفاتورة
    if (totalRequestedBaseQty > (availBaseStock + originalQtyInInvoice)) {
        const varInfo = effVariant ? ` [${[effVariant.size, effVariant.color].filter(x => x && x !== 'قياسي' && x !== 'موحد').join(' - ')}]` : '';
        const maxAvailStr = maxAvailInUnit <= 0 ? '0' : maxAvailInUnit.toFixed(2).replace(/\.?0+$/, '');
        const currentInCartDisplay = (currentInCartBaseQty / factor).toFixed(2).replace(/\.?0+$/, '');
        showToast(`🚫 عذراً، الكمية المطلوبة غير متوفرة! المتاح بمخزن (${activeWH}) للصنف (${product.name}${varInfo}) هو (${maxAvailStr}) فقط، وبالسلة حالياً (${currentInCartDisplay})!`, "error", 5000);
        if (typeof BayanBarcode !== 'undefined' && typeof BayanBarcode.playBeep === 'function') {
            BayanBarcode.playBeep(false);
        }
        return false;
    }

    if (existingItem) {
        existingItem.qty = parseFloat((existingItem.qty + hQty).toFixed(3));
        if (typeof markPosInvoiceModified === 'function') markPosInvoiceModified();
        const isPriceLocked = (typeof currentUser !== 'undefined' && currentUser && currentUser.lockPriceEdit);
        const canEditPrice = !isPriceLocked && ((typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') 
            || (typeof hasPermission === 'function' && hasPermission('docs_price_edit')));
        if (hPrice !== null && canEditPrice) {
            let itemCost = 0;
            if (effVariant && (effVariant.avgBuyPrice || effVariant.cost || effVariant.buyPrice)) {
                itemCost = parseFloat(effVariant.avgBuyPrice) || parseFloat(effVariant.cost) || parseFloat(effVariant.buyPrice) || 0;
            }
            if (itemCost <= 0 && selectedUnit && selectedUnit.cost && parseFloat(selectedUnit.cost) > 0) {
                itemCost = parseFloat(selectedUnit.cost);
            }
            if (itemCost <= 0) {
                const pCost = parseFloat(product.avgBuyPrice) || parseFloat(product.cost) || parseFloat(product.buyPrice) || 0;
                if (selectedUnit && selectedUnit.factor && parseFloat(selectedUnit.factor) > 1 && (!selectedUnit.isBaseUnit)) {
                    itemCost = pCost / parseFloat(selectedUnit.factor);
                } else {
                    itemCost = pCost;
                }
            }
            if (itemCost > 0 && hPrice < itemCost) {
                if (window.BayanBarcode && typeof BayanBarcode.playBeep === 'function') BayanBarcode.playBeep(false);
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert({
                        type: 'error',
                        titleText: '⚠️ تنبيه أمان: بيع بأقل من سعر التكلفة!',
                        msg: `عذراً، غير مسموح ببيع الصنف "<b>${product.name}</b>" بسعر أقل من سعر التكلفة المحدد من الإدارة منعاً للخسارة والتلاعب!\n\n🛡️ تم الإبقاء على سعر البيع الحالي دون تغيير.`
                    });
                } else if (typeof showToast === 'function') {
                    showToast("⚠️ غير مسموح بالبيع بأقل من سعر التكلفة المحدد من الإدارة!", "error");
                }
                return false;
            } else {
                existingItem.price = hPrice;
            }
        }
    } else {
        const priceLevelSelect = document.getElementById('salesPriceLevel');
        const priceLevel = priceLevelSelect ? priceLevelSelect.value : 'retail';
        let factor = 1;
        let price = 0;

        if (effVariant) {
            if (priceLevel === 'wholesale') {
                price = parseFloat(effVariant.wholesale) || parseFloat(effVariant.price) || parseFloat(product.wholesale) || parseFloat(product.price) || 0;
            } else {
                price = parseFloat(effVariant.price) || parseFloat(product.price) || 0;
            }
        } else if (selectedUnit) {
            factor = parseFloat(selectedUnit.factor) || 1;
            if (priceLevel === 'wholesale') {
                price = parseFloat(selectedUnit.wholesale) || parseFloat(selectedUnit.price) || 0;
            } else {
                price = parseFloat(selectedUnit.price) || 0;
            }
        } else {
            if (priceLevel === 'wholesale') {
                price = parseFloat(product.wholesale) || parseFloat(product.price) || 0;
            } else {
                price = parseFloat(product.price) || 0;
            }
        }

        let itemCost = 0;
        if (effVariant && (effVariant.avgBuyPrice || effVariant.cost || effVariant.buyPrice)) {
            itemCost = parseFloat(effVariant.avgBuyPrice) || parseFloat(effVariant.cost) || parseFloat(effVariant.buyPrice) || 0;
        }
        if (itemCost <= 0 && selectedUnit && selectedUnit.cost && parseFloat(selectedUnit.cost) > 0) {
            itemCost = parseFloat(selectedUnit.cost);
        }
        if (itemCost <= 0) {
            const pCost = parseFloat(product.avgBuyPrice) || parseFloat(product.cost) || parseFloat(product.buyPrice) || 0;
            if (selectedUnit && selectedUnit.factor && parseFloat(selectedUnit.factor) > 1 && (!selectedUnit.isBaseUnit)) {
                itemCost = pCost / parseFloat(selectedUnit.factor);
            } else {
                itemCost = pCost;
            }
        }

        const baseOriginalPrice = price;
        const itemDiscount = parseFloat(product.discount) || 0;

        const isPriceLocked = (typeof currentUser !== 'undefined' && currentUser && currentUser.lockPriceEdit);
        const canEditPrice = !isPriceLocked && ((typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') 
            || (typeof hasPermission === 'function' && hasPermission('docs_price_edit')));

        // تحديد ما إذا كان السعر في الهيدر هو مجرد تعبئة تلقائية أم تعديل يدوي
        if (hPrice !== null) {
            if (!canEditPrice) {
                // الكاشير غير مصرح له بتعديل السعر → نعتمد السعر الرسمي فقط
                price = baseOriginalPrice;
            } else if (itemCost > 0 && hPrice < itemCost) {
                // محاولة إدخال سعر أقل من التكلفة من الهيدر
                if (window.BayanBarcode && typeof BayanBarcode.playBeep === 'function') {
                    BayanBarcode.playBeep(false);
                }
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert({
                        type: 'error',
                        titleText: '⚠️ تنبيه أمان: بيع بأقل من سعر التكلفة!',
                        msg: `عذراً، غير مسموح ببيع الصنف "<b>${product.name}</b>" بسعر أقل من سعر التكلفة المحدد من الإدارة منعاً للخسارة والتلاعب!\n\n🛡️ تم منع إضافة الصنف بسعر أقل من التكلفة (${itemCost.toFixed(2)} ج.م).`
                    });
                } else if (typeof showToast === 'function') {
                    showToast("⚠️ غير مسموح بالبيع بأقل من سعر التكلفة المحدد من الإدارة!", "error");
                }
                return false;
            } else {
                price = hPrice;
            }
        }

        // تطبيق الخصم التلقائي إذا لم يقم المستخدم بتعديل السعر يدوياً
        if (hPrice === null || Math.abs(hPrice - baseOriginalPrice) < 0.01) {
            if (itemDiscount > 0) {
                price = Number(Math.max(0, baseOriginalPrice - (baseOriginalPrice * itemDiscount / 100)).toFixed(2));
            }
        }

        cart.push({
            id: product.id,
            code: (effVariant && effVariant.barcode) ? effVariant.barcode : product.code,
            name: product.name,
            originalPrice: baseOriginalPrice,
            discount: itemDiscount,
            price: price,
            cost: itemCost,
            qty: hQty,
            selectedSize: vSize,
            selectedColor: vColor,
            selectedVariant: effVariant,
            units: product.units || [],
            selectedUnit: selectedUnit,
            unitFactor: factor,
            taxType: product.taxType || 'none',
            taxRate: product.taxRate || 0
        });
        if (typeof markPosInvoiceModified === 'function') markPosInvoiceModified();
    }

    renderCart();
    if (typeof calculateCartTotals === 'function') calculateCartTotals();
    if (typeof calculateTotals === 'function') calculateTotals();

    // 📸 عرض صورة الموديل فوراً في اللوحة الجانبية بمجرد نزوله للسلة
    if (typeof updatePOSProductImagePreview === 'function') {
        updatePOSProductImagePreview(product, effVariant);
    }

    // تصفير البحث والمدخلات والتركيز
    if (hQtyInput) hQtyInput.value = 1;
    if (hPriceInput) hPriceInput.value = '';
    currentHeaderProductId = null;
    currentHeaderUnit = null;
    window._pendingSalesVariant = null;

    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    return true;
}

// =========================================================================
// 👗 نافذة الاختيار السريع للمقاسات والألوان (Fast Variant Picker Modal with Keyboard Control)
// =========================================================================

let variantModalSelectedIndex = 0;
let variantModalProduct = null;
let variantModalContext = 'sales';

function showUnitSelectionModal(product, context = 'sales') {
    pendingAddToCartProduct = product;

    unitModalContext = context;

    unitModalSelectedIndex = 0;

    const list = document.getElementById('unitSelectionList');

    list.innerHTML = '';

    let priceLevel = 'retail';

    if (context === 'sales' || context === 'sales-header') {

        const priceLevelSelect = document.getElementById('salesPriceLevel');

        priceLevel = priceLevelSelect ? priceLevelSelect.value : 'retail';

    }

    product.units.forEach((unit, idx) => {

        let displayPrice = 0;

        if (context === 'transfer') {
            if (typeof window.getEffectiveTransferPrice === 'function') {
                displayPrice = window.getEffectiveTransferPrice(product, null, unit);
            } else {
                displayPrice = parseFloat(unit.cost) || 0;
            }
        } else if (context === 'adjustment') {
            if (typeof window.getEffectiveAdjustmentPrice === 'function') {
                displayPrice = window.getEffectiveAdjustmentPrice(product, null, unit);
            } else {
                displayPrice = parseFloat(unit.cost) || 0;
            }
        } else if (context === 'sales' || context === 'sales-header' || context === 'sales-return') {

            if (priceLevel === 'wholesale') {

                displayPrice = parseFloat(unit.wholesale) || parseFloat(unit.price) || 0;

            } else {

                displayPrice = parseFloat(unit.price) || 0;

            }

        } else {

            displayPrice = parseFloat(unit.cost) || 0;

        }

        const card = document.createElement('div');

        card.className = 'unit-option-card' + (idx === 0 ? ' selected' : '');

        card.onclick = () => {

            document.querySelectorAll('.unit-option-card').forEach(c => c.classList.remove('selected'));

            card.classList.add('selected');

        };

        card.ondblclick = () => {

            if (context === 'sales') {

                completeAddToCart(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'sales-header') {

                fillSalesHeaderWithUnit(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'purchase') {

                // بدلاً من الإضافة الفورية، نملأ الهيدر ونركز على الكمية

                fillPurchaseHeaderWithUnit(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'sales-return') {

                completeAddToReturnCart(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'purchase-return') {

                completeAddToPurReturnCart(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'adjustment') {

                // في التسوية، نملأ الهيدر ونركز على الكمية

                if (typeof fillAdjustmentHeaderWithUnit === 'function') {

                    fillAdjustmentHeaderWithUnit(product, unit);

                }

                closeUnitSelectionModal();

            } else if (context === 'transfer') {

                // في التحويل، نملأ الهيدر ونركز على الكمية

                if (typeof fillTransferHeaderWithUnit === 'function') {

                    fillTransferHeaderWithUnit(product, unit);

                }

                closeUnitSelectionModal();

            } else if (context === 'sales-return-header') {

                fillReturnHeaderWithUnit(product, unit, 'sales');

                closeUnitSelectionModal();

            } else if (context === 'purchase-return-header') {

                fillReturnHeaderWithUnit(product, unit, 'purchase');

                closeUnitSelectionModal();

            }

        };

        const formattedFactor = (unit.factor % 1 === 0) ? unit.factor : parseFloat(unit.factor).toFixed(2);

        card.innerHTML = `

                    <div style="display:flex; flex-direction:column;">

                        <span class="unit-name">${unit.unitName}</span>

                        <span style="font-size:0.75rem; color:#64748b;">معامل التحويل: ${formattedFactor}</span>

                    </div>

                    <span class="unit-price">${displayPrice.toFixed(2)} ج.م</span>

                `;

        card.dataset.unitIdx = idx;

        list.appendChild(card);

    });

    document.getElementById('confirmUnitBtn').onclick = () => {

        const selected = document.querySelector('.unit-option-card.selected');

        if (selected) {

            const unitIdx = selected.dataset.unitIdx;

            const unit = product.units[unitIdx];

            if (context === 'sales') {

                completeAddToCart(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'sales-header') {

                fillSalesHeaderWithUnit(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'purchase') {

                fillPurchaseHeaderWithUnit(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'sales-return') {

                completeAddToReturnCart(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'purchase-return') {

                completeAddToPurReturnCart(product, unit);

                closeUnitSelectionModal();

            } else if (context === 'adjustment') {

                if (typeof fillAdjustmentHeaderWithUnit === 'function') {

                    fillAdjustmentHeaderWithUnit(product, unit);

                }

                closeUnitSelectionModal();

            } else if (context === 'transfer') {

                if (typeof fillTransferHeaderWithUnit === 'function') {

                    fillTransferHeaderWithUnit(product, unit);

                }

                closeUnitSelectionModal();

            } else if (context === 'sales-return-header') {

                fillReturnHeaderWithUnit(product, unit, 'sales');

                closeUnitSelectionModal();

            } else if (context === 'purchase-return-header') {

                fillReturnHeaderWithUnit(product, unit, 'purchase');

                closeUnitSelectionModal();

            }

        }

    };

    document.getElementById('unitSelectionModal').classList.remove('hidden');

    if (document.activeElement) document.activeElement.blur();

    window.addEventListener('keydown', handleUnitModalKeydown);
}

function updateItemUnit(index, unitName, cartType = 'sales') {

    const currentCart = (cartType === 'sales') ? cart : purchaseCart;

    const item = currentCart[index];

    if (!item || !item.units) return;

    const unit = item.units.find(u => u.unitName === unitName);

    if (unit) {

        const priceLevel = document.getElementById('salesPriceLevel')?.value || 'retail';

        item.selectedUnit = unit;

        if (cartType === 'sales') {
            const basePrice = (priceLevel === 'wholesale') ? (parseFloat(unit.wholesale) || parseFloat(unit.price) || 0) : (parseFloat(unit.price) || 0);
            item.originalPrice = basePrice;
            const itemDisc = parseFloat(item.discount) || 0;
            if (itemDisc > 0) {
                item.price = Number(Math.max(0, basePrice - (basePrice * itemDisc / 100)).toFixed(2));
            } else {
                item.price = basePrice;
            }
        } else {
            item.price = parseFloat(unit.cost) || 0;
        }

        item.unitFactor = parseFloat(unit.factor) || 1;

        if (cartType === 'sales') {
            if (typeof markPosInvoiceModified === 'function') markPosInvoiceModified();
            renderCart();
        } else {
            renderPurchaseCart_Finalized_V3();
        }

    }

}

function removeFromCart(index) {
    if (isEditMode && !checkPermission('docs_edit')) return;
    const item = cart[index];
    cart.splice(index, 1);
    if (typeof markPosInvoiceModified === 'function') markPosInvoiceModified();

    // إزالة صورة الموديل أو التحديث لآخر صنف باقي فور الحذف
    if (cart.length === 0) {
        resetPOSProductImagePreview();
    } else {
        const remainingItem = cart[index] || cart[cart.length - 1];
        if (remainingItem) {
            updatePOSProductImagePreview(remainingItem.id, remainingItem.selectedVariant || remainingItem);
        }
    }

    renderCart();
}

function updateQty(index, newQty) {
    if (isEditMode && !checkPermission('docs_edit')) return renderCart();
    const item = cart[index];
    if (!item) return;

    const parsedQty = parseFloat(newQty);
    if (isNaN(parsedQty) || parsedQty <= 0) {
        showToast("⚠️ يرجى إدخال كمية صحيحة أكبر من الصفر!", "warning");
        return renderCart();
    }
    if (typeof markPosInvoiceModified === 'function') markPosInvoiceModified();

    const product = productsDB.find(p => p.id === item.id || p.name === item.name);
    if (product) {
        const factor = parseFloat(item.unitFactor) || 1;
        let effVariant = null;
        if (product.variants && Array.isArray(product.variants)) {
            const sSize = item.selectedSize || item.size || '';
            const sColor = item.selectedColor || item.color || '';
            if (sSize || sColor) {
                effVariant = product.variants.find(v => 
                    (!sSize || v.size === sSize) && 
                    (!sColor || v.color === sColor)
                );
            }
        }

        // في وضع تعديل فاتورة قديمة: إضافة الكمية الأصلية المحجوزة بالفاتورة إلى الرصيد المتاح
        let originalQtyInInvoice = 0;
        if (typeof isEditMode !== 'undefined' && isEditMode && typeof editingOriginalItems !== 'undefined' && Array.isArray(editingOriginalItems)) {
            const cleanAttr = (val) => {
                const s = String(val || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
                if (!s || s === 'قياسي' || s === 'موحد' || s === 'عام' || s === '-') return '';
                return s;
            };
            const sSize = cleanAttr(item.selectedSize || item.size);
            const sColor = cleanAttr(item.selectedColor || item.color);
            const matchedOriginal = editingOriginalItems.find(orig => {
                const origName = orig.product || orig.name || '';
                const origId = (orig.productId != null && orig.productId !== '') ? orig.productId : orig.id;
                const isProdMatch = (origName && (origName === item.name || (product && origName === product.name))) ||
                                    (origId != null && (String(origId) === String(item.id) || (product && String(origId) === String(product.id))));
                if (!isProdMatch) return false;

                const oSize = cleanAttr(orig.selectedSize || orig.size);
                const oColor = cleanAttr(orig.selectedColor || orig.color);
                return oSize === sSize && oColor === sColor;
            });
            if (matchedOriginal) {
                const origFactor = parseFloat(matchedOriginal.unitFactor) || 1;
                originalQtyInInvoice = (parseFloat(matchedOriginal.qty) || 0) * origFactor;
            }
        }

        const activeWH = ((typeof currentUser !== 'undefined' && currentUser && currentUser.warehouseName) ? currentUser.warehouseName : 'المخزن الرئيسي').trim();

        let currentBaseStock = 0;
        if (effVariant) {
            if (effVariant.warehouseStocks && typeof effVariant.warehouseStocks === 'object' && effVariant.warehouseStocks[activeWH] !== undefined) {
                currentBaseStock = parseFloat(effVariant.warehouseStocks[activeWH]) || 0;
            } else if (activeWH === 'المخزن الرئيسي') {
                currentBaseStock = parseFloat(effVariant.stock) || 0;
            } else {
                currentBaseStock = 0;
            }
        } else {
            if (typeof getWarehouseStock === 'function') {
                currentBaseStock = getWarehouseStock(product.name, activeWH);
            } else if (product.warehouseStocks && product.warehouseStocks[activeWH] !== undefined) {
                currentBaseStock = parseFloat(product.warehouseStocks[activeWH]) || 0;
            } else if (activeWH === 'المخزن الرئيسي') {
                currentBaseStock = parseFloat(product.stock) || 0;
            } else {
                currentBaseStock = 0;
            }
        }

        const availBaseStock = currentBaseStock + originalQtyInInvoice;
        const maxAvailInUnit = availBaseStock / factor;

        if ((parsedQty * factor) > availBaseStock) {
            const varInfo = effVariant ? ` [${effVariant.size || ''} ${effVariant.color || ''}]` : '';
            const maxAvailStr = maxAvailInUnit <= 0 ? '0' : maxAvailInUnit.toFixed(2).replace(/\.00$/, '');
            showToast(`🚫 عذراً، لا يمكن تجاوز الرصيد المتاح! المتاح بمخزن (${activeWH}) للصنف (${product.name}${varInfo}) هو (${maxAvailStr}) فقط`, "error");
            if (typeof BayanBarcode !== 'undefined' && typeof BayanBarcode.playBeep === 'function') {
                BayanBarcode.playBeep(false);
            }
            item.qty = maxAvailInUnit > 0 ? maxAvailInUnit : (item.qty || 1);
            renderCart();
            return;
        }
    }

    item.qty = parsedQty;
    renderCart();
}

function updateCartPrice(index, newPrice) {
    if (isEditMode && !checkPermission('docs_edit')) return renderCart();
    
    // 1. فحص صلاحية تعديل السعر للمستخدم
    const isPriceLocked = (typeof currentUser !== 'undefined' && currentUser && currentUser.lockPriceEdit);
    const canEditPrice = !isPriceLocked && ((typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') 
        || (typeof hasPermission === 'function' && hasPermission('docs_price_edit')));
    if (!canEditPrice) {
        if (typeof showToast === 'function') showToast(isPriceLocked ? "🔒 تعديل سعر البيع مقفل ومحمي لهذا الحساب!" : "🔒 تعديل سعر البيع غير مصرح به لهذا الحساب!", "warning");
        return renderCart();
    }

    const parsedPrice = parseFloat(newPrice);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        if (typeof showToast === 'function') showToast("⚠️ يرجى إدخال سعر صحيح!", "warning");
        return renderCart();
    }

    const item = cart[index];
    if (!item) return renderCart();

    // 2. البحث عن بيانات الصنف للتحقق من سعر التكلفة
    const product = productsDB.find(p => p.id === item.id || p.name === item.name);
    if (product) {
        const factor = parseFloat(item.unitFactor) || 1;
        
        // حساب سعر التكلفة الفعلي للصنف أو التشكيلة
        let baseCost = 0;
        const sSize = String(item.selectedSize || item.size || '').trim();
        const sColor = String(item.selectedColor || item.color || '').trim();
        
        if (product.variants && Array.isArray(product.variants) && (sSize || sColor)) {
            const effVar = product.variants.find(v => 
                (!sSize || String(v.size || '').trim() === sSize) && 
                (!sColor || String(v.color || '').trim() === sColor)
            );
            if (effVar && (effVar.cost || effVar.avgBuyPrice || effVar.buyPrice)) {
                baseCost = parseFloat(effVar.avgBuyPrice) || parseFloat(effVar.cost) || parseFloat(effVar.buyPrice) || 0;
            }
        }
        if (baseCost <= 0) {
            baseCost = parseFloat(product.avgBuyPrice) || parseFloat(product.cost) || parseFloat(product.buyPrice) || 0;
        }

        const unitCost = baseCost * factor;

        // 🛑 فحص الأمان الحاسم: منع البيع بأقل من سعر التكلفة المحدد إجبارياً
        if (unitCost > 0 && parsedPrice < unitCost) {
            // صفارة إنذار خطأ فورية
            if (window.BayanBarcode && typeof BayanBarcode.playBeep === 'function') {
                BayanBarcode.playBeep(false);
            }
            // نافذة تنبيه واضحة دون كشف رقم التكلفة للكاشير حفاظاً على خصوصية المحل
            if (typeof showCustomAlert === 'function') {
                showCustomAlert({
                    type: 'error',
                    titleText: '⚠️ تنبيه أمان: بيع بأقل من سعر التكلفة!',
                    msg: `عذراً، غير مسموح ببيع الصنف "<b>${item.name}</b>" بسعر أقل من سعر التكلفة المحدد من الإدارة منعاً للخسارة والتلاعب!\n\n🛡️ تم إعادة السعر تلقائياً إلى السعر الرسمي.`
                });
            } else if (typeof showToast === 'function') {
                showToast("⚠️ غير مسموح بالبيع بأقل من سعر التكلفة المحدد من الإدارة!", "error");
            }
            // إعادة السعر الأصلي فوراً غصب عنه
            const origPrice = parseFloat(item.originalPrice) || parseFloat(product.price) || unitCost;
            item.price = Number(origPrice.toFixed(2));
            return renderCart();
        }
    }

    item.price = parsedPrice;
    if (typeof markPosInvoiceModified === 'function') markPosInvoiceModified();
    renderCart();
}

function resetBill() {
    cart = [];
    isEditMode = false;
    window.isEditMode = false;
    editingInvoiceId = null;
    window.editingInvoiceId = null;
    editingOriginalDate = null;
    window.editingOriginalDate = null;
    editingInvoiceType = null;
    window.editingInvoiceType = null;
    editingOriginalPartner = null;
    window.editingOriginalPartner = null;
    editingOriginalItems = [];
    window.editingOriginalItems = [];

    window._posCurrentNavState = { invoiceId: null, dateISO: null, id: null };
    window._posInvoiceModified = false;
    if (typeof tabStates !== 'undefined' && typeof activeTabId !== 'undefined' && tabStates[activeTabId]) {
        tabStates[activeTabId].viewingInvoiceId = null;
        tabStates[activeTabId].posNavState = null;
        tabStates[activeTabId].invoiceModified = false;
        tabStates[activeTabId].isEditMode = false;
        tabStates[activeTabId].editingInvoiceId = null;
        tabStates[activeTabId].editingInvoiceType = null;
        tabStates[activeTabId].editingOriginalItems = [];
    }
    if (typeof updateActiveTabTitle === 'function') {
        updateActiveTabTitle('عميل نقدي', 'بيع');
    }

    const mainSaveBtn = document.querySelector('#sales-section .btn-save');

    if (mainSaveBtn) {

        mainSaveBtn.style.background = '';

        mainSaveBtn.innerHTML = '<span>✅ حفظ الفاتورة</span><span class="shortcut">F9</span>';

    }

    currentTotal = 0;

    document.getElementById('discountInput').value = 0;

    document.getElementById('discountType').value = 'val';

    document.getElementById('taxInput').value = 0;

    document.getElementById('taxType').value = 'val';

    document.getElementById('tenderedAmount').value = '';

    document.getElementById('customerName').value = '';

    if (document.getElementById('salesNotes')) document.getElementById('salesNotes').value = '';

    document.getElementById('changeAmount').innerText = '0.00';

    if (document.getElementById('cartFilterInput')) document.getElementById('cartFilterInput').value = '';

    if (document.getElementById('customerCodeDisplay')) document.getElementById('customerCodeDisplay').innerText = '---';

    if (document.getElementById('customerBalanceDisplay')) document.getElementById('customerBalanceDisplay').innerText = '0.00';

    if (document.getElementById('salesItemsCount')) document.getElementById('salesItemsCount').innerText = '0';

    if (document.getElementById('salesTotalQty')) document.getElementById('salesTotalQty').innerText = '0';

    const now = new Date();

    const sDate = document.getElementById('salesDate');
    if (sDate) {
        sDate.value = now.toLocaleDateString('en-CA');
        sDate.removeAttribute('data-touched');
        if (sDate.dataset) delete sDate.dataset.touched;
    }

    const sTime = document.getElementById('salesTime');
    if (sTime) {
        sTime.value = now.toTimeString().slice(0, 5);
        sTime.removeAttribute('data-touched');
        if (sTime.dataset) delete sTime.dataset.touched;
    }

    renderCart();

    if (typeof updatePosNavUIState === 'function') {
        updatePosNavUIState(null);
    }

    // تحديث رقم الفاتورة في المربع العلوي مع التلميح الذكي
    if (typeof updateSalesBadgeUI === 'function') {
        updateSalesBadgeUI();
    }

    // 💡 استعادة طريقة السداد الافتراضية للفاتورة القادمة (إما الخيار المثبت بالدبوس 📌 أو كاش تلقائياً)
    const pinnedMethod = getStore('pinned_payment_method');
    const methodSelect = document.getElementById('sales-sectionPaymentMethodSelect') || document.getElementById('salesPaymentMethodSelect');
    if (methodSelect) {
        let applied = false;
        if (pinnedMethod && Array.from(methodSelect.options).some(o => o.value === pinnedMethod)) {
            methodSelect.value = pinnedMethod;
            applied = true;
        }
        if (!applied) {
            // اختيار بند الكاش المتاح بالقائمة بدقة واحترافية لمنع فراغ المربع نهائياً
            const defaultCashOpt = Array.from(methodSelect.options).find(o => 
                o.value === 'كاش (نقدي)' || o.value.includes('كاش') || o.value.includes('نقدي')
            ) || methodSelect.options[0];
            if (defaultCashOpt) {
                methodSelect.value = defaultCashOpt.value;
            }
        }
        if (typeof selectMethod === 'function') selectMethod(methodSelect);
        selectedMethod = methodSelect.value;
    }
    if (typeof checkPaymentPinState === 'function') checkPaymentPinState();

    // 💡 استعادة مستوى السعر الافتراضي للفاتورة القادمة (إما المثبت بالدبوس 📌 أو الافتراضي)
    if (typeof loadPinnedPriceLevel === 'function') loadPinnedPriceLevel();

    // تصفير لوحة صورة الموديل
    if (typeof resetPOSProductImagePreview === 'function') resetPOSProductImagePreview();

    if (typeof saveCurrentTabState === 'function') saveCurrentTabState();
    if (typeof updateActiveTabTitle === 'function') updateActiveTabTitle('', 'بيع');

    document.getElementById('productSearch').focus();
}

// 📌 إدارة وتثبيت طريقة الدفع المفضلة للفواتير القادمة
window.togglePinPaymentMethod = function(e) {
    if (e) e.stopPropagation();
    const methodSelect = document.getElementById('sales-sectionPaymentMethodSelect') || document.getElementById('salesPaymentMethodSelect');
    if (!methodSelect) return;

    const currentVal = methodSelect.value;
    const existingPinned = getStore('pinned_payment_method');

    if (existingPinned === currentVal) {
        // إلغاء التثبيت
        setStore('pinned_payment_method', '');
        if (typeof showToast === 'function') showToast("🔓 تم إلغاء تثبيت طريقة الدفع المفضلة", "info");
    } else {
        // تثبيت الخيار الحالي
        setStore('pinned_payment_method', currentVal);
        const nameMap = { 'نقدي': 'كاش 💵', 'آجل': 'آجل ⏳', 'تحويل': 'بنك 🏦' };
        if (typeof showToast === 'function') showToast(`📌 تم تثبيت (${nameMap[currentVal] || currentVal}) كطريقة دفع افتراضية للفواتير القادمة`, "success");
    }

    window.checkPaymentPinState();
};

window.checkPaymentPinState = function() {
    const pinBtn = document.getElementById('pinPaymentMethodBtn');
    const methodSelect = document.getElementById('sales-sectionPaymentMethodSelect') || document.getElementById('salesPaymentMethodSelect');
    if (!pinBtn || !methodSelect) return;

    const pinnedVal = getStore('pinned_payment_method');
    const currentVal = methodSelect.value;

    if (pinnedVal && pinnedVal === currentVal) {
        pinBtn.style.opacity = '1';
        pinBtn.style.color = '#f59e0b';
        pinBtn.style.transform = 'scale(1.25)';
        pinBtn.title = `طريقة الدفع (${pinnedVal}) مثبتة كافتراضي. انقر لإلغاء التثبيت`;
    } else {
        pinBtn.style.opacity = '0.5';
        pinBtn.style.color = 'inherit';
        pinBtn.style.transform = 'none';
        pinBtn.title = 'تثبيت طريقة الدفع الحالية كافتراضي للفواتير القادمة';
    }
};

// ================= 📌 إدارة وتثبيت مستوى سعر البيع الدائم (Pinned Price Level) =================
window.isPriceLevelPinned = function() {
    const pinned = getStore('pos_price_level_pinned');
    return pinned === 'true' || pinned === true;
};

window.getPinnedPriceLevel = function() {
    return getStore('pos_pinned_price_level') || 'retail';
};

window.loadPinnedPriceLevel = function() {
    const priceLevelSelect = document.getElementById('salesPriceLevel');
    const pinBtn = document.getElementById('pinPriceLevelBtn');
    const pinIcon = document.getElementById('pinPriceLevelIcon');
    if (!priceLevelSelect) return;

    const isPinned = window.isPriceLevelPinned();
    const pinnedLevel = window.getPinnedPriceLevel();

    if (isPinned) {
        priceLevelSelect.value = pinnedLevel;
        if (pinBtn) {
            pinBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            pinBtn.style.borderColor = '#34d399';
            pinBtn.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.4)';
            pinBtn.title = `مستوى السعر (${pinnedLevel === 'wholesale' ? 'جملة تجار' : 'قطاعي'}) مُثبّت دائماً كافتراضي (انقر لإلغاء التثبيت)`;
        }
        if (pinIcon) pinIcon.innerText = '📌';
    } else {
        if (pinBtn) {
            pinBtn.style.background = '#f1f5f9';
            pinBtn.style.borderColor = '#cbd5e1';
            pinBtn.style.color = '#475569';
            pinBtn.style.boxShadow = 'none';
            pinBtn.title = 'انقر لتثبيت مستوى السعر الحالي كافتراضي دائم';
        }
        if (pinIcon) pinIcon.innerText = '📍';
    }
};

window.togglePinPriceLevel = async function(e) {
    if (e) e.stopPropagation();
    const priceLevelSelect = document.getElementById('salesPriceLevel');
    if (!priceLevelSelect) return;

    const currentLevel = priceLevelSelect.value;
    const isCurrentlyPinned = window.isPriceLevelPinned();

    if (!isCurrentlyPinned) {
        // تثبيت دائم
        setStore('pos_price_level_pinned', 'true');
        setStore('pos_pinned_price_level', currentLevel);
        try {
            if (typeof db !== 'undefined' && db.settings) {
                await db.settings.put({ id: 'pinned_price_level', value: currentLevel, isPinned: true });
            }
        } catch(err) {}
        window.loadPinnedPriceLevel();
        if (typeof showToast === 'function') {
            showToast(`📌 تم تثبيت وضع (${currentLevel === 'wholesale' ? 'جملة تجار 📦' : 'القطاعي 🛒'}) كافتراضي دائم للبرنامج!`, 'success');
        }
    } else {
        // إلغاء التثبيت
        setStore('pos_price_level_pinned', 'false');
        try {
            if (typeof db !== 'undefined' && db.settings) {
                await db.settings.put({ id: 'pinned_price_level', value: currentLevel, isPinned: false });
            }
        } catch(err) {}
        window.loadPinnedPriceLevel();
        if (typeof showToast === 'function') {
            showToast('📍 تم إلغاء تثبيت مستوى السعر', 'info');
        }
    }
};

window.onSalesPriceLevelChange = function() {
    const priceLevelSelect = document.getElementById('salesPriceLevel');
    if (!priceLevelSelect) return;

    const newLevel = priceLevelSelect.value;
    if (window.isPriceLevelPinned()) {
        setStore('pos_pinned_price_level', newLevel);
        try {
            if (typeof db !== 'undefined' && db.settings) {
                db.settings.put({ id: 'pinned_price_level', value: newLevel, isPinned: true });
            }
        } catch(err) {}
        window.loadPinnedPriceLevel();
    }
    updateCartPriceLevel();
};

// --- 2. رسم الجدول والحسابات ---

function renderCart() {

    const tbody = document.getElementById('cartTableBody');
    if (!tbody) return;

    // حفظ حالة التركيز الحالية قبل تفريغ الجدول
    const activeEl = document.activeElement;
    let restoreFocus = null;
    if (activeEl && tbody.contains(activeEl)) {
        const row = activeEl.closest('tr');
        const rowIndex = row ? Array.from(tbody.children).indexOf(row) : -1;
        if (rowIndex !== -1) {
            if (activeEl.classList.contains('qty-input')) {
                restoreFocus = { rowIndex, selector: '.qty-input' };
            } else if (activeEl.classList.contains('price-input')) {
                restoreFocus = { rowIndex, selector: '.price-input' };
            }
        }
    }

    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();

    let subTotal = 0;

    cart.forEach((item, index) => {

        const itemTotal = item.price * item.qty;

        subTotal += itemTotal;

        let unitOptions = `<option value="قطعة">قطعة</option>`;

        if (item.units && item.units.length > 0) {

            // selectedUnit قد يكون object أو string

            const selectedUnitName = item.selectedUnit

                ? (typeof item.selectedUnit === 'object' ? item.selectedUnit.unitName : item.selectedUnit)

                : null;

            unitOptions = item.units.map(u =>

                `<option value="${u.unitName}" ${u.unitName === selectedUnitName ? 'selected' : ''}>${u.unitName}</option>`

            ).join('');

        }

        const tr = document.createElement('tr');

        // تمييز الأصناف التي نفد رصيدها (خلصانة) بصرياً

        const pInfo = productsDB.find(p => p.id === item.id || p.name === item.name);

        if (pInfo && pInfo.stock <= 0) {
            tr.classList.add('out-of-stock-row');
        }

        const { sizeElement, colorElement } = renderVariantSelectElements(item, index, 'sales');

        const discountTag = (parseFloat(item.discount) > 0) 
            ? `<div style="font-size:0.72rem; color:#dc2626; font-weight:800; display:flex; align-items:center; justify-content:center; gap:3px; margin-top:2px;" title="خصم ${item.discount}%">
                 <span style="text-decoration:line-through; opacity:0.65;">${(parseFloat(item.originalPrice) || (item.price / (1 - (parseFloat(item.discount) || 0) / 100))).toFixed(2)}</span>
                 <span style="background:#fee2e2; color:#b91c1c; padding:1px 4px; border-radius:4px;">-${item.discount}%</span>
               </div>` 
            : '';

        const isPriceLocked = (typeof currentUser !== 'undefined' && currentUser && currentUser.lockPriceEdit);
        const canEditPrice = !isPriceLocked && ((typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') 
            || (typeof hasPermission === 'function' && hasPermission('docs_price_edit')));

        const priceFieldHtml = canEditPrice 
            ? `<input type="number" class="price-input" value="${(parseFloat(item.price) || 0).toFixed(2)}" min="0" step="0.01"
                      onchange="updateCartPrice(${index}, this.value)" onclick="this.select()" title="تعديل السعر"
                      style="width: 100px; max-width: 100%; height: 34px; font-size: 0.95rem; font-weight: 900; text-align: center; border-radius: 8px; border: 2px solid #3b82f6; background: #eff6ff; color: #1e40af; box-sizing: border-box; padding: 2px 4px;">`
            : `<input type="text" class="price-input" value="${(parseFloat(item.price) || 0).toFixed(2)}" readonly
                      title="${isPriceLocked ? '🔒 تعديل سعر البيع مقفل ومحمي لهذا الحساب' : '🔒 تعديل سعر البيع مقفل للكاشير ومصرح به للمدير فقط'}"
                      style="width: 100px; max-width: 100%; height: 34px; font-size: 0.95rem; font-weight: 900; text-align: center; border-radius: 8px; border: 1.5px dashed #cbd5e1; background: #f8fafc; color: #64748b; cursor: not-allowed; box-sizing: border-box; padding: 2px 4px;">`;

        const safeItemName = (typeof escapeHtml === 'function') ? escapeHtml(item.name || '') : (item.name || '');
        const safeItemCode = (typeof escapeHtml === 'function') ? escapeHtml(item.code || '---') : (item.code || '---');

        tr.innerHTML = `
                    <td style="font-weight: 800; color: #64748b;">${index + 1}</td>
                    <td style="font-size: 0.82rem; color: #475569; font-weight: bold;">${safeItemCode}</td>
                    <td style="font-weight: 900; color: #1e293b; text-align: right; vertical-align: middle; min-width: 140px;">
                        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 3px; width: 100%;">
                            <span style="width: 100%; line-height: 1.35; font-size: 0.92rem; color: #0f172a; word-break: normal; white-space: normal;">${safeItemName}</span>
                            <button type="button" onclick="event.stopPropagation(); window.openInquiryForCartItem(${index});"
                                title="استعلام فوري عن رصيد ومقاسات وألوان هذا الموديل بكافة المخازن والفروع"
                                style="background: #ecfdf5; border: 1px solid #10b981; color: #047857; border-radius: 6px; padding: 1px 7px; font-size: 0.74rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; transition: all 0.15s; margin-top: 1px; box-shadow: 0 1px 2px rgba(0,0,0,0.04);"
                                onmouseover="this.style.background='#059669'; this.style.color='#ffffff';"
                                onmouseout="this.style.background='#ecfdf5'; this.style.color='#047857';">
                                <span style="font-size: 0.85rem; line-height: 1;">❓</span>
                                <span>استعلام المقاسات والرصيد</span>
                            </button>
                        </div>
                    </td>
                    <td class="col-variant-size" style="text-align: center;">${sizeElement}</td>
                    <td class="col-variant-color" style="text-align: center;">${colorElement}</td>
                    <td style="text-align: center;">
                        <select onchange="updateItemUnit(${index}, this.value, 'sales')" 
                            style="width: 80px; max-width: 100%; border: 1.5px solid #cbd5e1; background: #fff; color: #1e293b; border-radius: 6px; padding: 4px; font-weight: 800; font-size: 0.85rem; outline: none; cursor: pointer; text-align: center;">
                            ${unitOptions}
                        </select>
                    </td>
                    <td style="text-align: center;">
                        <input type="number" class="qty-input" value="${item.qty}" min="1" step="any"
                               onchange="updateQty(${index}, this.value)" onclick="this.select()" title="تعديل الكمية"
                               style="width: 72px; height: 34px; font-size: 1.1rem; font-weight: 900; text-align: center; border-radius: 8px; border: 2px solid #10b981; background: #ecfdf5; color: #065f46; box-sizing: border-box; padding: 2px 4px;">
                    </td>
                    <td style="text-align: center;">
                        ${priceFieldHtml}
                        ${discountTag}
                    </td>
                    <td class="cart-item-total" style="font-weight: 900; color: #047857; font-size: 1.1rem; text-align: center;">${itemTotal.toFixed(2)}</td>
                    <td style="text-align: center;">
                        <button class="btn-delete-row" onclick="removeFromCart(${index})" title="حذف هذا الصنف"
                            style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; border-radius: 6px; padding: 5px 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: 0.2s;">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </td>
        `;
        tr.onclick = (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                if (window._activeCartRow && window._activeCartRow !== tr) {
                    window._activeCartRow.style.backgroundColor = '';
                    window._activeCartRow.style.boxShadow = '';
                }
                window._activeCartRow = tr;
                tr.style.backgroundColor = '#eff6ff';
                tr.style.boxShadow = 'inset 4px 0 0 #2563eb';
                updatePOSProductImagePreview(item.id, item.selectedVariant || item);
            }
        };
        // عند مرور مؤشر الماوس على أي صنف في الفاتورة، تظهر صورته مع إطار محدد فوراً وبدون استعلام DOM ثقيل
        tr.onmouseenter = () => {
            if (window._activeCartRow && window._activeCartRow !== tr) {
                window._activeCartRow.style.backgroundColor = '';
                window._activeCartRow.style.boxShadow = '';
            }
            window._activeCartRow = tr;
            tr.style.backgroundColor = '#eff6ff';
            tr.style.boxShadow = 'inset 4px 0 0 #2563eb';
            updatePOSProductImagePreview(item.id, item.selectedVariant || item);
        };
        tr.onmouseleave = () => {
            if (window._activeCartRow === tr) {
                tr.style.backgroundColor = '';
                tr.style.boxShadow = '';
                window._activeCartRow = null;
            }
        };
        tr.style.cursor = 'pointer';
        fragment.appendChild(tr);

    });

    tbody.appendChild(fragment);

    if (restoreFocus) {
        const rows = tbody.querySelectorAll('tr');
        if (rows[restoreFocus.rowIndex]) {
            const target = rows[restoreFocus.rowIndex].querySelector(restoreFocus.selector);
            if (target) {
                target.focus();
                try { target.select(); } catch(e) {}
            }
        }
    }

    document.getElementById('subTotalDisplay').innerText = subTotal.toFixed(2);

    calculateTotals(subTotal);

    updateHeaderPartnerInfo();

}

/**
 * استعلام سريع ومباشر لصنف في سلة المبيعات
 * يفتح نافذة الاستعلام مفلترة فوراً على نفس الموديل والمقاس واللون المحدد
 */
window.openInquiryForCartItem = function(index) {
    if (typeof cart === 'undefined' || !cart[index]) return;
    const item = cart[index];
    const targetProduct = (typeof productsDB !== 'undefined' && Array.isArray(productsDB))
        ? productsDB.find(p => p.id === item.id || p.name === item.name)
        : null;

    if (!targetProduct && !item.id) {
        if (typeof showToast === 'function') showToast('تعذر العثور على بيانات الصنف في النظام', 'error');
        return;
    }

    const productId = targetProduct ? targetProduct.id : item.id;
    const targetSize = item.selectedSize || (item.selectedVariant ? item.selectedVariant.size : '');
    const targetColor = item.selectedColor || (item.selectedVariant ? item.selectedVariant.color : '');
    const targetVariant = {
        size: targetSize,
        color: targetColor,
        barcode: (item.selectedVariant && item.selectedVariant.barcode) ? item.selectedVariant.barcode : (item.code || '')
    };

    if (typeof window.openFastItemInquiryModal === 'function') {
        window.openFastItemInquiryModal(productId, targetVariant);
    } else {
        if (typeof showToast === 'function') showToast('نافذة الاستعلام السريع غير متاحة حالياً', 'warning');
    }
};

function updateCartPriceLevel() {

    const priceLevelSelect = document.getElementById('salesPriceLevel');

    const priceLevel = priceLevelSelect ? priceLevelSelect.value : 'retail';

    cart.forEach(item => {
        // البحث عن المنتج الأصلي في قاعدة البيانات لجلب أحدث أسعار الجملة والقطاعي
        const product = productsDB.find(p => p.id === item.id || p.name === item.name);
        if (!product) return;

        let basePrice = 0;

        const sSize = String(item.selectedSize || item.size || '').trim();
        const sColor = String(item.selectedColor || item.color || '').trim();

        // 1. البحث عن التشكيلة المطابقة (المقاس واللون) أولاً
        let matchedVariant = item.selectedVariant || null;
        if (!matchedVariant && product.variants && Array.isArray(product.variants)) {
            matchedVariant = product.variants.find(v => 
                (String(v.size || '').trim() === sSize) && 
                (String(v.color || '').trim() === sColor)
            ) || product.variants.find(v => 
                (!sSize || String(v.size || '').trim() === sSize) && 
                (!sColor || String(v.color || '').trim() === sColor)
            );
        }

        if (matchedVariant) {
            const vPrice = parseFloat(matchedVariant.price) || parseFloat(product.price) || 0;
            const vWholesale = parseFloat(matchedVariant.wholesale) || parseFloat(matchedVariant.price) || parseFloat(product.wholesale) || parseFloat(product.price) || 0;
            if (priceLevel === 'wholesale') {
                basePrice = vWholesale > 0 ? vWholesale : (parseFloat(product.wholesale) || vPrice);
            } else {
                basePrice = vPrice;
            }
        } else if (item.selectedUnit && typeof item.selectedUnit === 'object') {
            // إذا كان هناك وحدة مختارة، نبحث عن نفس الوحدة في المنتج الأصلي
            const unitInDb = product.units ? product.units.find(u => u.unitName === item.selectedUnit.unitName) : null;
            if (unitInDb) {
                if (priceLevel === 'wholesale') {
                    basePrice = parseFloat(unitInDb.wholesale) || parseFloat(unitInDb.price) || 0;
                } else {
                    basePrice = parseFloat(unitInDb.price) || 0;
                }
            } else {
                basePrice = (priceLevel === 'wholesale') ? (parseFloat(product.wholesale) || parseFloat(product.price) || 0) : (parseFloat(product.price) || 0);
            }
        } else {
            // السعر الأساسي للمنتج
            if (priceLevel === 'wholesale') {
                basePrice = parseFloat(product.wholesale) || parseFloat(product.price) || 0;
            } else {
                basePrice = parseFloat(product.price) || 0;
            }
        }

        item.originalPrice = basePrice;
        const itemDisc = parseFloat(item.discount !== undefined ? item.discount : product.discount) || 0;
        item.discount = itemDisc;
        if (itemDisc > 0) {
            item.price = Number(Math.max(0, basePrice - (basePrice * itemDisc / 100)).toFixed(2));
        } else {
            item.price = basePrice;
        }
    });

    if (typeof showToast === 'function') {

        showToast(`تم تحويل الأسعار إلى وضع: ${priceLevel === 'wholesale' ? 'الجملة 📦' : 'القطاعي 🛒'}`, 'info');

    }

    renderCart();

}

function calculateTotals(subTotalParam) {

    // إذا لم يتم تمرير المجموع الفرعي، نحسبه من الجدول الحالي

    let subTotal = subTotalParam;

    if (subTotal === undefined) {

        subTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    }

    // تحديث إجمالي الأصناف والكمية

    const itemsCount = cart.length;

    const totalQty = cart.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0);

    if (document.getElementById('salesItemsCount')) document.getElementById('salesItemsCount').innerText = itemsCount;

    if (document.getElementById('salesTotalQty')) document.getElementById('salesTotalQty').innerText = totalQty;

    if (document.getElementById('subTotalDisplay')) document.getElementById('subTotalDisplay').innerText = subTotal.toFixed(2);

    // 🛡️ فحص صلاحيات الخصم وأقصى نسبة مصرحة للموظف والمدير
    const isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
    const canDiscount = isAdmin || (typeof hasPermission === 'function' && hasPermission('docs_discount'));
    
    let maxDiscountPerc = 100;
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.maxDiscountPercent !== undefined && currentUser.maxDiscountPercent !== null && currentUser.maxDiscountPercent !== '') {
        maxDiscountPerc = parseFloat(currentUser.maxDiscountPercent);
        if (isNaN(maxDiscountPerc)) maxDiscountPerc = isAdmin ? 100 : 5;
    } else {
        maxDiscountPerc = isAdmin ? 100 : 5;
    }

    const discInputEl = document.getElementById('discountInput');
    const discTypeEl = document.getElementById('discountType');
    
    if (discInputEl) {
        if (!canDiscount || maxDiscountPerc <= 0) {
            discInputEl.value = 0;
            discInputEl.disabled = true;
            discInputEl.title = '🔒 الخصم غير مصرح به لهذا الحساب';
            discInputEl.style.cursor = 'not-allowed';
            discInputEl.style.background = '#f1f5f9';
            if (discTypeEl) discTypeEl.disabled = true;
        } else {
            discInputEl.disabled = false;
            discInputEl.title = `أقصى خصم مصرح به: ${maxDiscountPerc}%`;
            discInputEl.style.cursor = '';
            discInputEl.style.background = '';
            if (discTypeEl) discTypeEl.disabled = false;
        }
    }

    // حساب الخصم والتحقق من صحته وقواعد الأمان المنطقية
    let discountVal = parseFloat(document.getElementById('discountInput').value) || 0;
    if (discountVal < 0) {
        document.getElementById('discountInput').value = 0;
        discountVal = 0;
        if (typeof showToast === 'function') showToast("⚠️ لا يمكن إدخال قيمة خصم بالسالب!", "warning");
    }

    const discountType = document.getElementById('discountType').value;

    // 🛑 فحص الأمان: منع تجاوز أقصى نسبة خصم مصرحة للكاشير أو المدير
    if (canDiscount && maxDiscountPerc > 0 && maxDiscountPerc < 100) {
        if (discountType === 'perc' && discountVal > maxDiscountPerc) {
            if (window.BayanBarcode && typeof BayanBarcode.playBeep === 'function') BayanBarcode.playBeep(false);
            if (typeof showToast === 'function') showToast(`⚠️ أقصى نسبة خصم مصرح بها لحسابك هي (${maxDiscountPerc}%)!`, "warning");
            discountVal = maxDiscountPerc;
            if (discInputEl) discInputEl.value = maxDiscountPerc;
        } else if (discountType === 'val') {
            const maxVal = subTotal > 0 ? (subTotal * maxDiscountPerc / 100) : 0;
            if (discountVal > maxVal && subTotal > 0) {
                if (window.BayanBarcode && typeof BayanBarcode.playBeep === 'function') BayanBarcode.playBeep(false);
                if (typeof showToast === 'function') showToast(`⚠️ قيمة الخصم تتجاوز الحد الأقصى المصرح به (${maxDiscountPerc}% = ${maxVal.toFixed(2)} ج.م)!`, "warning");
                discountVal = Number(maxVal.toFixed(2));
                if (discInputEl) discInputEl.value = discountVal;
            }
        }
    }

    // استدعاء محرك الفواتير المركزي الموحد لحساب المجموع، الخصم، الإضافة، والضريبة
    let invoiceSummary = null;
    if (window.BayanInvoiceEngine && typeof window.BayanInvoiceEngine.calculateInvoiceSummary === 'function') {
        invoiceSummary = window.BayanInvoiceEngine.calculateInvoiceSummary({
            cart,
            discountVal,
            discountType,
            taxVal: parseFloat(document.getElementById('taxInput')?.value) || 0,
            taxType: (document.getElementById('taxType')?.value) || 'val',
            maxDiscountPerc,
            canDiscount
        });
    }

    let discountAmount = invoiceSummary ? invoiceSummary.discountAmount : ((discountType === 'perc') ? (subTotal * discountVal / 100) : discountVal);
    
    if (subTotal <= 0) {
        discountAmount = 0;
    } else if (discountAmount > subTotal) {
        if (typeof showToast === 'function') showToast("⚠️ قيمة الخصم أكبر من إجمالي الفاتورة! تم ضبط الخصم بحد أقصى مساوٍ للفاتورة", "warning");
        discountAmount = subTotal;
    }

    if (document.getElementById('salesDiscountAmountDisplay')) document.getElementById('salesDiscountAmountDisplay').innerText = discountAmount.toFixed(2);

    // 🛡️ فحص صلاحية الإضافة / الضريبة وأقصى نسبة مصرحة للكاشير والمدير
    const canTax = isAdmin || (typeof hasPermission === 'function' && hasPermission('docs_tax'));
    let maxAdditionPerc = 100;
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.maxAdditionPercent !== undefined && currentUser.maxAdditionPercent !== null && currentUser.maxAdditionPercent !== '') {
        maxAdditionPerc = parseFloat(currentUser.maxAdditionPercent);
        if (isNaN(maxAdditionPerc)) maxAdditionPerc = isAdmin ? 100 : 15;
    } else {
        maxAdditionPerc = isAdmin ? 100 : 15;
    }

    const taxInputEl = document.getElementById('taxInput');
    const taxTypeEl = document.getElementById('taxType');
    if (taxInputEl) {
        if (!canTax || maxAdditionPerc <= 0) {
            taxInputEl.value = 0;
            taxInputEl.disabled = true;
            taxInputEl.title = '🔒 إضافة الرسوم أو الضريبة غير مصرح بها لهذا الحساب';
            taxInputEl.style.cursor = 'not-allowed';
            taxInputEl.style.background = '#f1f5f9';
            if (taxTypeEl) taxTypeEl.disabled = true;
        } else {
            taxInputEl.disabled = false;
            taxInputEl.title = `أقصى إضافة مصرح بها: ${maxAdditionPerc}%`;
            taxInputEl.style.cursor = '';
            taxInputEl.style.background = '';
            if (taxTypeEl) taxTypeEl.disabled = false;
        }
    }

    // حساب الإضافة/الضريبة والتحقق من قيم الأمان
    let taxVal = parseFloat(document.getElementById('taxInput').value) || 0;
    if (taxVal < 0) {
        document.getElementById('taxInput').value = 0;
        taxVal = 0;
        if (typeof showToast === 'function') showToast("⚠️ لا يمكن إدخال قيمة إضافة أو ضريبة بالسالب!", "warning");
    }

    const taxType = (document.getElementById('taxType') && document.getElementById('taxType').value) ? document.getElementById('taxType').value : 'val';

    // 🛑 فحص الأمان: منع تجاوز أقصى نسبة إضافة مصرح بها
    if (canTax && maxAdditionPerc > 0 && maxAdditionPerc < 100) {
        if (taxType === 'perc' && taxVal > maxAdditionPerc) {
            if (window.BayanBarcode && typeof BayanBarcode.playBeep === 'function') BayanBarcode.playBeep(false);
            if (typeof showToast === 'function') showToast(`⚠️ أقصى نسبة إضافة مصرح بها لحسابك هي (${maxAdditionPerc}%)!`, "warning");
            taxVal = maxAdditionPerc;
            if (taxInputEl) taxInputEl.value = maxAdditionPerc;
        } else if (taxType === 'val') {
            const maxTaxVal = subTotal > 0 ? (subTotal * maxAdditionPerc / 100) : 0;
            if (taxVal > maxTaxVal && subTotal > 0) {
                if (window.BayanBarcode && typeof BayanBarcode.playBeep === 'function') BayanBarcode.playBeep(false);
                if (typeof showToast === 'function') showToast(`⚠️ قيمة الإضافة تتجاوز الحد الأقصى المصرح به (${maxAdditionPerc}% = ${maxTaxVal.toFixed(2)} ج.م)!`, "warning");
                taxVal = Number(maxTaxVal.toFixed(2));
                if (taxInputEl) taxInputEl.value = taxVal;
            }
        }
    }

    let taxAmount = (taxType === 'perc') ? (subTotal * taxVal / 100) : taxVal;
    if (invoiceSummary && typeof invoiceSummary.taxAmount === 'number') {
        taxAmount = invoiceSummary.taxAmount;
    }

    if (document.getElementById('salesTaxAmountDisplay')) document.getElementById('salesTaxAmountDisplay').innerText = taxAmount.toFixed(2);

    const settings = JSON.parse(getStore('pos_settings') || '{}');
    const globalTaxEnabled = settings.taxEnabled || false;
    const globalTaxPercent = parseFloat(settings.taxPercent) || 0;
    let globalTaxAmount = invoiceSummary ? invoiceSummary.globalTaxAmount : (globalTaxEnabled ? (subTotal * globalTaxPercent / 100) : 0);

    currentTotal = invoiceSummary ? invoiceSummary.finalTotal : (subTotal - discountAmount + taxAmount + globalTaxAmount);

    if (currentTotal < 0) currentTotal = 0;

    // تحديث إجمالي كل سطر في الجدول ليعكس توزيع الخصم والمصاريف
    if (subTotal > 0) {
        const ratio = currentTotal / subTotal;
        const rows = document.querySelectorAll('#cartTableBody tr');
        cart.forEach((item, index) => {
            const row = rows[index];
            if (row) {
                const totalCell = row.querySelector('.cart-item-total') || row.cells[8];
                if (totalCell) {
                    totalCell.innerText = (item.price * item.qty * ratio).toFixed(2);
                }
            }
        });
    }

    // تحديث الإجمالي

    if (document.getElementById('totalAmount')) document.getElementById('totalAmount').innerText = currentTotal.toFixed(2);

    // حساب إجمالي المديونية المتراكمة (الرصيد السابق + الفاتورة - المدفوع)
    const prevBal = parseFloat(document.getElementById('prevBalanceDisplay').innerText) || 0;
    const tenderedInput = document.getElementById('tenderedAmount');
    const curMethod = getSelectedPaymentMethod('sales-section');
    const custName = document.getElementById('customerName') ? document.getElementById('customerName').value.trim() : '';
    const isGenericCust = !custName || (typeof window.isGenericCashPartner === 'function' && window.isGenericCashPartner(custName));
    const isExplicitCred = typeof window.isTransactionCredit === 'function' ? window.isTransactionCredit(curMethod, 0, 0, 0) : (curMethod === 'آجل' || curMethod.includes('آجل') || curMethod.includes('اجل'));

    // إذا كانت المعاملة غير آجلة (كاش / بنك / شبكة)، يتم تحديث المدفوع ليكون مساوياً للإجمالي الجديد تلقائياً سواء كان العميل نقدياً أو مسجلاً بالاسم
    if (!isExplicitCred && tenderedInput) {
        tenderedInput.value = currentTotal.toFixed(2);
    }

    const tendered = parseFloat(tenderedInput ? tenderedInput.value : 0) || 0;

    const grandTotalDebt = prevBal + currentTotal - tendered;

    if (document.getElementById('grandDebtDisplay')) {

        document.getElementById('grandDebtDisplay').innerText = grandTotalDebt.toFixed(2);

    }

    if (typeof calculateChange === 'function') calculateChange();

    // تحديث شارة الربح المباشرة (مع مراعاة تكلفة المقاسات والوحدات الفرعية بدقة)
    const totalCost = cart.reduce((sum, item) => {
        let itemCost = 0;
        let effCost = (item.selectedVariant && item.selectedVariant.cost) 
            ? (parseFloat(item.selectedVariant.cost) || 0) 
            : (parseFloat(item.cost) || 0);

        if (item.selectedUnit && typeof item.selectedUnit === 'object') {
            const unitCost = parseFloat(item.selectedUnit.cost);
            if (!isNaN(unitCost) && item.selectedUnit.cost !== '') {
                // تكلفة الوحدة الفرعية مدخلة صراحةً
                itemCost = unitCost * item.qty;
            } else {
                // الوحدة بدون تكلفة مخصصة → استخدم التكلفة الأساسية × factor
                const factor = parseFloat(item.unitFactor) || 1;
                itemCost = effCost * item.qty * factor;
            }
        } else {
            // لا وحدة فرعية → تكلفة الصنف أو المقاس مباشرة
            itemCost = effCost * item.qty;
        }
        return sum + itemCost;
    }, 0);

    const profit = currentTotal - totalCost;

    const profitBadge = document.getElementById('currentProfitBadge');

    if (profitBadge) {

        if (cart.length === 0 || currentTotal === 0) {

            profitBadge.innerText = '0.00';

            profitBadge.style.color = '';

        } else {

            profitBadge.innerText = profit.toFixed(2);

            profitBadge.style.color = profit >= 0 ? 'var(--main-green)' : '#e74c3c';

        }

    }

    // منطق الأزرار الذكية

    const btnContainer = document.getElementById('dynamicButtons');

    btnContainer.innerHTML = '';

    // الحصول على وسيلة الدفع المختارة

    const method = getSelectedPaymentMethod('sales-section');
    const isCreditMethod = (typeof window.getSelectedPaymentMethodType === 'function' && window.getSelectedPaymentMethodType('sales-section') === 'credit')
        || (typeof window.isTransactionCredit === 'function' ? window.isTransactionCredit(method) : (method === 'آجل' || method.includes('آجل') || method.includes('أجل')));

    if (currentTotal > 0 && isCreditMethod) {

        btnContainer.style.display = 'flex';

        // الزر الأول: المبلغ بالضبط

        createBtn(btnContainer, currentTotal);

        // الزر الثاني: أقرب رقم صحيح أعلى (Logic)

        let nextRound = Math.ceil(currentTotal / 50) * 50;

        if (nextRound === currentTotal) nextRound += 50;

        createBtn(btnContainer, nextRound);

        // زر ثالث اختياري (فئة أكبر)

        let bigNote = Math.ceil(currentTotal / 100) * 100;

        if (bigNote <= nextRound) bigNote += 100;

        createBtn(btnContainer, bigNote);

    } else {

        btnContainer.style.display = 'none';

    }

}

async function saveBill(force = false, accountChecked = false) {

    if (!checkPermission('docs_add')) return false;

    if (window.isSavingTransaction) return false;

    window.isSavingTransaction = true;

    // تعطيل أزرار الحفظ فوراً لمنع الضغط المزدوج
    const saveBtns = document.querySelectorAll('#sales-section .btn-save, #sales-section .action-btn');
    saveBtns.forEach(b => { b.disabled = true; b.style.pointerEvents = 'none'; b.style.opacity = '0.6'; });

    try {

        // --- 🛑 التحقق من حدود الباقة المجانية (Free Trial Limit) ---

        const currentPlan = window.getBayanPlan();

        if (!isEditMode && !window.enforceSubscriptionCheck('invoice')) {
            return false;
        }

        if (cart.length === 0) {

            showCustomAlert({ titleText: '⚠️ الفاتورة فارغة', msg: 'لا يمكن حفظ فاتورة بدون أصناف.' });

            return false;

        }

        // --- 🛑 التحقق من سقف الفواتير اليومية (الحماية الضريبية) ---
        if (!isEditMode && typeof isDailyTaxLimitReached === 'function' && isDailyTaxLimitReached()) {
            const settings = (typeof getStore === 'function') ? JSON.parse(getStore('pos_settings') || '{}') : {};
            const limit = parseInt(settings.dailyTaxSeqLimit || 0, 10);
            if (window.BayanBarcode && typeof BayanBarcode.playBeep === 'function') BayanBarcode.playBeep(false);
            showCustomAlert({
                type: 'warning',
                titleText: '⚠️ سقف الفواتير اليومية',
                msg: `عفواً، لقد تم الوصول للحد الأقصى للفواتير اليومية المحدد في الإعدادات (${limit} فواتير).\n\nلحماية المنشأة، تم إيقاف إصدار فواتير إضافية لهذا اليوم.\n\n💡 يمكنك زيادة سقف الفواتير من قسم الإعدادات لمتابعة البيع فوراً.`
            });
            return false;
        }

        // --- 0. فحص الأمان الصارم: منع حفظ الفاتورة إذا كان أي صنف أقل من سعر التكلفة ---
        for (const item of cart) {
            const p = productsDB.find(x => x.id === item.id || x.name === item.name);
            if (p) {
                const factor = parseFloat(item.unitFactor) || 1;
                let baseCost = 0;
                const sSize = String(item.selectedSize || item.size || '').trim();
                const sColor = String(item.selectedColor || item.color || '').trim();
                if (p.variants && Array.isArray(p.variants) && (sSize || sColor)) {
                    const effVar = p.variants.find(v => 
                        (!sSize || String(v.size || '').trim() === sSize) && 
                        (!sColor || String(v.color || '').trim() === sColor)
                    );
                    if (effVar && (effVar.cost || effVar.avgBuyPrice || effVar.buyPrice)) {
                        baseCost = parseFloat(effVar.avgBuyPrice) || parseFloat(effVar.cost) || parseFloat(effVar.buyPrice) || 0;
                    }
                }
                if (baseCost <= 0) {
                    baseCost = parseFloat(p.avgBuyPrice) || parseFloat(p.cost) || parseFloat(p.buyPrice) || 0;
                }
                const unitCost = baseCost * factor;
                if (unitCost > 0 && parseFloat(item.price) < unitCost) {
                    if (window.BayanBarcode && typeof BayanBarcode.playBeep === 'function') BayanBarcode.playBeep(false);
                    saveBtns.forEach(b => { b.disabled = false; b.style.pointerEvents = 'auto'; b.style.opacity = '1'; });
                    window.isSavingTransaction = false;
                    showCustomAlert({
                        type: 'error',
                        titleText: '⚠️ غير مسموح بالبيع بخسارة',
                        msg: `لا يمكن حفظ الفاتورة لأن الصنف "<b>${item.name}</b>" مسعر بأقل من سعر التكلفة المحدد من الإدارة.\nيرجى تعديل السعر أولاً.`
                    });
                    return false;
                }
            }
        }

        // --- 1. التحقق الصارم من توفر الكميات في المخزن (منع البيع بالسالب نهائياً بالتجميع الشامل) ---
        let activeWH = 'المخزن الرئيسي';
        if (typeof currentUser !== 'undefined' && currentUser) {
            if (currentUser.role === 'admin' || currentUser.isAdmin === true) {
                activeWH = (currentUser.warehouseName || 'المخزن الرئيسي').trim();
            } else {
                const isWhLocked = (currentUser.lockWarehouseSwitching !== undefined)
                    ? !!currentUser.lockWarehouseSwitching
                    : ((currentUser.permissions && currentUser.permissions.stock && currentUser.permissions.stock.lockWarehouseSwitching !== undefined)
                        ? !!currentUser.permissions.stock.lockWarehouseSwitching
                        : true);
                if (isWhLocked) {
                    // 🔒 حماية أمنية مشددة: الكاشير مقفل بمخزنه المخصص حصراً لمنع التلاعب
                    activeWH = (currentUser.assignedWarehouse && currentUser.assignedWarehouse.trim())
                        ? currentUser.assignedWarehouse.trim()
                        : ((currentUser.warehouseName && currentUser.warehouseName.trim()) ? currentUser.warehouseName.trim() : 'المخزن الرئيسي');
                    currentUser.warehouseName = activeWH;
                } else {
                    // موظف مصرح له بتبديل المخزن
                    activeWH = (currentUser.warehouseName && currentUser.warehouseName.trim()) 
                        ? currentUser.warehouseName.trim() 
                        : (currentUser.assignedWarehouse ? currentUser.assignedWarehouse.trim() : 'المخزن الرئيسي');
                }
            }
        }
        let stockErrors = [];

        // تجميع كميات السلة بالوحدة الأساسية لكل صنف وتشكيلة لمنع تجاوز الرصيد عند تعدد الأسطر أو الوحدات لنفس الصنف
        const aggregatedCartStock = new Map();

        cart.forEach(item => {
            const p = productsDB.find(x => x.id === item.id || x.name === item.name);
            if (!p) return;

            const factor = parseFloat(item.unitFactor) || 1;
            const baseQty = (parseFloat(item.qty) || 0) * factor;
            const sSize = String(item.selectedSize || item.size || '').trim();
            const sColor = String(item.selectedColor || item.color || '').trim();
            const groupKey = `${p.id || p.name}__${sSize}__${sColor}`;

            if (!aggregatedCartStock.has(groupKey)) {
                aggregatedCartStock.set(groupKey, {
                    product: p,
                    size: sSize,
                    color: sColor,
                    totalBaseQty: baseQty,
                    sampleItem: item
                });
            } else {
                aggregatedCartStock.get(groupKey).totalBaseQty += baseQty;
            }
        });

        aggregatedCartStock.forEach(entry => {
            const p = entry.product;
            const sSize = entry.size;
            const sColor = entry.color;
            const totalBaseQty = entry.totalBaseQty;

            let effVariant = null;
            if (p.variants && Array.isArray(p.variants) && (sSize || sColor)) {
                effVariant = p.variants.find(v => 
                    (!sSize || String(v.size || '').trim() === sSize) && 
                    (!sColor || String(v.color || '').trim() === sColor)
                );
            }

            // في وضع التعديل: استرداد إجمالي الكمية الأصلية المحجوزة في الفاتورة لهذا الصنف وتشكيلته لإتاحتها
            let originalQtyInInvoice = 0;
            if (typeof isEditMode !== 'undefined' && isEditMode && typeof editingOriginalItems !== 'undefined' && Array.isArray(editingOriginalItems)) {
                const cleanAttr = (val) => {
                    const s = String(val || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
                    if (!s || s === 'قياسي' || s === 'موحد' || s === 'عام' || s === '-') return '';
                    return s;
                };
                const cSize = cleanAttr(sSize);
                const cColor = cleanAttr(sColor);

                const matchedOriginals = editingOriginalItems.filter(orig => {
                    const origName = orig.product || orig.name || '';
                    const origId = (orig.productId != null && orig.productId !== '') ? orig.productId : orig.id;
                    const isProdMatch = (origName && (origName === p.name || origName === p.id)) ||
                                        (origId != null && (String(origId) === String(p.id) || String(origId) === String(p.name)));
                    if (!isProdMatch) return false;

                    const oSize = cleanAttr(orig.selectedSize || orig.size);
                    const oColor = cleanAttr(orig.selectedColor || orig.color);
                    return oSize === cSize && oColor === cColor;
                });
                matchedOriginals.forEach(orig => {
                    const origFactor = parseFloat(orig.unitFactor) || 1;
                    originalQtyInInvoice += (parseFloat(orig.qty) || 0) * origFactor;
                });
            }

            let currentBaseStock = 0;
            if (effVariant) {
                if (effVariant.warehouseStocks && typeof effVariant.warehouseStocks === 'object' && effVariant.warehouseStocks[activeWH] !== undefined) {
                    currentBaseStock = parseFloat(effVariant.warehouseStocks[activeWH]) || 0;
                } else if (activeWH === 'المخزن الرئيسي' || !effVariant.warehouseStocks) {
                    currentBaseStock = parseFloat(effVariant.stock) || 0;
                } else {
                    currentBaseStock = 0;
                }
            } else {
                if (p.warehouseStocks && typeof p.warehouseStocks === 'object' && p.warehouseStocks[activeWH] !== undefined) {
                    currentBaseStock = parseFloat(p.warehouseStocks[activeWH]) || 0;
                } else if (activeWH === 'المخزن الرئيسي' || !p.warehouseStocks) {
                    currentBaseStock = parseFloat(p.stock) || 0;
                } else {
                    currentBaseStock = 0;
                }
            }

            const availStock = currentBaseStock + originalQtyInInvoice;

            if (totalBaseQty > availStock) {
                const variantInfo = (sSize || sColor) ? ` [${[sSize, sColor].filter(Boolean).join(' - ')}]` : '';
                const availDisplay = availStock.toFixed(2).replace(/\.00$/, '');
                const requestedDisplay = totalBaseQty.toFixed(2).replace(/\.00$/, '');
                stockErrors.push(`❌ ${p.name}${variantInfo}: إجمالي المطلوب (${requestedDisplay} ق) / متوفر في (${activeWH}): (${availDisplay} ق)`);
            }
        });

        if (stockErrors.length > 0) {
            showCustomAlert({
                type: 'error',
                titleText: '🚫 منع البيع بالسالب (عجز مخزني)',
                msg: 'لا يمكن حفظ الفاتورة لأن الكميات المطلوبة غير متوفرة في المخزن:\n\n' + stockErrors.join('\n') + '\n\nيرجى تعديل الكميات للمتابعة.',
                confirmText: 'حسناً، تراجع'
            });
            return false;
        }

        // --- 🛑 شرط محاسبي: الآجل لازم عميل مسجل ---
        const selectedMethod = getSelectedPaymentMethod('sales-section');
        const customerName = document.getElementById('customerName').value.trim();
        const isGenericCustomer = !customerName || (typeof window.isGenericCashPartner === 'function' && window.isGenericCashPartner(customerName));
        const isExplicitCreditMethod = typeof window.isTransactionCredit === 'function' ? window.isTransactionCredit(selectedMethod, 0, 0, 0) : (selectedMethod.includes('آجل') || selectedMethod.includes('اجل'));

        const tenderedInput = document.getElementById('tenderedAmount');
        let tendered = 0;

        if (!isExplicitCreditMethod) {
            // أي معاملة غير آجلة صراحة (كاش، بنك، شبكة، فيزا، محافظ) مدفوعة بالكامل فوراً
            tendered = currentTotal;
            if (tenderedInput) {
                tenderedInput.value = currentTotal.toFixed(2);
            }
        } else {
            // في المعاملة الآجلة، نقرأ المدفوع إن وُجد (دفع جزئي)، وإلا فهو صفر
            tendered = (tenderedInput && tenderedInput.value !== '') ? (parseFloat(tenderedInput.value) || 0) : 0;
        }

        const isCredit = isExplicitCreditMethod;

        if (customerName && !window.isGenericCashPartner(customerName) && typeof checkAccountFrozenAndAlert === 'function') {
            if (checkAccountFrozenAndAlert(customerName)) {
                return false;
            }
        }

        // التحقق الإلزامي من حساب العميل للآجل والتسجيل السريع
        if (!accountChecked) {
            const ok = await window.ensurePartnerAccountExists(customerName, 'عميل', isCredit, () => {
                window.isSavingTransaction = false;
                saveBill(force, true);
            });
            if (!ok) return false;
        }

        // التحقق فقط إذا كان المبلغ المدفوع أقل من المطلوب ولم تكن الفاتورة آجلة (تأكيد الحفظ)

        if (!force && !isCredit && tendered < currentTotal) {

            showCustomAlert({

                type: 'question',

                titleText: '❓ تأكيد العملية',

                msg: 'المبلغ المدفوع أقل من الإجمالي. هل تريد تسجيل الباقي كمديونية؟',

                showCancel: true,

                confirmText: 'نعم، سجل',

                cancelText: 'تراجع',

                onConfirm: () => {
                    window.isSavingTransaction = false;
                    saveBill(true, true);
                }

            });

            return false;

        }

        // تحديث رصيد العميل بناءً للميزة المضافة لجمع الرصيد السابق وعرض تنبيه ذكي

        if (!force && isCredit) {

            const cleanArabic = (str) => (str || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');

            const targetNameClean = cleanArabic(customerName);

            const accIndex = accounts.findIndex(a => cleanArabic(a.name) === targetNameClean);

            if (accIndex !== -1) {

                const acc = accounts[accIndex];

                // التحقق من الحد الائتماني

                const limit = parseFloat(acc.maxDebt) || 0;
                const currentDebt = getAccountBalance(acc.name);
                const newDebtAmount = currentTotal - tendered;
                if (limit > 0 && (currentDebt + newDebtAmount) > limit) {

                    showCustomAlert({

                        type: 'warning',

                        titleText: '⚠️ تحذير شديد: تجاوز الحد الائتماني المسموح!',

                        msg: `

                                <div style="text-align: right; padding: 10px; background: rgba(230, 126, 34, 0.1); border-radius: 15px; border: 1px solid rgba(230, 126, 34, 0.2);">

                                    <p style="margin-bottom: 10px; font-size: 1.1rem;">👤 العميل: <b style="color: var(--accent-gold);">${acc.name}</b></p>

                                    <hr style="opacity: 0.1; margin: 10px 0;">

                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">

                                        <div>

                                            <span style="font-size: 0.8rem; color: #888;">أعلى دين مسموح:</span>

                                            <div style="font-size: 1.2rem; font-weight: 900; color: #27ae60;">${limit.toFixed(2)}</div>

                                        </div>

                                        <div>

                                            <span style="font-size: 0.8rem; color: #888;">الدين الحالي:</span>

                                            <div style="font-size: 1.2rem; font-weight: 900; color: #e74c3c;">${currentDebt.toFixed(2)}</div>

                                        </div>

                                    </div>

                                    <div style="margin-top: 15px; padding: 10px; background: #e67e22; color: white; border-radius: 10px; font-weight: 900; text-align: center;">

                                        ⚠️ الدين بعد الفاتورة: ${(currentDebt + newDebtAmount).toFixed(2)}

                                    </div>

                                    <p style="margin-top: 15px; color: #333; font-size: 0.95rem; text-align: center; font-weight: bold;">

                                        لقد تجاوز العميل الحد الائتماني المحدد له! هل تريد المتابعة وحفظ الفاتورة على أي حال؟

                                    </p>

                                </div>

                            `,

                        showCancel: true,

                        confirmText: 'نعم، احفظ الفاتورة وتجاوز الحد',

                        cancelText: 'تراجع (لتعديل حد الدين من الحسابات)',

                        onConfirm: () => {

                            saveBill(true);

                        }

                    });

                    return false; // إيقاف العملية مؤقتاً في انتظار التأكيد

                }

                // التنبيه الذكي للمديونية

                const totalDue = currentDebt + newDebtAmount;

                showCustomAlert({

                    type: 'question',

                    titleText: '❓ إجمالي الحساب المطلوب',

                    msg: `العميل عليه سابقاً ${currentDebt.toFixed(2)} ج.م، وبالفاتورة الحالية المستحق ${newDebtAmount.toFixed(2)} ج.م.\n\nيصبح إجمالي المديونية: ${totalDue.toFixed(2)} ج.م.\n\nهل تريد الحفظ؟`,

                    showCancel: true,

                    confirmText: 'نعم، احفظ الفاتورة',

                    cancelText: 'إلغاء',

                    onConfirm: () => {

                        // التحديث سيتم عند استدعاء الدالة بقوة

                        saveBill(true);

                    }

                });

                return false; // نوقف التنفيذ حتى يؤكد المستخدم

            }

        }

        // حفظ أسباب الخصم والإضافة الجديدة (التعلم الآلي)

        const discReason = document.getElementById('discountReason').value.trim();

        const txReason = document.getElementById('taxReason').value.trim();

        if (discReason) addNewReason(discReason, discountReasons, 'discountReasonsList');

        if (txReason) addNewReason(txReason, taxReasons, 'taxReasonsList');

        // حساب رقم الفاتورة (Invoice ID) والتعامل مع المخزن في وضع التعديل

        let newInvoiceId;

        if (isEditMode && editingInvoiceId) {

            newInvoiceId = editingInvoiceId;

            // عكس المخزن القديم وحذف السجلات السابقة باستخدام الوظيفة المركزية

            if (window.revertAndClearOldInvoice) {

                await window.revertAndClearOldInvoice(editingInvoiceId, editingInvoiceType);

            }

        } else {

            newInvoiceId = typeof getNextSequence === 'function' ? getNextSequence('بيع') : 1;

        }

        // تجميد الوقت: استخدام التاريخ الأصلي إذا كنا في وضع التعديل

        const origDt = (typeof editingOriginalDate !== 'undefined' && editingOriginalDate && editingOriginalDate.full)
            ? editingOriginalDate
            : ((typeof window.editingOriginalDate !== 'undefined' && window.editingOriginalDate && window.editingOriginalDate.full) ? window.editingOriginalDate : null);

        const dt = (typeof window.getEffectiveTransactionDateTime === 'function')
            ? window.getEffectiveTransactionDateTime('salesDate', 'salesTime', origDt, isEditMode)
            : ((function() {
                const dateInputEl = document.getElementById('salesDate');
                const inputDateVal = dateInputEl?.value;
                const wasTouched = Boolean(dateInputEl && (dateInputEl.getAttribute('data-touched') === 'true' || dateInputEl.dataset?.touched === 'true'));
                const isDateManuallyChanged = isEditMode && origDt && origDt.iso && wasTouched && inputDateVal && (inputDateVal !== origDt.iso);
                return (isEditMode && origDt && !isDateManuallyChanged) ? origDt : (typeof getTransactionDateTime === 'function' ? getTransactionDateTime('salesDate', 'salesTime') : {
                    full: new Date().toLocaleString('ar-EG'),
                    iso: new Date().toLocaleDateString('en-CA'),
                    time: new Date().toTimeString().slice(0, 5)
                });
            })());

        // 🧾 استخراج رقم الإيصال اليومي (خاص بنظام الضرائب إذا كانت الميزة مفعلة)
        let currentDailyTaxSeq = null;
        if (typeof isDailyTaxSeqEnabled === 'function' && isDailyTaxSeqEnabled()) {
            if (isEditMode) {
                currentDailyTaxSeq = (typeof window.editingOriginalDailyTaxSeq !== 'undefined' && window.editingOriginalDailyTaxSeq)
                    ? window.editingOriginalDailyTaxSeq
                    : (typeof getDailyTaxSequence === 'function' ? getDailyTaxSequence(dt.iso) : null);
            } else {
                currentDailyTaxSeq = typeof getDailyTaxSequence === 'function' ? getDailyTaxSequence(dt.iso) : null;
            }
        }

        // 🛑 فحص أمان: منع حفظ نفس الفاتورة مرتين بالخطأ في نفس اللحظة لنفس العميل والإجمالي
        if (!isEditMode && !force) {
            const cleanCust = (document.getElementById('customerName')?.value || 'عميل نقدي').trim().toLowerCase();
            const rapidDuplicate = transactions.find(t => 
                t.type && t.type.includes('بيع') && !t.type.includes('مرتجع') &&
                t.isInvoiceHead &&
                (t.partner || '').trim().toLowerCase() === cleanCust &&
                t.dateISO === dt.iso &&
                t.timeISO === dt.time &&
                Math.abs((parseFloat(t.invoiceGrandTotal) || parseFloat(t.total) || 0) - currentTotal) < 0.01
            );
            if (rapidDuplicate) {
                console.warn("⚠️ تم حظر تكرار حفظ فاتورة البيع في نفس اللحظة:", newInvoiceId);
                return false;
            }
        }

        // حساب النسبة لتوزيع الخصم والضريبة على الأصناف في السجل

        const subTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

        const ratio = subTotal > 0 ? (currentTotal / subTotal) : 1;

        // حساب الرصيد السابق للعميل عند لحظة إصدار الفاتورة لتسجيله بشكل دائم مع رأس الفاتورة
        let prevBalance = 0;
        const currentCust = (document.getElementById('customerName')?.value || '').trim();
        if (currentCust && !window.isGenericCashPartner(currentCust)) {
            if (typeof getHistoricalPartnerBalance === 'function') {
                prevBalance = getHistoricalPartnerBalance(currentCust, newInvoiceId);
            } else if (typeof getAccountBalance === 'function') {
                prevBalance = getAccountBalance(currentCust, newInvoiceId);
            }
        } else if (document.getElementById('prevBalanceDisplay')) {
            prevBalance = parseFloat(document.getElementById('prevBalanceDisplay').innerText) || 0;
        }

        // 3. خصم الكميات الجديدة من المخزن وتسجيل العمليات

        let accumulatedItemsTotal = 0;

        const tInfo = (window.BayanNetworkHub && typeof window.BayanNetworkHub.getTerminalInfo === 'function')
            ? window.BayanNetworkHub.getTerminalInfo()
            : {
                terminal: ((window.BayanNetworkHub && window.BayanNetworkHub.isMasterServer) ? 'الجهاز الرئيسي 💻 (الماستر)' : 'كاشير فرعي (A) 📱'),
                terminalLetter: ((window.BayanNetworkHub && window.BayanNetworkHub.isMasterServer) ? 'MASTER' : 'A'),
                terminalOrder: ((window.BayanNetworkHub && window.BayanNetworkHub.isMasterServer) ? 0 : 1),
                terminalId: (window.BayanNetworkHub && window.BayanNetworkHub.deviceId) || ''
            };
        const terminalName = tInfo.terminal;

        const newTransactionRows = [];
        const affectedProducts = [];

        cart.forEach((cartItem, idx) => {

            const product = productsDB.find(p => p.id === cartItem.id || p.name === cartItem.name);

            const factor = cartItem.unitFactor || 1;
            const baseQty = cartItem.qty * factor;

            if (product) {
                product.stock = (parseFloat(product.stock) || 0) - baseQty;
                if (!product.warehouseStocks) product.warehouseStocks = {};
                product.warehouseStocks[activeWH] = (parseFloat(product.warehouseStocks[activeWH]) || 0) - baseQty;

                // تحديث رصيد التشكيلة (المقاس واللون) في مصفوفة الصنف بدقة وتطابق تام
                if (product.variants && Array.isArray(product.variants)) {
                    const sSize = String(cartItem.selectedSize || cartItem.size || '').trim();
                    const sColor = String(cartItem.selectedColor || cartItem.color || '').trim();
                    if (sSize || sColor) {
                        const cleanV = (s) => String(s || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىي]/g, 'ي').replace(/\s+/g, ' ');
                        const cSize = cleanV(sSize);
                        const cColor = cleanV(sColor);
                        const matchedVar = product.variants.find(v => 
                            (!cSize || cleanV(v.size) === cSize) && 
                            (!cColor || cleanV(v.color) === cColor)
                        );
                        if (matchedVar) {
                            matchedVar.stock = (parseFloat(matchedVar.stock) || 0) - baseQty;
                            if (!matchedVar.warehouseStocks) matchedVar.warehouseStocks = {};
                            matchedVar.warehouseStocks[activeWH] = (parseFloat(matchedVar.warehouseStocks[activeWH]) || 0) - baseQty;
                        }
                    }
                    if (product.variants.length > 0) {
                        product.stock = product.variants.reduce((sum, v) => sum + (parseFloat(v.stock) || 0), 0);
                        if (!product.warehouseStocks) product.warehouseStocks = {};
                        product.warehouseStocks[activeWH] = product.variants.reduce((sum, v) => {
                            const vWh = (v.warehouseStocks && v.warehouseStocks[activeWH] !== undefined)
                                ? parseFloat(v.warehouseStocks[activeWH])
                                : (activeWH === 'المخزن الرئيسي' ? (parseFloat(v.stock) || 0) : 0);
                            return sum + vWh;
                        }, 0);
                    }
                }
                if (!affectedProducts.some(ap => ap.id === product.id)) {
                    affectedProducts.push(product);
                }
            }

            let itemNetTotal = cartItem.price * cartItem.qty * ratio;
            if (idx === cart.length - 1) {
                itemNetTotal = currentTotal - accumulatedItemsTotal;
            } else {
                itemNetTotal = parseFloat(itemNetTotal.toFixed(2));
                accumulatedItemsTotal += itemNetTotal;
            }
            let itemTotalCost = 0;
            // فحص دقيق لتكلفة المقاس واللون المختار في الفاشون (Fashion Variant Cost)
            let effCost = 0;
            if (cartItem.selectedVariant && cartItem.selectedVariant.cost) {
                effCost = parseFloat(cartItem.selectedVariant.cost) || 0;
            } else if (product && product.variants && Array.isArray(product.variants) && (cartItem.selectedSize || cartItem.selectedColor)) {
                const matchedV = product.variants.find(v => (v.size || '') === (cartItem.selectedSize || '') && (v.color || '') === (cartItem.selectedColor || ''));
                if (matchedV && matchedV.cost) effCost = parseFloat(matchedV.cost) || 0;
            }
            if (!effCost) {
                effCost = (cartItem.cost !== undefined && cartItem.cost !== null && !isNaN(parseFloat(cartItem.cost))) 
                    ? parseFloat(cartItem.cost) 
                    : (product ? (parseFloat(product.avgBuyPrice) || parseFloat(product.cost) || 0) : 0);
            }

            if (cartItem.selectedUnit && typeof cartItem.selectedUnit === 'object') {
                const unitCost = parseFloat(cartItem.selectedUnit.cost);
                if (!isNaN(unitCost) && unitCost > 0) {
                    itemTotalCost = unitCost * cartItem.qty;
                } else {
                    itemTotalCost = effCost * baseQty;
                }
            } else {
                itemTotalCost = effCost * baseQty;
            }

            const profit = itemNetTotal - itemTotalCost;

            // تسجيل الحركة الجديدة
            const newRow = {
                date: dt.full,
                dateISO: dt.iso,
                timeISO: dt.time,
                type: 'بيع 📤',
                method: selectedMethod,
                invoiceId: newInvoiceId,
                product: product ? product.name : (cartItem.name || 'صنف حر'),
                unit: cartItem.selectedUnit ? (typeof cartItem.selectedUnit === 'object' ? cartItem.selectedUnit.unitName : cartItem.selectedUnit) : (cartItem.unit || 'قطعة'),
                size: cartItem.selectedSize || '',
                color: cartItem.selectedColor || '',
                priceLevel: document.getElementById('salesPriceLevel')?.value || 'retail',
                qty: cartItem.qty,
                price: cartItem.price,
                discount: (cartItem.qty * cartItem.price > itemNetTotal) ? ((cartItem.qty * cartItem.price) - itemNetTotal).toFixed(2) : '0.00',
                addition: (itemNetTotal > cartItem.qty * cartItem.price) ? (itemNetTotal - (cartItem.qty * cartItem.price)).toFixed(2) : '0.00',
                total: itemNetTotal.toFixed(2),
                profit: profit.toFixed(2),
                partner: document.getElementById('customerName')?.value?.trim() || (isEditMode && window.editingOriginalPartner ? window.editingOriginalPartner : 'عميل نقدي'),
                user: (isEditMode && window.editingOriginalUser) ? window.editingOriginalUser : (currentUser ? currentUser.name : '-'),
                notes: document.getElementById('salesNotes') ? document.getElementById('salesNotes').value.trim() : '',
                paidAmount: (idx === 0) ? tendered : 0,
                remaining: (idx === 0) ? (isCredit ? Math.max(0, currentTotal - tendered) : 0) : 0,
                deferred: (idx === 0) ? (isCredit ? Math.max(0, currentTotal - tendered) : 0) : 0,
                isInvoiceHead: (idx === 0),
                invoiceDiscount: (idx === 0) ? (parseFloat(document.getElementById('discountInput')?.value) || 0) : 0,
                invoiceDiscountType: (idx === 0) ? (document.getElementById('discountType')?.value || 'val') : 'val',
                invoiceTax: (idx === 0) ? (parseFloat(document.getElementById('taxInput')?.value) || 0) : 0,
                invoiceTaxType: (idx === 0) ? (document.getElementById('taxType')?.value || 'val') : 'val',
                invoiceGrandTotal: (idx === 0) ? currentTotal : 0,
                prevBalance: (idx === 0) ? prevBalance : 0,
                currentBalance: (idx === 0) ? (prevBalance + (currentTotal - tendered)) : 0,
                warehouse: activeWH,
                terminal: terminalName,
                terminalLetter: tInfo.terminalLetter,
                terminalOrder: tInfo.terminalOrder,
                terminalId: tInfo.terminalId,
                unitFactor: factor, // حفظ المعامل للرجوع إليه عند التعديل مستقبلاً
                taxInvoiceSeq: currentDailyTaxSeq,
                dailySeq: currentDailyTaxSeq,
                editDate: isEditMode ? `${new Date().toLocaleString('ar-EG')} (تعديل: ${currentUser ? currentUser.name : 'مجهول'})` : '-'
            };
            transactions.push(newRow);
            newTransactionRows.push(newRow);

        });

        // ⚡ حفظ المعاملة والأصناف المتأثرة فورياً وبدون إعادة كتابة الجداول (في الوضعين: جديد وتعديل)
        if (typeof window.saveTransactionChanges === 'function') {
            const affectedAccountsList = [];
            if (isCredit && customerName && Array.isArray(accounts)) {
                const targetAcc = accounts.find(a => a.name === customerName);
                if (targetAcc) affectedAccountsList.push(targetAcc);
            }
            await window.saveTransactionChanges({
                newTransactions: newTransactionRows,
                modifiedProducts: affectedProducts,
                modifiedAccounts: affectedAccountsList
            });
        } else {
            await saveData();
        }

        if (!isEditMode && typeof window.registerTrialInvoiceCreation === 'function') {
            window.registerTrialInvoiceCreation();
        }

        if (!isEditMode && typeof window.updateLastSavedSequence === 'function') {
            window.updateLastSavedSequence('بيع', newInvoiceId);
        }

        if (!isEditMode && currentDailyTaxSeq && typeof window.updateLastSavedDailyTaxSequence === 'function') {
            window.updateLastSavedDailyTaxSequence(dt.iso, currentDailyTaxSeq);
        }

        if (typeof logAuditAction === 'function') {
            const auditAction = isEditMode ? 'تحديث فاتورة بيع' : 'حفظ فاتورة بيع جديدة';
            logAuditAction(auditAction, `فاتورة رقم #${newInvoiceId}, الإجمالي: ${currentTotal.toFixed(2)} ج.م, العميل: ${document.getElementById('customerName')?.value || 'نقدي'}, طريقة الدفع: ${selectedMethod}`);
        }

        // 🖨️ فحص وتنفيذ الطباعة التلقائية فور الحفظ إذا كانت الخاصية مفعلة
        const shouldAutoPrint = (typeof isPOSAutoPrintEnabled === 'function') && isPOSAutoPrintEnabled();
        let autoPrintInvoiceData = null;

        if (shouldAutoPrint) {
            const customerNameInput = document.getElementById('customerName');
            const customer = customerNameInput ? customerNameInput.value.trim() : 'عميل نقدي';
            const isExplicitCredit = typeof window.isTransactionCredit === 'function' ? window.isTransactionCredit(selectedMethod, 0, 0, 0) : (selectedMethod.includes('آجل') || selectedMethod.includes('اجل') || selectedMethod.includes('ذمم'));
            let paidValue = currentTotal;
            const tenderedInp = document.getElementById('tenderedAmount');
            if (!isExplicitCredit) {
                paidValue = currentTotal;
            } else if (tenderedInp && tenderedInp.value !== '') {
                paidValue = parseFloat(tenderedInp.value) || 0;
            } else {
                paidValue = 0;
            }

            if (customer && !window.isGenericCashPartner(customer)) {
                if (typeof getHistoricalPartnerBalance === 'function') {
                    prevBalance = getHistoricalPartnerBalance(customer, newInvoiceId);
                } else if (typeof getAccountBalance === 'function') {
                    prevBalance = getAccountBalance(customer, newInvoiceId);
                }
            } else if (document.getElementById('prevBalanceDisplay')) {
                prevBalance = parseFloat(document.getElementById('prevBalanceDisplay').innerText) || 0;
            }

            let discountVal = parseFloat(document.getElementById('discountInput')?.value) || 0;
            const discountType = document.getElementById('discountType')?.value || 'val';
            let discountAmount = (discountType === 'perc') ? (subTotal * discountVal / 100) : discountVal;

            let taxVal = parseFloat(document.getElementById('taxInput')?.value) || 0;
            const taxType = document.getElementById('taxType')?.value || 'val';
            let taxAmount = (taxType === 'perc') ? (subTotal * taxVal / 100) : taxVal;
            const taxReasonEl = document.getElementById('taxReason');
            const selectedTaxReason = taxReasonEl ? taxReasonEl.value.trim() : 'إضافة';

            const settings = JSON.parse(getStore('pos_settings') || '{}');
            const globalTaxEnabled = settings.taxEnabled || false;
            const globalTaxPercent = parseFloat(settings.taxPercent) || 0;
            let globalTaxAmount = globalTaxEnabled ? (subTotal * globalTaxPercent / 100) : 0;

            autoPrintInvoiceData = {
                invoiceNumber: (currentDailyTaxSeq || newInvoiceId),
                originalInvoiceId: newInvoiceId,
                taxInvoiceSeq: currentDailyTaxSeq,
                dailySeq: currentDailyTaxSeq,
                invoiceType: selectedMethod,
                date: dt.iso || dt.full.split(' ')[0],
                time: dt.time || '',
                cashier: currentUser ? currentUser.name : 'كاشير',
                customer: customer,
                items: JSON.parse(JSON.stringify(cart)),
                subTotal: subTotal,
                discount: discountAmount,
                tax: taxAmount,
                taxLabel: selectedTaxReason,
                globalTax: globalTaxAmount,
                totalAmount: currentTotal,
                paid: paidValue,
                deferred: currentTotal - paidValue,
                prevBalance: prevBalance,
                currentBalance: prevBalance + (currentTotal - paidValue),
                docType: 'sales'
            };
        }

        // ⚡ تفريغ السلة وإعادة ضبط الواجهة فوراً للكاشير دون أي انتظار (Ultra-Fast UI Release)
        const wasEditMode = isEditMode;
        isEditMode = false;
        window.isEditMode = false;
        editingInvoiceId = null;
        window.editingInvoiceId = null;
        editingOriginalDate = null;
        window.editingOriginalDate = null;
        editingOriginalItems = [];
        window.editingOriginalItems = [];

        const mainSaveBtn = document.querySelector('#sales-section .btn-save');
        if (mainSaveBtn) {
            mainSaveBtn.style.background = '';
            mainSaveBtn.innerHTML = '<span>✅ حفظ الفاتورة</span><span class="shortcut">F9</span>';
        }

        resetBill();

        showCustomAlert({
            type: 'success',
            titleText: wasEditMode ? '✅ تم تحديث الفاتورة' : '✅ تم الحفظ بنجاح',
            msg: `تم ${wasEditMode ? 'تحديث' : 'حفظ'} فاتورة البيع رقم #${newInvoiceId} ومعالجة فرق المخزون والمديونية.`
        });

        if (wasEditMode) {
            if (typeof window.invalidateAccountBalancesCache === 'function') window.invalidateAccountBalancesCache();
        } else if (!isGenericCustomer && customerName) {
            if (typeof window.invalidateAccountBalancesCache === 'function') window.invalidateAccountBalancesCache(customerName);
        }

        // 🖨️ إرسال أمر الطباعة التلقائي المباشر (صامت تماماً وفوري دون أي نوافذ)
        if (shouldAutoPrint && autoPrintInvoiceData && typeof printInvoice === 'function') {
            setTimeout(() => {
                printInvoice(autoPrintInvoiceData, { silent: true });
            }, 100);
        }

        if (typeof window.clearRevertedInvoiceBackup === 'function') {
            window.clearRevertedInvoiceBackup();
        }

        return true;

    } catch (saveErr) {

        console.error("❌ خطأ أثناء حفظ فاتورة المبيعات بعد تفريغ القديمة:", saveErr);
        if (isEditMode && typeof window.rollbackLastRevertedInvoice === 'function') {
            await window.rollbackLastRevertedInvoice();
        }
        showCustomAlert({
            type: 'error',
            titleText: '⚠️ تعذر حفظ الفاتورة',
            msg: isEditMode
                ? ('حدث خطأ أثناء حفظ التعديل، وتم الحفاظ على الفاتورة الأصلية واستعادتها بالكامل دون أي فقدان للبيانات.\n\nتفاصيل الخطأ: ' + (saveErr?.message || saveErr))
                : ('حدث خطأ غير متوقع أثناء حفظ الفاتورة:\n' + (saveErr?.message || saveErr))
        });
        return false;

    } finally {

        const saveBtns = document.querySelectorAll('#sales-section .btn-save, #sales-section .action-btn');
        saveBtns.forEach(b => { b.disabled = false; b.style.pointerEvents = 'auto'; b.style.opacity = '1'; });
        window.isSavingTransaction = false;

    }

}

function shareBill(platform) {

    if (!navigator.onLine) {

        alert("⚠️ أنت في وضع الأوفلاين (غير متصل بالإنترنت).\nلا يمكن مشاركة الفاتورة عبر واتساب أو تلجرام حالياً.");

        return;

    }

    if (cart.length === 0) return alert("الفاتورة فارغة!");

    let text = `🛒 * فاتورة جديدة من متجر السعادة *\n`;

    text += `📅 التاريخ: ${new Date().toLocaleString('ar-EG')}\n`;

    text += `👤 العميل: ${document.getElementById('customerName').value || 'نقدي'}\n`;

    text += `------------------\n`;

    cart.forEach(item => {

        const unitName = item.selectedUnit ? (typeof item.selectedUnit === 'object' ? item.selectedUnit.unitName : item.selectedUnit) : (item.unit || 'قطعة');

        text += `▪️ ${item.name} (${item.qty} ${unitName}) = ${(item.price * item.qty).toFixed(2)} \n`;

    });

    text += `------------------\n`;

    text += `💰 * الإجمالي: ${currentTotal.toFixed(2)} ج.م *\n`;

    const encodedText = encodeURIComponent(text);

    let url = '';

    if (platform === 'wa') {

        url = `https://wa.me/?text=${encodedText}`;

    } else if (platform === 'tg') {

        url = `https://t.me/share/url?url=${encodedText}&text=`; // Telegram format

    }

    window.open(url, '_blank');

}

function getSalesInvoicePrintData() {
    const method = getSelectedPaymentMethod('sales-section');
    const customerNameInput = document.getElementById('customerName');
    const customer = customerNameInput ? customerNameInput.value.trim() : 'عميل نقدي';
    const dt = getTransactionDateTime('salesDate', 'salesTime');
    const shopName = (typeof getMerchantStoreName === 'function' ? getMerchantStoreName() : (document.getElementById('shopName')?.value || 'متجر السعادة'));
    const shopAddress = document.getElementById('shopAddress')?.value || '';
    const shopPhone = document.getElementById('shopPhone1')?.value || '';
    const footerMsg = document.getElementById('printFooterMsg')?.value || 'شكراً لزيارتكم!';
    const salesId = document.getElementById('salesBadgeID') ? document.getElementById('salesBadgeID').innerText : '---';

    const isExplicitCredit = typeof window.isTransactionCredit === 'function' ? window.isTransactionCredit(method, 0, 0, 0) : (method.includes('آجل') || method.includes('اجل') || method.includes('ذمم') || method.includes('credit'));
    let paidValue = (typeof currentTotal !== 'undefined' ? currentTotal : 0);
    const tenderedInp = document.getElementById('tenderedAmount');
    if (!isExplicitCredit) {
        paidValue = (typeof currentTotal !== 'undefined' ? currentTotal : 0);
    } else if (tenderedInp && tenderedInp.value !== '') {
        paidValue = parseFloat(tenderedInp.value) || 0;
    } else {
        paidValue = 0;
    }

    let prevBalance = 0;
    if (customer && !window.isGenericCashPartner(customer)) {
        if (typeof getHistoricalPartnerBalance === 'function') {
            prevBalance = getHistoricalPartnerBalance(customer, salesId);
        } else if (typeof getAccountBalance === 'function') {
            prevBalance = getAccountBalance(customer, salesId);
        }
    } else if (document.getElementById('prevBalanceDisplay')) {
        prevBalance = parseFloat(document.getElementById('prevBalanceDisplay').innerText) || 0;
    }

    let invoiceTotal = (typeof currentTotal !== 'undefined' ? currentTotal : 0) + prevBalance;
    let creditValue = Math.max(0, invoiceTotal - paidValue);

    let customerAddressToPrint = currentSessionSelectedAddress;
    if (!customerAddressToPrint && typeof accounts !== 'undefined') {
        const acc = accounts.find(a => a.name === customer);
        if (acc) customerAddressToPrint = (acc.address || acc.mobile || '').split(/[|,]/)[0];
    }

    let subTotal = cart.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0)), 0);

    let discountVal = parseFloat(document.getElementById('discountInput')?.value) || 0;
    const discountType = document.getElementById('discountType')?.value || 'val';

    let taxVal = parseFloat(document.getElementById('taxInput')?.value) || 0;
    const taxType = document.getElementById('taxType')?.value || 'val';

    const isCurAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
    let maxCheckoutDisc = 100;
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.maxDiscountPercent !== undefined && currentUser.maxDiscountPercent !== null && currentUser.maxDiscountPercent !== '') {
        maxCheckoutDisc = parseFloat(currentUser.maxDiscountPercent);
        if (isNaN(maxCheckoutDisc)) maxCheckoutDisc = isCurAdmin ? 100 : 5;
    } else {
        maxCheckoutDisc = isCurAdmin ? 100 : 5;
    }

    let maxCheckoutAdd = 100;
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.maxAdditionPercent !== undefined && currentUser.maxAdditionPercent !== null && currentUser.maxAdditionPercent !== '') {
        maxCheckoutAdd = parseFloat(currentUser.maxAdditionPercent);
        if (isNaN(maxCheckoutAdd)) maxCheckoutAdd = isCurAdmin ? 100 : 15;
    } else {
        maxCheckoutAdd = isCurAdmin ? 100 : 15;
    }

    let printSummary = null;
    if (window.BayanInvoiceEngine && typeof window.BayanInvoiceEngine.calculateInvoiceSummary === 'function') {
        printSummary = window.BayanInvoiceEngine.calculateInvoiceSummary({
            cart,
            discountVal,
            discountType,
            taxVal,
            taxType,
            maxDiscountPerc: maxCheckoutDisc,
            canDiscount: true
        });
    }

    let discountAmount = printSummary ? printSummary.discountAmount : ((discountType === 'perc') ? (subTotal * discountVal / 100) : discountVal);
    let taxAmount = printSummary ? printSummary.taxAmount : ((taxType === 'perc') ? (subTotal * taxVal / 100) : taxVal);

    const taxReasonEl = document.getElementById('taxReason');
    const selectedTaxReason = taxReasonEl ? taxReasonEl.value.trim() : 'إضافة';

    const settings = JSON.parse(getStore('pos_settings') || '{}');
    const globalTaxEnabled = settings.taxEnabled || false;
    const globalTaxPercent = parseFloat(settings.taxPercent) || 0;
    let globalTaxAmount = printSummary ? printSummary.globalTaxAmount : (globalTaxEnabled ? (subTotal * globalTaxPercent / 100) : 0);
    const totAmount = (typeof currentTotal !== 'undefined' ? currentTotal : (printSummary ? printSummary.finalTotal : (subTotal - discountAmount + taxAmount + globalTaxAmount)));

    return {
        invoiceNumber: salesId,
        invoiceType: method,
        date: dt.iso || (dt.full ? dt.full.split(' ')[0] : new Date().toLocaleDateString('ar-EG')),
        time: dt.time || new Date().toLocaleTimeString('ar-EG'),
        cashier: (typeof currentUser !== 'undefined' && currentUser ? currentUser.name : 'المدير'),
        customer: customer,
        items: cart,
        subTotal: subTotal,
        discount: discountAmount,
        tax: taxAmount,
        taxLabel: selectedTaxReason,
        globalTax: globalTaxAmount,
        totalAmount: totAmount,
        paid: paidValue,
        deferred: totAmount - paidValue,
        prevBalance: prevBalance,
        currentBalance: prevBalance + (totAmount - paidValue),
        docType: 'sales'
    };
}
window.getSalesInvoicePrintData = getSalesInvoicePrintData;

function printBill() {
    if (cart.length === 0) return alert("⚠️ الفاتورة فارغة! لا يمكن طباعة فاتورة بدون أصناف.");
    const method = getSelectedPaymentMethod('sales-section');
    const customerNameInput = document.getElementById('customerName');
    const customer = customerNameInput ? customerNameInput.value.trim() : 'عميل نقدي';

    // --- حماية: منع طباعة آجل لعميل نقدي ---
    if (method.includes('آجل') && (customer === "" || customer.includes('نقدي') || customer.includes('كاش'))) {
        showCustomAlert({
            type: 'error',
            titleText: '⚠️ خطأ في الطباعة',
            msg: 'لا يمكن طباعة فاتورة "آجل" لحساب "نقدي". يرجى اختيار عميل مسجل أولاً لمتابعة مديونيته.'
        });
        if (customerNameInput) {
            customerNameInput.focus();
            customerNameInput.style.border = '2px solid red';
        }
        return;
    }

    const invoiceData = getSalesInvoicePrintData();
    if (typeof printInvoice === 'function') {
        printInvoice(invoiceData);
    } else {
        alert('خطأ: محرك الطباعة غير متوفر!');
    }
}

function printPurchaseBill() {

    if (purchaseCart.length === 0) return alert("⚠️ الفاتورة فارغة!");

    const supplier = document.getElementById('supplierName').value || 'مورد عام';

    const dt = getTransactionDateTime('purchaseDate', 'purchaseTime');

    const shopName = document.getElementById('shopName').value || 'متجر السعادة';

    const shopAddress = document.getElementById('shopAddress').value || '';

    const shopPhone = document.getElementById('shopPhone1').value || '';

    const purchaseId = document.getElementById('purchaseBadgeID') ? document.getElementById('purchaseBadgeID').innerText : '---';

    let subTotal = purchaseCart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    let discountVal = parseFloat(document.getElementById('purchaseDiscount').value) || 0;

    const discountType = document.getElementById('purchaseDiscountType').value;

    let discountAmount = (discountType === 'perc') ? (subTotal * discountVal / 100) : discountVal;

    let taxVal = parseFloat(document.getElementById('purchaseTax').value) || 0;

    const settings = JSON.parse(getStore('pos_settings') || '{}');
    const globalTaxEnabled = settings.taxEnabled || false;
    const globalTaxPercent = parseFloat(settings.taxPercent) || 0;
    let globalTaxAmount = globalTaxEnabled ? (subTotal * globalTaxPercent / 100) : 0;
    let finalTotal = subTotal - discountAmount + taxAmount + globalTaxAmount;
    const purchaseTaxReasonEl = document.getElementById('purchaseTaxReason');
    const selectedPurchaseTaxReason = purchaseTaxReasonEl ? purchaseTaxReasonEl.value.trim() : 'إضافة';

    const invoiceData = {
        invoiceNumber: purchaseId,
        invoiceType: 'نقداً',
        date: dt.iso || dt.full.split(' ')[0],
        time: dt.time || '',
        cashier: currentUser.name,
        customer: supplier,
        items: purchaseCart,
        subTotal: subTotal,
        discount: discountAmount,
        tax: taxAmount,
        taxLabel: selectedPurchaseTaxReason,
        globalTax: globalTaxAmount,
        totalAmount: finalTotal,
        paid: finalTotal,
        deferred: 0,
        prevBalance: 0,
        currentBalance: 0,
        docType: 'purchase'
    };

    if (typeof printInvoice === 'function') {
        printInvoice(invoiceData);
    } else {
        alert('خطأ: محرك الطباعة غير متوفر!');
    }
}

async function showCurrentBillProfit() {
    // 🔒 التحقق الصارم من صلاحية رؤية الأرباح
    if (typeof hasPermission === 'function' && !hasPermission('general_profits')) {
        if (typeof showCustomAlert === 'function') {
            showCustomAlert({
                type: 'error',
                titleText: '🚫 صلاحية مقيدة',
                msg: 'عذراً، هذا الحساب لا يمتلك صلاحية لعرض أرباح الفاتورة والتكلفة.'
            });
        } else if (typeof showToast === 'function') {
            showToast("⛔ عذراً، لا تمتلك صلاحية لعرض أرباح الفاتورة", "error");
        } else {
            alert("⛔ عذراً، لا تمتلك صلاحية لعرض أرباح الفاتورة");
        }
        return;
    }

    if (cart.length === 0) return alert("⚠️ الفاتورة فارغة!");
    let totalCost = 0;
    let totalSale = 0;

    for (const item of cart) {
        let latestProduct = (typeof productsDB !== 'undefined' && Array.isArray(productsDB))
            ? productsDB.find(p => p && (p.id === item.id || p.id == item.id))
            : null;
        if (!latestProduct && typeof db !== 'undefined' && db.products) {
            latestProduct = await db.products.get(item.id);
            if (!latestProduct && !isNaN(item.id)) {
                latestProduct = await db.products.get(Number(item.id));
            }
        }

        // 👗 فحص التكلفة الدقيقة الخاصة بالمقاس واللون (Fashion Variant Cost)
        let variantCost = 0;
        if (item.selectedVariant && item.selectedVariant.cost) {
            variantCost = parseFloat(item.selectedVariant.cost) || 0;
        }
        if (!variantCost && latestProduct && latestProduct.variants && Array.isArray(latestProduct.variants) && (item.selectedSize || item.selectedColor)) {
            const v = latestProduct.variants.find(vr => (vr.size || '') === (item.selectedSize || '') && (vr.color || '') === (item.selectedColor || ''));
            if (v && v.cost) variantCost = parseFloat(v.cost) || 0;
        }

        // تحديد التكلفة الأساسية للقطعة (تكلفة المقاس المحدد أو تكلفة الصنف العامة أو المسجلة بالسلة)
        let baseCost = variantCost > 0 
            ? variantCost 
            : (latestProduct ? (parseFloat(latestProduct.avgBuyPrice) || parseFloat(latestProduct.cost) || 0) : (parseFloat(item.cost) || 0));
        
        if (!baseCost && item.cost) {
            baseCost = parseFloat(item.cost) || 0;
        }

        let itemCost = 0;
        const factor = parseFloat(item.unitFactor) || 1;

        if (item.selectedUnit && typeof item.selectedUnit === 'object') {
            let unitCost = 0;
            if (item.selectedUnit.cost && !isNaN(parseFloat(item.selectedUnit.cost))) {
                unitCost = parseFloat(item.selectedUnit.cost) || 0;
            } else if (latestProduct && latestProduct.units) {
                const u = latestProduct.units.find(un => un.unitName === item.selectedUnit.unitName);
                if (u && u.cost) unitCost = parseFloat(u.avgBuyPrice) || parseFloat(u.cost) || 0;
            }

            if (unitCost > 0) {
                itemCost = unitCost * item.qty;
            } else {
                itemCost = baseCost * item.qty * factor;
            }
        } else {
            itemCost = baseCost * item.qty * factor;
        }

        totalCost += itemCost;
        totalSale += (parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0);
    }

    // حساب الخصم وسقفه بأمان مطابق تماماً لشاشة البيع
    let discountVal = parseFloat(document.getElementById('discountInput')?.value) || 0;
    const discountType = document.getElementById('discountType')?.value || 'val';
    let discountAmount = (discountType === 'perc') ? (totalSale * discountVal / 100) : discountVal;
    if (discountAmount > totalSale && totalSale > 0) {
        discountAmount = totalSale;
    }
    if (discountAmount < 0) discountAmount = 0;

    // حساب الإضافات والضرائب إن وجدت
    let taxVal = parseFloat(document.getElementById('taxInput')?.value) || 0;
    const taxType = document.getElementById('taxType')?.value || 'val';
    let taxAmount = (taxType === 'perc') ? (totalSale * taxVal / 100) : taxVal;
    if (taxAmount < 0) taxAmount = 0;

    const settings = JSON.parse(getStore('pos_settings') || '{}');
    const globalTaxEnabled = settings.taxEnabled || false;
    const globalTaxPercent = parseFloat(settings.taxPercent) || 0;
    let globalTaxAmount = globalTaxEnabled ? (totalSale * globalTaxPercent / 100) : 0;

    const netInvoiceTotal = Math.max(0, totalSale - discountAmount + taxAmount + globalTaxAmount);
    const profit = netInvoiceTotal - totalCost;
    const profitMargin = netInvoiceTotal > 0 ? ((profit / netInvoiceTotal) * 100).toFixed(1) : '0';

    // تعبئة بيانات نافذة ملخص الأرباح
    const pSalesEl = document.getElementById('pTotalSales');
    const pCostEl = document.getElementById('pTotalCost');
    const pDiscEl = document.getElementById('pDiscount');
    const pNetEl = document.getElementById('pNetProfit');
    const pMarginEl = document.getElementById('pProfitMargin');

    if (pSalesEl) pSalesEl.innerText = netInvoiceTotal.toFixed(2);
    if (pCostEl) pCostEl.innerText = totalCost.toFixed(2);
    if (pDiscEl) pDiscEl.innerText = discountAmount.toFixed(2);
    if (pNetEl) {
        pNetEl.innerText = profit.toFixed(2);
        pNetEl.style.color = profit >= 0 ? '#10b981' : '#ef4444';
    }
    if (pMarginEl) {
        pMarginEl.innerText = profitMargin + '%';
        pMarginEl.style.color = profit >= 0 ? '#10b981' : '#ef4444';
    }

    // إظهار المودال
    const modalEl = document.getElementById('profitModal');
    if (modalEl) modalEl.classList.remove('hidden');
}

// --- دوال الطباعة للأقسام الأخرى ---

// =========================================================================
// 📸 معاينة صورة ومواصفات الموديل النشط في شاشة المبيعات (Active Fashion Product Preview)
// =========================================================================

function updatePOSProductImagePreview(productOrId, variant = null) {
    if (!productOrId) {
        resetPOSProductImagePreview();
        return;
    }

    const product = (typeof productOrId === 'object') ? productOrId : productsDB.find(p => p.id === productOrId);
    if (!product) {
        resetPOSProductImagePreview();
        return;
    }

    const placeholder = document.getElementById('posProductImagePlaceholder');
    const activeImg = document.getElementById('posProductActiveImg');
    const badgeEl = document.getElementById('posActiveProductBadge');
    const cardEl = document.getElementById('posProductImageCard');
    const zoomBtn = document.getElementById('posZoomModelBtn');

    if (!placeholder || !activeImg) return;

    if (badgeEl) badgeEl.innerText = 'المحدد 🎯';

    // 📸 عرض صورة الموديل ملء المربع بالكامل 100% من الحافة للحافة بدون أي فراغات بيضاء
    if (product.image && typeof product.image === 'string' && product.image.trim() !== '') {
        activeImg.src = product.image;
        activeImg.style.setProperty('display', 'block', 'important');
        activeImg.style.setProperty('width', '100%', 'important');
        activeImg.style.setProperty('height', '100%', 'important');
        activeImg.style.setProperty('max-width', '100%', 'important');
        activeImg.style.setProperty('max-height', '100%', 'important');
        activeImg.style.setProperty('object-fit', 'cover', 'important');
        activeImg.style.setProperty('object-position', 'center center', 'important');
        activeImg.style.setProperty('margin', '0', 'important');
        activeImg.style.setProperty('padding', '0', 'important');
        activeImg.style.setProperty('border-radius', 'inherit', 'important');

        placeholder.style.display = 'none';
        if (cardEl) {
            cardEl.style.setProperty('padding', '0', 'important');
            cardEl.style.setProperty('overflow', 'hidden', 'important');
            cardEl.style.border = '3.5px solid #2563eb';
            cardEl.style.background = '#0f172a';
            cardEl.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.25), 0 10px 25px rgba(37, 99, 235, 0.3)';
            cardEl.style.cursor = 'pointer';
            cardEl.title = '🔍 اضغط لتكبير ومعاينة صورة الموديل';
            cardEl.onclick = () => {
                if (typeof window.openProductImagePreview === 'function') {
                    window.openProductImagePreview(product.id);
                }
            };
        }
        if (zoomBtn) {
            zoomBtn.style.display = 'inline-flex';
            zoomBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                if (typeof window.openProductImagePreview === 'function') {
                    window.openProductImagePreview(product.id);
                }
            };
        }
    } else {
        activeImg.style.display = 'none';
        activeImg.src = '';
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `
            <span style="font-size: 3.5rem; opacity: 0.85;">👗</span>
            <div style="font-weight: 800; font-size: 0.78rem; color: #94a3b8; margin-top: 6px;">(لا توجد صورة للموديل)</div>
        `;
        if (cardEl) {
            cardEl.style.setProperty('padding', '0', 'important');
            cardEl.style.setProperty('overflow', 'hidden', 'important');
            cardEl.style.border = '3px solid #3b82f6';
            cardEl.style.background = '#f8fafc';
            cardEl.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.2), 0 6px 18px rgba(59, 130, 246, 0.2)';
            cardEl.style.cursor = 'default';
            cardEl.title = '';
            cardEl.onclick = null;
        }
        if (zoomBtn) {
            zoomBtn.style.display = 'none';
            zoomBtn.onclick = null;
        }
    }
}

function resetPOSProductImagePreview() {
    const placeholder = document.getElementById('posProductImagePlaceholder');
    const activeImg = document.getElementById('posProductActiveImg');
    const badgeEl = document.getElementById('posActiveProductBadge');
    const cardEl = document.getElementById('posProductImageCard');
    const zoomBtn = document.getElementById('posZoomModelBtn');

    if (badgeEl) badgeEl.innerText = 'جاهز';
    if (activeImg) {
        activeImg.style.display = 'none';
        activeImg.src = '';
    }
    if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `
            <span style="font-size: 3rem; margin-bottom: 6px; opacity: 0.75;">👗</span>
            <div style="font-weight: 800; font-size: 0.88rem; color: #64748b;">صورة الموديل</div>
            <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 3px;">تظهر الصورة عند المرور على الصنف</div>
        `;
    }
    if (cardEl) {
        cardEl.style.setProperty('padding', '0', 'important');
        cardEl.style.setProperty('overflow', 'hidden', 'important');
        cardEl.style.border = '2.5px dashed #cbd5e1';
        cardEl.style.background = '#ffffff';
        cardEl.style.boxShadow = 'none';
        cardEl.style.cursor = 'default';
        cardEl.title = '';
        cardEl.onclick = null;
    }
    if (zoomBtn) {
        zoomBtn.style.display = 'none';
        zoomBtn.onclick = null;
    }
}

window.updatePOSProductImagePreview = updatePOSProductImagePreview;
window.resetPOSProductImagePreview = resetPOSProductImagePreview;

function toggleQuickItems() {
    const container = document.getElementById('quickItemsContainer');
    const btn = document.getElementById('toggleQuickItemsBtn');
    const salesLayout = document.querySelector('.sales-main-layout');
    const tableContainer = salesLayout ? salesLayout.querySelector('.table-container') : null;

    if (!container) return;

    if (container.style.display === 'none') {
        container.style.display = 'flex';
        if (btn) {
            btn.classList.remove('is-hidden');
            btn.title = 'صور الموديلات: معروضة (انقر للإخفاء)';
            btn.innerHTML = '<span class="pos-model-toggle-icon">🖼️</span>';
        }
        if (tableContainer) tableContainer.style.flex = '1.5';
        setStore('showQuickItems', 'true');
    } else {
        container.style.display = 'none';
        if (btn) {
            btn.classList.add('is-hidden');
            btn.title = 'صور الموديلات: مخفية (انقر للإظهار)';
            btn.innerHTML = '<span class="pos-model-toggle-icon">🖼️</span>';
        }
        if (tableContainer) tableContainer.style.flex = '1';
        setStore('showQuickItems', 'false');
    }
}

window.toggleQuickItems = toggleQuickItems;

// تطبيق الحالة المحفوظة عند التشغيل
setTimeout(() => {
    const savedState = getStore('showQuickItems');
    if (savedState === 'false') {
        const container = document.getElementById('quickItemsContainer');
        const btn = document.getElementById('toggleQuickItemsBtn');
        const salesLayout = document.querySelector('.sales-main-layout');
        const tableContainer = salesLayout ? salesLayout.querySelector('.table-container') : null;

        if (container) {
            container.style.display = 'none';
            if (btn) {
                btn.classList.add('is-hidden');
                btn.title = 'صور الموديلات: مخفية (انقر للإظهار)';
                btn.innerHTML = '<span class="pos-model-toggle-icon">🖼️</span>';
            }
            if (tableContainer) tableContainer.style.flex = '1';
        }
    }
}, 500);

// =========================================================================
// 🖨️ نظام وخاصية الطباعة التلقائية لشاشة البيع (Auto-Print System for POS)
// =========================================================================

function isPOSAutoPrintEnabled() {
    return getStore('pos_auto_print_enabled') === 'true';
}

function updatePOSAutoPrintUI(isEnabled) {
    const btn = document.getElementById('posAutoPrintToggleBtn');
    const textEl = document.getElementById('posAutoPrintText');
    const iconEl = document.getElementById('posAutoPrintIcon');
    if (!btn) return;

    // إزالة أي أنماط داخلية لضمان عمل كلاسات CSS بحرية وسلاسة
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.style.boxShadow = '';

    if (isEnabled) {
        btn.classList.add('is-active');
        btn.classList.remove('is-disabled');
        btn.setAttribute('aria-checked', 'true');
        btn.title = 'الطباعة التلقائية: مفعلة ⚡ (انقر للإيقاف)';
        if (textEl) textEl.innerText = 'طباعة تلقائية: مفعلة ⚡';
        if (iconEl) iconEl.innerText = '🖨️';
    } else {
        btn.classList.remove('is-active');
        btn.classList.add('is-disabled');
        btn.setAttribute('aria-checked', 'false');
        btn.title = 'الطباعة التلقائية: معطلة (انقر للتشغيل)';
        if (textEl) textEl.innerText = 'طباعة تلقائية: معطلة';
        if (iconEl) iconEl.innerText = '🖨️';
    }
}

function togglePOSAutoPrint() {
    const currentState = isPOSAutoPrintEnabled();
    const newState = !currentState;
    setStore('pos_auto_print_enabled', newState ? 'true' : 'false');
    updatePOSAutoPrintUI(newState);

    if (typeof showToast === 'function') {
        showToast(
            newState ? '⚡ تم تفعيل الطباعة التلقائية فور حفظ الفاتورة' : '🔒 تم تعطيل الطباعة التلقائية',
            newState ? 'success' : 'info'
        );
    }
}

window.togglePOSAutoPrint = togglePOSAutoPrint;
window.isPOSAutoPrintEnabled = isPOSAutoPrintEnabled;

// تحميل وتطبيق الحالة المحفوظة عند فتح الصفحة
setTimeout(() => {
    updatePOSAutoPrintUI(isPOSAutoPrintEnabled());
}, 400);

// =========================================================================
// 🧭 محرك التنقل والبحث عن الفواتير في شاشة البيع (Sales Invoice Navigation Engine)
// =========================================================================

let _posNavBusy = false;
window._posCurrentNavState = { invoiceId: null, dateISO: null, id: null };
window._posInvoiceModified = false;

/**
 * تسجيل وتحديث حالة تعديل الفاتورة المستعرضة
 */
function markPosInvoiceModified() {
    window._posInvoiceModified = true;
    if (typeof tabStates !== 'undefined' && typeof activeTabId !== 'undefined' && tabStates[activeTabId]) {
        tabStates[activeTabId].invoiceModified = true;
    }
}
window.markPosInvoiceModified = markPosInvoiceModified;

/**
 * تفعيل مراقبة الحقول لضبط حالة التعديل تلقائياً عند تغيير أي مدخل يدوي
 */
function initPosInvoiceModifiedListeners() {
    const fieldIds = ['customerName', 'discountInput', 'taxInput', 'salesNotes', 'tenderedAmount', 'salesPriceLevel', 'discountType', 'taxType', 'sales-sectionPaymentMethodSelect', 'salesPaymentMethodSelect'];
    fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el._posModAttached) {
            el._posModAttached = true;
            el.addEventListener('input', () => {
                markPosInvoiceModified();
            });
            el.addEventListener('change', () => {
                markPosInvoiceModified();
            });
        }
    });
}

/**
 * تحديث حالة التنقل
 */
function updatePosNavUIState(invoiceId) {
    if (!invoiceId) {
        window._posCurrentNavState = { invoiceId: null, dateISO: null, id: null };
        window._posInvoiceModified = false;
    }
}

/**
 * تنفيذ استعلام مباشر ومحدد على SQLite بدون استدعاء كلي
 */
function posQueryDirect(sql, params = []) {
    if (window.BayanSQLite && window.BayanSQLite.db) {
        try {
            const stmt = window.BayanSQLite.db.prepare(sql);
            if (params && params.length > 0) stmt.bind(params);
            const results = [];
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        } catch (e) {
            console.warn("⚠️ [posNav] SQLite direct query notice:", e);
        }
    }
    return null;
}

/**
 * تأكيد التفريغ إذا كانت السلة الحالية تحتوي على أصناف غير محفوظة
 */
function confirmIfCartHasItems(targetInvoiceId) {
    return new Promise((resolve) => {
        if (!cart || cart.length === 0) {
            resolve(true);
            return;
        }
        if (window._posCurrentNavState && String(window._posCurrentNavState.invoiceId) === String(targetInvoiceId)) {
            resolve(true);
            return;
        }
        // إذا كان المستخدم يستعرض فاتورة سابقة بدون أي تعديل، الانتقال يكون فورياً وسلساً دون تنبيه
        if (window._posCurrentNavState && window._posCurrentNavState.invoiceId && !window._posInvoiceModified) {
            resolve(true);
            return;
        }

        if (typeof showCustomAlert === 'function') {
            showCustomAlert({
                type: 'question',
                titleText: '⚠️ أصناف في السلة',
                msg: 'يوجد أصناف في سلة البيع الحالية غير محفوظة.\nهل تريد تفريغ السلة والانتقال لعرض الفاتورة؟',
                showCancel: true,
                confirmText: 'نعم، انتقل',
                cancelText: 'إلغاء',
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        } else {
            resolve(confirm('يوجد أصناف في سلة البيع الحالية غير محفوظة. هل تريد تفريغ السلة والانتقال؟'));
        }
    });
}

/**
 * تحميل الفاتورة المحددة وعرض بنودها في شاشة البيع بدون أي تأثير على المخزن أو الخزينة
 */
async function loadInvoiceToSalesPOS(targetInvoiceId) {
    if (!targetInvoiceId) return;
    const sId = String(targetInvoiceId).trim();
    const cleanId = sId.replace(/^[#\s]+/, '');

    // فحص الأصناف الحالية غير المحفوظة
    const canProceed = await confirmIfCartHasItems(sId);
    if (!canProceed) return;

    // تثبيت الحالة النشطة في شريط التنقل مبكراً لضمان دقة حسابات الرصيد السابق أثناء تحميل السلة
    window._posCurrentNavState = {
        invoiceId: cleanId,
        dateISO: null,
        id: null
    };

    let rows = [];

    // 1. استدعاء الفاتورة لضمان وجودها بالذاكرة عبر المحول المركزي
    if (typeof window.ensureInvoiceLoaded === 'function') {
        try { await window.ensureInvoiceLoaded(cleanId); } catch (e) { }
    }

    // 2. البحث في الذاكرة (window.transactions) بدقة واحترافية: المطابقة الصارمة برقم الفاتورة أولاً لمنع خلط الحركات
    if (window.transactions && Array.isArray(window.transactions)) {
        const matchingByInvId = window.transactions.filter(t => {
            if (!t) return false;
            const invId = (t.invoiceId != null && t.invoiceId !== '' && t.invoiceId !== '---') ? String(t.invoiceId).trim() : null;
            if (invId && (invId === sId || invId === cleanId)) {
                const tType = String(t.type || '');
                return (tType.includes('بيع') || tType.includes('مبيعات')) && !tType.includes('مرتجع') && !tType.includes('قبض') && !tType.includes('صرف');
            }
            return false;
        });

        if (matchingByInvId.length > 0) {
            rows = matchingByInvId;
        } else {
            // حل بديل فقط إذا لم يكن للسجل invoiceId صريح
            rows = window.transactions.filter(t => {
                if (!t) return false;
                const hasInvId = (t.invoiceId != null && t.invoiceId !== '' && t.invoiceId !== '---');
                if (!hasInvId && (String(t.id) === sId || String(t.id) === cleanId)) {
                    const tType = String(t.type || '');
                    return (tType.includes('بيع') || tType.includes('مبيعات')) && !tType.includes('مرتجع') && !tType.includes('قبض') && !tType.includes('صرف');
                }
                return false;
            });
        }
    }

    // 3. إذا لم تكن في الذاكرة، استعلام مباشر ومحدد من SQLite برقم الفاتورة حصراً
    if (rows.length === 0) {
        const numId = Number(cleanId);
        const sqlInv = "SELECT * FROM transactions WHERE (invoiceId = ? OR invoiceId = ? OR CAST(invoiceId AS TEXT) = ? OR CAST(invoiceId AS INTEGER) = ?) AND (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%' ORDER BY id ASC;";
        let dbRows = posQueryDirect(sqlInv, [sId, cleanId, cleanId, isNaN(numId) ? -1 : numId]);

        if (!dbRows || dbRows.length === 0) {
            const sqlFallback = "SELECT * FROM transactions WHERE id = ? AND (invoiceId IS NULL OR invoiceId = '' OR invoiceId = '---') AND (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%' LIMIT 1;";
            dbRows = posQueryDirect(sqlFallback, [cleanId]);
        }

        if (dbRows && dbRows.length > 0) {
            rows = dbRows.map(row => {
                if (row.raw_json) {
                    try {
                        const parsed = JSON.parse(row.raw_json);
                        return Object.assign({}, row, parsed);
                    } catch (e) { }
                }
                return row;
            });
        }
    }

    // 4. فحص جدول بنود الفواتير (transaction_items) إن وجد
    if (rows.length === 0 || !rows.some(r => (r.product || r.productName || r.name))) {
        const tiSql = "SELECT * FROM transaction_items WHERE invoiceId = ? OR invoiceId = ? OR CAST(invoiceId AS TEXT) = ? ORDER BY id ASC;";
        const tiRows = posQueryDirect(tiSql, [sId, cleanId, cleanId]);
        if (tiRows && tiRows.length > 0) {
            const head = rows[0] || {};
            rows = tiRows.map(ti => {
                let parsed = {};
                if (ti.raw_json) {
                    try { parsed = JSON.parse(ti.raw_json); } catch (e) { }
                }
                return Object.assign({
                    invoiceId: ti.invoiceId,
                    product: ti.productName || parsed.product,
                    qty: ti.qty,
                    price: ti.price,
                    selectedSize: ti.size || parsed.selectedSize,
                    selectedColor: ti.color || parsed.selectedColor,
                    unit: parsed.unit || 'قطعة',
                    unitFactor: parsed.unitFactor || 1,
                    partner: head.partner || ti.partner
                }, parsed, ti);
            });
        }
    }

    // تصفية البنود الحقيقية واستبعاد أسطر المقبوضات أو الأسطر الفارغة بدون اسم صنف
    const validItems = rows.filter(x => {
        const pName = (x.product || x.productName || x.name || '').trim();
        if (!pName || pName === 'صنف غير محدد') return false;
        return true;
    });

    if (validItems.length === 0 && rows.length === 0) {
        if (typeof showToast === 'function') showToast(`⚠️ لم يتم العثور على الفاتورة #${cleanId}`, 'error');
        return;
    }

    // استخراج بيانات رأس الفاتورة
    const head = rows.find(x => x.isInvoiceHead) || rows[0] || {};
    const partnerName = head.partner || head.customer || 'عميل نقدي';
    const paymentMethod = String(head.method || head.paymentMethod || 'نقدي').trim();
    const paidValue = head.paidAmount !== undefined ? parseFloat(head.paidAmount) : (head.paid !== undefined ? parseFloat(head.paid) : 0);

    // -------------------------------------------------------------------------
    // 🏷️ استخراج ذكي وشامل لبيانات الخصم والإضافة للفاتورة (الجديدة والقديمة)
    // -------------------------------------------------------------------------
    const rawItemsSubTotal = validItems.reduce((sum, it) => sum + ((parseFloat(it.qty) || 1) * (parseFloat(it.price) || 0)), 0);

    const recordedGrandTotal = parseFloat(
        head.invoiceGrandTotal != null ? head.invoiceGrandTotal :
        (head.finalTotal != null ? head.finalTotal :
        (head.grandTotal != null ? head.grandTotal :
        (head.total != null ? head.total :
        ((head.paidAmount !== undefined ? parseFloat(head.paidAmount) : 0) + (head.remaining !== undefined ? parseFloat(head.remaining) : 0)))))
    ) || 0;

    const sumLinesDiscount = rows.reduce((s, r) => s + (parseFloat(r.discount) || 0), 0);
    const sumLinesAddition = rows.reduce((s, r) => s + (parseFloat(r.addition != null ? r.addition : (r.tax || 0)) || 0), 0);

    // --- أ) استخراج الخصم ---
    let detectedDisc = 0;
    let detectedDiscType = 'val';

    // أولوية 1: فحص الحقول الصريحة المباشرة في رأس الفاتورة
    if (head.invoiceDiscount != null && parseFloat(head.invoiceDiscount) > 0) {
        detectedDisc = parseFloat(head.invoiceDiscount);
        detectedDiscType = head.invoiceDiscountType || 'val';
    } else if (head.discountAmount != null && parseFloat(head.discountAmount) > 0) {
        detectedDisc = parseFloat(head.discountAmount);
        detectedDiscType = head.invoiceDiscountType || head.discountType || 'val';
    } else if (head.discountVal != null && parseFloat(head.discountVal) > 0) {
        detectedDisc = parseFloat(head.discountVal);
        detectedDiscType = head.invoiceDiscountType || head.discountType || 'val';
    }
    
    // أولوية 2: فحص أي سطر في الفاتورة يحمل invoiceDiscount
    if (!detectedDisc) {
        const rowWithInvDisc = rows.find(r => r.invoiceDiscount != null && parseFloat(r.invoiceDiscount) > 0);
        if (rowWithInvDisc) {
            detectedDisc = parseFloat(rowWithInvDisc.invoiceDiscount);
            detectedDiscType = rowWithInvDisc.invoiceDiscountType || 'val';
        }
    }

    // أولوية 3: فحص حقل discount المباشر في رأس الفاتورة للفواتير المسجلة قديماً
    if (!detectedDisc && head.discount != null && parseFloat(head.discount) > 0) {
        detectedDisc = parseFloat(head.discount);
        detectedDiscType = head.discountType || head.invoiceDiscountType || 'val';
    }

    // أولوية 4: فحص مجموع خصومات السطور إذا كانت موزعة على الأصناف
    if (!detectedDisc && sumLinesDiscount > 0.001) {
        detectedDisc = Number(sumLinesDiscount.toFixed(2));
        detectedDiscType = 'val';
    }

    // أولوية 5: فرق الحساب المنطقي (مجموع الأصناف - الإجمالي الفعلي للفاتورة)
    if (!detectedDisc && rawItemsSubTotal > 0 && recordedGrandTotal > 0 && (rawItemsSubTotal - recordedGrandTotal) > 0.005) {
        detectedDisc = Number((rawItemsSubTotal - recordedGrandTotal).toFixed(2));
        detectedDiscType = 'val';
    }

    // تطبيع نوع الخصم (val أو perc)
    let finalDiscType = 'val';
    const rawDtStr = String(detectedDiscType || '').toLowerCase().trim();
    if (rawDtStr.includes('perc') || rawDtStr.includes('%') || rawDtStr.includes('نسب')) {
        finalDiscType = 'perc';
    } else {
        finalDiscType = 'val';
    }
    const discountVal = detectedDisc;
    const discountTypeVal = finalDiscType;

    // --- ب) استخراج الإضافة / الضريبة ---
    let detectedTax = 0;
    let detectedTaxType = 'val';

    // أولوية 1: فحص الحقول الصريحة للإضافة في رأس الفاتورة
    if (head.invoiceTax != null && parseFloat(head.invoiceTax) > 0) {
        detectedTax = parseFloat(head.invoiceTax);
        detectedTaxType = head.invoiceTaxType || 'val';
    } else if (head.invoiceExtra != null && parseFloat(head.invoiceExtra) > 0) {
        detectedTax = parseFloat(head.invoiceExtra);
        detectedTaxType = head.invoiceExtraType || head.invoiceTaxType || 'val';
    } else if (head.tax != null && parseFloat(head.tax) > 0) {
        detectedTax = parseFloat(head.tax);
        detectedTaxType = head.taxType || 'val';
    } else if (head.addition != null && parseFloat(head.addition) > 0) {
        detectedTax = parseFloat(head.addition);
        detectedTaxType = head.additionType || head.taxType || 'val';
    } else if (head.extra != null && parseFloat(head.extra) > 0) {
        detectedTax = parseFloat(head.extra);
        detectedTaxType = head.extraType || head.taxType || 'val';
    }

    // أولوية 2: فحص أي سطر في الفاتورة يحمل invoiceTax أو invoiceExtra
    if (!detectedTax) {
        const rowWithTax = rows.find(r => (r.invoiceTax != null && parseFloat(r.invoiceTax) > 0) || (r.invoiceExtra != null && parseFloat(r.invoiceExtra) > 0));
        if (rowWithTax) {
            detectedTax = parseFloat(rowWithTax.invoiceTax != null ? rowWithTax.invoiceTax : rowWithTax.invoiceExtra);
            detectedTaxType = rowWithTax.invoiceTaxType || rowWithTax.invoiceExtraType || 'val';
        }
    }

    // أولوية 3: فحص مجموع إضافات السطور
    if (!detectedTax && sumLinesAddition > 0.001) {
        detectedTax = Number(sumLinesAddition.toFixed(2));
        detectedTaxType = 'val';
    }

    // أولوية 4: فرق الحساب المنطقي (الإجمالي الفعلي - مجموع الأصناف) إذا لم يكن هناك خصم
    if (!detectedTax && rawItemsSubTotal > 0 && recordedGrandTotal > 0 && (recordedGrandTotal - rawItemsSubTotal) > 0.005 && detectedDisc === 0) {
        detectedTax = Number((recordedGrandTotal - rawItemsSubTotal).toFixed(2));
        detectedTaxType = 'val';
    }

    // تطبيع نوع الإضافة (val أو perc)
    let finalTaxType = 'val';
    const rawTtStr = String(detectedTaxType || '').toLowerCase().trim();
    if (rawTtStr.includes('perc') || rawTtStr.includes('%') || rawTtStr.includes('نسب')) {
        finalTaxType = 'perc';
    } else {
        finalTaxType = 'val';
    }
    const taxVal = detectedTax;
    const taxTypeVal = finalTaxType;

    const notesVal = rows.find(t => t.notes)?.notes || head.notes || '';
    const dateVal = head.dateISO || (head.date ? head.date.split(' ')[0] : new Date().toLocaleDateString('en-CA'));
    const timeVal = head.timeISO || head.time || (head.date && head.date.split(' ')[1]) || new Date().toTimeString().slice(0, 5);

    const activeWH = (head.warehouse && head.warehouse.trim())
        ? head.warehouse.trim()
        : ((typeof currentUser !== 'undefined' && currentUser && currentUser.warehouseName)
            ? currentUser.warehouseName.trim()
            : ((typeof getStore === 'function' && getStore('bayan_terminal_warehouse')) || 'المخزن الرئيسي'));

    // تحويل البنود إلى سلة البيع بكامل تفاصيل المقاس واللون والوحدة
    cart = validItems.map(it => {
        const prodTitle = it.product || it.productName || it.name || 'صنف';
        const p = (typeof productsDB !== 'undefined' && Array.isArray(productsDB))
            ? productsDB.find(x => x.name === prodTitle || (it.barcode && x.barcode === it.barcode)) : null;
        const u = (p && p.units)
            ? p.units.find(un => un.unitName === it.unit) : null;
        return {
            id: p ? p.id : (it.productId || it.id || (Date.now() + Math.random())),
            productId: p ? p.id : (it.productId || null),
            product: prodTitle,
            name: prodTitle,
            code: it.code || (p ? p.code : (it.barcode || '')),
            qty: parseFloat(it.qty || 1),
            price: parseFloat(it.price || 0),
            unit: it.unit || 'قطعة',
            unitFactor: parseFloat(it.unitFactor) || (u ? (parseFloat(u.factor) || 1) : 1),
            selectedUnit: u || it.unit || 'قطعة',
            selectedSize: it.selectedSize || it.size || '',
            selectedColor: it.selectedColor || it.color || '',
            size: it.selectedSize || it.size || '',
            color: it.selectedColor || it.color || '',
            warehouse: it.warehouse || head.warehouse || activeWH,
            type: it.type || head.type || 'بيع 📤',
            units: p ? (p.units || []) : []
        };
    });

    // تعبئة حقول الواجهة
    const custInp = document.getElementById('customerName');
    if (custInp) custInp.value = partnerName;
    if (typeof updateHeaderPartnerInfo === 'function') updateHeaderPartnerInfo();

    // تثبيت التاريخ والوقت مع قفل الحقول بعلامة data-touched لمنع مؤقت الساعة من الكتابة فوقهما
    const dEl = document.getElementById('salesDate');
    if (dEl) {
        dEl.value = dateVal;
        dEl.setAttribute('data-touched', 'true');
        dEl.dataset.touched = 'true';
    }
    const tEl = document.getElementById('salesTime');
    if (tEl) {
        tEl.value = timeVal;
        tEl.setAttribute('data-touched', 'true');
        tEl.dataset.touched = 'true';
    }

    if (typeof updateSalesBadgeUI === 'function') {
        updateSalesBadgeUI(null, cleanId);
    } else if (document.getElementById('salesBadgeID')) {
        document.getElementById('salesBadgeID').innerText = cleanId;
    }

    const discInp = document.getElementById('discountInput');
    if (discInp) discInp.value = discountVal;
    const discType = document.getElementById('discountType');
    if (discType) discType.value = discountTypeVal;

    const taxInp = document.getElementById('taxInput');
    if (taxInp) taxInp.value = taxVal;
    const taxType = document.getElementById('taxType');
    if (taxType) taxType.value = taxTypeVal;

    const tendInp = document.getElementById('tenderedAmount');
    if (tendInp) tendInp.value = paidValue;

    const notesInp = document.getElementById('salesNotes');
    if (notesInp) notesInp.value = notesVal;

    // ضبط طريقة الدفع بدقة
    const methodSelect = document.getElementById('sales-sectionPaymentMethodSelect') || document.getElementById('salesPaymentMethodSelect');
    if (methodSelect) {
        const matched = Array.from(methodSelect.options).find(o => o.value === paymentMethod || o.text.trim() === paymentMethod);
        if (matched) {
            methodSelect.value = matched.value;
        } else if (paymentMethod.includes('كاش') || paymentMethod.includes('نقدي')) {
            const cashOpt = Array.from(methodSelect.options).find(o => o.value.includes('كاش') || o.value.includes('نقدي'));
            if (cashOpt) methodSelect.value = cashOpt.value;
        }
    }

    // إعادة رسم السلة وحساب الإجماليات
    renderCart();

    // تفعيل وضع التعديل (Edit Mode) للفاتورة المستعرضة بكافة بياناتها الأصلية
    isEditMode = true;
    window.isEditMode = true;
    editingInvoiceId = cleanId;
    window.editingInvoiceId = cleanId;
    editingInvoiceType = 'بيع';
    window.editingInvoiceType = 'بيع';

    editingOriginalDate = {
        full: head.date || `${dateVal} ${timeVal}`,
        iso: dateVal,
        time: timeVal
    };
    window.editingOriginalDate = editingOriginalDate;
    editingOriginalPartner = partnerName;
    window.editingOriginalPartner = partnerName;
    editingOriginalMethod = paymentMethod;
    window.editingOriginalMethod = paymentMethod;
    editingOriginalUser = head.user || (rows[0] ? rows[0].user : '') || (window.currentUser ? window.currentUser.name : '-');
    window.editingOriginalUser = editingOriginalUser;

    // حفظ نسخة من الأصناف الأصلية لحساب الفروق المخزنية والسماح بالحفظ دون منع البيع بالسالب
    editingOriginalItems = JSON.parse(JSON.stringify(cart));
    window.editingOriginalItems = editingOriginalItems;

    // تلوين وتحويل زر الحفظ إلى: ✏️ حفظ تعديل #X
    const mainSaveBtn = document.querySelector('#sales-section .btn-save');
    if (mainSaveBtn) {
        mainSaveBtn.style.background = '#e67e22';
        mainSaveBtn.innerHTML = `<span>✏️ حفظ تعديل #${cleanId}</span><span class="shortcut">F9</span>`;
    }

    // تثبيت الحالة النشطة في شريط التنقل
    window._posCurrentNavState = {
        invoiceId: cleanId,
        dateISO: head.dateISO || dateVal,
        id: head.id || (rows[0] ? rows[0].id : null)
    };
    window._posInvoiceModified = false;

    // مزامنة حالة التبويب النشط لحفظ العرض عند التبديل
    if (typeof tabStates !== 'undefined' && typeof activeTabId !== 'undefined' && tabStates[activeTabId]) {
        tabStates[activeTabId].viewingInvoiceId = cleanId;
        tabStates[activeTabId].posNavState = { ...window._posCurrentNavState };
        tabStates[activeTabId].invoiceModified = false;
        tabStates[activeTabId].isEditMode = true;
        tabStates[activeTabId].editingInvoiceId = cleanId;
        tabStates[activeTabId].editingInvoiceType = 'بيع';
        tabStates[activeTabId].editingOriginalItems = editingOriginalItems;
        tabStates[activeTabId].editingOriginalDate = editingOriginalDate;
        tabStates[activeTabId].editingOriginalPartner = partnerName;
        tabStates[activeTabId].badgeId = cleanId;
        tabStates[activeTabId].date = dateVal;
        tabStates[activeTabId].time = timeVal;
        tabStates[activeTabId].dateTouched = true;
        tabStates[activeTabId].timeTouched = true;
        tabStates[activeTabId].discount = discountVal;
        tabStates[activeTabId].discountType = discountTypeVal;
        tabStates[activeTabId].tax = taxVal;
        tabStates[activeTabId].taxType = taxTypeVal;
    }

    if (typeof updateActiveTabTitle === 'function') {
        updateActiveTabTitle(partnerName, `تعديل #${cleanId}`);
    }

    if (typeof initPosInvoiceModifiedListeners === 'function') {
        initPosInvoiceModifiedListeners();
    }

    if (typeof showToast === 'function') {
        showToast(`📖 تم عرض الفاتورة #${cleanId} بنجاح`, 'info');
    }
}

/**
 * 1. 🔍 البحث عن فاتورة محددة
 */
async function posSearchSpecificInvoice() {
    if (_posNavBusy) return;

    let searchVal = '';
    if (typeof window.showCustomPrompt === 'function') {
        searchVal = await window.showCustomPrompt('🔍 أدخل رقم أو كود فاتورة البيع للبحث:', '', 'text');
    } else {
        searchVal = prompt('🔍 أدخل رقم أو كود فاتورة البيع للبحث:');
    }

    if (!searchVal || !String(searchVal).trim()) return;
    searchVal = String(searchVal).trim();
    const cleanVal = searchVal.replace(/^[#\s]+/, '');

    _posNavBusy = true;
    try {
        let foundInvoiceId = null;
        const numVal = Number(cleanVal);

        // 1. بحث محدد وفوري برقم الفاتورة الصريح
        const sql1 = "SELECT invoiceId FROM transactions WHERE (invoiceId = ? OR invoiceId = ? OR CAST(invoiceId AS TEXT) = ? OR CAST(invoiceId AS INTEGER) = ?) AND (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%' LIMIT 1;";
        const rows1 = posQueryDirect(sql1, [searchVal, cleanVal, cleanVal, isNaN(numVal) ? -1 : numVal]);
        if (rows1 && rows1.length > 0 && rows1[0].invoiceId) {
            foundInvoiceId = rows1[0].invoiceId;
        } else {
            // بحث مرن LIKE
            const sql2 = "SELECT invoiceId FROM transactions WHERE (invoiceId LIKE ? OR invoiceId LIKE ?) AND (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%' ORDER BY id DESC LIMIT 1;";
            const rows2 = posQueryDirect(sql2, [`%${cleanVal}%`, `%${searchVal}%`]);
            if (rows2 && rows2.length > 0 && rows2[0].invoiceId) {
                foundInvoiceId = rows2[0].invoiceId;
            }
        }

        // صمام أمان بديل من الذاكرة
        if (!foundInvoiceId && window.transactions && Array.isArray(window.transactions)) {
            const memMatch = window.transactions.find(t => {
                if (!t) return false;
                const invId = (t.invoiceId != null && t.invoiceId !== '' && t.invoiceId !== '---') ? String(t.invoiceId).trim() : '';
                const tType = String(t.type || '');
                if (!((tType.includes('بيع') || tType.includes('مبيعات')) && !tType.includes('مرتجع') && !tType.includes('قبض') && !tType.includes('صرف'))) return false;
                return invId === searchVal || invId === cleanVal || invId.includes(cleanVal);
            });
            if (memMatch) foundInvoiceId = memMatch.invoiceId || memMatch.id;
        }

        if (!foundInvoiceId) {
            if (typeof showToast === 'function') {
                showToast(`⚠️ لم يتم العثور على فاتورة بيع برقم: ${searchVal}`, 'warning');
            } else {
                alert(`⚠️ لم يتم العثور على فاتورة بيع برقم: ${searchVal}`);
            }
            return;
        }

        await loadInvoiceToSalesPOS(foundInvoiceId);
    } finally {
        _posNavBusy = false;
    }
}

/**
 * 2. ⏮️ الانتقال إلى أول فاتورة مسجلة
 */
async function posNavigateFirstInvoice() {
    if (_posNavBusy) return;
    _posNavBusy = true;
    try {
        let foundInvoiceId = null;

        // استعلام أقدم فاتورة بيع مباشرة من SQLite بحد أقصى سجل واحد
        const sql = "SELECT invoiceId FROM transactions WHERE (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%' AND invoiceId IS NOT NULL AND invoiceId != '' AND invoiceId != '---' ORDER BY dateISO ASC, id ASC LIMIT 1;";
        const rows = posQueryDirect(sql);
        if (rows && rows.length > 0 && rows[0].invoiceId) {
            foundInvoiceId = rows[0].invoiceId;
        }

        // صمام أمان بديل من الذاكرة
        if (!foundInvoiceId && window.transactions && Array.isArray(window.transactions)) {
            const salesTxs = window.transactions
                .filter(t => t && t.invoiceId && (String(t.type || '').includes('بيع') || String(t.type || '').includes('مبيعات')) && !String(t.type || '').includes('مرتجع') && !String(t.type || '').includes('قبض') && !String(t.type || '').includes('صرف'))
                .sort((a, b) => (a.dateISO || '').localeCompare(b.dateISO || '') || (a.id || 0) - (b.id || 0));
            if (salesTxs.length > 0) foundInvoiceId = salesTxs[0].invoiceId;
        }

        if (!foundInvoiceId) {
            if (typeof showToast === 'function') showToast('⚠️ لا توجد فواتير بيع مسجلة في النظام', 'warning');
            return;
        }

        if (window._posCurrentNavState && String(window._posCurrentNavState.invoiceId) === String(foundInvoiceId)) {
            if (typeof showToast === 'function') showToast('ℹ️ أنت بالفعل عند أول فاتورة مسجلة', 'info');
            return;
        }

        await loadInvoiceToSalesPOS(foundInvoiceId);
    } finally {
        _posNavBusy = false;
    }
}

/**
 * 3. ◀️ الانتقال إلى الفاتورة السابقة
 */
async function posNavigatePrevInvoice() {
    if (_posNavBusy) return;
    _posNavBusy = true;
    try {
        let foundInvoiceId = null;
        const currentNav = window._posCurrentNavState;

        if (currentNav && currentNav.invoiceId) {
            const cleanId = String(currentNav.invoiceId).trim().replace(/^[#\s]+/, '');
            let currMinId = currentNav.id;
            let currDateISO = currentNav.dateISO;

            const metaSql = "SELECT MIN(id) as minId, dateISO FROM transactions WHERE (invoiceId = ? OR invoiceId = ? OR CAST(invoiceId AS TEXT) = ?) AND (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%';";
            const metaRows = posQueryDirect(metaSql, [currentNav.invoiceId, cleanId, cleanId]);
            if (metaRows && metaRows.length > 0 && metaRows[0].minId != null) {
                currMinId = metaRows[0].minId;
                if (metaRows[0].dateISO) currDateISO = metaRows[0].dateISO;
            }

            // استعلام الفاتورة السابقة فورياً من SQLite مع LIMIT 1
            const sql = "SELECT invoiceId FROM transactions WHERE (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%' AND invoiceId IS NOT NULL AND invoiceId != '' AND invoiceId != '---' AND invoiceId != ? AND invoiceId != ? AND (dateISO < ? OR (dateISO = ? AND id < ?)) ORDER BY dateISO DESC, id DESC LIMIT 1;";
            const rows = posQueryDirect(sql, [currentNav.invoiceId, cleanId, currDateISO, currDateISO, currMinId]);
            if (rows && rows.length > 0 && rows[0].invoiceId) {
                foundInvoiceId = rows[0].invoiceId;
            }
        } else {
            // شاشة جديدة فارغة: الفاتورة السابقة تعني أحدث فاتورة مسجلة في النظام
            const sql = "SELECT invoiceId FROM transactions WHERE (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%' AND invoiceId IS NOT NULL AND invoiceId != '' AND invoiceId != '---' ORDER BY dateISO DESC, id DESC LIMIT 1;";
            const rows = posQueryDirect(sql);
            if (rows && rows.length > 0 && rows[0].invoiceId) {
                foundInvoiceId = rows[0].invoiceId;
            }
        }

        // صمام أمان بديل من الذاكرة
        if (!foundInvoiceId && window.transactions && Array.isArray(window.transactions)) {
            const curId = currentNav ? String(currentNav.invoiceId).replace(/^[#\s]+/, '') : null;
            const salesTxs = window.transactions
                .filter(t => t && t.invoiceId && (String(t.type || '').includes('بيع') || String(t.type || '').includes('مبيعات')) && !String(t.type || '').includes('مرتجع') && !String(t.type || '').includes('قبض') && !String(t.type || '').includes('صرف'))
                .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || '') || (b.id || 0) - (a.id || 0));

            // تجميع الفواتير الفريدة
            const uniqueInvoices = [];
            const seen = new Set();
            for (const t of salesTxs) {
                const iId = String(t.invoiceId).trim();
                if (iId && !seen.has(iId)) {
                    seen.add(iId);
                    uniqueInvoices.push(t);
                }
            }

            if (!curId && uniqueInvoices.length > 0) {
                foundInvoiceId = uniqueInvoices[0].invoiceId;
            } else if (curId) {
                const curIdx = uniqueInvoices.findIndex(t => String(t.invoiceId) === String(curId));
                if (curIdx >= 0 && curIdx < uniqueInvoices.length - 1) {
                    foundInvoiceId = uniqueInvoices[curIdx + 1].invoiceId;
                }
            }
        }

        if (!foundInvoiceId) {
            if (typeof showToast === 'function') {
                showToast(currentNav && currentNav.invoiceId ? 'ℹ️ هذه أول فاتورة مسجلة، لا توجد فواتير سابقة' : '⚠️ لا توجد فواتير سابقة مسجلة', 'info');
            }
            return;
        }

        await loadInvoiceToSalesPOS(foundInvoiceId);
    } finally {
        _posNavBusy = false;
    }
}

/**
 * 4. ▶️ الانتقال إلى الفاتورة التالية
 */
async function posNavigateNextInvoice() {
    if (_posNavBusy) return;
    _posNavBusy = true;
    try {
        const currentNav = window._posCurrentNavState;
        if (!currentNav || !currentNav.invoiceId) {
            if (typeof showToast === 'function') showToast('ℹ️ أنت بالفعل في شاشة فاتورة جديدة', 'info');
            return;
        }

        let foundInvoiceId = null;
        const cleanId = String(currentNav.invoiceId).trim().replace(/^[#\s]+/, '');
        let currMaxId = currentNav.id;
        let currDateISO = currentNav.dateISO;

        const metaSql = "SELECT MAX(id) as maxId, dateISO FROM transactions WHERE (invoiceId = ? OR invoiceId = ? OR CAST(invoiceId AS TEXT) = ?) AND (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%';";
        const metaRows = posQueryDirect(metaSql, [currentNav.invoiceId, cleanId, cleanId]);
        if (metaRows && metaRows.length > 0 && metaRows[0].maxId != null) {
            currMaxId = metaRows[0].maxId;
            if (metaRows[0].dateISO) currDateISO = metaRows[0].dateISO;
        }

        // استعلام الفاتورة التالية فورياً من SQLite مع LIMIT 1
        const sql = "SELECT invoiceId FROM transactions WHERE (type LIKE '%بيع%' OR type LIKE '%مبيعات%') AND type NOT LIKE '%مرتجع%' AND type NOT LIKE '%قبض%' AND type NOT LIKE '%صرف%' AND invoiceId IS NOT NULL AND invoiceId != '' AND invoiceId != '---' AND invoiceId != ? AND invoiceId != ? AND (dateISO > ? OR (dateISO = ? AND id > ?)) ORDER BY dateISO ASC, id ASC LIMIT 1;";
        const rows = posQueryDirect(sql, [currentNav.invoiceId, cleanId, currDateISO, currDateISO, currMaxId]);
        if (rows && rows.length > 0 && rows[0].invoiceId) {
            foundInvoiceId = rows[0].invoiceId;
        }

        // صمام أمان بديل من الذاكرة
        if (!foundInvoiceId && window.transactions && Array.isArray(window.transactions)) {
            const salesTxs = window.transactions
                .filter(t => t && t.invoiceId && (String(t.type || '').includes('بيع') || String(t.type || '').includes('مبيعات')) && !String(t.type || '').includes('مرتجع') && !String(t.type || '').includes('قبض') && !String(t.type || '').includes('صرف'))
                .sort((a, b) => (a.dateISO || '').localeCompare(b.dateISO || '') || (a.id || 0) - (b.id || 0));

            // تجميع الفواتير الفريدة
            const uniqueInvoices = [];
            const seen = new Set();
            for (const t of salesTxs) {
                const iId = String(t.invoiceId).trim();
                if (iId && !seen.has(iId)) {
                    seen.add(iId);
                    uniqueInvoices.push(t);
                }
            }

            const curIdx = uniqueInvoices.findIndex(t => String(t.invoiceId) === String(cleanId));
            if (curIdx >= 0 && curIdx < uniqueInvoices.length - 1) {
                foundInvoiceId = uniqueInvoices[curIdx + 1].invoiceId;
            }
        }

        if (!foundInvoiceId) {
            if (typeof showToast === 'function') showToast('ℹ️ أنت بالفعل عند أحدث فاتورة مسجلة', 'info');
            return;
        }

        await loadInvoiceToSalesPOS(foundInvoiceId);
    } finally {
        _posNavBusy = false;
    }
}

/**
 * 🏷️ تحديث شارة ومربع رقم الفاتورة في شاشة البيع مع التلميح الذكي
 * يعرض رقم الإيصال اليومي ومعه تلميح كامل بالرقم الداخلي عند تمرير الماوس فوق المربع
 */
function updateSalesBadgeUI(explicitSeq = null, explicitRawSeq = null) {
    const badgeEl = document.getElementById('salesBadgeID');
    const boxEl = document.getElementById('salesInvoiceBadgeBox') || (badgeEl ? badgeEl.parentElement : null);
    if (!badgeEl && !boxEl) return;

    // 1. حالة استعراض فاتورة سابقة من خلال أزرار التنقل (سابق / تالي / بحث)
    if (window._posCurrentNavState && window._posCurrentNavState.invoiceId) {
        const invId = window._posCurrentNavState.invoiceId;
        let taxSeq = null;
        if (typeof transactions !== 'undefined' && Array.isArray(transactions)) {
            const match = transactions.find(t => String(t.invoiceId) === String(invId));
            if (match) taxSeq = match.taxInvoiceSeq || match.dailySeq;
        }
        if (taxSeq) {
            const titleText = `رقم الإيصال اليومي: ${taxSeq} (الرقم التراكمي الداخلي: ${invId})`;
            if (badgeEl) { badgeEl.innerText = taxSeq; badgeEl.title = titleText; }
            if (boxEl) { boxEl.title = titleText; }
        } else {
            const titleText = `رقم الفاتورة: ${invId}`;
            if (badgeEl) { badgeEl.innerText = invId; badgeEl.title = titleText; }
            if (boxEl) { boxEl.title = titleText; }
        }
        return;
    }

    // 2. حالة فاتورة جديدة قيد التحرير
    const rawSeq = explicitRawSeq !== null ? explicitRawSeq : (typeof getNextSequence === 'function' ? getNextSequence('بيع') : 1);
    const isTaxEnabled = (typeof isDailyTaxSeqEnabled === 'function' && isDailyTaxSeqEnabled());

    if (isTaxEnabled && typeof getDailyTaxSequence === 'function') {
        const isLimitReached = (typeof isDailyTaxLimitReached === 'function' && isDailyTaxLimitReached());
        const dailySeq = explicitSeq !== null ? explicitSeq : getDailyTaxSequence();
        const settings = (typeof getStore === 'function') ? JSON.parse(getStore('pos_settings') || '{}') : {};
        const limit = parseInt(settings.dailyTaxSeqLimit || 0, 10);

        const titleText = (isLimitReached && limit > 0)
            ? `⚠️ تم بلوغ الحد الأقصى اليومي (${limit} فواتير) - رقم الإيصال اليومي: ${dailySeq} (الرقم التراكمي الداخلي: ${rawSeq})`
            : `رقم الإيصال اليومي: ${dailySeq} (الرقم التراكمي الداخلي: ${rawSeq})`;

        if (badgeEl) {
            badgeEl.innerText = dailySeq;
            badgeEl.title = titleText;
        }
        if (boxEl) {
            boxEl.title = titleText;
        }
    } else {
        const titleText = `رقم الفاتورة: ${rawSeq}`;
        if (badgeEl) {
            badgeEl.innerText = rawSeq;
            badgeEl.title = titleText;
        }
        if (boxEl) {
            boxEl.title = titleText;
        }
    }
}

// تصدير الدوال للنافذة العامة
window.updateSalesBadgeUI = updateSalesBadgeUI;
window.posSearchSpecificInvoice = posSearchSpecificInvoice;
window.posNavigateFirstInvoice = posNavigateFirstInvoice;
window.posNavigatePrevInvoice = posNavigatePrevInvoice;
window.posNavigateNextInvoice = posNavigateNextInvoice;
window.loadInvoiceToSalesPOS = loadInvoiceToSalesPOS;
window.updatePosNavUIState = updatePosNavUIState;

// تشغيل التحديث فور اكتمال تحميل الصفحة لضمان جاهزية التلميح فوراً
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(updateSalesBadgeUI, 300);
    });
} else {
    setTimeout(updateSalesBadgeUI, 300);
}

