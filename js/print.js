/**
 * print.js - وحدة طباعة فواتير بيان POS
 * 
 * تدعم:
 *  - 5 أنواع مستندات: مبيعات، شراء، سندات مالية، تقارير مخزن، عام
 *  - 5 قوالب طباعة: 80mm Standard, 80mm Compact, 57mm Mobile, A4 Professional, A5 Modern
 *  - حفظ القالب المختار في SQLite (setStore)
 * 
 * invoiceData = {
 *   invoiceNumber, invoiceType, date, time, dueDate,
 *   cashier, customer, items: [{name, qty, price, total, unit, selectedUnit}],
 *   totalAmount, paid, deferred, prevBalance, currentBalance,
 *   shopName, shopAddress, shopPhone, footerMsg,
 *   docType: 'sales'|'purchase'|'financial'|'inventory'|'general'
 * }
 */

// ============================================================
// الدالة الرئيسية للطباعة
// ============================================================
function escapePrintHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function generateOfflineInvoiceQR(text, size = 110, fallbackText = '') {
    try {
        if (typeof QRCode !== 'undefined' && text) {
            const tempDiv = document.createElement('div');
            tempDiv.style.display = 'none';
            document.body.appendChild(tempDiv);
            
            // تنظيف النص وتأمينه لمنع أي تجاوز لحجم الـ QR Code
            const cleanText = String(text).trim();
            const safeText = cleanText.length > 200 ? cleanText.substring(0, 200) : cleanText;

            const correctLvl = (typeof QRCode !== 'undefined' && QRCode.CorrectLevel && QRCode.CorrectLevel.L !== undefined) 
                ? QRCode.CorrectLevel.L 
                : 1;

            new QRCode(tempDiv, {
                text: safeText,
                width: size,
                height: size,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: correctLvl
            });
            
            const svg = tempDiv.querySelector('svg');
            let resultHtml = '';
            if (svg) {
                svg.setAttribute('style', `width:${size}px; height:${size}px; display:block; margin:0 auto;`);
                resultHtml = svg.outerHTML;
            } else {
                const img = tempDiv.querySelector('img');
                const canvas = tempDiv.querySelector('canvas');
                if (img && img.src && img.src.startsWith('data:')) {
                    resultHtml = `<img src="${img.src}" style="width:${size}px; height:${size}px; display:block; margin:0 auto;" />`;
                } else if (canvas) {
                    resultHtml = `<img src="${canvas.toDataURL('image/png')}" style="width:${size}px; height:${size}px; display:block; margin:0 auto;" />`;
                }
            }
            tempDiv.remove();
            if (resultHtml) return resultHtml;
        }
    } catch (e) {
        console.warn("Offline QR generation notice:", e);
        if (fallbackText && fallbackText !== text) {
            return generateOfflineInvoiceQR(fallbackText, size, '');
        }
    }
    return '';
}

function generateOfflineBarcodeSVG(barcodeText, width = 1.4, height = 30) {
    try {
        if (typeof JsBarcode !== 'undefined' && barcodeText) {
            const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            JsBarcode(svgNode, String(barcodeText), {
                format: "CODE128",
                width: width,
                height: height,
                displayValue: false,
                margin: 0
            });
            return svgNode.outerHTML;
        }
    } catch(e) {
        console.warn("Offline barcode generation:", e);
    }
    return '';
}

/**
 * 🏷️ استنتاج مسمى منصة التواصل الاجتماعي تلقائياً من الرابط
 */
function getSocialQrLabel(url) {
    if (!url || !String(url).trim()) return 'Facebook';
    const lower = String(url).toLowerCase().trim();
    
    if (lower.includes('facebook') || lower.includes('fb.com') || lower.includes('fb.me') || lower.includes('fb.watch')) {
        return 'Facebook';
    }
    if (lower.includes('wa.me') || lower.includes('whatsapp')) {
        return 'WhatsApp';
    }
    if (lower.includes('instagram') || lower.includes('instagr.am')) {
        return 'Instagram';
    }
    if (lower.includes('tiktok')) {
        return 'TikTok';
    }
    if (lower.includes('t.me') || lower.includes('telegram')) {
        return 'Telegram';
    }
    if (lower.includes('snapchat')) {
        return 'Snapchat';
    }
    if (lower.includes('youtube') || lower.includes('youtu.be')) {
        return 'YouTube';
    }
    if (lower.includes('x.com') || lower.includes('twitter')) {
        return 'X';
    }
    if (lower.includes('pinterest')) {
        return 'Pinterest';
    }
    if (lower.includes('linkedin')) {
        return 'LinkedIn';
    }
    
    // إذا كان رابط موقع خاص بالمتجر
    return 'Website';
}

/**
 * 📱 بناء نص كيو آر الفاتورة والأصناف بدقة مع اختصار ذكي لمنع الاكتظاظ
 */
function buildInvoiceQrRawText(d) {
    let lines = [];
    if (d.shopName) lines.push(d.shopName);
    lines.push(`فاتورة #${d.invoiceNumber}`);
    lines.push(`التاريخ: ${d.date}`);
    lines.push(`المبلغ: ${parseFloat(d.totalAmount).toFixed(2)} ج.م`);
    if (parseFloat(d.paid) > 0) {
        lines.push(`المدفوع: ${parseFloat(d.paid).toFixed(2)} ج.م`);
    }
    if (d.customer && !d.customer.includes('نقدي') && d.customer !== '-' && d.customer !== '---') {
        lines.push(`العميل: ${d.customer}`);
    }
    return lines.join('\n');
}

/**
 * 🔲 بناء كود HTML لعرض الكيو آر كود المزدوج جنباً إلى جنب (كيو ار الفاتورة يساراً وكيو ار السوشيال يميناً)
 */
