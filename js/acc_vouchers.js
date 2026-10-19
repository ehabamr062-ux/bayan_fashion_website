// ============================================================
//  سندات القبض وسندات الصرف والعمليات المالية (Receipts & Disbursements)
// ============================================================
        function resetReceipt() {

            if (document.getElementById('receiptAmount')) document.getElementById('receiptAmount').value = '';

            if (document.getElementById('receiptCustomer')) document.getElementById('receiptCustomer').value = '';

            if (document.getElementById('receiptAccountBalance')) document.getElementById('receiptAccountBalance').innerText = '0.00';

            if (document.getElementById('receiptNotes')) document.getElementById('receiptNotes').value = '';

            if (document.getElementById('receiptType')) document.getElementById('receiptType').value = 'أخرى';
            if (typeof loadCustomVoucherCategories === 'function') loadCustomVoucherCategories('receipt');

            // تعيين التاريخ والوقت ورقم الحركة بالتسلسل

            const now = new Date();

            const rcDate = document.getElementById('receiptDate');
            if (rcDate) {
                rcDate.value = now.toLocaleDateString('en-CA');
                rcDate.removeAttribute('data-touched');
                if (rcDate.dataset) delete rcDate.dataset.touched;
            }

            const rcTime = document.getElementById('receiptTime');
            if (rcTime) {
                rcTime.value = now.toTimeString().slice(0, 5);
                rcTime.removeAttribute('data-touched');
                if (rcTime.dataset) delete rcTime.dataset.touched;
            }

            // رقم الحركة يبدأ من 1 ويتسلسل

            if (document.getElementById('receiptID')) {

                document.getElementById('receiptID').value = getNextSequence('قبض');

            }

            if (document.getElementById('pendingInvoicesBody')) document.getElementById('pendingInvoicesBody').innerHTML = '';

            if (document.getElementById('receiptAmount')) document.getElementById('receiptAmount').focus();

        }

        let isReceiptSaving = false; // حماية ضد النقرة المزدوجة

        async function saveReceipt(closeAfterExplicit = false, accountChecked = false) {

            if (isReceiptSaving) return false; // منع التكرار لو العملية جارية
            isReceiptSaving = true;

            const saveBtns = document.querySelectorAll('#receipt-section .btn-save, #receipt-section .action-btn');
            saveBtns.forEach(b => { b.disabled = true; b.style.pointerEvents = 'none'; b.style.opacity = '0.6'; });

            try {
                if (!checkPermission('sec_receipt')) return false;

                const amount = parseFloat(document.getElementById('receiptAmount').value);

                const payer = (document.getElementById('receiptCustomer')?.value || '').trim();

                if (payer && typeof checkAccountFrozenAndAlert === 'function') {
                    if (checkAccountFrozenAndAlert(payer)) {
                        return false;
                    }
                }

                const type = document.getElementById('receiptType').value;

                if (!amount || amount <= 0) {

                    alert("⚠️ يرجى إدخال مبلغ صحيح");

                    return false;

                }

                if (!payer || window.isGenericCashPartner(payer)) {

                    showCustomAlert({
                        type: 'error',
                        titleText: '⚠️ مطلوب اختيار العميل',
                        msg: 'سندات القبض تتطلب تحديد حساب عميل مسجل لتسجيل المبالغ في كشف حسابه.'
                    });

                    return false;

                }

                if (!accountChecked) {
                    const ok = await window.ensurePartnerAccountExists(payer, 'عميل', true, () => {
                        isReceiptSaving = false;
                        saveReceipt(closeAfterExplicit, true);
                    });
                    if (!ok) return false;
                }

                const origDt = (typeof editingOriginalDate !== 'undefined' && editingOriginalDate && editingOriginalDate.full)
                    ? editingOriginalDate
                    : ((typeof window.editingOriginalDate !== 'undefined' && window.editingOriginalDate && window.editingOriginalDate.full) ? window.editingOriginalDate : null);

                const dt = (typeof window.getEffectiveTransactionDateTime === 'function')
                    ? window.getEffectiveTransactionDateTime('receiptDate', 'receiptTime', origDt, isEditMode)
                    : ((function() {
                        const dateInputEl = document.getElementById('receiptDate');
                        const inputDateVal = dateInputEl?.value;
                        const wasTouched = Boolean(dateInputEl && (dateInputEl.getAttribute('data-touched') === 'true' || dateInputEl.dataset?.touched === 'true'));
                        const isDateManuallyChanged = isEditMode && origDt && origDt.iso && wasTouched && inputDateVal && (inputDateVal !== origDt.iso);
                        return (isEditMode && origDt && !isDateManuallyChanged) ? origDt : getTransactionDateTime('receiptDate', 'receiptTime');
                    })());

                const notes = document.getElementById('receiptNotes') ? document.getElementById('receiptNotes').value.trim() : "";

                const finalDescription = (type === 'أخرى' && notes) ? notes : type;

                const receiptID = isEditMode ? editingInvoiceId : (document.getElementById('receiptID') ? document.getElementById('receiptID').value : getNextSequence('قبض'));

                if (!isEditMode && transactions.some(t => String(t.invoiceId) === String(receiptID) && t.type && t.type.includes('قبض'))) {
                    console.warn("Duplicate Receipt Blocked");
                    return false;
                }
                if (isEditMode && editingInvoiceId) {

                    if (window.revertAndClearOldInvoice) {

                        await window.revertAndClearOldInvoice(editingInvoiceId, editingInvoiceType);

                    }

                }

                // --- 🛑 التحقق من حدود الباقة المجانية ---

                const currentPlan = window.getBayanPlan();

                if (!isEditMode && !window.enforceSubscriptionCheck('receipt')) {
                    return false;
                }

                const activeWH = ((typeof currentUser !== 'undefined' && currentUser && currentUser.warehouseName) ? currentUser.warehouseName : 'المخزن الرئيسي').trim();
                const tInfo = (window.BayanNetworkHub && typeof window.BayanNetworkHub.getTerminalInfo === 'function')
                    ? window.BayanNetworkHub.getTerminalInfo()
                    : { terminal: 'الجهاز الرئيسي 💻', terminalLetter: 'MASTER', terminalOrder: 0, terminalId: '' };
                const terminalName = tInfo.terminal;
                const receiptTreasury = document.getElementById('receiptTreasurySelect')?.value || 'نقدية';
                const receiptMethod = receiptTreasury;

                // تسجيل الحركة في السجل العام

                const newVoucherRow = {

                    date: dt.full,

                    dateISO: dt.iso,

                    timeISO: dt.time,

                    type: 'قبض 📥',

                    voucherCategory: type,

                    method: receiptMethod,

                    invoiceId: receiptID,

                    product: finalDescription,

                    notes: notes,

                    qty: 1,

                    price: Number(amount) || 0,

                    total: Number((Number(amount) || 0).toFixed(2)),

                    paidAmount: Number((Number(amount) || 0).toFixed(2)),

                    partner: payer,

                    warehouse: activeWH,
                    terminal: terminalName,
                    terminalLetter: tInfo.terminalLetter,
                    terminalOrder: tInfo.terminalOrder,
                    terminalId: tInfo.terminalId,

                    user: currentUser ? currentUser.name : '-',

                    editDate: isEditMode ? `${new Date().toLocaleString('ar-EG')} (تعديل بواسطة: ${currentUser ? currentUser.name : 'مجهول'})` : '-'

                };
                transactions.push(newVoucherRow);

                if (typeof window.saveTransactionChanges === 'function') {
                    await window.saveTransactionChanges({ newTransactions: [newVoucherRow] });
                } else {
                    await saveData();
                }

                if (!isEditMode && typeof window.updateLastSavedSequence === 'function') {
                    window.updateLastSavedSequence('قبض', receiptID);
                }

                if (typeof logAuditAction === 'function') {
                    const auditAction = isEditMode ? 'تحديث سند قبض' : 'حفظ سند قبض جديد';
                    logAuditAction(auditAction, `سند قبض رقم #${receiptID}, المبلغ: ${amount.toFixed(2)} ج.م, العميل: ${payer}`);
                }

                showCustomAlert({

                    type: 'success',

                    titleText: isEditMode ? '✅ تم تحديث السند' : '✅ تم الحفظ بنجاح',

                    msg: `تم ${isEditMode ? 'تحديث' : 'حفظ'} سند القبض رقم #${receiptID} بنجاح.`

                });

                isEditMode = false;
                window.isEditMode = false;

                editingInvoiceId = null;
                window.editingInvoiceId = null;

                editingOriginalDate = null;
                window.editingOriginalDate = null;

                editingInvoiceType = null;
                window.editingInvoiceType = null;

                const isPrintChecked = document.getElementById('receiptPrintCheck')?.checked || false;
                const isCloseChecked = closeAfterExplicit || document.getElementById('receiptCloseCheck')?.checked || false;

                if (isPrintChecked && typeof printReceiptData === 'function') {
                    try { printReceiptData(); } catch(e) { console.warn(e); }
                }

                resetReceipt();

                if (isCloseChecked) {
                    setTimeout(() => {
                        if (typeof closeTab === 'function') closeTab('receipt');
                        if (typeof switchSection === 'function') switchSection('dashboard');
                    }, 300);
                }

                if (typeof window.clearRevertedInvoiceBackup === 'function') {
                    window.clearRevertedInvoiceBackup();
                }

                return true;
            } catch (vErr) {
                console.error("❌ خطأ أثناء حفظ سند القبض:", vErr);
                if (isEditMode && typeof window.rollbackLastRevertedInvoice === 'function') {
                    await window.rollbackLastRevertedInvoice();
                }
                showCustomAlert({
                    type: 'error',
                    titleText: '⚠️ تعذر حفظ سند القبض',
                    msg: isEditMode
                        ? ('حدث خطأ أثناء حفظ التعديل، وتم استعادة سند القبض الأصلي بأمان.\n\nتفاصيل الخطأ: ' + (vErr?.message || vErr))
                        : ('حدث خطأ غير متوقع أثناء حفظ سند القبض:\n' + (vErr?.message || vErr))
                });
                return false;
            } finally {
                const saveBtns = document.querySelectorAll('#receipt-section .btn-save, #receipt-section .action-btn');
                saveBtns.forEach(b => { b.disabled = false; b.style.pointerEvents = 'auto'; b.style.opacity = '1'; });
                isReceiptSaving = false;
            }

        }

        // ================= منطق الصرف (Disbursement Logic) =================

        function resetDisbursement() {

            if (document.getElementById('disburseAmount')) document.getElementById('disburseAmount').value = '';

            if (document.getElementById('disbursePayee')) document.getElementById('disbursePayee').value = '';

            if (document.getElementById('disburseAccountBalance')) document.getElementById('disburseAccountBalance').innerText = '0.00';

            if (document.getElementById('disburseNotes')) document.getElementById('disburseNotes').value = '';

            if (document.getElementById('disburseType')) document.getElementById('disburseType').value = 'أخرى';
            if (typeof loadCustomVoucherCategories === 'function') loadCustomVoucherCategories('disburse');

            // رقم الحركة يبدأ من 1 ويتسلسل

            if (document.getElementById('disburseID')) {

                document.getElementById('disburseID').value = getNextSequence('صرف');

            }

            // تعيين التاريخ والوقت الحالي

            const now = new Date();

            const dsDate = document.getElementById('disburseDate');
            if (dsDate) {
                dsDate.value = now.toLocaleDateString('en-CA');
                dsDate.removeAttribute('data-touched');
                if (dsDate.dataset) delete dsDate.dataset.touched;
            }

            const dsTime = document.getElementById('disburseTime');
            if (dsTime) {
                dsTime.value = now.toTimeString().slice(0, 5);
                dsTime.removeAttribute('data-touched');
                if (dsTime.dataset) delete dsTime.dataset.touched;
            }

            if (document.getElementById('pendingBillsBody')) document.getElementById('pendingBillsBody').innerHTML = '';

            if (document.getElementById('disburseAmount')) document.getElementById('disburseAmount').focus();

        }

        let isDisburseSaving = false;

        async function saveDisbursement(closeAfterExplicit = false, accountChecked = false, force = false) {

            if (isDisburseSaving) return false;
            isDisburseSaving = true;

            const saveBtns = document.querySelectorAll('#disbursement-section .btn-save, #disbursement-section .action-btn');
            saveBtns.forEach(b => { b.disabled = true; b.style.pointerEvents = 'none'; b.style.opacity = '0.6'; });

            try {
                if (!checkPermission('sec_disburse')) return false;

                const amount = parseFloat(document.getElementById('disburseAmount').value);

                const payee = (document.getElementById('disbursePayee')?.value || '').trim();

                if (payee && typeof checkAccountFrozenAndAlert === 'function') {
                    if (checkAccountFrozenAndAlert(payee)) {
                        return false;
                    }
                }

                const type = document.getElementById('disburseType').value;

                if (!amount || amount <= 0) {

                    alert("⚠️ يرجى إدخال مبلغ صرف صحيح!");

                    return false;

                }

                if (!payee || window.isGenericCashPartner(payee)) {

                    showCustomAlert({
                        type: 'error',
                        titleText: '⚠️ مطلوب اختيار المستلم / المورد',
                        msg: 'سندات الصرف تتطلب تحديد حساب مورد أو جهة مسجلة لمتابعة الحسابات.'
                    });

                    return false;

                }

                if (!accountChecked) {
                    const ok = await window.ensurePartnerAccountExists(payee, 'مورد', true, () => {
                        isDisburseSaving = false;
                        saveDisbursement(closeAfterExplicit, true, force);
                    });
                    if (!ok) return false;
                }

                const disburseTreasury = document.getElementById('disburseTreasurySelect')?.value || 'نقدية';
                const disburseMethod = disburseTreasury;
                const isDisburseNonCash = (typeof window.isNonCashPaymentMethod === 'function')
                    ? window.isNonCashPaymentMethod(disburseMethod)
                    : (disburseMethod.includes('بنك') || disburseMethod.includes('فيزا') || disburseMethod.includes('تحويل') || disburseMethod.includes('فودافون') || disburseMethod.includes('انستا') || disburseMethod.includes('محفظة'));
                const isCash = !isDisburseNonCash;

                // 🛑 فحص رصيد الدرج / الخزينة قبل صرف النقدية لمنع العجز غير المراقب
                if (isCash && !force) {
                    const currentCash = (function() {
                        let c = 0;
                        const isNonCash = (m) => {
                            if (!m) return false;
                            if (typeof window.isNonCashPaymentMethod === 'function' && window.isNonCashPaymentMethod(m)) {
                                return true;
                            }
                            const s = String(m).toLowerCase().replace(/[أإآ]/g, 'ا');
                            return s.includes('فيزا') || s.includes('بنك') || s.includes('شيك') || s.includes('تحويل') || s.includes('اجل') || s.includes('حساب') || s.includes('محفظ');
                        };
                        (window.transactions || []).forEach(t => {
                            if (isNonCash(t.method)) return;
                            const type = t.type || '';
                            const amt = (t.isInvoiceHead || t.isInvoiceHead === undefined) ? (parseFloat(t.paidAmount !== undefined ? t.paidAmount : (t.paid !== undefined ? t.paid : t.total)) || 0) : 0;
                            if (type.includes('بيع') && !type.includes('مرتجع')) c += amt;
                            else if (type.includes('قبض')) c += (parseFloat(t.total) || 0);
                            else if (type.includes('مرتجع شراء')) c += amt;
                            else if (type.includes('شراء') && !type.includes('مرتجع')) c -= amt;
                            else if (type.includes('صرف')) c -= (parseFloat(t.total) || 0);
                            else if (type.includes('مرتجع بيع')) c -= amt;
                        });
                        return c;
                    })();

                    if (currentCash < amount) {
                        saveBtns.forEach(b => { b.disabled = false; b.style.pointerEvents = 'auto'; b.style.opacity = '1'; });
                        isDisburseSaving = false;
                        showCustomAlert({
                            type: 'warning',
                            titleText: '⚠️ رصيد الخزينة غير كافٍ',
                            msg: `مبلغ الصرف المطلوب نقداً هو (<b>${amount.toFixed(2)} ج.م</b>) بينما النقدية المتوفرة بالدرج حالياً هي (<b>${currentCash.toFixed(2)} ج.م</b>).<br><br>هل تريد المتابعة والسماح برصيد سالب بالدرج؟`,
                            showCancel: true,
                            confirmText: 'نعم، تابع واصرف',
                            cancelText: 'إلغاء الصرف',
                            onConfirm: () => {
                                saveDisbursement(closeAfterExplicit, accountChecked, true);
                            }
                        });
                        return false;
                    }
                }

                const origDt = (typeof editingOriginalDate !== 'undefined' && editingOriginalDate && editingOriginalDate.full)
                    ? editingOriginalDate
                    : ((typeof window.editingOriginalDate !== 'undefined' && window.editingOriginalDate && window.editingOriginalDate.full) ? window.editingOriginalDate : null);

                const dt = (typeof window.getEffectiveTransactionDateTime === 'function')
                    ? window.getEffectiveTransactionDateTime('disburseDate', 'disburseTime', origDt, isEditMode)
                    : ((function() {
                        const dateInputEl = document.getElementById('disburseDate');
                        const inputDateVal = dateInputEl?.value;
                        const wasTouched = Boolean(dateInputEl && (dateInputEl.getAttribute('data-touched') === 'true' || dateInputEl.dataset?.touched === 'true'));
                        const isDateManuallyChanged = isEditMode && origDt && origDt.iso && wasTouched && inputDateVal && (inputDateVal !== origDt.iso);
                        return (isEditMode && origDt && !isDateManuallyChanged) ? origDt : getTransactionDateTime('disburseDate', 'disburseTime');
                    })());

                const notes = document.getElementById('disburseNotes') ? document.getElementById('disburseNotes').value.trim() : "";

                const finalDescription = (type === 'أخرى' && notes) ? notes : type;
                if (isEditMode && editingInvoiceId) {

                    if (window.revertAndClearOldInvoice) {

                        await window.revertAndClearOldInvoice(editingInvoiceId, editingInvoiceType);

                    }

                }

                // --- 🛑 التحقق من حدود الباقة المجانية ---

                const currentPlan = window.getBayanPlan();

                if (!isEditMode && !window.enforceSubscriptionCheck('disbursement')) {
                    return false;
                }

                const disburseID = isEditMode ? editingInvoiceId : (document.getElementById('disburseID')?.value || (typeof getNextSequence === 'function' ? getNextSequence('صرف') : 1));

                if (!isEditMode && transactions.some(t => String(t.invoiceId) === String(disburseID) && t.type && t.type.includes('صرف'))) {
                    console.warn("Duplicate Disbursement Blocked");
                    return false;
                }

                const activeWH = ((typeof currentUser !== 'undefined' && currentUser && currentUser.warehouseName) ? currentUser.warehouseName : 'المخزن الرئيسي').trim();
                const tInfo = (window.BayanNetworkHub && typeof window.BayanNetworkHub.getTerminalInfo === 'function')
                    ? window.BayanNetworkHub.getTerminalInfo()
                    : { terminal: 'الجهاز الرئيسي 💻', terminalLetter: 'MASTER', terminalOrder: 0, terminalId: '' };
                const terminalName = tInfo.terminal;

                // تسجيل الحركة في السجل العام

                const newDisburseRow = {

                    date: dt.full,

                    dateISO: dt.iso,

                    timeISO: dt.time,

                    type: 'صرف 📤',

                    voucherCategory: type,

                    method: disburseMethod,

                    invoiceId: disburseID,

                    product: finalDescription,

                    notes: notes,

                    qty: 1,

                    price: Number(amount) || 0,

                    total: Number((Number(amount) || 0).toFixed(2)),

                    paidAmount: Number((Number(amount) || 0).toFixed(2)),

                    partner: payee,

                    warehouse: activeWH,
                    terminal: terminalName,
                    terminalLetter: tInfo.terminalLetter,
                    terminalOrder: tInfo.terminalOrder,
                    terminalId: tInfo.terminalId,

                    user: currentUser ? currentUser.name : '-',

                    editDate: isEditMode ? `${new Date().toLocaleString('ar-EG')} (تعديل بواسطة: ${currentUser ? currentUser.name : 'مجهول'})` : '-'

                };
                transactions.push(newDisburseRow);

                if (typeof window.saveTransactionChanges === 'function') {
                    await window.saveTransactionChanges({ newTransactions: [newDisburseRow] });
                } else {
                    await saveData();
                }

                if (!isEditMode && typeof window.updateLastSavedSequence === 'function') {
                    window.updateLastSavedSequence('صرف', disburseID);
                }

                if (typeof logAuditAction === 'function') {
                    const auditAction = isEditMode ? 'تحديث سند صرف' : 'حفظ سند صرف جديد';
                    logAuditAction(auditAction, `سند صرف رقم #${disburseID}, المبلغ: ${amount.toFixed(2)} ج.م, المستلم/المورد: ${payee}`);
                }

                showCustomAlert({

                    type: 'success',

                    titleText: isEditMode ? '✅ تم تحديث السند' : '✅ تم الحفظ بنجاح',

                    msg: `تم ${isEditMode ? 'تحديث' : 'حفظ'} سند الصرف رقم #${disburseID} بنجاح.`

                });

                isEditMode = false;
                window.isEditMode = false;

                editingInvoiceId = null;
                window.editingInvoiceId = null;

                editingOriginalDate = null;
                window.editingOriginalDate = null;

                editingInvoiceType = null;
                window.editingInvoiceType = null;

                const isPrintChecked = document.getElementById('disbursePrintCheck')?.checked || false;
                const isCloseChecked = closeAfterExplicit || document.getElementById('disburseCloseCheck')?.checked || false;

                if (isPrintChecked && typeof printDisbursementData === 'function') {
                    try { printDisbursementData(); } catch(e) { console.warn(e); }
                }

                resetDisbursement();

                if (isCloseChecked) {
                    setTimeout(() => {
                        if (typeof closeTab === 'function') closeTab('disbursement');
                        if (typeof switchSection === 'function') switchSection('dashboard');
                    }, 300);
                }

                if (typeof window.clearRevertedInvoiceBackup === 'function') {
                    window.clearRevertedInvoiceBackup();
                }

                return true;
            } catch (vErr) {
                console.error("❌ خطأ أثناء حفظ سند الصرف:", vErr);
                if (isEditMode && typeof window.rollbackLastRevertedInvoice === 'function') {
                    await window.rollbackLastRevertedInvoice();
                }
                showCustomAlert({
                    type: 'error',
                    titleText: '⚠️ تعذر حفظ سند الصرف',
                    msg: isEditMode
                        ? ('حدث خطأ أثناء حفظ التعديل، وتم استعادة سند الصرف الأصلي بأمان.\n\nتفاصيل الخطأ: ' + (vErr?.message || vErr))
                        : ('حدث خطأ غير متوقع أثناء حفظ سند الصرف:\n' + (vErr?.message || vErr))
                });
                return false;
            } finally {
                const saveBtns = document.querySelectorAll('#disbursement-section .btn-save, #disbursement-section .action-btn');
                saveBtns.forEach(b => { b.disabled = false; b.style.pointerEvents = 'auto'; b.style.opacity = '1'; });
                isDisburseSaving = false;
            }

        }

        // ================= منطق تقرير الحركة اليومية (Daily Report Logic) =================

        function printReceiptData() {
            const payer = (document.getElementById('receiptCustomer')?.value || '').trim();
            const amount = parseFloat(document.getElementById('receiptAmount')?.value) || 0;
            const isPayerEmpty = (!payer || payer === 'غير محدد' || payer === 'عميل نقدي' || payer === 'عميل');

            if (amount <= 0 && isPayerEmpty) {
                if (typeof showToast === 'function') showToast("⚠️ لا يمكن الطباعة: يرجى كتابة اسم العميل وإدخال مبلغ سند القبض أولاً!", "warning");
                else alert("⚠️ لا يمكن الطباعة: يرجى كتابة اسم العميل وإدخال مبلغ سند القبض أولاً!");
                return;
            } else if (amount <= 0) {
                if (typeof showToast === 'function') showToast("⚠️ لا يمكن الطباعة: يرجى إدخال مبلغ صحيح لسند القبض أولاً!", "warning");
                else alert("⚠️ لا يمكن الطباعة: يرجى إدخال مبلغ صحيح لسند القبض أولاً!");
                return;
            } else if (isPayerEmpty) {
                if (typeof showToast === 'function') showToast("⚠️ لا يمكن الطباعة: يرجى كتابة وتحديد اسم العميل أولاً للسند!", "warning");
                else alert("⚠️ لا يمكن الطباعة: يرجى كتابة وتحديد اسم العميل أولاً للسند!");
                return;
            }

            const id = document.getElementById('receiptID')?.value || '';
            const date = document.getElementById('receiptDate')?.value || new Date().toLocaleDateString('en-CA');
            const time = document.getElementById('receiptTime')?.value || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

            let savedPosSettings = {};
            try { savedPosSettings = JSON.parse(getStore('pos_settings') || '{}'); } catch(e) {}
            const shopName = savedPosSettings.name || document.getElementById('shopName')?.value || 'مؤسستي';
            const footerMsg = savedPosSettings.printFooterMsg || document.getElementById('printFooterMsg')?.value || 'شكراً لتعاملكم معنا!';

            const isAlreadySaved = transactions.some(t => String(t.invoiceId) === String(id) && (t.type || '').includes('قبض'));
            const currentBalance = typeof getAccountBalance === 'function' ? getAccountBalance(payer) : 0;
            let balBefore, balAfter;
            if (isAlreadySaved) {
                balAfter = currentBalance;
                balBefore = currentBalance + amount;
            } else {
                balBefore = currentBalance;
                balAfter = currentBalance - amount;
            }

            const formatMoney = (num) => {
                const isNeg = num < 0;
                const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return isNeg ? `-${formatted}` : formatted;
            };

            const htmlContent = `
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="utf-8">
                    <title>سند قبض #${id} - ${shopName}</title>
                    <style>
                        @page { margin: 0; size: 80mm auto; }
                        *, *::before, *::after { box-sizing: border-box !important; }
                        html, body {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100% !important;
                            max-width: 80mm !important;
                            background: #fff !important;
                            color: #000 !important;
                            font-family: 'Cairo', 'Segoe UI', Arial, sans-serif !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        .receipt-card {
                            width: 72mm;
                            margin: 0 auto;
                            padding: 3mm 2mm;
                            text-align: center;
                        }
                        .shop-header {
                            font-size: 19px;
                            font-weight: 900;
                            margin-bottom: 5px;
                            color: #000;
                        }
                        .doc-badge {
                            font-size: 14px;
                            font-weight: 900;
                            border: 2px solid #000;
                            display: inline-block;
                            padding: 2px 14px;
                            border-radius: 4px;
                            margin-bottom: 8px;
                        }
                        .meta-row {
                            display: flex;
                            justify-content: space-between;
                            font-size: 12px;
                            font-weight: 800;
                            border-bottom: 1.5px solid #000;
                            padding-bottom: 5px;
                            margin-bottom: 8px;
                        }
                        .box-info {
                            border: 1.5px solid #000;
                            border-radius: 6px;
                            padding: 8px;
                            margin-bottom: 10px;
                            text-align: right;
                            font-size: 13px;
                            font-weight: 700;
                        }
                        .amount-container {
                            margin-top: 6px;
                            text-align: center;
                            font-size: 13px;
                            font-weight: 900;
                        }
                        .amount-val {
                            font-size: 22px;
                            font-weight: 900;
                            border: 2px solid #000;
                            display: inline-block;
                            padding: 2px 12px;
                            border-radius: 6px;
                            margin-top: 3px;
                            font-family: 'Segoe UI', Arial, sans-serif;
                            direction: ltr !important;
                        }
                        .summary-table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 12px;
                            border: 1.5px solid #000;
                        }
                        .summary-table th {
                            border: 1px solid #000;
                            padding: 4px 2px;
                            font-size: 11px;
                            font-weight: 900;
                            color: #000 !important;
                            background: #ffffff;
                        }
                        .summary-table td {
                            border: 1px solid #000;
                            padding: 6px 2px;
                            font-size: 12px;
                            font-weight: 900;
                            text-align: center;
                            font-family: 'Segoe UI', Arial, sans-serif;
                            direction: ltr !important;
                            white-space: nowrap;
                        }
                        .sign-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 15px;
                            margin-top: 20px;
                            font-size: 12px;
                            font-weight: 800;
                        }
                        .sign-line {
                            border-top: 1.5px solid #000;
                            padding-top: 4px;
                            text-align: center;
                        }
                        .footer-text {
                            margin-top: 15px;
                            border-top: 1px dashed #000;
                            padding-top: 8px;
                            font-size: 11px;
                            font-weight: 700;
                            color: #333;
                        }
                    </style>
                </head>
                <body>
                    <div class="receipt-card">
                        <div class="shop-header">${shopName}</div>
                        <div class="doc-badge">سند قبض نقدية</div>
                        <div class="meta-row">
                            <span>رقم: ${id}</span>
                            <span>التاريخ: ${date}</span>
                        </div>

                        <div class="box-info">
                            <div>وصلنا من السيد: <b style="font-size:14px; font-weight:900;">${payer}</b></div>
                            <div class="amount-container">
                                <div>المبلغ المقبوض:</div>
                                <div class="amount-val">${formatMoney(amount)}</div>
                            </div>
                        </div>

                        <table class="summary-table">
                            <thead>
                                <tr>
                                    <th style="width:33%;">الرصيد السابق</th>
                                    <th style="width:34%;">المبلغ المقبوض</th>
                                    <th style="width:33%;">المتبقي عليه</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>${formatMoney(balBefore)}</td>
                                    <td>${formatMoney(amount)}</td>
                                    <td>${formatMoney(balAfter)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="sign-grid">
                            <div class="sign-line">توقيع المستلم</div>
                            <div class="sign-line">الختم والاعتماد</div>
                        </div>

                        <div class="footer-text">
                            <div>${footerMsg}</div>
                            <div style="font-size:9px; color:#666; margin-top:3px;">نظام بَيَان POS المتكامل</div>
                        </div>
                    </div>
                    <script>
                        window.onload = function() {
                            window.focus();
                            setTimeout(function() {
                                window.print();
                                setTimeout(function() { window.close(); }, 500);
                            }, 200);
                        };
                    <\/script>
                </body>
                </html>
            `;

            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(htmlContent);
                printWindow.document.close();
            } else {
                document.getElementById('receipt-area').innerHTML = htmlContent;
                window.print();
            }
        }

        function printDisbursementData() {
            const payee = (document.getElementById('disbursePayee')?.value || '').trim();
            const amount = parseFloat(document.getElementById('disburseAmount')?.value) || 0;
            const isPayeeEmpty = (!payee || payee === 'غير محدد' || payee === 'مورد نقدي' || payee === 'جهة');

            if (amount <= 0 && isPayeeEmpty) {
                if (typeof showToast === 'function') showToast("⚠️ لا يمكن الطباعة: يرجى كتابة اسم المستلم/المورد وإدخال مبلغ سند الصرف أولاً!", "warning");
                else alert("⚠️ لا يمكن الطباعة: يرجى كتابة اسم المستلم/المورد وإدخال مبلغ سند الصرف أولاً!");
                return;
            } else if (amount <= 0) {
                if (typeof showToast === 'function') showToast("⚠️ لا يمكن الطباعة: يرجى إدخال مبلغ صحيح لسند الصرف أولاً!", "warning");
                else alert("⚠️ لا يمكن الطباعة: يرجى إدخال مبلغ صحيح لسند الصرف أولاً!");
                return;
            } else if (isPayeeEmpty) {
                if (typeof showToast === 'function') showToast("⚠️ لا يمكن الطباعة: يرجى كتابة اسم المستلم / المورد أولاً للسند!", "warning");
                else alert("⚠️ لا يمكن الطباعة: يرجى كتابة اسم المستلم / المورد أولاً للسند!");
                return;
            }

            const id = document.getElementById('disburseID')?.value || '';
            const date = document.getElementById('disburseDate')?.value || new Date().toLocaleDateString('en-CA');
            const time = document.getElementById('disburseTime')?.value || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

            let savedPosSettings = {};
            try { savedPosSettings = JSON.parse(getStore('pos_settings') || '{}'); } catch(e) {}
            const shopName = savedPosSettings.name || document.getElementById('shopName')?.value || 'مؤسستي';
            const footerMsg = savedPosSettings.printFooterMsg || document.getElementById('printFooterMsg')?.value || 'شكراً لتعاملكم معنا!';

            const isAlreadySaved = transactions.some(t => String(t.invoiceId) === String(id) && (t.type || '').includes('صرف'));
            const currentBalance = typeof getAccountBalance === 'function' ? getAccountBalance(payee) : 0;
            let balBefore, balAfter;
            if (isAlreadySaved) {
                balAfter = currentBalance;
                balBefore = currentBalance - amount;
            } else {
                balBefore = currentBalance;
                balAfter = currentBalance + amount;
            }

            const formatMoney = (num) => {
                const isNeg = num < 0;
                const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return isNeg ? `-${formatted}` : formatted;
            };

            const htmlContent = `
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="utf-8">
                    <title>سند صرف #${id} - ${shopName}</title>
                    <style>
                        @page { margin: 0; size: 80mm auto; }
                        *, *::before, *::after { box-sizing: border-box !important; }
                        html, body {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100% !important;
                            max-width: 80mm !important;
                            background: #fff !important;
                            color: #000 !important;
                            font-family: 'Cairo', 'Segoe UI', Arial, sans-serif !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                        .receipt-card {
                            width: 72mm;
                            margin: 0 auto;
                            padding: 3mm 2mm;
                            text-align: center;
                        }
                        .shop-header {
                            font-size: 19px;
                            font-weight: 900;
                            margin-bottom: 5px;
                            color: #000;
                        }
                        .doc-badge {
                            font-size: 14px;
                            font-weight: 900;
                            border: 2px solid #000;
                            display: inline-block;
                            padding: 2px 14px;
                            border-radius: 4px;
                            margin-bottom: 8px;
                        }
                        .meta-row {
                            display: flex;
                            justify-content: space-between;
                            font-size: 12px;
                            font-weight: 800;
                            border-bottom: 1.5px solid #000;
                            padding-bottom: 5px;
                            margin-bottom: 8px;
                        }
                        .box-info {
                            border: 1.5px solid #000;
                            border-radius: 6px;
                            padding: 8px;
                            margin-bottom: 10px;
                            text-align: right;
                            font-size: 13px;
                            font-weight: 700;
                        }
                        .amount-container {
                            margin-top: 6px;
                            text-align: center;
                            font-size: 13px;
                            font-weight: 900;
                        }
                        .amount-val {
                            font-size: 22px;
                            font-weight: 900;
                            border: 2px solid #000;
                            display: inline-block;
                            padding: 2px 12px;
                            border-radius: 6px;
                            margin-top: 3px;
                            font-family: 'Segoe UI', Arial, sans-serif;
                            direction: ltr !important;
                        }
                        .summary-table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-bottom: 12px;
                            border: 1.5px solid #000;
                        }
                        .summary-table th {
                            border: 1px solid #000;
                            padding: 4px 2px;
                            font-size: 11px;
                            font-weight: 900;
                            color: #000 !important;
                            background: #ffffff;
                        }
                        .summary-table td {
                            border: 1px solid #000;
                            padding: 6px 2px;
                            font-size: 12px;
                            font-weight: 900;
                            text-align: center;
                            font-family: 'Segoe UI', Arial, sans-serif;
                            direction: ltr !important;
                            white-space: nowrap;
                        }
                        .sign-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 15px;
                            margin-top: 20px;
                            font-size: 12px;
                            font-weight: 800;
                        }
                        .sign-line {
                            border-top: 1.5px solid #000;
                            padding-top: 4px;
                            text-align: center;
                        }
                        .footer-text {
                            margin-top: 15px;
                            border-top: 1px dashed #000;
                            padding-top: 8px;
                            font-size: 11px;
                            font-weight: 700;
                            color: #333;
                        }
                    </style>
                </head>
                <body>
                    <div class="receipt-card">
                        <div class="shop-header">${shopName}</div>
                        <div class="doc-badge">سند صرف نقدية</div>
                        <div class="meta-row">
                            <span>رقم: ${id}</span>
                            <span>التاريخ: ${date}</span>
                        </div>

                        <div class="box-info">
                            <div>صرف للسيد: <b style="font-size:14px; font-weight:900;">${payee}</b></div>
                            <div class="amount-container">
                                <div>المبلغ المنصرف:</div>
                                <div class="amount-val">${formatMoney(amount)}</div>
                            </div>
                        </div>

                        <table class="summary-table">
                            <thead>
                                <tr>
                                    <th style="width:33%;">كان له</th>
                                    <th style="width:34%;">المنصرف</th>
                                    <th style="width:33%;">المتبقي له</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>${formatMoney(balBefore)}</td>
                                    <td>${formatMoney(amount)}</td>
                                    <td>${formatMoney(balAfter)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="sign-grid">
                            <div class="sign-line">توقيع المستلم</div>
                            <div class="sign-line">المدير المالي</div>
                        </div>

                        <div class="footer-text">
                            <div>${footerMsg}</div>
                            <div style="font-size:9px; color:#666; margin-top:3px;">نظام بَيَان POS المتكامل</div>
                        </div>
                    </div>
                    <script>
                        window.onload = function() {
                            window.focus();
                            setTimeout(function() {
                                window.print();
                                setTimeout(function() { window.close(); }, 500);
                            }, 200);
                        };
                    <\/script>
                </body>
                </html>
            `;

            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(htmlContent);
                printWindow.document.close();
            } else {
                document.getElementById('receipt-area').innerHTML = htmlContent;
                window.print();
            }
        }

        function quickTransaction(type) {
            if (type === 'receipt' && typeof checkPermission === 'function' && !checkPermission('sec_receipt')) return;
            if (type === 'disbursement' && typeof checkPermission === 'function' && !checkPermission('sec_disburse')) return;

            const accId = window.selectedAccountID || (typeof selectedAccountID !== 'undefined' ? selectedAccountID : null);
            if (!accId) return alert("⚠️ يرجى تحديد حساب أولاً (بالضغط عليه في الجدول) قبل الضغط على قبض أو صرف!");

            const allAccs = window.accounts || (typeof accounts !== 'undefined' ? accounts : []);
            const acc = allAccs.find(a => a.id == accId || a.id === accId);
            if (!acc) return alert("⚠️ لم يتم العثور على بيانات الحساب المحدد!");

            // فحص التجميد مباشرة
            const isFrozen = (acc.inactive === true || acc.inactive === 'true' || acc.isFrozen === true);
            if (isFrozen) {
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert({
                        type: 'error',
                        titleText: '❄️ الحساب مجمّد',
                        msg: `عذراً، الحساب "<b>${acc.name}</b>" مجمّد حالياً من قبل الإدارة.<br>لا يمكن إنشاء سندات قبض أو صرف له حتى يتم إلغاء التجميد.`
                    });
                } else {
                    alert(`❄️ عذراً، الحساب "${acc.name}" مجمّد حالياً ولا يمكن إجراء حركات مالية عليه.`);
                }
                return;
            }

            const balance = typeof getAccountBalance === 'function' ? getAccountBalance(acc.name) : (acc.balance || 0);
            let formattedBal = '0.00 ج.م (خالص)';
            if (balance > 0.005) {
                formattedBal = `${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م (عليه)`;
            } else if (balance < -0.005) {
                formattedBal = `${Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م (له)`;
            }

            if (type === 'receipt') {
                switchSection('receipt');

                setTimeout(() => {
                    const customerInput = document.getElementById('receiptCustomer');
                    if (customerInput) {
                        customerInput.value = acc.name;
                    }

                    const clearBtn = document.getElementById('receiptCustomerClear');
                    if (clearBtn) clearBtn.style.display = 'block';

                    const balEl = document.getElementById('receiptAccountBalance');
                    if (balEl) balEl.innerText = formattedBal;

                    const amountInput = document.getElementById('receiptAmount');
                    if (amountInput) {
                        amountInput.focus();
                        amountInput.select();
                    }
                }, 50);
            } else {
                switchSection('disbursement');

                setTimeout(() => {
                    const payeeInput = document.getElementById('disbursePayee');
                    if (payeeInput) {
                        payeeInput.value = acc.name;
                    }

                    const clearBtn = document.getElementById('disbursePayeeClear');
                    if (clearBtn) clearBtn.style.display = 'block';

                    const balEl = document.getElementById('disburseAccountBalance');
                    if (balEl) balEl.innerText = formattedBal;

                    const amountInput = document.getElementById('disburseAmount');
                    if (amountInput) {
                        amountInput.focus();
                        amountInput.select();
                    }
                }, 50);
            }
        }
        window.quickTransaction = quickTransaction;

        // ============================================================
        // إدارة بنود الصرف والقبض المخصصة (Custom Voucher Categories)
        // ============================================================
        let currentVoucherCategoryModalType = 'disburse'; // 'disburse' أو 'receipt'

        const DEFAULT_VOUCHER_CATEGORIES = {
            disburse: ['إيجار', 'كهرباء ومياه', 'رواتب', 'نثريات', 'سداد موردين', 'نقل ومشال', 'أخرى'],
            receipt: ['خدمات', 'تركيبات', 'صيانة', 'مبيعات نقدية', 'أخرى']
        };

        function escapeVoucherHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function getCustomVoucherCategories(type) {
            const key = (type === 'receipt') ? 'bayan_custom_receipt_categories' : 'bayan_custom_disburse_categories';
            try {
                const val = (typeof getStore === 'function') ? getStore(key) : localStorage.getItem(key);
                if (val) {
                    const parsed = JSON.parse(val);
                    if (Array.isArray(parsed)) {
                        return parsed.map(s => String(s).trim()).filter(Boolean);
                    }
                }
            } catch (e) {
                console.warn(`[acc_vouchers] Error reading custom voucher categories (${type}):`, e);
            }
            return [];
        }

        function saveCustomVoucherCategoriesList(type, list) {
            const key = (type === 'receipt') ? 'bayan_custom_receipt_categories' : 'bayan_custom_disburse_categories';
            const cleanList = Array.from(new Set((list || []).map(s => String(s).trim()).filter(Boolean)));
            const jsonStr = JSON.stringify(cleanList);
            try {
                if (typeof setStore === 'function') {
                    setStore(key, jsonStr);
                } else {
                    localStorage.setItem(key, jsonStr);
                }
            } catch (e) {
                console.warn(`[acc_vouchers] Error saving custom voucher categories (${type}):`, e);
            }
            return cleanList;
        }

        function loadCustomVoucherCategories(specificType = null, targetToSelect = null) {
            const typesToLoad = specificType ? [specificType] : ['disburse', 'receipt'];

            typesToLoad.forEach(type => {
                const selectId = (type === 'receipt') ? 'receiptType' : 'disburseType';
                const selectEl = document.getElementById(selectId);
                if (!selectEl) return;

                const currentVal = selectEl.value;
                const customItems = getCustomVoucherCategories(type);

                // إزالة أي خيارات مخصصة سابقة لتجنب التكرار
                const existingCustom = selectEl.querySelectorAll('option[data-custom="true"]');
                existingCustom.forEach(opt => opt.remove());

                // جمع الخيارات الأساسية الحالية لمنع التكرار
                const currentOptions = Array.from(selectEl.options).map(o => o.value.trim());

                // البحث عن خيار "أخرى" لإدراج البنود المخصصة قبله مباشرة
                let otherOption = null;
                for (let i = 0; i < selectEl.options.length; i++) {
                    if (selectEl.options[i].value === 'أخرى') {
                        otherOption = selectEl.options[i];
                        break;
                    }
                }

                // إدراج البنود المخصصة قبل خيار "أخرى"
                customItems.forEach(item => {
                    const cleanItem = String(item).trim();
                    if (!cleanItem) return;
                    if (currentOptions.includes(cleanItem)) return;

                    const opt = document.createElement('option');
                    opt.value = cleanItem;
                    opt.textContent = cleanItem;
                    opt.setAttribute('data-custom', 'true');

                    if (otherOption) {
                        selectEl.insertBefore(opt, otherOption);
                    } else {
                        selectEl.appendChild(opt);
                    }
                    currentOptions.push(cleanItem);
                });

                // تحديد القيمة المناسبة
                if (targetToSelect && targetToSelect.trim() && Array.from(selectEl.options).some(o => o.value === targetToSelect.trim())) {
                    selectEl.value = targetToSelect.trim();
                } else if (currentVal && Array.from(selectEl.options).some(o => o.value === currentVal)) {
                    selectEl.value = currentVal;
                }
            });
        }

        let currentEditingCategoryOldName = null;

        function openAddVoucherCategoryModal(type = 'disburse') {
            currentVoucherCategoryModalType = (type === 'receipt') ? 'receipt' : 'disburse';
            const modal = document.getElementById('voucherCategoryModal');
            if (!modal) return;

            cancelEditCustomVoucherCategory();

            const titleEl = document.getElementById('voucherCatModalTitle');
            const subEl = document.getElementById('voucherCatModalSub');
            const iconEl = document.getElementById('voucherCatModalIcon');
            const inputLabelEl = document.getElementById('voucherCatInputLabel');
            const inputEl = document.getElementById('voucherCatInput');
            const saveBtn = document.getElementById('btnSaveVoucherCat');

            if (currentVoucherCategoryModalType === 'receipt') {
                if (titleEl) titleEl.textContent = 'إضافة بند إيراد/قبض جديد';
                if (subEl) subEl.textContent = 'أدخل اسم بند الإيراد لإضافته بشكل دائم لقائمة سندات القبض';
                if (iconEl) {
                    iconEl.innerHTML = '💰';
                    iconEl.style.background = '#ecfdf5';
                    iconEl.style.borderColor = '#a7f3d0';
                }
                if (inputLabelEl) inputLabelEl.innerHTML = 'اسم بند الإيراد الجديد <span style="color: #ef4444;">*</span>';
                if (inputEl) inputEl.placeholder = 'مثال: خدمات شحن، استشارات، عمولات...';
                if (saveBtn) {
                    saveBtn.style.background = 'linear-gradient(135deg, #059669, #047857)';
                    saveBtn.style.boxShadow = '0 2px 8px rgba(5, 150, 105, 0.25)';
                }
            } else {
                if (titleEl) titleEl.textContent = 'إضافة بند مصروف جديد';
                if (subEl) subEl.textContent = 'أدخل اسم بند المصروف لإضافته بشكل دائم لقائمة سندات الصرف';
                if (iconEl) {
                    iconEl.innerHTML = '💸';
                    iconEl.style.background = '#fef2f2';
                    iconEl.style.borderColor = '#fecaca';
                }
                if (inputLabelEl) inputLabelEl.innerHTML = 'اسم بند المصروف الجديد <span style="color: #ef4444;">*</span>';
                if (inputEl) inputEl.placeholder = 'مثال: دعاية وتسويق، بوفية وضيافة، صيانة دورية...';
                if (saveBtn) {
                    saveBtn.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
                    saveBtn.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.25)';
                }
            }

            if (inputEl) inputEl.value = '';
            renderCustomVoucherCategoryList();

            modal.classList.remove('hidden');
            modal.style.display = 'flex';

            setTimeout(() => {
                if (inputEl) inputEl.focus();
            }, 100);
        }

        function closeAddVoucherCategoryModal() {
            const modal = document.getElementById('voucherCategoryModal');
            if (!modal) return;
            cancelEditCustomVoucherCategory();
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }

        function editCustomVoucherCategory(target) {
            const type = currentVoucherCategoryModalType;
            const items = getCustomVoucherCategories(type);
            let oldName = '';

            if (typeof target === 'number') {
                oldName = items[target] || '';
            } else {
                oldName = String(target || '').trim();
            }

            if (!oldName) return;

            const defaults = DEFAULT_VOUCHER_CATEGORIES[type] || [];
            if (defaults.some(d => d.toLowerCase() === oldName.toLowerCase())) {
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert({
                        type: 'warning',
                        titleText: '🔒 حماية البنود الأساسية',
                        msg: 'عذراً، لا يمكن تعديل البنود الأساسية الافتراضية للنظام.'
                    });
                } else {
                    alert('🔒 لا يمكن تعديل البنود الأساسية الافتراضية للنظام.');
                }
                return;
            }

            currentEditingCategoryOldName = oldName;
            window.isEditingVoucherCategory = true;

            const inputEl = document.getElementById('voucherCatInput');
            const labelEl = document.getElementById('voucherCatInputLabel');
            const saveBtn = document.getElementById('btnSaveVoucherCat');
            const cancelBtn = document.getElementById('btnCancelEditCat');

            if (inputEl) {
                inputEl.value = oldName;
                inputEl.focus();
                inputEl.select();
            }

            if (labelEl) {
                labelEl.innerHTML = `تعديل اسم البند <span style="color: #ef4444;">*</span> <span style="color: #4f46e5; font-size: 0.8rem; font-weight: 800; margin-right: 6px;">(جارٍ تعديل: "${escapeVoucherHtml(oldName)}")</span>`;
            }

            if (saveBtn) {
                saveBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>حفظ التعديل</span>
                `;
            }

            if (cancelBtn) {
                cancelBtn.style.display = 'inline-flex';
            }

            renderCustomVoucherCategoryList();
        }

        function cancelEditCustomVoucherCategory() {
            currentEditingCategoryOldName = null;
            window.isEditingVoucherCategory = false;

            const inputEl = document.getElementById('voucherCatInput');
            const labelEl = document.getElementById('voucherCatInputLabel');
            const saveBtn = document.getElementById('btnSaveVoucherCat');
            const cancelBtn = document.getElementById('btnCancelEditCat');

            if (inputEl) inputEl.value = '';

            if (labelEl) {
                const itemTypeLabel = (currentVoucherCategoryModalType === 'receipt') ? 'الإيراد' : 'المصروف';
                labelEl.innerHTML = `اسم بند ${itemTypeLabel} الجديد <span style="color: #ef4444;">*</span>`;
            }

            if (saveBtn) {
                saveBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>حفظ وإضافة</span>
                `;
            }

            if (cancelBtn) {
                cancelBtn.style.display = 'none';
            }

            renderCustomVoucherCategoryList();
        }

        function renderCustomVoucherCategoryList() {
            const listContainer = document.getElementById('voucherCatListContainer');
            const countEl = document.getElementById('voucherCatCount');
            if (!listContainer) return;

            const items = getCustomVoucherCategories(currentVoucherCategoryModalType);
            if (countEl) countEl.textContent = items.length;

            if (!items || items.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; color: #94a3b8; font-size: 0.85rem; font-weight: 700; padding: 18px 10px;">
                        لا توجد بنود مخصصة مضافة حالياً.
                    </div>
                `;
                return;
            }

            const typeLabel = (currentVoucherCategoryModalType === 'receipt') ? 'إيراد مخصص' : 'مصروف مخصص';
            const tagBg = (currentVoucherCategoryModalType === 'receipt') ? '#ecfdf5' : '#fef2f2';
            const tagColor = (currentVoucherCategoryModalType === 'receipt') ? '#047857' : '#b91c1c';
            const tagBorder = (currentVoucherCategoryModalType === 'receipt') ? '#a7f3d0' : '#fecaca';

            let html = '';
            items.forEach((item, idx) => {
                const safeText = escapeVoucherHtml(item);
                html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: ${currentEditingCategoryOldName && currentEditingCategoryOldName.toLowerCase() === item.toLowerCase() ? '#eef2ff' : '#ffffff'}; border: 1.5px solid ${currentEditingCategoryOldName && currentEditingCategoryOldName.toLowerCase() === item.toLowerCase() ? '#4f46e5' : '#e2e8f0'}; border-radius: 9px; padding: 8px 12px; transition: 0.2s;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 0.95rem;">🏷️</span>
                            <span style="font-weight: 800; color: #1e293b; font-size: 0.88rem;">${safeText}</span>
                            <span style="font-size: 0.7rem; font-weight: 800; background: ${tagBg}; color: ${tagColor}; border: 1px solid ${tagBorder}; padding: 1px 6px; border-radius: 6px;">${typeLabel}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <button type="button" onclick="editCustomVoucherCategory('${safeText.replace(/'/g, "\\'")}')"
                                title="تعديل هذا البند"
                                style="background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; width: 30px; height: 30px; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;"
                                onmouseover="this.style.background='#dbeafe'; this.style.transform='scale(1.05)';"
                                onmouseout="this.style.background='#eff6ff'; this.style.transform='scale(1)';">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                </svg>
                            </button>
                            <button type="button" onclick="deleteCustomVoucherCategory(${idx})"
                                title="حذف هذا البند المخصص"
                                style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; width: 30px; height: 30px; border-radius: 7px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;"
                                onmouseover="this.style.background='#fca5a5'; this.style.transform='scale(1.05)';"
                                onmouseout="this.style.background='#fee2e2'; this.style.transform='scale(1)';">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            });

            listContainer.innerHTML = html;
        }

        function saveCustomVoucherCategory() {
            const inputEl = document.getElementById('voucherCatInput');
            if (!inputEl) return;

            const rawName = inputEl.value.trim();
            if (!rawName) {
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert({
                        type: 'warning',
                        titleText: '⚠️ تنبيه',
                        msg: 'يرجى كتابة اسم البند أولاً.'
                    });
                } else {
                    alert('⚠️ يرجى كتابة اسم البند أولاً.');
                }
                inputEl.focus();
                return;
            }

            const type = currentVoucherCategoryModalType;
            const defaults = DEFAULT_VOUCHER_CATEGORIES[type] || [];
            const currentCustom = getCustomVoucherCategories(type);

            // في حالة التعديل على بند موجود
            if (currentEditingCategoryOldName) {
                const oldName = currentEditingCategoryOldName;
                if (rawName.toLowerCase() === oldName.toLowerCase()) {
                    cancelEditCustomVoucherCategory();
                    return;
                }

                if (defaults.some(d => d.toLowerCase() === rawName.toLowerCase())) {
                    if (typeof showCustomAlert === 'function') {
                        showCustomAlert({
                            type: 'warning',
                            titleText: '⚠️ تنبيه',
                            msg: 'لا يمكن استخدام اسم بند أساسي للنظام.'
                        });
                    } else {
                        alert('⚠️ لا يمكن استخدام اسم بند أساسي للنظام.');
                    }
                    inputEl.focus();
                    return;
                }

                if (currentCustom.some(c => c.toLowerCase() === rawName.toLowerCase() && c.toLowerCase() !== oldName.toLowerCase())) {
                    if (typeof showCustomAlert === 'function') {
                        showCustomAlert({
                            type: 'warning',
                            titleText: '⚠️ تنبيه',
                            msg: `البند "${rawName}" موجود بالفعل.`
                        });
                    } else {
                        alert(`⚠️ البند "${rawName}" موجود بالفعل.`);
                    }
                    inputEl.focus();
                    return;
                }

                const editIdx = currentCustom.findIndex(c => c.toLowerCase() === oldName.toLowerCase());
                if (editIdx !== -1) {
                    currentCustom[editIdx] = rawName;
                }
                saveCustomVoucherCategoriesList(type, currentCustom);

                const selectId = (type === 'receipt') ? 'receiptType' : 'disburseType';
                const sel = document.getElementById(selectId);
                const wasSelected = sel && sel.value === oldName;
                loadCustomVoucherCategories(type, wasSelected ? rawName : null);

                cancelEditCustomVoucherCategory();

                if (typeof showToast === 'function') {
                    showToast(`✅ تم تعديل البند إلى "${rawName}" بنجاح`, 'success');
                }
                return;
            }

            // التحقق من عدم وجوده في البنود الافتراضية
            if (defaults.some(d => d.toLowerCase() === rawName.toLowerCase())) {
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert({
                        type: 'info',
                        titleText: 'ℹ️ معلومة',
                        msg: `البند "${rawName}" موجود بالفعل كبند افتراضي في القائمة.`
                    });
                } else {
                    alert(`ℹ️ البند "${rawName}" موجود بالفعل كبند افتراضي.`);
                }
                const selectId = (type === 'receipt') ? 'receiptType' : 'disburseType';
                const sel = document.getElementById(selectId);
                if (sel) sel.value = rawName;
                closeAddVoucherCategoryModal();
                return;
            }

            // التحقق من عدم تكراره في البنود المخصصة
            if (currentCustom.some(c => c.toLowerCase() === rawName.toLowerCase())) {
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert({
                        type: 'info',
                        titleText: 'ℹ️ معلومة',
                        msg: `البند "${rawName}" موجود مسبقاً في القائمة المخصصة.`
                    });
                } else {
                    alert(`ℹ️ البند "${rawName}" موجود مسبقاً.`);
                }
                const selectId = (type === 'receipt') ? 'receiptType' : 'disburseType';
                const sel = document.getElementById(selectId);
                if (sel) sel.value = rawName;
                closeAddVoucherCategoryModal();
                return;
            }

            // إضافة البند الجديد وحفظه
            currentCustom.push(rawName);
            saveCustomVoucherCategoriesList(type, currentCustom);

            // إعادة تحميل الخيارات واختيار البند الجديد فوراً
            loadCustomVoucherCategories(type, rawName);

            // إغلاق النافذة المنبثقة
            closeAddVoucherCategoryModal();

            // إشعار نجاح
            if (typeof showToast === 'function') {
                showToast(`✅ تم إضافة بند "${rawName}" واختياره بنجاح`, 'success');
            }
        }

        function deleteCustomVoucherCategory(target) {
            const type = currentVoucherCategoryModalType;
            let items = getCustomVoucherCategories(type);
            let itemToDelete = '';

            if (typeof target === 'number') {
                itemToDelete = items[target] || '';
            } else {
                itemToDelete = String(target).trim();
            }

            if (!itemToDelete) return;

            const defaults = DEFAULT_VOUCHER_CATEGORIES[type] || [];
            if (defaults.some(d => d.toLowerCase() === itemToDelete.toLowerCase())) {
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert({
                        type: 'warning',
                        titleText: '🔒 حماية البنود الأساسية',
                        msg: 'عذراً، لا يمكن حذف البنود الأساسية الافتراضية للنظام.'
                    });
                } else {
                    alert('🔒 لا يمكن حذف البنود الأساسية الافتراضية للنظام.');
                }
                return;
            }

            const confirmMsg = `هل أنت متأكد من حذف البند المخصص "${itemToDelete}" من القائمة؟`;
            if (!confirm(confirmMsg)) return;

            if (currentEditingCategoryOldName && currentEditingCategoryOldName.toLowerCase() === itemToDelete.toLowerCase()) {
                cancelEditCustomVoucherCategory();
            }

            items = items.filter(c => c.trim().toLowerCase() !== itemToDelete.trim().toLowerCase());
            saveCustomVoucherCategoriesList(type, items);

            renderCustomVoucherCategoryList();

            const selectId = (type === 'receipt') ? 'receiptType' : 'disburseType';
            const sel = document.getElementById(selectId);
            if (sel && sel.value === itemToDelete) {
                sel.value = 'أخرى';
            }
            loadCustomVoucherCategories(type);

            if (typeof showToast === 'function') {
                showToast(`🗑️ تم حذف بند "${itemToDelete}" بنجاح`, 'info');
            }
        }

        // ربط الدوال بالنطاق العام window
        window.getCustomVoucherCategories = getCustomVoucherCategories;
        window.loadCustomVoucherCategories = loadCustomVoucherCategories;
        window.openAddVoucherCategoryModal = openAddVoucherCategoryModal;
        window.closeAddVoucherCategoryModal = closeAddVoucherCategoryModal;
        window.editCustomVoucherCategory = editCustomVoucherCategory;
        window.cancelEditCustomVoucherCategory = cancelEditCustomVoucherCategory;
        window.saveCustomVoucherCategory = saveCustomVoucherCategory;
        window.deleteCustomVoucherCategory = deleteCustomVoucherCategory;

        // تهيئة الاستدعاء التلقائي عند بدء التشغيل وعند التنقل بين التبويبات
        (function initVoucherCategoryHooks() {
            // الاستدعاء الأولي عند جاهزية الصفحة
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    loadCustomVoucherCategories();
                });
            } else {
                setTimeout(loadCustomVoucherCategories, 60);
            }

            // الاستماع للنقر على تبويبات أو أزرار سندات الصرف والقبض
            document.addEventListener('click', (e) => {
                const target = e.target.closest && e.target.closest('[data-section], .sub-tab, .nav-item, .sidebar-link, button, [onclick*="switchSection"]');
                if (!target) return;
                const str = (target.getAttribute('onclick') || '') + (target.getAttribute('data-section') || '');
                if (str.includes('receipt') || str.includes('disburse')) {
                    setTimeout(loadCustomVoucherCategories, 50);
                }
            }, true);
        })();
