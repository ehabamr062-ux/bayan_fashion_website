/**
 * ==============================================================================
 *  بَيَان فاشون POS - كود المراقبة والمتابعة التلقائية في Google Sheets
 *  Bayan POS Fashion - Silent Cloud Telemetry Google Apps Script
 * ==============================================================================
 * 
 * طريقة التركيب السريعة في 3 خطوات:
 * 1. افتح جدول بيانات جديد في Google Sheets وسمّه مثلاً: "متابعة عملاء بَيَان POS".
 * 2. من القائمة العلوية اضغط على: (الامتدادات Extensions) -> ثم (Apps Script).
 * 3. امسح أي كود موجود هناك، والصق هذا الكود بالكامل، ثم اضغط على أيقونة الحفظ (Save 💾).
 * 4. اضغط على الزر الأزرق في الأعلى (نشر Deploy) -> ثم (نشر جديد New deployment).
 *    - اضغط على الترس ⚙️ واختر (تطبيق ويب Web app).
 *    - في خانة "من يملك حق الوصول Who has access" اختر: (الجميع Anyone).
 *    - اضغط (نشر Deploy)، وانسخ رابط تطبيق الويب (Web app URL).
 * 5. ضع الرابط المنسوخ في ملف js/cloud_telemetry.js داخل متغير GOOGLE_SCRIPT_URL.
 * ==============================================================================
 */

// إعداد الترويسة وتجهيز الشيت تلقائياً
function setupSheetHeaders(sheet) {
  var headers = [
    "معرف الجهاز (HWID)",
    "اسم المحل",
    "رقم الهاتف",
    "الفواتير المستهلكة",
    "الفواتير المتبقية بالضبط",
    "نسبة الاستهلاك",
    "حالة التجربة",
    "الباقة الحالية",
    "تاريخ أول تشغيل",
    "تاريخ آخر عملية",
    "إصدار النظام",
    "تحديث أخير",
    "أمر الإدارة (Admin Action)"
  ];
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    var range = sheet.getRange(1, 1, 1, headers.length);
    range.setFontWeight("bold");
    range.setBackground("#0f172a");
    range.setFontColor("#f8fafc");
    range.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    
    // ضبط أحجام الأعمدة لقراءة مريحة
    sheet.setColumnWidth(1, 210); // HWID
    sheet.setColumnWidth(2, 170); // Shop Name
    sheet.setColumnWidth(3, 140); // Phone
    sheet.setColumnWidth(4, 150); // Invoices Count
    sheet.setColumnWidth(5, 170); // Invoices Remaining [NEW]
    sheet.setColumnWidth(6, 130); // Percentage
    sheet.setColumnWidth(7, 170); // Status
    sheet.setColumnWidth(8, 140); // Plan
    sheet.setColumnWidth(9, 160); // Install Date
    sheet.setColumnWidth(10, 170); // Last Active
    sheet.setColumnWidth(11, 110); // Version
    sheet.setColumnWidth(12, 170); // Updated At
    sheet.setColumnWidth(13, 190); // Admin Action
  } else {
    var col5Val = String(sheet.getRange(1, 5).getValue() || '');
    // إذا لم يكن العمود 5 هو الفواتير المتبقية، نقوم بإدراجه وتحديث الترويسات تلقائياً
    if (!col5Val.includes('المتبقية')) {
      sheet.insertColumnAfter(4);
      sheet.setColumnWidth(5, 170);
    }
    
    // التأكد من وجود عمود أمر الإدارة في العمود 13
    if (sheet.getLastColumn() < 13) {
      sheet.getRange(1, 13).setValue("أمر الإدارة (Admin Action)")
        .setFontWeight("bold")
        .setBackground("#b91c1c")
        .setFontColor("#f8fafc")
        .setHorizontalAlignment("center");
      sheet.setColumnWidth(13, 190);
    }

    // كتابة الترويسات وتنسيقها
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#0f172a");
    headerRange.setFontColor("#f8fafc");
    headerRange.setHorizontalAlignment("center");

    // تمييز عمود المتبقي بالضبط بلون أزرق سماوي وعمود أمر الإدارة بلون أحمر
    sheet.getRange(1, 5).setBackground("#0284c7").setFontColor("#ffffff");
    sheet.getRange(1, 13).setBackground("#b91c1c").setFontColor("#ffffff");
  }
}