function renderDualQrCodesHtml(d, size = 80, isNarrow = false) {
    const isInvoiceQrActive  = (d.printInvoiceQrEnabled !== undefined) ? !!d.printInvoiceQrEnabled : true;
    const isSocial1Active    = (d.printSocialQrEnabled !== undefined) ? !!d.printSocialQrEnabled : true;
    const social1Link        = (isSocial1Active && d.socialQrLink && d.socialQrLink.trim()) ? d.socialQrLink.trim() : '';

    const isSocial2Active    = (d.printSocialQr2Enabled !== undefined) ? !!d.printSocialQr2Enabled : false;
    const social2Link        = (isSocial2Active && d.socialQr2Link && d.socialQr2Link.trim()) ? d.socialQr2Link.trim() : '';

    const containerWidth = size + (isNarrow ? 8 : 18);
    const labelFontSize = isNarrow ? '10.5px' : '12px';

    // تجهيز كتل الأكواد المرشحة:
    // 1. كود كيو آر بيانات الفاتورة
    let invoiceQrBlock = null;
    if (isInvoiceQrActive) {
        const invoiceQrText = buildInvoiceQrRawText(d);
        const fallbackInvoiceText = `Inv: #${d.invoiceNumber} | Total: ${parseFloat(d.totalAmount).toFixed(2)} | Date: ${d.date}`;
        const invoiceQrHtml = generateOfflineInvoiceQR(invoiceQrText, size, fallbackInvoiceText);
        invoiceQrBlock = {
            type: 'invoice',
            html: `
            <div style="text-align:center; width:${containerWidth}px; display:inline-block; vertical-align:top;">
                ${invoiceQrHtml}
                <div style="font-size:${labelFontSize}; font-weight:900; margin-top:3px; -webkit-text-stroke:0.6px #000; line-height:1.2; text-align:center;">بيانات الفاتورة</div>
            </div>`
        };
    }

    // 2. كود كيو آر الرابط الأول
    let social1Block = null;
    if (social1Link) {
        let norm1 = social1Link;
        if (!/^https?:\/\//i.test(norm1)) norm1 = 'https://' + norm1;
        const label1 = getSocialQrLabel(social1Link);
        const qrHtml1 = generateOfflineInvoiceQR(norm1, size, social1Link);
        social1Block = {
            type: 'social1',
            html: `
            <div style="text-align:center; width:${containerWidth}px; display:inline-block; vertical-align:top;">
                ${qrHtml1}
                <div style="font-size:${labelFontSize}; font-weight:900; margin-top:3px; -webkit-text-stroke:0.6px #000; line-height:1.2; text-align:center; letter-spacing:0.5px;">${label1}</div>
            </div>`
        };
    }

    // 3. كود كيو آر الرابط الثاني
    let social2Block = null;
    if (social2Link) {
        let norm2 = social2Link;
        if (!/^https?:\/\//i.test(norm2)) norm2 = 'https://' + norm2;
        const label2 = getSocialQrLabel(social2Link);
        const qrHtml2 = generateOfflineInvoiceQR(norm2, size, social2Link);
        social2Block = {
            type: 'social2',
            html: `
            <div style="text-align:center; width:${containerWidth}px; display:inline-block; vertical-align:top;">
                ${qrHtml2}
                <div style="font-size:${labelFontSize}; font-weight:900; margin-top:3px; -webkit-text-stroke:0.6px #000; line-height:1.2; text-align:center; letter-spacing:0.5px;">${label2}</div>
            </div>`
        };
    }

    // تحديد ما سيتم عرضه (بحد أقصى كودين اثنين فقط):
    let selectedBlocks = [];

    if (social1Block && social2Block && !invoiceQrBlock) {
        // حالة: المستخدم لغى كود الفاتورة ومفعّل الرابطين (يطبع الرابطين جنباً إلى جنب)
        selectedBlocks = [social1Block, social2Block];
    } else if (invoiceQrBlock && social1Block && social2Block) {
        // حالة: المستخدم مفعّل التلاتة معاً -> السقف كودين: نعرض الرابط الأول + كود الفاتورة
        selectedBlocks = [social1Block, invoiceQrBlock];
    } else {
        // الحالات المتبقية: تجميع الكتل النشطة
        if (social1Block) selectedBlocks.push(social1Block);
        if (social2Block) selectedBlocks.push(social2Block);
        if (invoiceQrBlock) selectedBlocks.push(invoiceQrBlock);
        // الاكتفاء بأول 2 كحد أقصى
        selectedBlocks = selectedBlocks.slice(0, 2);
    }

    // إذا لم يكن هناك أي كود نشط
    if (selectedBlocks.length === 0) {
        return '';
    }

    // إذا كان كود واحد فقط نشط (يظهر في المنتصف)
    if (selectedBlocks.length === 1) {
        return `
        <div style="margin-top:8px; text-align:center; border-top:2px dashed #000000; padding-top:6px; display:flex; justify-content:center;">
            ${selectedBlocks[0].html}
        </div>`;
    }

    // إذا كان كودين نشطين (يعرضان جنباً إلى جنب)
    return `
    <div style="display:flex; justify-content:space-around; align-items:flex-start; margin-top:8px; padding-top:6px; border-top:2px dashed #000000; direction:rtl; box-sizing:border-box;">
        ${selectedBlocks[0].html}
        ${selectedBlocks[1].html}
    </div>`;
}

/**
 * بناء كود HTML الكامل للفاتورة وفقاً للقالب المحدد (A4, 80mm, 57mm...)
 * يُستخدم للطباعة وتصدير الصور (مثل واتساب) بنفس التصميم المعتمد 100%
 */
function buildInvoiceDocumentHTML(invoiceData) {
    if (!invoiceData) invoiceData = {};
    // قراءة القالب المحفوظ
    const savedSettings  = JSON.parse(getStore('bayan_print_template_choice') || '{}');
    const templateChoice = invoiceData.template || savedSettings.template || '80mm Standard';

    // بيانات المتجر والمؤسسة (جلب موثوق من pos_settings وحقول الشاشة)
    let savedPosSettings = {};
    try {
        savedPosSettings = JSON.parse(getStore('pos_settings') || '{}');
    } catch(e) {}

    const shopName    = invoiceData.shopName    
        || savedPosSettings.name 
        || (document.getElementById('shopName') ? document.getElementById('shopName').value.trim() : '') 
        || 'مؤسستي';

    const shopAddress = invoiceData.shopAddress 
        || savedPosSettings.address 
        || (document.getElementById('shopAddress') ? document.getElementById('shopAddress').value.trim() : '');

    const defaultPhone = (savedPosSettings.phones && savedPosSettings.phones.find(p => p && p.trim() !== '')) || '';
    const shopPhone   = invoiceData.shopPhone   
        || defaultPhone 
        || (document.getElementById('shopPhone1') ? document.getElementById('shopPhone1').value.trim() : '');

    const footerMsg   = invoiceData.footerMsg   
        || savedPosSettings.printFooterMsg 
        || (document.getElementById('printFooterMsg') ? document.getElementById('printFooterMsg').value.trim() : '') 
        || 'شكراً لتعاملكم معنا!';

    const printInvoiceQrEnabled = (invoiceData.printInvoiceQrEnabled !== undefined) 
        ? !!invoiceData.printInvoiceQrEnabled 
        : ((savedPosSettings.printInvoiceQrEnabled !== undefined) 
            ? !!savedPosSettings.printInvoiceQrEnabled 
            : (document.getElementById('printInvoiceQrEnabled') ? document.getElementById('printInvoiceQrEnabled').checked : true));

    const printSocialQrEnabled = (invoiceData.printSocialQrEnabled !== undefined) 
        ? !!invoiceData.printSocialQrEnabled 
        : ((savedPosSettings.printSocialQrEnabled !== undefined) 
            ? !!savedPosSettings.printSocialQrEnabled 
            : (document.getElementById('printSocialQrEnabled') ? document.getElementById('printSocialQrEnabled').checked : true));

    const socialQrLink = (invoiceData.socialQrLink || savedPosSettings.printSocialQrLink || (document.getElementById('printSocialQrLink') ? document.getElementById('printSocialQrLink').value.trim() : '') || '').trim();

    const printSocialQr2Enabled = (invoiceData.printSocialQr2Enabled !== undefined) 
        ? !!invoiceData.printSocialQr2Enabled 
        : ((savedPosSettings.printSocialQr2Enabled !== undefined) 
            ? !!savedPosSettings.printSocialQr2Enabled 
            : (document.getElementById('printSocialQr2Enabled') ? document.getElementById('printSocialQr2Enabled').checked : false));

    const socialQr2Link = (invoiceData.socialQr2Link || savedPosSettings.printSocialQr2Link || (document.getElementById('printSocialQr2Link') ? document.getElementById('printSocialQr2Link').value.trim() : '') || '').trim();

    // توحيد وتطبيع الحقول لتغطية كافة أشكال البيانات القادمة من مختلف شاشات التطبيق
    const rawInvoiceNumber = invoiceData.originalInvoiceId || invoiceData.invoiceNumber || invoiceData.id || '';
    const dailyTaxSeq = (typeof getInvoiceTaxReceiptSeq === 'function') ? getInvoiceTaxReceiptSeq(invoiceData) : (invoiceData.taxInvoiceSeq || invoiceData.dailySeq || null);
    const isTaxSeqActive = (typeof isDailyTaxSeqEnabled === 'function') ? isDailyTaxSeqEnabled() : false;
    // إذا كان الترقيم اليومي مفعلاً، يكون هو الرقم المطبوع الرئيسي للزبون والضرائب
    const invoiceNumber = (dailyTaxSeq && (isTaxSeqActive || invoiceData.taxInvoiceSeq || invoiceData.dailySeq))
        ? dailyTaxSeq
        : (invoiceData.invoiceNumber || invoiceData.id || '');
    const date          = invoiceData.date          || '';
    const time          = invoiceData.time          || '';
    const dueDate       = invoiceData.dueDate       || '';
    const cashier       = invoiceData.cashier       || '';
    const customer      = invoiceData.customer      || invoiceData.partnerName || '';
    const warehouse     = invoiceData.warehouse     || (typeof currentUser !== 'undefined' && currentUser && currentUser.warehouseName) || 'المخزن الرئيسي';
    const terminal      = invoiceData.terminal      || ((window.BayanNetworkHub && typeof window.BayanNetworkHub.getTerminalDisplayName === 'function') ? window.BayanNetworkHub.getTerminalDisplayName() : 'الجهاز الرئيسي 💻');
    const items         = invoiceData.items         || [];

    const totalAmount = parseFloat(invoiceData.totalAmount !== undefined ? invoiceData.totalAmount : (invoiceData.invoiceAmount !== undefined ? invoiceData.invoiceAmount : (invoiceData.total || 0)));
    const paid        = parseFloat(invoiceData.paid !== undefined ? invoiceData.paid : 0);
    const deferred    = parseFloat(invoiceData.deferred !== undefined ? invoiceData.deferred : (totalAmount - paid));
    const prevBalance = parseFloat(invoiceData.prevBalance !== undefined ? invoiceData.prevBalance : 0);
    const currentBalance = parseFloat(invoiceData.currentBalance !== undefined ? invoiceData.currentBalance : (prevBalance + deferred));

    // استخراج طريقة الدفع الصريحة ونوع الفاتورة بمرونة لتجنب الخلط
    const paymentMethod = invoiceData.paymentMethod || invoiceData.method || (['نقدي', 'آجل', 'فيزا', 'شبكة', 'بنكي', 'شيك'].includes(invoiceData.invoiceType) ? invoiceData.invoiceType : 'نقدي');
    const invoiceType   = invoiceData.invoiceType || paymentMethod || 'بيع';

    // فحص دقيق وشامل لنوع المستند (مبيعات / مشتريات / مرتجعات) من مختلف الإشارات الممكنة
    const rawType = String(invoiceData.invoiceType || invoiceData.type || invoiceData.docType || invoiceData.docTitle || '').toLowerCase();
    const isRet = invoiceData.isReturn === true || 
                  rawType.includes('مرتجع') || 
                  rawType.includes('return') || 
                  rawType.includes('ارتجاع') || 
                  (invoiceData.docType && invoiceData.docType.includes('return'));

    const isPur = invoiceData.isPurchase === true || 
                  rawType.includes('شراء') || 
                  rawType.includes('مشتريات') || 
                  rawType.includes('purchase') || 
                  invoiceData.docType === 'purchase' || 
                  invoiceData.docType === 'return_purchase';

    const docType = invoiceData.docType || (isRet ? (isPur ? 'return_purchase' : 'return_sales') : (isPur ? 'purchase' : 'sales'));

    // عناوين المستندات الرسمية
    const docTitles = {
        sales:           'فاتورة مبيعات',
        purchase:        'فاتورة شراء',
        return_sales:    'مرتجع مبيعات',
        return_purchase: 'مرتجع مشتريات',
        financial:       'سند مالي',
        inventory:       'تقرير مخزن',
        general:         'مستند عام'
    };

    let docTitle = invoiceData.docTitle;
    if (!docTitle) {
        if (isRet) {
            docTitle = isPur ? 'مرتجع مشتريات' : 'مرتجع مبيعات';
        } else if (docTitles[docType]) {
            docTitle = docTitles[docType];
        } else {
            docTitle = isPur ? 'فاتورة شراء' : 'فاتورة مبيعات';
        }
    }

    // صفوف الأصناف - النسخة الكاملة (مع السعر والإجمالي والمقاس واللون)
    const itemsRowsFull = items.map(item => {
        const qty       = parseFloat(item.qty   || 0);
        const price     = parseFloat(item.price || 0);
        const lineTotal = parseFloat(item.total != null ? item.total : price * qty).toFixed(2);
        const unitName  = item.selectedUnit
            ? (typeof item.selectedUnit === 'object' ? item.selectedUnit.unitName : item.selectedUnit)
            : (item.unit || 'قطعة');
            
        // تفاصيل المقاس واللون للملابس والفاشون (حجم صغير مضغوط بدون هوامش زائدة، بحبر أسود فاحم صريح)
        const sVal = String(item.size || item.selectedSize || (item.selectedVariant && item.selectedVariant.size) || '').trim();
        const cVal = String(item.color || item.selectedColor || (item.selectedVariant && item.selectedVariant.color) || '').trim();
        const isPrintVariantsDisabled = (typeof document !== 'undefined' && document.body && document.body.classList.contains('bayan-variants-disabled'));
        let fashionText = '';
        if (!isPrintVariantsDisabled) {
            if (sVal && sVal !== '-' && sVal !== 'عام' && cVal && cVal !== '-' && cVal !== 'عام') {
                fashionText = `(مقاس: ${escapePrintHtml(sVal)} | لون: ${escapePrintHtml(cVal)})`;
            } else if (sVal && sVal !== '-' && sVal !== 'عام') {
                fashionText = `(مقاس: ${escapePrintHtml(sVal)})`;
            } else if (cVal && cVal !== '-' && cVal !== 'عام') {
                fashionText = `(لون: ${escapePrintHtml(cVal)})`;
            }
        }
        const fashionDetails = fashionText ? `<div style="font-size:12px; color:#000000 !important; font-weight:900; line-height:1.2; margin-top:2px; -webkit-text-stroke:0.5px #000;">${fashionText}</div>` : '';

        return `<tr>
            <td style="text-align:right; padding:5px 4px; border:2px solid #000; word-break:break-word;">
                <div style="font-weight:900; line-height:1.25; font-size:14px; color:#000; -webkit-text-stroke:0.65px #000;">${escapePrintHtml(item.name || item.product || '')}</div>
                ${fashionDetails}
            </td>
            <td style="text-align:center; padding:5px 1px; border:2px solid #000; font-weight:900; color:#000; font-size:13.5px; line-height:1.2; -webkit-text-stroke:0.65px #000;">
                <div style="font-weight:900; font-size:14.5px; line-height:1.1;">${qty}</div>
                ${unitName ? `<div style="font-size:11px; font-weight:900; line-height:1.1; color:#000; -webkit-text-stroke:0.5px #000;">${escapePrintHtml(unitName)}</div>` : ''}
            </td>
            <td style="text-align:center; padding:5px 1px; border:2px solid #000; font-weight:900; color:#000; font-size:13.5px; white-space:nowrap; -webkit-text-stroke:0.65px #000;">${price.toFixed(2)}</td>
            <td style="text-align:center; padding:5px 1px; border:2px solid #000; font-weight:900; color:#000; font-size:13.5px; white-space:nowrap; -webkit-text-stroke:0.75px #000;">${lineTotal}</td>
        </tr>`;
    }).join('');

    // صفوف الأصناف - النسخة المضغوطة (بحجم صغير مضغوط وحبر أسود واضح)
    const itemsRowsCompact = items.map(item => {
        const qty       = parseFloat(item.qty   || 0);
        const price     = parseFloat(item.price || 0);
        const lineTotal = parseFloat(item.total != null ? item.total : price * qty).toFixed(2);
        const unitName  = item.selectedUnit
            ? (typeof item.selectedUnit === 'object' ? item.selectedUnit.unitName : item.selectedUnit)
            : (item.unit || 'قطعة');
            
        // تفاصيل المقاس واللون للملابس والفاشون
        const sVal = String(item.size || item.selectedSize || (item.selectedVariant && item.selectedVariant.size) || '').trim();
        const cVal = String(item.color || item.selectedColor || (item.selectedVariant && item.selectedVariant.color) || '').trim();
        const isPrintVariantsDisabledCompact = (typeof document !== 'undefined' && document.body && document.body.classList.contains('bayan-variants-disabled'));
        let fashionText = '';
        if (!isPrintVariantsDisabledCompact) {
            if (sVal && sVal !== '-' && sVal !== 'عام' && cVal && cVal !== '-' && cVal !== 'عام') {
                fashionText = `(مقاس: ${escapePrintHtml(sVal)} | لون: ${escapePrintHtml(cVal)})`;
            } else if (sVal && sVal !== '-' && sVal !== 'عام') {
                fashionText = `(مقاس: ${escapePrintHtml(sVal)})`;
            } else if (cVal && cVal !== '-' && cVal !== 'عام') {
                fashionText = `(لون: ${escapePrintHtml(cVal)})`;
            }
        }
        const fashionDetails = fashionText ? `<div style="font-size:12px; color:#000000 !important; font-weight:900; line-height:1.2; margin-top:2px; -webkit-text-stroke:0.5px #000;">${fashionText}</div>` : '';

        return `<tr>
            <td style="text-align:right; padding:5px 4px; border-bottom:2px solid #000; font-weight:900; font-size:14px; -webkit-text-stroke:0.65px #000;">
                <div style="line-height:1.25;">${escapePrintHtml(item.name || item.product || '')}</div>
                ${fashionDetails}
            </td>
            <td style="text-align:center; padding:5px 1px; border-bottom:2px solid #000; font-weight:900; color:#000; font-size:13.5px; line-height:1.2; -webkit-text-stroke:0.65px #000;">
                <div style="font-weight:900; font-size:14.5px; line-height:1.1;">${qty}</div>
                ${unitName ? `<div style="font-size:11px; font-weight:900; line-height:1.1; color:#000; -webkit-text-stroke:0.5px #000;">${escapePrintHtml(unitName)}</div>` : ''}
            </td>
            <td style="text-align:center; padding:5px 4px; border-bottom:2px solid #000; font-weight:900; color:#000; font-size:13.5px; -webkit-text-stroke:0.75px #000;">${lineTotal}</td>
        </tr>`;
    }).join('');

    const discount    = parseFloat(invoiceData.discount || 0);
    const subTotal    = parseFloat(invoiceData.subTotal || 0);
    const tax         = parseFloat(invoiceData.tax || 0);
    const taxLabel    = invoiceData.taxLabel || 'إضافة';
    const globalTax   = parseFloat(invoiceData.globalTax || 0);

    const d = {
        shopName, shopAddress, shopPhone, footerMsg,
        socialQrLink, socialQr2Link,
        printInvoiceQrEnabled, printSocialQrEnabled, printSocialQr2Enabled, docTitle,
        invoiceNumber, rawInvoiceNumber, dailyTaxSeq, isTaxSeqActive,
        invoiceType: paymentMethod, date, time, dueDate, cashier, customer, warehouse, terminal,
        totalAmount, paid, deferred, prevBalance, currentBalance, docType,
        itemsRowsFull, itemsRowsCompact, discount, subTotal, tax, taxLabel, globalTax,
        rawItems: items
    };

    // ============================================================
    // بناء المحتوى بحسب القالب
    // ============================================================
    let content = '';

    if (templateChoice === 'A4 Professional' || templateChoice === 'A4') {
        content = buildA4Professional(d);
    } else if (templateChoice === 'A5 Modern' || templateChoice === 'A5') {
        content = buildA5Modern(d);
    } else if (templateChoice === '57mm Mobile' || templateChoice === '57mm') {
        content = build57mm(d);
    } else if (templateChoice === '80mm Compact') {
        content = build80mmCompact(d);
    } else {
        // 80mm Standard (الافتراضي)
        content = build80mmStandard(d);
    }

    // تحديد عرض الصفحة للطباعة
    const pageWidth = (templateChoice === 'A4 Professional' || templateChoice === 'A4') ? '210mm'
                    : (templateChoice === 'A5 Modern'       || templateChoice === 'A5') ? '148mm'
                    : (templateChoice === '57mm Mobile'     || templateChoice === '57mm') ? '57mm'
                    : '80mm';

    return {
        content,
        pageWidth,
        docTitle,
        shopName,
        data: d
    };
}
window.buildInvoiceDocumentHTML = buildInvoiceDocumentHTML;

async function printInvoice(invoiceData, options = {}) {
    const rendered = buildInvoiceDocumentHTML(invoiceData);
    const content = rendered.content;
    const pageWidth = rendered.pageWidth;
    const docTitle = rendered.docTitle;
    const shopName = rendered.shopName;
    const isSilent = (options && options.silent === true);

    const baseUrl = (typeof window !== 'undefined' && window.location && window.location.href)
        ? window.location.href.split('/').slice(0, -1).join('/') + '/'
        : '';

    const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <base href="${baseUrl}">
    <title>${docTitle} - ${shopName}</title>
    <link rel="stylesheet" href="${baseUrl}fonts/cairo.css">
    <style>
        @page { size: ${pageWidth} auto; margin: 0mm; }
        *, *::before, *::after { 
            box-sizing: border-box !important; 
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: ${pageWidth} !important;
            height: auto !important;
            overflow: visible !important;
            font-family: 'Arial', 'Tahoma', 'Segoe UI', 'Cairo', sans-serif !important;
            text-align: right;
            direction: rtl;
            color: #000000 !important;
            background: #ffffff !important;
            font-weight: 900 !important;
            -webkit-text-stroke: 0.55px #000000 !important;
            text-shadow: 0.25px 0 0 #000, -0.25px 0 0 #000, 0 0.25px 0 #000, 0 -0.25px 0 #000 !important;
        }
        /* 🖨️ تعزيز ثقل الحبر والسواد الفاحم الصريح للطابعات الحرارية بدون بهتان */
        body, div, span, b, strong, td, th, p, h1, h2, h3, label {
            color: #000000 !important;
            font-weight: 900 !important;
            -webkit-text-stroke: 0.55px #000000 !important;
            text-shadow: 0.25px 0 0 #000, -0.25px 0 0 #000, 0 0.25px 0 #000, 0 -0.25px 0 #000 !important;
        }
        b, strong, th, .bold-text {
            -webkit-text-stroke: 0.75px #000000 !important;
            font-weight: 900 !important;
        }
        table {
            box-sizing: border-box !important;
            border-collapse: collapse !important;
            width: 100% !important;
        }
        table th, table td {
            color: #000000 !important;
            box-sizing: border-box !important;
            font-weight: 900 !important;
        }
        @media print {
            .no-print { display: none !important; }
            html, body {
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
            }
        }
    </style>
</head>
<body>
    ${isSilent ? '' : `
    <div class="no-print" style="text-align: center; margin-bottom: 15px; padding: 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
        <button onclick="window.print()" style="background: #2563eb; color: white; padding: 10px 25px; font-size: 18px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">🖨️ طباعة الآن</button>
        <button onclick="window.close()" style="background: #ef4444; color: white; padding: 10px 25px; font-size: 18px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-right: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">❌ إغلاق</button>
    </div>
    `}
    ${content}
    ${isSilent ? '' : `
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.focus();
                window.print();
            }, 250);
        };
    </script>
    `}
</body>
</html>`;

    // 1. ⚡ الطباعة الصامتة المباشرة في بيئة Electron (فورياً وبدون أي نوافذ منبثقة)
    if (isSilent && typeof window !== 'undefined' && window.require) {
        try {
            const electron = window.require('electron');
            if (electron && electron.ipcRenderer) {
                const targetPrinter = (typeof getStore === 'function' ? getStore('bayan_receipt_printer') : '') || '';
                const result = await electron.ipcRenderer.invoke('print-receipt-silent', {
                    html: fullHtml,
                    printerName: targetPrinter
                });

                if (result && result.success) {
                    console.log('✅ [Print Silent] تم إرسال الفاتورة بنجاح إلى الطابعة.');
                    if (typeof showToast === 'function') {
                        showToast('🖨️ جاري خروج الفاتورة من الطابعة مباشرة...', 'info');
                    }
                    return true;
                } else {
                    console.warn('⚠️ [Print Silent] فشل الإرسال الصامت:', result ? result.error : 'unknown');
                    if (typeof showToast === 'function') {
                        showToast('⚠️ تعذر إرسال الفاتورة للطابعة الصامتة، يمكنك الطباعة يدوياً عبر F4', 'warning');
                    }
                }
            }
        } catch (e) {
            console.warn('Silent print electron fallback notice:', e);
        }
    }

    // 2. الطباعة العادية بنظام المعاينة (أو كبديل آمن في المتصفح)
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('⚠️ يرجى السماح بفتح النوافذ المنبثقة لإتمام الطباعة');
        return false;
    }

    printWindow.document.write(fullHtml);
    printWindow.document.close();
    return true;
}

function savePrintTemplate(templateName) {
    setStore('bayan_print_template_choice', JSON.stringify({ template: templateName }));
}

// ============================================================
// ➕ إضافة قالب للقوالب المحفوظة
// ============================================================
function addToMyTemplates(templateName, docType) {
    const name     = templateName || JSON.parse(getStore('bayan_print_template_choice') || '{}').template || '80mm Standard';
    const type     = docType     || 'فاتورة المبيعات';
    const userTemplates = JSON.parse(getStore('bayan_user_templates') || '[]');

    const exists = userTemplates.find(t => t.id === name && t.type === type);
    if (exists) {
        if (typeof showToast === 'function') showToast('⚠️ هذا القالب موجود بالفعل في تصميماتي');
        return;
    }

    userTemplates.push({ type, id: name, addedAt: new Date().toLocaleString('ar-EG') });
    setStore('bayan_user_templates', JSON.stringify(userTemplates));
    if (typeof showToast === 'function') showToast('✅ تمت إضافة القالب إلى تصميماتي');
    else alert('✅ تمت إضافة القالب إلى تصميماتي');
}

// ============================================================
// ✏️ محرر القوالب الحر - يفتح modal لتعديل HTML الفاتورة
// ============================================================
function openFreeEditor(invoiceData) {
    // إغلاق أي modal سابق
    const existingModal = document.getElementById('bayPrintEditorModal');
    if (existingModal) existingModal.remove();

    const savedSettings  = JSON.parse(getStore('bayan_print_template_choice') || '{}');
    const templateName   = (invoiceData && invoiceData.template) || savedSettings.template || '80mm Standard';

    // الحصول على الـ HTML الحالي للقالب المختار
    const shopName    = (invoiceData && invoiceData.shopName)    || (document.getElementById('shopName')      ? document.getElementById('shopName').value      : 'بيان POS');
    const shopAddress = (invoiceData && invoiceData.shopAddress) || (document.getElementById('shopAddress')   ? document.getElementById('shopAddress').value   : '');
    const shopPhone   = (invoiceData && invoiceData.shopPhone)   || (document.getElementById('shopPhone1')    ? document.getElementById('shopPhone1').value    : '');
    const footerMsg   = (invoiceData && invoiceData.footerMsg)   || (document.getElementById('printFooterMsg')? document.getElementById('printFooterMsg').value : 'شكراً لزيارتكم!');

    // بيانات تجريبية لعرض المعاينة
    const sampleData = {
        invoiceNumber: '1001', invoiceType: 'نقداً', date: new Date().toLocaleDateString('ar-EG'),
        time: new Date().toLocaleTimeString('ar-EG'), dueDate: '', cashier: 'المدير',
        customer: 'عميل تجريبي', docType: 'sales', shopName, shopAddress, shopPhone, footerMsg,
        totalAmount: 250, paid: 250, deferred: 0, prevBalance: 0, currentBalance: 0,
        items: [
            { name: 'صنف تجريبي 1', qty: 2, price: 50, total: 100, unit: 'قطعة' },
            { name: 'صنف تجريبي 2', qty: 3, price: 50, total: 150, unit: 'كيلو' }
        ],
        template: templateName
    };

    // بناء HTML الفاتورة الحالية للتعديل
    const buildContentFn = {
        'A4 Professional': buildA4Professional,
        'A4':              buildA4Professional,
        'A5 Modern':       buildA5Modern,
        'A5':              buildA5Modern,
        '57mm Mobile':     build57mm,
        '57mm':            build57mm,
        '80mm Compact':    build80mmCompact,
    };

    const d = {
        shopName, shopAddress, shopPhone, footerMsg,
        docTitle: 'فاتورة مبيعات',
        invoiceNumber: sampleData.invoiceNumber, invoiceType: sampleData.invoiceType,
        date: sampleData.date, time: sampleData.time, dueDate: '', cashier: sampleData.cashier,
        customer: sampleData.customer,
        totalAmount: sampleData.totalAmount, paid: sampleData.paid,
        deferred: sampleData.deferred, prevBalance: sampleData.prevBalance,
        currentBalance: sampleData.currentBalance,
        itemsRowsFull: sampleData.items.map(item => `
            <tr>
                <td style="text-align:right; padding:3px 5px; border:1px solid #000;">${item.name}</td>
                <td style="text-align:center; padding:3px 4px; border:1px solid #000;">${item.qty} ${item.unit}</td>
                <td style="text-align:center; padding:3px 4px; border:1px solid #000;">${(parseFloat(item.price) || 0).toFixed(2)}</td>
                <td style="text-align:center; padding:3px 4px; border:1px solid #000;">${(parseFloat(item.total) || 0).toFixed(2)}</td>
            </tr>`).join(''),
        itemsRowsCompact: sampleData.items.map(item => `
            <tr>
                <td style="padding:2px 4px; border-bottom:1px solid #ccc; font-weight:900;">${item.name}</td>
                <td style="text-align:center; padding:2px 4px; border-bottom:1px solid #ccc; font-weight:900;">${item.qty}</td>
                <td style="text-align:center; padding:2px 4px; border-bottom:1px solid #ccc; font-weight:900;">${(parseFloat(item.total) || 0).toFixed(2)}</td>
            </tr>`).join('')
    };

    const fn = buildContentFn[templateName] || build80mmStandard;
    let currentHTML = fn(d);

    // Modal HTML
    const modal = document.createElement('div');
    modal.id = 'bayPrintEditorModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.7); 
        display: flex; align-items: center; justify-content: center; 
        z-index: 999999; direction: rtl;
    `;

    modal.innerHTML = `
        <div style="background:#1a1a2e; border-radius:16px; width:95vw; max-width:1100px; height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.1);">
            
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#16213e,#0f3460); padding:16px 24px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:1.5rem;">✏️</span>
                    <div>
                        <div style="color:#fff; font-weight:900; font-size:1.1rem;">محرر القوالب الحر</div>
                        <div style="color:rgba(255,255,255,0.6); font-size:0.8rem;">قالب: ${templateName}</div>
                    </div>
                </div>
                <button onclick="document.getElementById('bayPrintEditorModal').remove()" 
                    style="background:rgba(255,255,255,0.1); border:none; color:#fff; width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:1.2rem; transition:0.2s;"
                    onmouseover="this.style.background='rgba(231,76,60,0.8)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">✕</button>
            </div>

            <!-- Toolbar -->
            <div style="background:#16213e; padding:10px 16px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; border-bottom:1px solid rgba(255,255,255,0.1);">
                <button onclick="updatePrintEditorPreview()" 
                    style="padding:6px 14px; background:#27ae60; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:0.85rem; transition:0.2s;"
                    onmouseover="this.style.background='#2ecc71'" onmouseout="this.style.background='#27ae60'">
                    🔄 تحديث المعاينة
                </button>
                <button onclick="saveFreeTemplate()" 
                    style="padding:6px 14px; background:#3498db; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:0.85rem; transition:0.2s;"
                    onmouseover="this.style.background='#2980b9'" onmouseout="this.style.background='#3498db'">
                    ➕ إضافة لقوالبي
                </button>
                <button onclick="printFromEditor()" 
                    style="padding:6px 14px; background:#8e44ad; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:bold; font-size:0.85rem; transition:0.2s;"
                    onmouseover="this.style.background='#9b59b6'" onmouseout="this.style.background='#8e44ad'">
                    🖨️ طباعة مباشرة
                </button>
                <button onclick="resetEditorHTML()" 
                    style="padding:6px 14px; background:rgba(255,255,255,0.1); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:8px; cursor:pointer; font-size:0.85rem; transition:0.2s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                    ↩️ استعادة الأصلي
                </button>
                <div style="margin-right:auto; color:rgba(255,255,255,0.5); font-size:0.75rem;">تعديل HTML مباشر للقالب</div>
            </div>

            <!-- Editor + Preview -->
            <div style="display:flex; flex:1; overflow:hidden; gap:0;">
                
                <!-- Code Editor -->
                <div style="flex:1; display:flex; flex-direction:column; border-left:1px solid rgba(255,255,255,0.1); min-width:0;">
                    <div style="padding:8px 16px; background:#0d1117; color:rgba(255,255,255,0.5); font-size:0.75rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                        📝 كود HTML
                    </div>
                    <textarea id="bayPrintEditorCode" 
                        style="flex:1; width:100%; background:#0d1117; color:#c9d1d9; border:none; outline:none; padding:16px; font-family:monospace; font-size:12px; line-height:1.6; resize:none; direction:ltr; text-align:left; overflow-y:auto;"
                        placeholder="اكتب HTML هنا..."
                        oninput="updatePrintEditorPreview()">${currentHTML.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
                </div>

                <!-- Live Preview -->
                <div style="flex:1; display:flex; flex-direction:column; background:#f5f5f5; min-width:0;">
                    <div style="padding:8px 16px; background:#e8e8e8; color:#555; font-size:0.75rem; border-bottom:1px solid #ddd;">
                        👁️ معاينة مباشرة
                    </div>
                    <div style="flex:1; overflow-y:auto; display:flex; justify-content:center; padding:20px; background:#f0f0f0;">
                        <div id="bayPrintEditorPreview" style="background:#fff; padding:10px; box-shadow:0 2px 12px rgba(0,0,0,0.15); direction:rtl; min-width:200px; max-width:100%;"></div>
                    </div>
                </div>

            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // تفعيل المعاينة فور الفتح
    const textarea = document.getElementById('bayPrintEditorCode');
    if (textarea) {
        textarea.value = currentHTML; // القيمة الحقيقية (بدون HTML entities)
        updatePrintEditorPreview();
    }

    // ─── دوال Modal الداخلية ───
    window._bayOriginalEditorHTML = currentHTML;

    window.updatePrintEditorPreview = function() {
        const code    = document.getElementById('bayPrintEditorCode').value;
        const preview = document.getElementById('bayPrintEditorPreview');
        if (preview) preview.innerHTML = code;
    };

    window.saveFreeTemplate = async function() {
        const code = document.getElementById('bayPrintEditorCode').value;
        const name = await showCustomPrompt('اسم القالب الجديد:');
        if (!name) return;
        const userTemplates = JSON.parse(getStore('bayan_user_templates') || '[]');
        userTemplates.push({
            type: 'مخصص ✏️',
            id: name,
            html: code,
            addedAt: new Date().toLocaleString('ar-EG')
        });
        setStore('bayan_user_templates', JSON.stringify(userTemplates));
        if (typeof showToast === 'function') showToast(`✅ تم حفظ القالب "${name}" في تصميماتي`);
        else alert(`✅ تم حفظ القالب "${name}"`);
    };

    window.printFromEditor = function() {
        const code = document.getElementById('bayPrintEditorCode').value;
        const printWindow = window.open('', '_blank');
        if (!printWindow) { alert('يرجى السماح بفتح النوافذ المنبثقة'); return; }
        printWindow.document.write(`
            <html dir="rtl" lang="ar">
            <head><title>طباعة الفاتورة</title>
            <style>@page{margin:0;} body{margin:0;padding:5px;font-family:Arial,sans-serif;} @media print { .no-print { display: none !important; } }</style></head>
            <body>
            <div class="no-print" style="text-align: center; margin-bottom: 15px; padding: 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <button onclick="window.print()" style="background: #2563eb; color: white; padding: 10px 25px; font-size: 18px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">🖨️ طباعة الآن</button>
                <button onclick="window.close()" style="background: #ef4444; color: white; padding: 10px 25px; font-size: 18px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-right: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">❌ إغلاق</button>
            </div>
            ${code}
            <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
            </body></html>
        `);
        printWindow.document.close();
    };

    window.resetEditorHTML = function() {
        if (confirm('هل تريد استعادة الكود الأصلي؟ سيتم فقدان التعديلات.')) {
            document.getElementById('bayPrintEditorCode').value = window._bayOriginalEditorHTML;
            updatePrintEditorPreview();
        }
    };
}

// ============================================================
// القوالب
// ============================================================

// ─── 80mm Standard ───────────────────────────────────────────
function build80mmStandard(d) {
    const isCashBuyer = !d.customer || (window.isGenericCashPartner && window.isGenericCashPartner(d.customer)) || d.customer === '-' || d.customer === '---' || d.customer.includes('نقدي');
    
    // تصفية أسطر الأصناف من الإيموجيات للحفاظ على جودة الطباعة
    const cleanItemsRows = d.itemsRowsFull.replace(/📤|📥|🔄|🔙|💵|💸|⚖️|🚚|🛒|🛍️|🧺|📦|💰|🌗|✅|⏳/g, '');

    // إنشاء الـ QR Code المزدوج (بيانات الفاتورة يساراً وصفحة فيسبوك يميناً)
    const qrSectionHtml = renderDualQrCodesHtml(d, 82, false);

    return `
    <div style="width:72mm; max-width:72mm; margin:0 auto; font-family:'Arial','Tahoma','Segoe UI',sans-serif; direction:rtl; padding:1mm 2mm; color:#000000; box-sizing:border-box; line-height:1.35; font-weight:900;">
        <div style="text-align:center; border-bottom:3px solid #000000; padding-bottom:6px; margin-bottom:6px;">
            <div style="font-size:24px; font-weight:900; line-height:1.2; letter-spacing:-0.2px; -webkit-text-stroke:0.9px #000;">${d.shopName}</div>
            ${d.shopAddress ? `<div style="font-size:13px; font-weight:900; margin-top:2px; -webkit-text-stroke:0.55px #000;">${d.shopAddress}</div>` : ''}
            ${d.shopPhone   ? `<div style="font-size:13px; font-weight:900; margin-top:2px; -webkit-text-stroke:0.6px #000;">📞 ${d.shopPhone}</div>` : ''}
            <div style="font-size:16px; font-weight:900; border:2.5px solid #000000; display:inline-block; padding:4px 22px; margin-top:6px; border-radius:4px; letter-spacing:0.5px; -webkit-text-stroke:0.8px #000;">${d.docTitle}</div>
        </div>

        <div style="font-size:13px; font-weight:900; margin-bottom:6px; border-bottom:2.5px solid #000000; padding-bottom:5px; line-height:1.4;">
            <div style="display:flex; justify-content:space-between; padding:0 2px;">
                <span>رقم الفاتورة: <b style="font-size:15px; font-weight:900; -webkit-text-stroke:0.8px #000;">#${d.invoiceNumber}</b></span>
                <span style="-webkit-text-stroke:0.6px #000;">التاريخ: ${d.date}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:0 2px; margin-top:3px;">
                <span style="-webkit-text-stroke:0.6px #000;">طريقة الدفع: ${d.invoiceType}</span>
                <span style="-webkit-text-stroke:0.6px #000;">الوقت: ${d.time}</span>
            </div>
            ${!isCashBuyer && d.customer ? `<div style="border-top:2px dashed #000000; margin-top:4px; padding-top:3px; padding-right:2px; font-weight:900; font-size:13.5px; -webkit-text-stroke:0.7px #000;">العميل: ${d.customer}</div>` : ''}
            <div style="display:flex; justify-content:space-between; padding:0 2px; margin-top:3px; font-size:12.5px; -webkit-text-stroke:0.55px #000;">
                ${d.cashier ? `<span>الكاشير: ${d.cashier}</span>` : '<span></span>'}
                <span>الفرع: ${d.warehouse}</span>
            </div>
            ${d.terminal ? `<div style="padding:0 2px; font-size:11.5px; display:flex; justify-content:space-between; margin-top:2px; -webkit-text-stroke:0.5px #000;"><span>الجهاز: ${d.terminal}</span>${(!d.isTaxSeqActive && d.dailyTaxSeq && d.rawInvoiceNumber && String(d.dailyTaxSeq) !== String(d.rawInvoiceNumber)) ? `<span>Ref: ${d.rawInvoiceNumber}</span>` : ''}</div>` : ''}
            ${d.dueDate  ? `<div style="padding-right:2px; margin-top:2px; -webkit-text-stroke:0.55px #000;">تاريخ الاستحقاق: ${d.dueDate}</div>`  : ''}
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:6px; border:2.5px solid #000000; font-weight:900; table-layout:fixed; box-sizing:border-box;">
            <colgroup>
                <col style="width:46%;">
                <col style="width:15%;">
                <col style="width:19%;">
                <col style="width:20%;">
            </colgroup>
            <thead>
                <tr style="border-bottom:2.5px solid #000000; background:#ffffff;">
                    <th style="text-align:right; padding:6px 3px; border:2px solid #000000; font-size:13px; font-weight:900; overflow:hidden; -webkit-text-stroke:0.75px #000;">الصنف</th>
                    <th style="text-align:center; padding:6px 1px; border:2px solid #000000; font-size:13px; font-weight:900; -webkit-text-stroke:0.75px #000;">الكمية</th>
                    <th style="text-align:center; padding:6px 1px; border:2px solid #000000; font-size:13px; font-weight:900; -webkit-text-stroke:0.75px #000;">السعر</th>
                    <th style="text-align:center; padding:6px 1px; border:2px solid #000000; font-size:13px; font-weight:900; -webkit-text-stroke:0.75px #000;">الإجمالي</th>
                </tr>
            </thead>
            <tbody>${cleanItemsRows}</tbody>
        </table>

        <table style="width:100%; border-collapse:collapse; font-size:13.5px; margin-bottom:6px; border:2.5px solid #000000; font-weight:900;">
            <tr style="font-size:14.5px; font-weight:900;">
                <td style="padding:6px 6px; border:2px solid #000000; font-weight:900; text-align:right; width:56%; -webkit-text-stroke:0.8px #000;">مبلغ الفاتورة</td>
                <td style="padding:6px 6px; border:2px solid #000000; text-align:center; direction:ltr; font-weight:900; font-size:15.5px; -webkit-text-stroke:0.85px #000;">${parseFloat(d.totalAmount).toFixed(2)}</td>
            </tr>
            ${d.discount && parseFloat(d.discount) > 0 ? `
            <tr>
                <td style="padding:5px 6px; border:2px solid #000000; font-weight:900; text-align:right; -webkit-text-stroke:0.7px #000;">خصم (-)</td>
                <td style="padding:5px 6px; border:2px solid #000000; text-align:center; direction:ltr; font-weight:900; -webkit-text-stroke:0.75px #000;">${parseFloat(d.discount).toFixed(2)}</td>
            </tr>
            ` : ''}
            ${d.tax && parseFloat(d.tax) > 0 ? `
            <tr>
                <td style="padding:5px 6px; border:2px solid #000000; font-weight:900; text-align:right; -webkit-text-stroke:0.7px #000;">${d.taxLabel} (+)</td>
                <td style="padding:5px 6px; border:2px solid #000000; text-align:center; direction:ltr; font-weight:900; -webkit-text-stroke:0.75px #000;">${parseFloat(d.tax).toFixed(2)}</td>
            </tr>
            ` : ''}
            ${d.globalTax && parseFloat(d.globalTax) > 0 ? `
            <tr>
                <td style="padding:5px 6px; border:2px solid #000000; font-weight:900; text-align:right; -webkit-text-stroke:0.7px #000;">ضريبة القيمة المضافة</td>
                <td style="padding:5px 6px; border:2px solid #000000; text-align:center; direction:ltr; font-weight:900; -webkit-text-stroke:0.75px #000;">${parseFloat(d.globalTax).toFixed(2)}</td>
            </tr>
            ` : ''}
            ${!isCashBuyer && parseFloat(d.prevBalance) !== 0 ? `
            <tr>
                <td style="padding:5px 6px; border:2px solid #000000; font-weight:900; text-align:right; -webkit-text-stroke:0.7px #000;">الرصيد السابق</td>
                <td style="padding:5px 6px; border:2px solid #000000; text-align:center; direction:ltr; font-weight:900; -webkit-text-stroke:0.75px #000;">${parseFloat(d.prevBalance).toFixed(2)}</td>
            </tr>
            <tr style="border-top:3px solid #000000; border-bottom:3px solid #000000; font-weight:900; font-size:15px;">
                <td style="padding:6px 6px; border:2px solid #000000; font-weight:900; text-align:right; -webkit-text-stroke:0.85px #000;">الإجمالي المطلوب</td>
                <td style="padding:6px 6px; border:2px solid #000000; text-align:center; direction:ltr; font-weight:900; font-size:16px; -webkit-text-stroke:0.9px #000;">${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance)).toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr>
                <td style="padding:5px 6px; border:2px solid #000000; font-weight:900; text-align:right; -webkit-text-stroke:0.75px #000;">المدفوع</td>
                <td style="padding:5px 6px; border:2px solid #000000; text-align:center; direction:ltr; font-weight:900; font-size:15px; -webkit-text-stroke:0.8px #000;">${parseFloat(d.paid).toFixed(2)}</td>
            </tr>
            ${!isCashBuyer ? `
            <tr style="border-top:3px solid #000000; font-weight:900; font-size:15px;">
                <td style="padding:6px 6px; border:2px solid #000000; font-weight:900; text-align:right; -webkit-text-stroke:0.85px #000;">الرصيد المستحق (الباقي)</td>
                <td style="padding:6px 6px; border:2px solid #000000; text-align:center; direction:ltr; font-weight:900; font-size:16px; -webkit-text-stroke:0.9px #000;">${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance) - parseFloat(d.paid)).toFixed(2)}</td>
            </tr>
            ` : (parseFloat(d.paid) > parseFloat(d.totalAmount) ? `
            <tr style="border-top:2.5px solid #000000; font-weight:900; font-size:14.5px;">
                <td style="padding:5px 6px; border:2px solid #000000; font-weight:900; text-align:right; -webkit-text-stroke:0.8px #000;">الباقي للعميل</td>
                <td style="padding:5px 6px; border:2px solid #000000; text-align:center; direction:ltr; font-weight:900; font-size:15.5px; -webkit-text-stroke:0.85px #000;">${(parseFloat(d.paid) - parseFloat(d.totalAmount)).toFixed(2)}</td>
            </tr>
            ` : '')}
        </table>

        <div style="text-align:center; border-top:3px solid #000000; padding-top:6px; margin-top:6px;">
            ${d.footerMsg ? `<div style="font-size:14px; font-weight:900; line-height:1.45; white-space: pre-line; -webkit-text-stroke:0.7px #000;">${d.footerMsg}</div>` : ''}
            
            ${qrSectionHtml}
        </div>
    </div>`;
}

// ─── 80mm Compact ─────────────────────────────────────────────
function build80mmCompact(d) {
    const isCashBuyer = !d.customer || (window.isGenericCashPartner && window.isGenericCashPartner(d.customer)) || d.customer === '-' || d.customer === '---' || d.customer.includes('نقدي');
    
    // تصفية الأصناف من الإيموجيات
    const cleanItemsRows = d.itemsRowsCompact.replace(/📤|📥|🔄|🔙|💵|💸|⚖️|🚚|🛒|🛍️|🧺|📦|💰|🌗|✅|⏳/g, '');

    const qrSectionHtml = renderDualQrCodesHtml(d, 82, false);

    return `
    <div style="width:72mm; max-width:72mm; margin:0 auto; font-family:'Arial','Tahoma','Segoe UI',sans-serif; direction:rtl; padding:1mm 2mm; color:#000000; font-size:13.5px; font-weight:900; box-sizing:border-box;">
        <div style="text-align:center; border-bottom:3px solid #000000; padding-bottom:6px; margin-bottom:6px;">
            <div style="font-size:24px; font-weight:900; line-height:1.2; -webkit-text-stroke:0.9px #000;">${d.shopName}</div>
            ${d.shopAddress ? `<div style="font-size:13px; font-weight:900; margin-top:2px; -webkit-text-stroke:0.55px #000;">${d.shopAddress}</div>` : ''}
            ${d.shopPhone   ? `<div style="font-size:13px; font-weight:900; margin-top:2px; -webkit-text-stroke:0.6px #000;">ت: ${d.shopPhone}</div>` : ''}
            <div style="font-size:16px; font-weight:900; border:2.5px solid #000000; padding:4px 20px; display:inline-block; margin-top:6px; border-radius:4px; -webkit-text-stroke:0.8px #000;">${d.docTitle}</div>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:900; margin-bottom:5px; padding:0 3px; -webkit-text-stroke:0.6px #000;">
            <div>كاشير: ${d.cashier}<br>التاريخ: ${d.date}</div>
            <div style="text-align:left;">رقم: <b style="font-size:14.5px; -webkit-text-stroke:0.75px #000;">#${d.invoiceNumber}</b><br>${d.time}</div>
        </div>
        ${!isCashBuyer && d.customer ? `<div style="font-size:13.5px; border-bottom:2.5px solid #000000; padding-bottom:4px; margin-bottom:5px; font-weight:900; padding-right:3px; -webkit-text-stroke:0.7px #000;">العميل: ${d.customer}</div>` : ''}

        <table style="width:100%; border-collapse:collapse; margin-bottom:6px; border-top:2.5px solid #000000; border-bottom:2.5px solid #000000; font-weight:900; table-layout:fixed;">
            <colgroup>
                <col style="width:48%;">
                <col style="width:18%;">
                <col style="width:34%;">
            </colgroup>
            <thead>
                <tr style="border-bottom:2px solid #000000;">
                    <th style="text-align:right; padding:5px 2px; font-size:13px; font-weight:900; -webkit-text-stroke:0.75px #000;">الصنف</th>
                    <th style="text-align:center; padding:5px 1px; font-size:13px; font-weight:900; -webkit-text-stroke:0.75px #000;">الكمية</th>
                    <th style="text-align:center; padding:5px 2px; font-size:13px; font-weight:900; -webkit-text-stroke:0.75px #000;">الإجمالي</th>
                </tr>
            </thead>
            <tbody>${cleanItemsRows}</tbody>
        </table>

        <div style="font-size:13.5px; font-weight:900;">
            <div style="display:flex; justify-content:space-between; font-size:15px; margin:4px 0; -webkit-text-stroke:0.8px #000;">
                <span>مبلغ الفاتورة:</span>
                <span>${parseFloat(d.totalAmount).toFixed(2)} ${typeof getCurrencySymbol === 'function' ? getCurrencySymbol() : 'ج.م'}</span>
            </div>
            ${d.discount && parseFloat(d.discount) > 0 ? `
            <div style="display:flex; justify-content:space-between; margin:2px 0; -webkit-text-stroke:0.7px #000;"><span>خصم (-):</span><span>${parseFloat(d.discount).toFixed(2)}</span></div>
            ` : ''}
            ${d.tax && parseFloat(d.tax) > 0 ? `
            <div style="display:flex; justify-content:space-between; margin:2px 0; -webkit-text-stroke:0.7px #000;"><span>${d.taxLabel} (+):</span><span>${parseFloat(d.tax).toFixed(2)}</span></div>
            ` : ''}
            ${d.globalTax && parseFloat(d.globalTax) > 0 ? `
            <div style="display:flex; justify-content:space-between; margin:2px 0; -webkit-text-stroke:0.7px #000;"><span>ضريبة القيمة المضافة:</span><span>${parseFloat(d.globalTax).toFixed(2)}</span></div>
            ` : ''}
            ${!isCashBuyer && parseFloat(d.prevBalance) !== 0 ? `
            <div style="display:flex; justify-content:space-between; margin:2px 0; -webkit-text-stroke:0.7px #000;"><span>الرصيد السابق:</span><span>${parseFloat(d.prevBalance).toFixed(2)}</span></div>
            <div style="display:flex; justify-content:space-between; font-size:15px; border-top:2.5px solid #000000; border-bottom:2.5px solid #000000; margin:3px 0; padding:4px 0; -webkit-text-stroke:0.85px #000;">
                <span>الإجمالي المطلوب:</span>
                <span>${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance)).toFixed(2)}</span>
            </div>
            ` : ''}
            <div style="display:flex; justify-content:space-between; border-top:2px dashed #000000; padding-top:4px; margin-top:4px; -webkit-text-stroke:0.75px #000;">
                <span>المدفوع:</span>
                <span>${parseFloat(d.paid).toFixed(2)}</span>
            </div>
            ${!isCashBuyer ? `
            <div style="display:flex; justify-content:space-between; font-size:15px; border-top:3px solid #000000; padding-top:5px; margin-top:4px; -webkit-text-stroke:0.9px #000;">
                <span>الرصيد المستحق (الباقي):</span>
                <span>${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance) - parseFloat(d.paid)).toFixed(2)}</span>
            </div>
            ` : (parseFloat(d.paid) > parseFloat(d.totalAmount) ? `
            <div style="display:flex; justify-content:space-between; font-size:14.5px; border-top:2px dashed #000000; padding-top:4px; margin-top:4px; -webkit-text-stroke:0.8px #000;">
                <span>الباقي للعميل:</span>
                <span>${(parseFloat(d.paid) - parseFloat(d.totalAmount)).toFixed(2)}</span>
            </div>
            ` : '')}
        </div>

        <div style="text-align:center; border-top:3px solid #000000; padding-top:6px; margin-top:6px; font-size:14px; font-weight:900;">
            <div style="white-space: pre-line; -webkit-text-stroke:0.7px #000;">${d.footerMsg}</div>

            ${qrSectionHtml}
        </div>
    </div>`;
}

