/**
 * Bayan POS - Unified Invoice & Calculation Engine (BayanInvoiceEngine)
 * =========================================================================
 * محرك موحد لكافة العمليات الحسابية والمنطق المشترك بين شاشات:
 * (المبيعات - المشتريات - المرتجعات - التسويات)
 * يوفر كوداً واحداً نظيفاً فائق السرعة، ويلغي تكرار آلاف الأسطر.
 * =========================================================================
 */

(function (window) {
    'use strict';

    const BayanInvoiceEngine = {
        /**
         * دالة التقريب المالي الموحدة فائقة الدقة (Financial Precision Rounding)
         */
        round(val, decimals = 2) {
            if (val === null || val === undefined || isNaN(val)) return 0;
            const factor = Math.pow(10, decimals);
            return Math.round((Number(val) + Number.EPSILON) * factor) / factor;
        },

        format(val, decimals = 2) {
            return this.round(val, decimals).toFixed(decimals);
        },

        /**
         * 1. حساب قيمة الخصم وضمان الأمان وحدود الصلاحيات
         */
        calculateDiscount(subTotal, discountVal, discountType = 'val', maxDiscountPerc = 100, canDiscount = true) {
            const sub = Math.max(0, parseFloat(subTotal) || 0);
            let val = Math.max(0, parseFloat(discountVal) || 0);

            if (!canDiscount || maxDiscountPerc <= 0 || sub === 0) {
                return { amount: 0, value: 0, capped: false };
            }

            let capped = false;

            // تطبيق الحد الأقصى المصرح به للموظف
            if (maxDiscountPerc > 0 && maxDiscountPerc < 100) {
                if (discountType === 'perc' && val > maxDiscountPerc) {
                    val = maxDiscountPerc;
                    capped = true;
                } else if (discountType === 'val') {
                    const maxVal = this.round(sub * (maxDiscountPerc / 100), 2);
                    if (val > maxVal) {
                        val = maxVal;
                        capped = true;
                    }
                }
            }

            let amount = (discountType === 'perc') ? this.round(sub * val / 100, 2) : val;

            // الخصم لا يتجاوز إجمالي الفاتورة
            if (amount > sub) {
                amount = sub;
                capped = true;
            }

            return {
                amount: this.round(amount, 2),
                value: val,
                capped
            };
        },

        /**
         * 2. حساب قيمة الضريبة أو المصاريف الإضافية
         */
        calculateTax(subTotal, taxVal, taxType = 'val') {
            const sub = Math.max(0, parseFloat(subTotal) || 0);
            const val = Math.max(0, parseFloat(taxVal) || 0);
            const amount = (taxType === 'perc') ? this.round(sub * val / 100, 2) : val;
            return {
                amount: this.round(amount, 2),
                value: val
            };
        },

        /**
         * 3. جلب قيمة ضريبة القيمة المضافة العامة (من إعدادات النظام)
         */
        getGlobalTaxAmount(subTotal) {
            const sub = Math.max(0, parseFloat(subTotal) || 0);
            try {
                const settings = (typeof getStore === 'function') 
                    ? JSON.parse(getStore('pos_settings') || '{}') 
                    : {};
                if (settings.taxEnabled) {
                    const pct = parseFloat(settings.taxPercent) || 0;
                    return this.round(sub * pct / 100, 2);
                }
            } catch (e) {}
            return 0;
        },

        /**
         * 4. الحساب الشامل والنهائي لأي فاتورة (بيع / شراء / مرتجع)
         */
        calculateInvoiceSummary({
            cart = [],
            discountVal = 0,
            discountType = 'val',
            taxVal = 0,
            taxType = 'val',
            prevBalance = 0,
            paidAmount = 0,
            maxDiscountPerc = 100,
            canDiscount = true,
            isPurchase = false
        } = {}) {
            // أ. حساب المجموع الفرعي والكميات بدقة القروش المحاسبية
            let subTotal = 0;
            let totalQty = 0;
            const itemsCount = cart.length;

            cart.forEach(item => {
                const q = parseFloat(item.qty) || 0;
                const p = parseFloat(item.price) || 0;
                const lineTotal = this.round(q * p, 2);
                totalQty = this.round(totalQty + q, 3);
                subTotal = this.round(subTotal + lineTotal, 2);
            });

            subTotal = this.round(subTotal, 2);

            // ب. حساب الخصم
            const discResult = this.calculateDiscount(subTotal, discountVal, discountType, maxDiscountPerc, canDiscount);
            const discountAmount = discResult.amount;

            // ج. حساب الإضافة / المصاريف
            const taxResult = this.calculateTax(subTotal, taxVal, taxType);
            const taxAmount = taxResult.amount;

            // د. الضريبة العامة
            const globalTaxAmount = this.getGlobalTaxAmount(subTotal);

            // هـ. الصافي النهائي
            let finalTotal = this.round(subTotal - discountAmount + taxAmount + globalTaxAmount, 2);
            if (finalTotal < 0) finalTotal = 0;

            // و. المطلوب مع الرصيد السابق والمدفوع
            const prev = parseFloat(prevBalance) || 0;
            const paid = parseFloat(paidAmount) || 0;
            
            // في المبيعات: الصافي + السابق - المدفوع
            // في المشتريات: الصافي + السابق - المدفوع
            const grandTotalWithPrev = this.round(finalTotal + prev, 2);
            const remainingOrChange = this.round(paid - grandTotalWithPrev, 2);

            return {
                itemsCount,
                totalQty: this.round(totalQty, 3),
                subTotal,
                discountAmount,
                discountValCapped: discResult.value,
                isDiscountCapped: discResult.capped,
                taxAmount,
                globalTaxAmount,
                finalTotal,
                prevBalance: prev,
                paidAmount: paid,
                grandTotalWithPrev,
                remainingOrChange
            };
        },

        /**
         * 5. محرك البحث السريع الموحد في الحسابات (عملاء / موردين / مناديب)
         */
        searchAccounts(query, filterType = null) {
            if (!query || typeof query !== 'string') return [];
            const cleanQuery = query.trim().toLowerCase();
            if (!cleanQuery) return [];

            const list = (window.accounts && Array.isArray(window.accounts)) 
                ? window.accounts 
                : ((typeof accounts !== 'undefined' && Array.isArray(accounts)) ? accounts : []);

            return list.filter(acc => {
                if (!acc) return false;
                if (filterType && acc.type && acc.type !== filterType && acc.type !== 'mixed') {
                    return false;
                }
                const name = String(acc.name || '').toLowerCase();
                const code = String(acc.code || '').toLowerCase();
                const mobile = String(acc.mobile || acc.phone || '').toLowerCase();
                return name.includes(cleanQuery) || code.includes(cleanQuery) || mobile.includes(cleanQuery);
            });
        }
    };

    window.BayanInvoiceEngine = BayanInvoiceEngine;
    if (typeof window.bayanRound !== 'function') {
        window.bayanRound = BayanInvoiceEngine.round.bind(BayanInvoiceEngine);
    }
    if (typeof window.bayanFormatMoney !== 'function') {
        window.bayanFormatMoney = BayanInvoiceEngine.format.bind(BayanInvoiceEngine);
    }
})(typeof window !== 'undefined' ? window : globalThis);