// دالة تحليل وتفسير أوامر الإدارة المكتوبة في الشيت
function parseAdminCommand(cmd) {
  var str = String(cmd || '').trim();
  if (!str) return { type: 'NORMAL', raw: '' };
  
  var lower = str.toLowerCase();
  
  // 1. أمر الحظر / الإيقاف
  if (str.includes('حظر') || lower.includes('block') || str.includes('إيقاف') || str.includes('ايقاف') || lower.includes('suspend') || lower.includes('kill')) {
    return {
      type: 'BLOCK',
      raw: str,
      message: 'تم تعليق ترخيص وصلاحية هذا الجهاز بقرار من إدارة بَيَان POS.\nيرجى التواصل مع إدارة النظام والدعم الفني للمتابعة.'
    };
  }
  
  // 2. أمر فك الحظر / السماح
  if (str.includes('فك') || str.includes('سماح') || lower.includes('unblock') || str.includes('عادي') || lower.includes('normal')) {
    return {
      type: 'UNBLOCK',
      raw: str,
      message: 'تم إلغاء الحظر واستعادة صلاحيات النظام بنجاح.'
    };
  }
  
  // 3. أمر تمديد أو إضافة فواتير تجريبية (مثل: +10 أو تمديد 10 أو زيادة 20 أو إضافة 15 أو منح 10 أو فتح 10)
  var matchExtend = str.match(/(?:تمديد|\+|زيادة|إضافة|اضافة|منح|فتح|extend|add)\s*(\d+)/i);
  if (matchExtend && matchExtend[1]) {
    var extra = parseInt(matchExtend[1], 10) || 0;
    var newTotal = 200 + extra;
    return {
      type: 'EXTEND_TRIAL',
      raw: str,
      extraLimit: extra,
      totalLimit: newTotal,
      message: 'تم منحك ' + extra + ' فاتورة إضافية لتجربة المنظومة من قبل المطور والإدارة (الحد الإجمالي: ' + newTotal + ' فاتورة).'
    };
  }

  // 3.1 أمر تعيين الحد الإجمالي المباشر (مثل: الحد 210 أو إجمالي 220 أو حد 250 أو limit 210)
  var matchTotal = str.match(/(?:الحد|إجمالي|اجمالي|حد|limit|total)\s*(\d+)/i);
  if (matchTotal && matchTotal[1]) {
    var total = parseInt(matchTotal[1], 10) || 200;
    var extraDiff = Math.max(0, total - 200);
    return {
      type: 'EXTEND_TRIAL',
      raw: str,
      extraLimit: extraDiff,
      totalLimit: total,
      message: 'تم ضبط الحد الأقصى للفواتير التجريبية إلى ' + total + ' فاتورة بقرار من المطور.'
    };
  }

  // 3.2 أمر تصفير أو إلغاء التمديد وإعادته للـ 200 الأساسية
  if (str.includes('تصفير') || str.includes('إلغاء التمديد') || str.includes('الغاء التمديد') || lower.includes('reset')) {
    return {
      type: 'RESET_TRIAL',
      raw: str,
      extraLimit: 0,
      totalLimit: 200,
      message: 'تم إعادة الحد التجريبي للوضع الافتراضي (200 فاتورة).'
    };
  }
  
  // 4. أمر التفعيل عن بُعد (دائم / سنوي / شهري)
  if (str.includes('تفعيل دائم') || str.includes('مدى الحياة') || lower.includes('lifetime')) {
    return { type: 'ACTIVATE', raw: str, plan: 'الباقة مدى الحياة', message: 'تم تفعيل باقة مدى الحياة بنجاح.' };
  }
  if (str.includes('تفعيل شهر') || lower.includes('monthly')) {
    return { type: 'ACTIVATE', raw: str, plan: 'الباقة الشهرية', message: 'تم تفعيل الباقة الشهرية بنجاح.' };
  }
  if (str.includes('تفعيل سنة') || lower.includes('annual') || lower.includes('yearly')) {
    return { type: 'ACTIVATE', raw: str, plan: 'الباقة السنوية', message: 'تم تفعيل الباقة السنوية بنجاح.' };
  }
  
  return { type: 'NORMAL', raw: str };
}