// ─── 57mm Mobile ──────────────────────────────────────────────
function build57mm(d) {
    const isCashBuyer = !d.customer || (window.isGenericCashPartner && window.isGenericCashPartner(d.customer)) || d.customer === '-' || d.customer === '---' || d.customer.includes('نقدي');
    const qrSectionHtml = renderDualQrCodesHtml(d, 66, true);

    return `
    <div style="width:57mm; font-family:'Arial','Tahoma',sans-serif; direction:rtl; padding:2mm; color:#000000; font-size:12px; font-weight:900;">
        <div style="text-align:center; border-bottom:2.5px solid #000; padding-bottom:5px; margin-bottom:5px;">
            <strong style="font-size:16px; -webkit-text-stroke:0.8px #000;">${d.shopName}</strong><br>
            <span style="font-size:13px; font-weight:900; -webkit-text-stroke:0.6px #000;">${d.docTitle}</span>
        </div>
        <div style="font-size:11.5px; margin-bottom:5px; font-weight:900; -webkit-text-stroke:0.55px #000;">
            #${d.invoiceNumber} | ${d.date}<br>
            ${!isCashBuyer && d.customer ? `العميل: ${d.customer}<br>` : ''}
            ${d.cashier  ? `كاشير: ${d.cashier}` : ''}
        </div>
        <table style="width:100%; border-collapse:collapse; border-top:2px solid #000; border-bottom:2px solid #000; margin-bottom:5px;">
            <tr style="border-bottom:2px solid #000;">
                <th style="text-align:right; font-size:12px; -webkit-text-stroke:0.7px #000;">الصنف</th>
                <th style="text-align:center; font-size:12px; -webkit-text-stroke:0.7px #000;">ك</th>
                <th style="text-align:center; font-size:12px; -webkit-text-stroke:0.7px #000;">إجمالي</th>
            </tr>
            ${d.itemsRowsCompact}
        </table>
        <div style="display:flex; justify-content:space-between; font-weight:900; font-size:13px; border-top:2px solid #000; padding-top:4px; -webkit-text-stroke:0.75px #000;">
            <span>مبلغ الفاتورة:</span><span>${parseFloat(d.totalAmount).toFixed(2)}</span>
        </div>
        ${!isCashBuyer && parseFloat(d.prevBalance) !== 0 ? `
        <div style="display:flex; justify-content:space-between; font-size:11.5px; font-weight:900; -webkit-text-stroke:0.6px #000;">
            <span>رصيد سابق:</span><span>${parseFloat(d.prevBalance).toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight:900; font-size:13px; border-top:2px solid #000; padding-top:3px; -webkit-text-stroke:0.8px #000;">
            <span>الإجمالي المطلوب:</span><span>${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance)).toFixed(2)}</span>
        </div>
        ` : ''}
        <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:900; -webkit-text-stroke:0.65px #000;">
            <span>المدفوع:</span><span>${parseFloat(d.paid).toFixed(2)}</span>
        </div>
        ${!isCashBuyer ? `
        <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:900; border-top:2.5px solid #000; padding-top:3px; -webkit-text-stroke:0.85px #000;">
            <span>الرصيد المستحق:</span><span>${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance) - parseFloat(d.paid)).toFixed(2)}</span>
        </div>
        ` : (parseFloat(d.paid) > parseFloat(d.totalAmount) ? `
        <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:900; -webkit-text-stroke:0.65px #000;">
            <span>الباقي:</span><span>${(parseFloat(d.paid) - parseFloat(d.totalAmount)).toFixed(2)}</span>
        </div>
        ` : '')}
        <div style="text-align:center; border-top:2px solid #000; padding-top:5px; margin-top:5px; font-size:11px; font-weight:900; white-space: pre-line; -webkit-text-stroke:0.6px #000;">
            ${d.footerMsg}
            ${qrSectionHtml}
        </div>
    </div>`;
}

