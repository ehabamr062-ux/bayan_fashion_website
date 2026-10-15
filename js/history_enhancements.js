/**
 * Bayan POS - History Section Enhancements
 * 1. عمود "الكمية بعد العملية" (رصيد المخزون بعد كل حركة)
 * 2. فلتر البحث برقم الفاتورة أو اسم العميل/المورد
 */
(function () {
    'use strict';

    // =============================================
    // فلتر البحث برقم الفاتورة/العميل
    // =============================================
    window.applyHistoryInvoiceClientFilter = function (query) {
        if (typeof renderHistoryTable === 'function') {
            renderHistoryTable();
        }
    };

})();