// الدالة الرئيسية لاستقبال التقارير وتحديث السطر المناسب
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    setupSheetHeaders(sheet);

    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var machineId = data.machineId || "UNKNOWN-HWID";
    var shopName = data.shopName || "غير محدد";
    var phone = data.phone || "---";
    var trialCount = parseInt(data.trialCount, 10) || 0;
    var maxLimit = parseInt(data.maxLimit, 10) || 200;
    var plan = data.currentPlan || "باقة نسخة المجانية";
    var status = data.status || "نشطة";
    var installDate = data.installDate || "---";
    var lastActive = data.lastActive || new Date().toLocaleString("ar-EG");
    var version = data.appVersion || "V3.1.2";
    var timestampNow = new Date().toLocaleString("ar-EG");

    // البحث هل هذا الجهاز مسجل مسبقاً في الشيت؟
    var lastRow = sheet.getLastRow();
    var existingRow = -1;
    var currentAdminAction = "";

    if (lastRow > 1) {
      var idRange = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < idRange.length; i++) {
        if (idRange[i][0] && String(idRange[i][0]).trim().toUpperCase() === String(machineId).trim().toUpperCase()) {
          existingRow = i + 2;
          break;
        }
      }
    }

    // قراءة أمر الإدارة المسجل مسبقاً للجهاز في العمود 13
    if (existingRow > 0) {
      try {
        currentAdminAction = sheet.getRange(existingRow, 13).getValue();
      } catch(e) {}
    }

    var parsedCmd = parseAdminCommand(currentAdminAction);

    // إذا كان هناك تمديد للفواتير في أمر الإدارة
    if (parsedCmd.type === 'EXTEND_TRIAL') {
      if (parsedCmd.totalLimit) {
        maxLimit = parsedCmd.totalLimit;
      } else if (parsedCmd.extraLimit > 0) {
        maxLimit = 200 + parsedCmd.extraLimit;
      }
    } else if (parsedCmd.type === 'RESET_TRIAL') {
      maxLimit = 200;
    }

    var invoicesDisplay = trialCount + " / " + maxLimit + " فاتورة";
    var remaining = Math.max(0, maxLimit - trialCount);
    var remainingDisplay = "";
    if (plan !== "باقة نسخة المجانية" && !plan.includes("تجريب")) {
      remainingDisplay = "👑 غير محدود (مشترك)";
    } else if (remaining === 0) {
      remainingDisplay = "🛑 0 (انتهت التجربة)";
    } else {
      remainingDisplay = "⏳ " + remaining + " متبقية";
    }

    var percentage = Math.min(100, Math.round((trialCount / maxLimit) * 100)) + "%";

    // تحديد حالة التجربة مع إيموجي مميز
    var statusDisplay = status;
    if (parsedCmd.type === 'BLOCK') {
      statusDisplay = "⛔ محظور بقرار الإدارة";
    } else if (plan !== "باقة نسخة المجانية" && !plan.includes("تجريب")) {
      statusDisplay = "👑 مشترك (باقة مدفوعة)";
    } else if (trialCount >= maxLimit) {
      statusDisplay = "🛑 انتهت التجربة (" + maxLimit + "/" + maxLimit + ")";
    } else if (trialCount >= (maxLimit - 40)) {
      statusDisplay = "⚠️ قاربت على الانتهاء (" + remaining + " متبقي)";
    } else {
      statusDisplay = "🌱 تجربة نشطة (" + remaining + " متبقي)";
    }

    var rowValues = [
      machineId,
      shopName,
      phone,
      invoicesDisplay,
      remainingDisplay,
      percentage,
      statusDisplay,
      plan,
      installDate,
      lastActive,
      version,
      timestampNow
    ];

    if (existingRow > 0) {
      // تحديث الأعمدة من 1 إلى 12 دون مسح أمر الإدارة الموجود في العمود 13
      sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
      applyStatusColor(sheet, existingRow, trialCount, maxLimit, plan, parsedCmd.type);
    } else {
      // إضافة سطر جديد للجهاز مع عمود أمر الإدارة فارغاً
      rowValues.push("");
      sheet.appendRow(rowValues);
      var newRow = sheet.getLastRow();
      applyStatusColor(sheet, newRow, trialCount, maxLimit, plan, parsedCmd.type);
    }

    // إرجاع رد JSON متكامل يتضمن أمر الإدارة الواجب تنفيذه على جهاز العميل
    var responseObj = {
      status: "success",
      updatedRow: existingRow > 0 ? existingRow : sheet.getLastRow(),
      command: parsedCmd.type,
      rawCommand: parsedCmd.raw,
      extraLimit: parsedCmd.extraLimit || 0,
      totalLimit: parsedCmd.totalLimit || (200 + (parsedCmd.extraLimit || 0)),
      commandId: 'CMD-' + (parsedCmd.type) + '-' + (parsedCmd.extraLimit || 0) + '-' + (parsedCmd.raw || '').replace(/\s+/g, ''),
      plan: parsedCmd.plan || "",
      message: parsedCmd.message || ""
    };

    return ContentService.createTextOutput(JSON.stringify(responseObj))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// تلوين السطر تلقائياً حسب حالة الاستهلاك وأمر الإدارة