// ─── A4 Professional ──────────────────────────────────────────
function buildA4Professional(d) {
    const isCashBuyer = !d.customer || (window.isGenericCashPartner && window.isGenericCashPartner(d.customer)) || d.customer === '-' || d.customer === '---' || d.customer.includes('نقدي');
    const qrSectionHtml = renderDualQrCodesHtml(d, 95, false);

    return `
    <div style="font-family:'Segoe UI',Tahoma,Arial,sans-serif; direction:rtl; padding:30px; background:#fff; color:#333;">
        <div style="display:flex; justify-content:space-between; border-bottom:2px solid #2c3e50; padding-bottom:15px; margin-bottom:20px;">
            <div>
                <h1 style="margin:0; color:#2c3e50; font-size:1.8rem;">${d.shopName}</h1>
                ${d.shopAddress ? `<p style="margin:4px 0 0; color:#7f8c8d;">${d.shopAddress}</p>` : ''}
                ${d.shopPhone   ? `<p style="margin:4px 0 0; color:#7f8c8d;">📞 ${d.shopPhone}</p>` : ''}
            </div>
            <div style="text-align:left;">
                <h2 style="margin:0; color:#e74c3c; font-size:1.5rem;">${d.docTitle}</h2>
                <p style="margin:4px 0 0; font-weight:bold;">رقم المستند: #${d.invoiceNumber}</p>
                <p style="margin:4px 0 0;">التاريخ: ${d.date} ${d.time}</p>
                ${d.dueDate ? `<p style="margin:4px 0 0;">تستحق: ${d.dueDate}</p>` : ''}
            </div>
        </div>

        <div style="background:#f9f9f9; padding:12px; border-radius:6px; margin-bottom:20px; display:flex; justify-content:space-between;">
            <div>
                ${!isCashBuyer && d.customer ? `<p style="margin:0;"><strong>العميل:</strong> ${d.customer}</p>` : '<p style="margin:0;"><strong>العميل:</strong> عميل نقدي</p>'}
            </div>
            <div>
                ${d.cashier ? `<p style="margin:0;"><strong>الكاشير:</strong> ${d.cashier}</p>` : ''}
                <p style="margin:0;"><strong>نوع الفاتورة:</strong> ${d.invoiceType}</p>
            </div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:0.9rem; table-layout:fixed; box-sizing:border-box;">
            <colgroup>
                <col style="width:44%;">
                <col style="width:18%;">
                <col style="width:18%;">
                <col style="width:20%;">
            </colgroup>
            <thead>
                <tr style="background:#2c3e50; color:#fff;">
                    <th style="padding:10px; text-align:right; border:1px solid #34495e; overflow:hidden;">اسم الصنف</th>
                    <th style="padding:10px; text-align:center; border:1px solid #34495e;">الكمية</th>
                    <th style="padding:10px; text-align:center; border:1px solid #34495e;">السعر</th>
                    <th style="padding:10px; text-align:center; border:1px solid #34495e;">الإجمالى</th>
                </tr>
            </thead>
            <tbody>${d.itemsRowsFull}</tbody>
        </table>

        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="text-align:center; padding:5px;">
                ${qrSectionHtml}
            </div>
            <table style="width:300px; background:#f9f9f9; padding:15px; border-radius:6px; border:1px solid #eee;">
                <tr>
                    <td style="font-weight:bold; color:#2c3e50; padding:4px 0;">مبلغ الفاتورة:</td>
                    <td style="text-align:left; font-weight:bold;">${parseFloat(d.totalAmount).toFixed(2)}</td>
                </tr>
                ${!isCashBuyer && parseFloat(d.prevBalance) !== 0 ? `
                <tr>
                    <td style="padding:3px 0;">الرصيد السابق:</td>
                    <td style="text-align:left;">${parseFloat(d.prevBalance).toFixed(2)}</td>
                </tr>
                <tr style="background:#eef2f6;">
                    <td style="font-weight:bold; padding:4px 0;">الإجمالي المطلوب:</td>
                    <td style="text-align:left; font-weight:bold;">${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance)).toFixed(2)}</td>
                </tr>
                ` : ''}
                <tr>
                    <td style="color:#27ae60; font-weight:bold; padding:3px 0;">المدفوع:</td>
                    <td style="text-align:left; font-weight:bold; color:#27ae60;">${parseFloat(d.paid).toFixed(2)}</td>
                </tr>
                ${!isCashBuyer ? `
                <tr style="background:#fef2f2;">
                    <td style="color:#c0392b; font-weight:bold; padding:4px 0;">الرصيد المستحق (الباقي):</td>
                    <td style="text-align:left; font-weight:bold; color:#c0392b;">${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance) - parseFloat(d.paid)).toFixed(2)}</td>
                </tr>
                ` : (parseFloat(d.paid) > parseFloat(d.totalAmount) ? `
                <tr>
                    <td style="padding:3px 0;">الباقي للعميل:</td>
                    <td style="text-align:left;">${(parseFloat(d.paid) - parseFloat(d.totalAmount)).toFixed(2)}</td>
                </tr>
                ` : '')}
            </table>
        </div>

        <div style="margin-top:40px; text-align:center; border-top:1px solid #ddd; padding-top:15px; color:#7f8c8d;">
            <p style="white-space: pre-line;">${d.footerMsg}</p>
            <p style="font-size:0.8rem; margin-top:5px;">بيان POS - نظام مبيعات متكامل</p>
        </div>
    </div>`;
}