function applyStatusColor(sheet, rowNum, count, limit, plan, cmdType) {
  try {
    var statusCell = sheet.getRange(rowNum, 7);
    if (cmdType === 'BLOCK') {
      statusCell.setBackground("#450a0a").setFontColor("#fca5a5").setFontWeight("bold"); // أحمر داكن جداً
    } else if (plan !== "باقة نسخة المجانية" && !plan.includes("تجريب")) {
      statusCell.setBackground("#dbeafe").setFontColor("#1e40af").setFontWeight("bold"); // أزرق هادئ
    } else if (count >= limit) {
      statusCell.setBackground("#fee2e2").setFontColor("#991b1b").setFontWeight("bold"); // أحمر تحذيري
    } else if (count >= (limit - 40)) {
      statusCell.setBackground("#fef3c7").setFontColor("#92400e").setFontWeight("bold"); // أصفر تنبيهي
    } else {
      statusCell.setBackground("#dcfce7").setFontColor("#166534").setFontWeight("bold"); // أخضر سارٍ
    }
  } catch (e) {}
}

// دالة GET للتحقق من الأوامر أو فحص صحة الرابط
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'check_command') {
      var machineId = e.parameter.machineId || '';
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sheet = ss.getActiveSheet();
      setupSheetHeaders(sheet);
      
      var lastRow = sheet.getLastRow();
      var foundRow = -1;
      var currentAdminAction = "";
      
      if (lastRow > 1 && machineId) {
        var idRange = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var i = 0; i < idRange.length; i++) {
          if (idRange[i][0] && String(idRange[i][0]).trim().toUpperCase() === String(machineId).trim().toUpperCase()) {
            foundRow = i + 2;
            break;
          }
        }
      }
      
      if (foundRow > 0) {
        currentAdminAction = sheet.getRange(foundRow, 13).getValue();
      }
      
      var parsedCmd = parseAdminCommand(currentAdminAction);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        machineId: machineId,
        command: parsedCmd.type,
        rawCommand: parsedCmd.raw,
        extraLimit: parsedCmd.extraLimit || 0,
        totalLimit: parsedCmd.totalLimit || (200 + (parsedCmd.extraLimit || 0)),
        commandId: 'CMD-' + (parsedCmd.type) + '-' + (parsedCmd.extraLimit || 0) + '-' + (parsedCmd.raw || '').replace(/\s+/g, ''),
        plan: parsedCmd.plan || "",
        message: parsedCmd.message || ""
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput("✅ خادم استقبال بيانات وأوامر بَيَان فاشون POS يعمل بنجاح ومستعد لاستقبال التقارير وتنفيذ أوامر الإدارة!");
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