// ─── A5 Modern ────────────────────────────────────────────────
function buildA5Modern(d) {
    const isCashBuyer = !d.customer || (window.isGenericCashPartner && window.isGenericCashPartner(d.customer)) || d.customer === '-' || d.customer === '---' || d.customer.includes('نقدي');
    const qrSectionHtml = renderDualQrCodesHtml(d, 85, false);

    return `
    <div style="font-family:'Segoe UI',Tahoma,Arial,sans-serif; direction:rtl; padding:20px; background:#fff; color:#333; width:148mm;">
        <div style="text-align:center; margin-bottom:15px; border-bottom:2px solid #e67e22; padding-bottom:10px;">
            <h1 style="margin:0; color:#34495e; font-size:1.4rem;">${d.shopName}</h1>
            ${d.shopAddress ? `<p style="margin:3px 0; font-size:0.85rem; color:#7f8c8d;">${d.shopAddress}</p>` : ''}
            <h2 style="margin:6px 0 0; color:#e67e22; font-size:1.1rem;">${d.docTitle}</h2>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; background:#f9f9f9; padding:10px; border-radius:5px; margin-bottom:15px; font-size:0.85rem;">
            <div><b>رقم المستند:</b> #${d.invoiceNumber}</div>
            <div><b>التاريخ:</b> ${d.date}</div>
            <div><b>نوع الفاتورة:</b> ${d.invoiceType}</div>
            <div><b>الوقت:</b> ${d.time}</div>
            ${!isCashBuyer && d.customer ? `<div><b>العميل:</b> ${d.customer}</div>` : '<div><b>العميل:</b> عميل نقدي</div>'}
            ${d.cashier  ? `<div><b>الكاشير:</b> ${d.cashier}</div>` : ''}
            ${d.dueDate  ? `<div><b>تستحق:</b> ${d.dueDate}</div>` : ''}
        </div>

        <table style="width:100%; border-collapse:collapse; margin-bottom:15px; font-size:0.85rem;">
            <thead>
                <tr style="background:#ecf0f1; border-bottom:2px solid #bdc3c7;">
                    <th style="padding:7px; text-align:right;">الصنف</th>
                    <th style="padding:7px; text-align:center;">الكمية</th>
                    <th style="padding:7px; text-align:center;">السعر</th>
                    <th style="padding:7px; text-align:center;">الإجمالى</th>
                </tr>
            </thead>
            <tbody>${d.itemsRowsFull}</tbody>
        </table>

        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
            <div style="text-align:center;">
                ${qrSectionHtml}
            </div>
            <table style="width:60%; font-size:0.9rem; border-top:2px solid #34495e;">
                <tr>
                    <td style="font-weight:bold; padding:4px 0;">مبلغ الفاتورة:</td>
                    <td style="text-align:left; font-weight:bold; font-size:1.05rem;">${parseFloat(d.totalAmount).toFixed(2)} ${typeof getCurrencySymbol === 'function' ? getCurrencySymbol() : 'ج.م'}</td>
                </tr>
                ${!isCashBuyer && parseFloat(d.prevBalance) !== 0 ? `
                <tr>
                    <td style="padding:3px 0;">الرصيد السابق:</td>
                    <td style="text-align:left;">${parseFloat(d.prevBalance).toFixed(2)}</td>
                </tr>
                <tr style="background:#eef2f6;">
                    <td style="font-weight:bold; padding:4px 0;">الإجمالي المطلوب:</td>
                    <td style="text-align:left; font-weight:bold;">${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance)).toFixed(2)}</td>
                </tr>
                ` : ''}
                <tr>
                    <td style="color:#27ae60; font-weight:bold; padding:3px 0;">المدفوع:</td>
                    <td style="text-align:left; color:#27ae60; font-weight:bold;">${parseFloat(d.paid).toFixed(2)}</td>
                </tr>
                ${!isCashBuyer ? `
                <tr style="background:#fef2f2;">
                    <td style="color:#c0392b; font-weight:bold; padding:4px 0;">الرصيد المستحق (الباقي):</td>
                    <td style="text-align:left; font-weight:bold; color:#c0392b;">${(parseFloat(d.totalAmount) + parseFloat(d.prevBalance) - parseFloat(d.paid)).toFixed(2)}</td>
                </tr>
                ` : (parseFloat(d.paid) > parseFloat(d.totalAmount) ? `
                <tr>
                    <td style="padding:3px 0;">الباقي للعميل:</td>
                    <td style="text-align:left;">${(parseFloat(d.paid) - parseFloat(d.totalAmount)).toFixed(2)}</td>
                </tr>
                ` : '')}
            </table>
        </div>

        <div style="text-align:center; margin-top:20px; font-size:0.8rem; color:#7f8c8d; border-top:1px dashed #bdc3c7; padding-top:10px;">
            <p style="white-space: pre-line;">${d.footerMsg}</p>
            <p>بيان POS</p>
        </div>
    </div>`;
}
