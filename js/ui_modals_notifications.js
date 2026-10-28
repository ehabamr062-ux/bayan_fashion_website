// ============================================================
//  النوافذ المنبثقة، الإشعارات، ومعاينة الفواتير (Modals & Notifications)
// ============================================================
        window.acknowledgeCloudFromNotify = function(cloudId) {
            if (!cloudId) return;
            const cloudHistory = (window.cloudAnnouncementsHistory && Array.isArray(window.cloudAnnouncementsHistory))
                ? window.cloudAnnouncementsHistory
                : [];
            const item = cloudHistory.find(c => String(c.id) === String(cloudId)) || {};
            const title = item.title || 'إشعار سحابي';
            const cleanDetails = String(item.message || '').replace(/\r?\n/g, ' ').slice(0, 100);
            if (typeof window.acknowledgeNotification === 'function') {
                window.acknowledgeNotification('cloud', String(cloudId), {
                    name: title,
                    details: cleanDetails,
                    typeLabel: 'إشعار سحابي'
                }, 'cloud');
            }
        };

        window.showNotificationsModal = function(activeTab = null) {
            // 1. استدعاء الإحصائيات الشاملة من المصدر الموحد للحقيقة (Single Source of Truth)
            const stats = (typeof window.getSystemNotificationsStats === 'function') 
                ? window.getSystemNotificationsStats() 
                : {
                    allLowStock: [], activeLowStock: [], archivedLowStock: [],
                    allExpiring: [], activeExpiring: [], archivedExpiring: [],
                    allDebtAccounts: [], activeDebt: [], archivedDebt: [],
                    allDelayed: [], activeDelayed: [], archivedDelayed: [],
                    pendingTransfersList: [], activeTransfers: [], activeTransfersCount: 0,
                    cloudHistory: [], activeCloud: [], activeCloudCount: 0,
                    activeProductsTotal: 0, activeAccountsTotal: 0,
                    totalActiveCount: 0, totalReceiptCount: 0,
                    activeWH: 'المخزن الرئيسي'
                };

            const {
                activeLowStock, archivedLowStock,
                activeExpiring, archivedExpiring,
                activeDebt, archivedDebt,
                activeDelayed, archivedDelayed,
                pendingTransfersList = [], receivedTransfersList = [], allTransfersList = [], activeTransfers = [], activeTransfersCount = 0,
                cloudHistory = [], activeCloud = [], activeCloudCount = 0,
                activeProductsTotal = 0, activeAccountsTotal = 0,
                totalActiveCount = 0, activeWH = 'المخزن الرئيسي', canViewAccounts = true
            } = stats;

            const receiptLog = (window.bayanReceiptLog && Array.isArray(window.bayanReceiptLog)) ? window.bayanReceiptLog : [];
            const totalReceiptCount = receiptLog.length;

            // 2. التحديد الذكي للتبويب الافتراضي مع احترام الصلاحيات
            if (!activeTab) {
                if (activeTransfersCount > 0) activeTab = 'transfers';
                else if (activeProductsTotal > 0) activeTab = 'products';
                else if (canViewAccounts && activeAccountsTotal > 0) activeTab = 'accounts';
                else if (activeCloudCount > 0) activeTab = 'cloud';
                else activeTab = 'products';
            }
            if (activeTab === 'accounts' && !canViewAccounts) {
                activeTab = 'products';
            }

            // 3. تحديث شارة الجرس في الهيدر فوراً وبدقة تامة لمنع أي التباس في الأرقام
            const topBell = document.getElementById('bellBadge') || document.getElementById('notificationsBadge');
            const bellContainer = document.querySelector('.notification-bell');
            if (topBell) {
                topBell.innerText = totalActiveCount > 99 ? '99+' : totalActiveCount;
                topBell.style.display = totalActiveCount > 0 ? 'flex' : 'none';
            }
            if (bellContainer) {
                if (totalActiveCount > 0) bellContainer.classList.add('has-active-notifications');
                else bellContainer.classList.remove('has-active-notifications');
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // دوال مساعدة لإنشاء صفوف الجداول بتصميم حديث وفخم وحماية تامة ضد أخطاء الرموز والأسطر
            const escapeStr = (str) => String(str || '')
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '&quot;')
                .replace(/\r?\n/g, ' ');
            const escapeHtml = (str) => String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            const modalContent = `
                <div class="glass-card-premium" style="background: #ffffff; border: 1px solid #cbd5e1; padding: 0; border-radius: 24px; width: 1080px; max-width: 96vw; height: 86vh; max-height: 860px; overflow: hidden; box-shadow: 0 16px 36px rgba(15, 23, 42, 0.22); display: flex; flex-direction: column; direction: rtl; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">

                    <!-- Header بتدرج كحلي ملكي فخم وعالي التباين مع ملخص ذكي -->
                    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 18px 28px; display: flex; justify-content: space-between; align-items: center; color: #ffffff; border-bottom: 1px solid rgba(255,255,255,0.22); position: relative; flex-shrink: 0; box-shadow: 0 4px 20px rgba(30, 58, 138, 0.25);">
                        <div style="display:flex; align-items:center; gap:14px;">
                            <div style="width: 44px; height: 44px; border-radius: 14px; background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; font-size: 1.35rem; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15); border: 1px solid rgba(255,255,255,0.35); flex-shrink: 0;">
                                🔔
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.28rem; font-weight: 700; color: #ffffff; letter-spacing: -0.3px; display:flex; align-items:center; gap:10px;">
                                    مركز إدارة التنبيهات وسجل الاستلام
                                    ${totalActiveCount > 0 ? `<span style="background: linear-gradient(135deg, #ef4444, #dc2626); color: #ffffff; font-size: 0.74rem; font-weight: 800; padding: 3px 10px; border-radius: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); letter-spacing: 0; border: 1px solid rgba(255,255,255,0.35);">${totalActiveCount} تنبيه نشط</span>` : '<span style="background: rgba(16, 185, 129, 0.95); color: #ffffff; font-size: 0.75rem; font-weight: 800; padding: 3px 12px; border-radius: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); border: 1px solid rgba(255,255,255,0.35);">مستقر ومكتمل</span>'}
                                </h3>
                                <div style="font-size: 0.8rem; color: #ffffff; font-weight: 600; margin-top: 6px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                                    <span style="background: rgba(255, 255, 255, 0.15); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.3); font-weight: 600; padding: 3px 12px; border-radius: 10px; backdrop-filter: blur(6px); display: inline-flex; align-items: center; gap: 6px;">🏬 المعين المالي: <b style="color: #ffffff; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${escapeStr(activeWH)}</b></span>
                                    <span style="color: rgba(255,255,255,0.6);">•</span>
                                    <span style="background: rgba(255, 255, 255, 0.15); color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.3); font-weight: 600; padding: 3px 12px; border-radius: 10px; backdrop-filter: blur(6px); display: inline-flex; align-items: center; gap: 6px;">📋 التنبيهات الموثقة بالسجل: <b style="color: #fef08a; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">${totalReceiptCount}</b></span>
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; align-items: center; gap: 12px;">
                            ${(totalActiveCount > 0 && activeTab !== 'transfers') ? `
                                <button onclick="acknowledgeAllNotifications('${activeTab}')" style="background: rgba(255, 255, 255, 0.18); border: 1.5px solid rgba(255, 255, 255, 0.4); color: #ffffff; padding: 7px 16px; border-radius: 10px; cursor: pointer; font-size: 0.84rem; font-weight: 800; display: flex; align-items: center; gap: 6px; transition: all 0.2s; backdrop-filter: blur(4px); box-shadow: 0 2px 8px rgba(0,0,0,0.15);" onmouseover="this.style.background='rgba(16, 185, 129, 0.9)'; this.style.borderColor='#10b981'; this.style.transform='translateY(-1px)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.18)'; this.style.borderColor='rgba(255, 255, 255, 0.4)'; this.style.transform='none';">
                                    <span>✔️</span> استلام وتوثيق الكل
                                </button>
                            ` : ''}
                            <button onclick="document.getElementById('notifyModal').remove()" style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.35); color: #ffffff; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 1.35rem; display: flex; align-items: center; justify-content: center; font-weight: bold; transition: all 0.2s; backdrop-filter: blur(4px); box-shadow: 0 2px 8px rgba(0,0,0,0.15);" onmouseover="this.style.background='rgba(239, 68, 68, 0.85)'; this.style.borderColor='rgba(239, 68, 68, 1)'; this.style.transform='scale(1.08)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'; this.style.borderColor='rgba(255, 255, 255, 0.35)'; this.style.transform='none';">&times;</button>
                        </div>
                    </div>

                    <!-- Body Layout (Sidebar Right + Content Area Left) -->
                    <div style="display: flex; flex: 1; min-height: 0; overflow: hidden; background: #ffffff;">

                        <!-- الشريط الجانبي الأيمن للتبويبات (Vertical Sidebar Tabs) -->
                        <div style="width: 240px; min-width: 240px; max-width: 240px; background: #f8fafc; border-left: 1.5px solid #e2e8f0; display: flex; flex-direction: column; gap: 8px; padding: 18px 12px; overflow-y: auto;" class="fast-scrollbar">

                            <!-- 1. تبويب البضاعة والصلاحية -->
                            <div onclick="showNotificationsModal('products')"
                                 style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 12px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); user-select: none;
                                        background: ${activeTab === 'products' ? '#ecfdf5' : '#ffffff'};
                                        border: 1.5px solid ${activeTab === 'products' ? '#10b981' : '#e2e8f0'};
                                        border-right: ${activeTab === 'products' ? '4px solid #10b981' : '1.5px solid #e2e8f0'};
                                        color: ${activeTab === 'products' ? '#065f46' : '#475569'};
                                        box-shadow: ${activeTab === 'products' ? '0 3px 10px rgba(16, 185, 129, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)'};"
                                 onmouseover="if('${activeTab}' !== 'products'){ this.style.background='#f1f5f9'; this.style.borderColor='#cbd5e1'; this.style.transform='translateX(-4px)'; }"
                                 onmouseout="if('${activeTab}' !== 'products'){ this.style.background='#ffffff'; this.style.borderColor='#e2e8f0'; this.style.transform='none'; }">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 1.15rem; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: ${activeTab === 'products' ? '#a7f3d0' : '#f8fafc'}; color: ${activeTab === 'products' ? '#047857' : '#64748b'};">
                                        📦
                                    </span>
                                    <span style="font-weight: 900; font-size: 0.88rem;">البضاعة والصلاحية</span>
                                </div>
                                <span style="background: ${activeProductsTotal > 0 ? '#ef4444' : (activeTab === 'products' ? '#a7f3d0' : '#f1f5f9')};
                                             color: ${activeProductsTotal > 0 ? '#ffffff' : (activeTab === 'products' ? '#065f46' : '#64748b')};
                                             font-size: 0.74rem; font-weight: 900; padding: 2px 9px; border-radius: 12px; min-width: 24px; text-align: center;
                                             ${activeProductsTotal > 0 ? 'box-shadow: 0 2px 6px rgba(239, 68, 68, 0.35);' : ''}">
                                    ${activeProductsTotal}
                                </span>
                            </div>

                            <!-- 2. تبويب تسهيلات واردة (التحويلات) -->
                            <div onclick="showNotificationsModal('transfers')"
                                 style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 12px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); user-select: none;
                                        background: ${activeTab === 'transfers' ? '#ecfdf5' : '#ffffff'};
                                        border: 1.5px solid ${activeTab === 'transfers' ? '#059669' : '#e2e8f0'};
                                        border-right: ${activeTab === 'transfers' ? '4px solid #059669' : '1.5px solid #e2e8f0'};
                                        color: ${activeTab === 'transfers' ? '#065f46' : '#475569'};
                                        box-shadow: ${activeTab === 'transfers' ? '0 3px 10px rgba(5, 150, 105, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)'};"
                                 onmouseover="if('${activeTab}' !== 'transfers'){ this.style.background='#f1f5f9'; this.style.borderColor='#cbd5e1'; this.style.transform='translateX(-4px)'; }"
                                 onmouseout="if('${activeTab}' !== 'transfers'){ this.style.background='#ffffff'; this.style.borderColor='#e2e8f0'; this.style.transform='none'; }">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 1.15rem; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: ${activeTab === 'transfers' ? '#a7f3d0' : '#f8fafc'}; color: ${activeTab === 'transfers' ? '#047857' : '#64748b'};">
                                        💳
                                    </span>
                                    <span style="font-weight: 900; font-size: 0.88rem;">تسهيلات واردة</span>
                                </div>
                                <span style="background: ${activeTransfersCount > 0 ? '#059669' : (activeTab === 'transfers' ? '#a7f3d0' : '#f1f5f9')};
                                             color: ${activeTransfersCount > 0 ? '#ffffff' : (activeTab === 'transfers' ? '#065f46' : '#64748b')};
                                             font-size: 0.74rem; font-weight: 900; padding: 2px 9px; border-radius: 12px; min-width: 24px; text-align: center;
                                             ${activeTransfersCount > 0 ? 'box-shadow: 0 2px 6px rgba(5, 150, 105, 0.35);' : ''}">
                                    ${activeTransfersCount}
                                </span>
                            </div>

                            <!-- 3. تبويب تنبيهات الحسابات -->
                            ${canViewAccounts ? `
                            <div onclick="showNotificationsModal('accounts')"
                                 style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 12px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); user-select: none;
                                        background: ${activeTab === 'accounts' ? '#ecfdf5' : '#ffffff'};
                                        border: 1.5px solid ${activeTab === 'accounts' ? '#10b981' : '#e2e8f0'};
                                        border-right: ${activeTab === 'accounts' ? '4px solid #10b981' : '1.5px solid #e2e8f0'};
                                        color: ${activeTab === 'accounts' ? '#065f46' : '#475569'};
                                        box-shadow: ${activeTab === 'accounts' ? '0 3px 10px rgba(16, 185, 129, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)'};"
                                 onmouseover="if('${activeTab}' !== 'accounts'){ this.style.background='#f1f5f9'; this.style.borderColor='#cbd5e1'; this.style.transform='translateX(-4px)'; }"
                                 onmouseout="if('${activeTab}' !== 'accounts'){ this.style.background='#ffffff'; this.style.borderColor='#e2e8f0'; this.style.transform='none'; }">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 1.15rem; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: ${activeTab === 'accounts' ? '#a7f3d0' : '#f8fafc'}; color: ${activeTab === 'accounts' ? '#047857' : '#64748b'};">
                                        💬
                                    </span>
                                    <span style="font-weight: 900; font-size: 0.88rem;">تنبيهات الحسابات</span>
                                </div>
                                <span style="background: ${activeAccountsTotal > 0 ? '#ef4444' : (activeTab === 'accounts' ? '#a7f3d0' : '#f1f5f9')};
                                             color: ${activeAccountsTotal > 0 ? '#ffffff' : (activeTab === 'accounts' ? '#065f46' : '#64748b')};
                                             font-size: 0.74rem; font-weight: 900; padding: 2px 9px; border-radius: 12px; min-width: 24px; text-align: center;
                                             ${activeAccountsTotal > 0 ? 'box-shadow: 0 2px 6px rgba(239, 68, 68, 0.35);' : ''}">
                                    ${activeAccountsTotal}
                                </span>
                            </div>
                            ` : ''}

                            <!-- 4. تبويب سجل الاستلام والتدقيق -->
                            <div onclick="showNotificationsModal('archived')"
                                 style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 12px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); user-select: none;
                                        background: ${activeTab === 'archived' ? '#ecfdf5' : '#ffffff'};
                                        border: 1.5px solid ${activeTab === 'archived' ? '#10b981' : '#e2e8f0'};
                                        border-right: ${activeTab === 'archived' ? '4px solid #10b981' : '1.5px solid #e2e8f0'};
                                        color: ${activeTab === 'archived' ? '#065f46' : '#475569'};
                                        box-shadow: ${activeTab === 'archived' ? '0 3px 10px rgba(16, 185, 129, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)'};"
                                 onmouseover="if('${activeTab}' !== 'archived'){ this.style.background='#f1f5f9'; this.style.borderColor='#cbd5e1'; this.style.transform='translateX(-4px)'; }"
                                 onmouseout="if('${activeTab}' !== 'archived'){ this.style.background='#ffffff'; this.style.borderColor='#e2e8f0'; this.style.transform='none'; }">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 1.15rem; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: ${activeTab === 'archived' ? '#a7f3d0' : '#f8fafc'}; color: ${activeTab === 'archived' ? '#047857' : '#64748b'};">
                                        📋
                                    </span>
                                    <span style="font-weight: 900; font-size: 0.88rem;">سجل الاستلام والتدقيق</span>
                                </div>
                                <span style="background: ${activeTab === 'archived' ? '#a7f3d0' : '#f1f5f9'};
                                             color: ${activeTab === 'archived' ? '#065f46' : '#64748b'};
                                             font-size: 0.74rem; font-weight: 900; padding: 2px 9px; border-radius: 12px; min-width: 24px; text-align: center;">
                                    ${totalReceiptCount}
                                </span>
                            </div>

                            <!-- 5. تبويب الإشعارات السحابية -->
                            <div onclick="showNotificationsModal('cloud')"
                                 style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 12px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); user-select: none;
                                        background: ${activeTab === 'cloud' ? '#ecfdf5' : '#ffffff'};
                                        border: 1.5px solid ${activeTab === 'cloud' ? '#10b981' : '#e2e8f0'};
                                        border-right: ${activeTab === 'cloud' ? '4px solid #10b981' : '1.5px solid #e2e8f0'};
                                        color: ${activeTab === 'cloud' ? '#065f46' : '#475569'};
                                        box-shadow: ${activeTab === 'cloud' ? '0 3px 10px rgba(16, 185, 129, 0.12)' : '0 1px 2px rgba(0,0,0,0.02)'};"
                                 onmouseover="if('${activeTab}' !== 'cloud'){ this.style.background='#f1f5f9'; this.style.borderColor='#cbd5e1'; this.style.transform='translateX(-4px)'; }"
                                 onmouseout="if('${activeTab}' !== 'cloud'){ this.style.background='#ffffff'; this.style.borderColor='#e2e8f0'; this.style.transform='none'; }">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 1.15rem; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: ${activeTab === 'cloud' ? '#a7f3d0' : '#f8fafc'}; color: ${activeTab === 'cloud' ? '#047857' : '#64748b'};">
                                        🔔
                                    </span>
                                    <span style="font-weight: 900; font-size: 0.88rem;">الإشعارات السحابية</span>
                                </div>
                                <span style="background: ${activeCloudCount > 0 ? '#ef4444' : (activeTab === 'cloud' ? '#a7f3d0' : '#f1f5f9')};
                                             color: ${activeCloudCount > 0 ? '#ffffff' : (activeTab === 'cloud' ? '#065f46' : '#64748b')};
                                             font-size: 0.74rem; font-weight: 900; padding: 2px 9px; border-radius: 12px; min-width: 24px; text-align: center;
                                             ${activeCloudCount > 0 ? 'box-shadow: 0 2px 6px rgba(239, 68, 68, 0.35);' : ''}">
                                    ${activeCloudCount}
                                </span>
                            </div>

                        </div>

                        <!-- مساحة العرض الرئيسية على اليسار (Left Main Column: Content Area + Footer) -->
                        <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; background: #ffffff;">

                            <!-- مساحة عرض المحتوى القابلة للتمرير الداخلي (Scrollable Content Area) -->
                            <div style="flex: 1; padding: 24px 28px; overflow-y: auto; min-height: 0;" class="fast-scrollbar">

                            <!-- 1. تبويب التحويلات الواردة -->
                            ${activeTab === 'transfers' ? `
                            ${(pendingTransfersList.length === 0 && receivedTransfersList.length === 0) ? `
                                <div style="text-align: center; padding: 50px 20px; color: #64748b;">
                                    <div style="font-size: 3.5rem; margin-bottom: 12px;">🚚✨</div>
                                    <div style="font-weight: 900; font-size: 1.2rem; color: #0f172a;">لا توجد أذونات تحويل واردة أو مستلمة بالمخزن!</div>
                                    <div style="font-size: 0.9rem; margin-top: 6px; color: #64748b;">جميع الشحنات المحولة إلى (<b style="color:#059669;">${escapeStr(activeWH)}</b>) تظهر هنا فور إنشائها وتوثيق استلامها.</div>
                                </div>
                            ` : `
                                <div style="display:flex; flex-direction:column; gap:22px;">
                                    <!-- 1. أذونات التحويل المعلقة بانتظار المراجعة والاستلام -->
                                    ${pendingTransfersList.length > 0 ? `
                                        <div>
                                            <div style="margin-bottom: 14px; display:flex; justify-content:space-between; align-items:center;">
                                                <span style="font-size:0.95rem; font-weight:900; color:#1e293b; display:flex; align-items:center; gap:8px;">
                                                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#ef4444; box-shadow:0 0 8px rgba(239,68,68,0.5);"></span>
                                                    📦 أذونات تحويل واردة بانتظار المراجعة والاستلام المخزني (<b style="color:#ef4444;">${pendingTransfersList.length}</b>):
                                                </span>
                                                <span style="font-size:0.8rem; color:#64748b; font-weight:bold;">يرجى مراجعة محتويات الإذن وتأكيد استلامه لإضافته لرصيد المخزن</span>
                                            </div>
                                            <div style="display:flex; flex-direction:column; gap:16px;">
                                                ${pendingTransfersList.map(tr => `
                                                    <div style="background:#f8fafc; border:2px solid #a7f3d0; border-radius:18px; padding:18px 22px; box-shadow:0 4px 18px rgba(0,0,0,0.04);">
                                                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px dashed #cbd5e1; padding-bottom:12px; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                                                            <div>
                                                                <span style="background:#047857; color:#fff; font-weight:900; font-size:0.85rem; padding:4px 14px; border-radius:20px;">إذن تحويل #${escapeStr(tr.id)}</span>
                                                                <span style="color:#0f172a; font-weight:900; font-size:0.95rem; margin-right:10px;">من: <b style="color:#2563eb;">${escapeStr(tr.sourceWarehouse)}</b> ⬅️ إلى مخزنك: <b style="color:#059669;">${escapeStr(tr.warehouse)}</b></span>
                                                            </div>
                                                            <div style="font-size:0.82rem; color:#64748b; font-weight:bold;">
                                                                🕒 وقت الإرسال: ${escapeStr(tr.date || '')} | 👤 الراسل: <b style="color:#334155;">${escapeStr(tr.user)}</b>
                                                            </div>
                                                        </div>

                                                        <div style="background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden; margin-bottom:14px;">
                                                            <table style="width:100%; border-collapse:collapse; font-size:0.88rem; text-align:center;">
                                                                <thead style="background:#f1f5f9; color:#475569; font-weight:900;">
                                                                    <tr>
                                                                        <th style="padding:8px 14px; text-align:right;">الصنف المحول</th>
                                                                        <th style="padding:8px 10px;">المقاس</th>
                                                                        <th style="padding:8px 10px;">اللون</th>
                                                                        <th style="padding:8px 14px;">الكمية</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    ${tr.items.map(it => `
                                                                        <tr style="border-top:1px solid #f1f5f9;">
                                                                            <td style="padding:10px 14px; font-weight:900; color:#0f172a; text-align:right;">${escapeStr(it.product)}</td>
                                                                            <td style="padding:10px 10px; color:#475569; font-weight:bold;">${escapeStr(it.selectedSize || it.size || '-')}</td>
                                                                            <td style="padding:10px 10px; color:#475569; font-weight:bold;">${escapeStr(it.selectedColor || it.color || '-')}</td>
                                                                            <td style="padding:10px 14px; font-weight:900; color:#047857; font-size:1.02rem;">${it.qty} ${escapeStr(it.unit || 'قطعة')}</td>
                                                                        </tr>
                                                                    `).join('')}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        ${tr.notes ? `<div style="font-size:0.85rem; color:#475569; margin-bottom:14px; background:#ffffff; padding:8px 14px; border-radius:10px; border:1px solid #e2e8f0; font-weight:bold;">📝 ملاحظات المرسل: ${escapeStr(tr.notes)}</div>` : ''}

                                                        <div style="display:flex; justify-content:flex-end; gap:12px;">
                                                            <button onclick="if(confirm('هل أنت متأكد من رفض إذن التحويل #${escapeStr(tr.id)}؟ تظل البضاعة مسجلة بالكامل برصيد المخزن المصدر.')) window.rejectTransferFromNotify('${escapeStr(tr.id)}')" style="background:#fee2e2; color:#dc2626; border:1.5px solid #fca5a5; border-radius:10px; padding:9px 18px; font-weight:900; font-size:0.86rem; cursor:pointer; transition:0.2s;">
                                                                ❌ رفض التحويل
                                                            </button>
                                                            <button onclick="window.acceptTransferFromNotify('${escapeStr(tr.id)}')" style="background:linear-gradient(135deg, #10b981, #047857); color:#fff; border:none; border-radius:10px; padding:9px 24px; font-weight:900; font-size:0.92rem; cursor:pointer; box-shadow:0 3px 10px rgba(16,185,129,0.35); transition:0.2s;">
                                                                ✅ موافقة واستلام البضاعة بالمخزن
                                                            </button>
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    ` : `
                                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:14px 20px; display:flex; align-items:center; gap:12px; color:#475569;">
                                            <span style="font-size:1.5rem;">🎉</span>
                                            <div style="font-size:0.9rem; font-weight:bold;">لا توجد أذونات تحويل معلقة جديدة بانتظار الاستلام.</div>
                                        </div>
                                    `}

                                    <!-- 2. أذونات التحويل المستلمة والمعتمدة رسمياً بالمخزن (ثابتة وغير قابلة للحذف) -->
                                    ${receivedTransfersList.length > 0 ? `
                                        <div style="border-top: 2px dashed #cbd5e1; padding-top: 20px;">
                                            <div style="margin-bottom: 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                                <span style="font-size:0.95rem; font-weight:900; color:#065f46; display:flex; align-items:center; gap:8px;">
                                                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#10b981;"></span>
                                                    🔒 الأذونات المعتمدة والمستلمة بالمخزن (${receivedTransfersList.length}):
                                                </span>
                                                <span style="font-size:0.8rem; background:#ecfdf5; color:#047857; padding:4px 12px; border-radius:10px; border:1px solid #a7f3d0; font-weight:900;">
                                                    🛡️ سجل استلام مخزني موثق وثابت (غير قابل للحذف)
                                                </span>
                                            </div>
                                            <div style="display:flex; flex-direction:column; gap:16px;">
                                                ${receivedTransfersList.map(tr => {
                                                    const isRejected = tr.status === 'rejected';
                                                    const borderColor = isRejected ? '#fca5a5' : '#86efac';
                                                    const bgCard = isRejected ? '#fffaf0' : '#f0fdf4';
                                                    return `
                                                    <div style="background:${bgCard}; border:2px solid ${borderColor}; border-radius:18px; padding:18px 22px; box-shadow:0 4px 18px rgba(0,0,0,0.03);">
                                                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px dashed ${borderColor}; padding-bottom:12px; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                                                            <div>
                                                                <span style="background:${isRejected ? '#dc2626' : '#059669'}; color:#fff; font-weight:900; font-size:0.85rem; padding:4px 14px; border-radius:20px;">إذن تحويل #${escapeStr(tr.id)}</span>
                                                                <span style="color:#0f172a; font-weight:900; font-size:0.95rem; margin-right:10px;">من: <b style="color:#2563eb;">${escapeStr(tr.sourceWarehouse)}</b> ⬅️ إلى: <b style="color:#059669;">${escapeStr(tr.warehouse)}</b></span>
                                                            </div>
                                                            <div style="font-size:0.82rem; color:#64748b; font-weight:bold;">
                                                                🕒 تاريخ الإنشاء: ${escapeStr(tr.date || '')} | 👤 الراسل: <b style="color:#334155;">${escapeStr(tr.user)}</b>
                                                            </div>
                                                        </div>

                                                        <!-- شارة حالة الاستلام الموثقة مع اسم المستلم والتاريخ -->
                                                        ${isRejected ? `
                                                            <div style="background:#fee2e2; border:1px solid #fca5a5; border-radius:12px; padding:10px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                                                                <div style="display:flex; align-items:center; gap:10px;">
                                                                    <span style="font-size:1.3rem;">❌</span>
                                                                    <div>
                                                                        <div style="font-weight:900; color:#991b1b; font-size:0.92rem;">
                                                                            تم رفض إذن التحويل (البضاعة محفوظة برصيد المخزن المصدر)
                                                                        </div>
                                                                        <div style="font-size:0.82rem; color:#b91c1c; font-weight:bold; margin-top:2px;">
                                                                            👤 القائم بالرفض: <b style="color:#0f172a;">${escapeStr(tr.rejectedBy || tr.receiverUser || 'أمين المخزن')}</b>
                                                                            ${tr.rejectedAt ? ` • 🕒 وقت الرفض: <b style="color:#0f172a;">${escapeStr(tr.rejectedAt)}</b>` : ''}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div style="background:#ffffff; color:#991b1b; border:1px solid #fca5a5; padding:5px 12px; border-radius:10px; font-weight:900; font-size:0.78rem;">
                                                                    ❌ مرفوض نهائياً وموثق
                                                                </div>
                                                            </div>
                                                        ` : `
                                                            <div style="background:#dcfce7; border:1px solid #86efac; border-radius:12px; padding:10px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                                                                <div style="display:flex; align-items:center; gap:10px;">
                                                                    <span style="font-size:1.3rem;">✅</span>
                                                                    <div>
                                                                        <div style="font-weight:900; color:#065f46; font-size:0.92rem;">
                                                                            تم الاستلام والاعتماد المخزني بنجاح
                                                                        </div>
                                                                        <div style="font-size:0.82rem; color:#047857; font-weight:bold; margin-top:2px;">
                                                                            👤 المستلم: <b style="color:#0f172a;">${escapeStr(tr.receiverUser || 'أمين المخزن')}</b>
                                                                            ${tr.receivedDate ? ` • 🕒 تاريخ وتوقيت الاستلام: <b style="color:#0f172a;">${escapeStr(tr.receivedDate)}</b>` : ''}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div style="background:#ffffff; color:#065f46; border:1px solid #a7f3d0; padding:5px 12px; border-radius:10px; font-weight:900; font-size:0.78rem; display:flex; align-items:center; gap:6px;">
                                                                    🔒 معتمد ومقفل نهائياً (لا يمكن حذفه)
                                                                </div>
                                                            </div>
                                                        `}

                                                        <div style="background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden;">
                                                            <table style="width:100%; border-collapse:collapse; font-size:0.88rem; text-align:center;">
                                                                <thead style="background:#f1f5f9; color:#475569; font-weight:900;">
                                                                    <tr>
                                                                        <th style="padding:8px 14px; text-align:right;">الصنف المحول</th>
                                                                        <th style="padding:8px 10px;">المقاس</th>
                                                                        <th style="padding:8px 10px;">اللون</th>
                                                                        <th style="padding:8px 14px;">الكمية المستلمة</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    ${tr.items.map(it => `
                                                                        <tr style="border-top:1px solid #f1f5f9;">
                                                                            <td style="padding:10px 14px; font-weight:900; color:#0f172a; text-align:right;">${escapeStr(it.product)}</td>
                                                                            <td style="padding:10px 10px; color:#475569; font-weight:bold;">${escapeStr(it.selectedSize || it.size || '-')}</td>
                                                                            <td style="padding:10px 10px; color:#475569; font-weight:bold;">${escapeStr(it.selectedColor || it.color || '-')}</td>
                                                                            <td style="padding:10px 14px; font-weight:900; color:${isRejected ? '#b91c1c' : '#047857'}; font-size:1.02rem;">${it.qty} ${escapeStr(it.unit || 'قطعة')}</td>
                                                                        </tr>
                                                                    `).join('')}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        ${tr.notes ? `<div style="font-size:0.85rem; color:#475569; margin-top:12px; background:#ffffff; padding:8px 14px; border-radius:10px; border:1px solid #e2e8f0; font-weight:bold;">📝 ملاحظات المرسل: ${escapeStr(tr.notes)}</div>` : ''}
                                                    </div>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            `}
                        ` : activeTab === 'products' ? `
                            <!-- 2. تبويب البضاعة والصلاحية -->
                            ${(activeProductsTotal === 0) ? `
                                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 420px; text-align: center; padding: 30px 20px;">
                                    <div style="margin-bottom: 22px; filter: drop-shadow(0 12px 20px rgba(0,0,0,0.07));">
                                        <svg width="150" height="130" viewBox="0 0 150 130" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <!-- Wooden Crate Top -->
                                            <polygon points="75,42 122,64 75,86 28,64" fill="#eed5b7" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round"/>
                                            <!-- Wooden Crate Left Side -->
                                            <polygon points="28,64 75,86 75,124 28,102" fill="#d4a373" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round"/>
                                            <!-- Wooden Crate Right Side -->
                                            <polygon points="122,64 75,86 75,124 122,102" fill="#bc8a5f" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round"/>
                                            <!-- Wood Planks Detail Lines -->
                                            <line x1="28" y1="83" x2="75" y2="105" stroke="#1e293b" stroke-width="2"/>
                                            <line x1="75" y1="105" x2="122" y2="83" stroke="#1e293b" stroke-width="2"/>
                                            <line x1="51" y1="53" x2="51" y2="113" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="3 3" stroke-opacity="0.6"/>
                                            <line x1="99" y1="53" x2="99" y2="113" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="3 3" stroke-opacity="0.6"/>
                                            <!-- Floating Crown with Gold & Blue Jewels -->
                                            <g transform="translate(85, 30) rotate(18)">
                                                <path d="M-22,10 L-16,-8 L-6,4 L6,-12 L16,4 L26,-8 L22,10 Z" fill="#3b82f6" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>
                                                <rect x="-22" y="10" width="44" height="5" rx="2.5" fill="#1d4ed8" stroke="#0f172a" stroke-width="2"/>
                                                <circle cx="-16" cy="-8" r="3" fill="#fbbf24" stroke="#0f172a" stroke-width="1.5"/>
                                                <circle cx="6" cy="-12" r="3.5" fill="#fbbf24" stroke="#0f172a" stroke-width="1.5"/>
                                                <circle cx="26" cy="-8" r="3" fill="#fbbf24" stroke="#0f172a" stroke-width="1.5"/>
                                            </g>
                                        </svg>
                                    </div>
                                    <h3 style="font-weight: 900; font-size: 1.35rem; color: #0f172a; margin: 0 0 10px 0; letter-spacing: -0.3px;">
                                        مخزون البضاعة والصلاحيات مستقر ومكتمل!
                                    </h3>
                                    <p style="font-size: 0.92rem; color: #64748b; font-weight: 700; margin: 0; max-width: 480px; line-height: 1.6;">
                                        لا توجد أصناف وصلت لحد النواقص الأدنى أو اقتربت تواريخ صلاحيتها.
                                    </p>
                                </div>
                            ` : `
                                <div style="margin-bottom: 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                                    <span style="font-size:0.9rem; font-weight:900; color:#334155;">
                                        الأصناف المطلوب متابعتها (${activeProductsTotal}): <span style="color:#ef4444; font-weight:900;">(${activeLowStock.length} نواقص)</span> • <span style="color:#d97706; font-weight:900;">(${activeExpiring.length} صلاحيات)</span>
                                    </span>
                                    <button onclick="acknowledgeAllProductsNotifications()" style="padding: 7px 16px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 9px; font-weight: 900; font-size: 0.84rem; cursor: pointer; box-shadow:0 2px 8px rgba(16,185,129,0.3);">
                                        ✔️ استلام وتوثيق كل تنبيهات البضاعة
                                    </button>
                                </div>

                                <div style="border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                                    <table style="width:100%; border-collapse:collapse; font-size:0.88rem; text-align:right;">
                                        <thead>
                                            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 900;">
                                                <th style="padding:12px 16px;">الصنف والمقاس واللون</th>
                                                <th style="padding:12px 16px; text-align:center;">رصيد المقاس / إجمالي الموديل</th>
                                                <th style="padding:12px 16px; text-align:center;">مستوى التنبيه</th>
                                                <th style="padding:12px 16px; text-align:center; width:130px;">الإجراء</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <!-- أصناف النواقص مع دعم مقاسات وألوان الفاشون والرصيد الكلي العام -->
                                            ${(() => {
                                                const maxDisplay = 120;
                                                const displayedItems = activeLowStock.slice(0, maxDisplay);
                                                return displayedItems.map(p => {
                                                    const curStock = parseFloat(p.stock) || 0;
                                                    const minStock = parseFloat(p.minStock) || 5;
                                                    const isZero = curStock <= 0;
                                                    const isVar = Boolean(p.isVariant);
                                                    
                                                    const pDetailsAck = isVar
                                                        ? `المقاس: ${escapeStr(p.size)} | اللون: ${escapeStr(p.color)} | رصيد المقاس: ${curStock} | إجمالي الموديل: ${p.totalStock}`
                                                        : `الرصيد: ${curStock} (حد الأمان: ${minStock})`;
                                                    const pNameAck = isVar 
                                                        ? `${escapeStr(p.name)} [${escapeStr(p.size)} - ${escapeStr(p.color)}]` 
                                                        : escapeStr(p.name);
                                                    const pTypeLabel = isVar ? 'نواقص مقاس/لون' : 'نواقص بضاعة';

                                                    return `
                                                    <tr style="border-bottom: 1px solid #f1f5f9; transition: 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                                                        <td style="padding: 12px 16px;">
                                                            <div style="display:flex; align-items:flex-start; gap:12px;">
                                                                <div style="width:38px; height:38px; border-radius:12px; background:${isVar ? '#eff6ff' : '#fee2e2'}; color:${isVar ? '#2563eb' : '#dc2626'}; display:flex; align-items:center; justify-content:center; font-size:1.2rem; flex-shrink:0; border: 1px solid ${isVar ? '#bfdbfe' : '#fecaca'};">
                                                                    ${isVar ? '👕' : '📦'}
                                                                </div>
                                                                <div style="flex:1;">
                                                                    <div style="font-weight:900; color:#0f172a; font-size:0.95rem; line-height: 1.3;">${escapeStr(p.name)}</div>
                                                                    ${isVar ? `
                                                                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:6px;">
                                                                            <span style="background: #e0e7ff; color: #3730a3; padding: 2px 9px; border-radius: 6px; font-weight: 900; font-size: 0.78rem; border: 1px solid #c7d2fe; display:inline-flex; align-items:center; gap:4px;">
                                                                                <span>📏 المقاس:</span> <b>${escapeStr(p.size)}</b>
                                                                            </span>
                                                                            <span style="background: #f1f5f9; color: #1e293b; padding: 2px 9px; border-radius: 6px; font-weight: 800; font-size: 0.78rem; border: 1px solid #cbd5e1; display:inline-flex; align-items:center; gap:4px;">
                                                                                <span>🎨 اللون:</span> <b>${escapeStr(p.color)}</b>
                                                                            </span>
                                                                            ${p.barcode ? `
                                                                                <span style="font-family: monospace; color: #475569; background: #faf5ff; border: 1px dashed #d8b4fe; padding: 2px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 700;" title="باركود هذا المقاس">
                                                                                    🏷️ ${escapeStr(p.barcode)}
                                                                                </span>
                                                                            ` : ''}
                                                                        </div>
                                                                    ` : `
                                                                        ${p.barcode ? `<div style="font-size:0.75rem; color:#64748b; font-family:monospace; margin-top:3px;">كود الصنف: ${escapeStr(p.barcode)}</div>` : ''}
                                                                    `}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style="padding: 12px 16px; text-align:center;">
                                                            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
                                                                <div>
                                                                    <span style="font-size:1.2rem; font-weight:900; color:${isZero ? '#ef4444' : '#d97706'}; direction:ltr; display:inline-block;">${curStock}</span>
                                                                    <span style="font-size:0.78rem; color:${isZero ? '#ef4444' : '#64748b'}; font-weight:800; margin-right:3px;">${escapeStr(p.unit || 'قطعة')}</span>
                                                                </div>
                                                                <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">(حد الأمان: ${minStock})</div>
                                                                ${isVar ? `
                                                                    <div style="margin-top: 6px; display: inline-flex; align-items: center; gap: 5px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 0.75rem; font-weight: 900; padding: 3px 9px; border-radius: 8px;" title="إجمالي رصيد الموديل بالكامل بكل مقاساته">
                                                                        <span>📊</span> إجمالي الموديل: <b>${p.totalStock} ${escapeStr(p.unit || 'قطعة')}</b>
                                                                    </div>
                                                                ` : ''}
                                                            </div>
                                                        </td>
                                                        <td style="padding: 12px 16px; text-align:center;">
                                                            ${isZero ? `
                                                                <span style="background:#fee2e2; color:#b91c1c; font-size:0.76rem; font-weight:900; padding:5px 12px; border-radius:20px; border:1px solid #fca5a5; display:inline-flex; align-items:center; gap:4px; box-shadow: 0 1px 4px rgba(239,68,68,0.15);">
                                                                    ❌ ${isVar ? 'نفد المقاس (0)' : 'نفد تماماً (0)'}
                                                                </span>
                                                            ` : `
                                                                <span style="background:#fef3c7; color:#b45309; font-size:0.76rem; font-weight:900; padding:5px 12px; border-radius:20px; border:1px solid #fde68a; display:inline-flex; align-items:center; gap:4px; box-shadow: 0 1px 4px rgba(217,119,6,0.15);">
                                                                    ⚠️ ${isVar ? 'مقاس قارب على النفاد' : 'قارب على النفاد'}
                                                                </span>
                                                            `}
                                                        </td>
                                                        <td style="padding: 12px 16px; text-align:center;">
                                                            <button onclick="window.acknowledgeNotification('low-stock', '${escapeStr(p.id)}', { name: '${pNameAck}', details: '${pDetailsAck}', typeLabel: '${pTypeLabel}' }, 'products')" 
                                                                style="background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; border-radius:9px; padding:7px 15px; font-size:0.82rem; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(16,185,129,0.3); transition:0.2s;"
                                                                title="تأكيد الاستلام ونقله لسجل الاستلام الموثق">
                                                                <span>✔️</span> استلام
                                                            </button>
                                                        </td>
                                                    </tr>`;
                                                }).join('') + (activeLowStock.length > maxDisplay ? `
                                                    <tr>
                                                        <td colspan="4" style="text-align:center; padding:12px; background:#f8fafc; color:#64748b; font-weight:800; font-size:0.82rem;">
                                                            ⚡ يتم عرض أول ${maxDisplay} مقاس وصنف من إجمالي (${activeLowStock.length}) لتسريع الأداء والاستجابة الفورية.
                                                        </td>
                                                    </tr>
                                                ` : '');
                                            })()}

                                            <!-- أصناف الصلاحية -->
                                            ${activeExpiring.map(p => {
                                                const exp = new Date(p.expiry);
                                                exp.setHours(0, 0, 0, 0);
                                                const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
                                                const isExpired = diffDays <= 0;
                                                const pDetails = isExpired ? `منتهي بتاريخ ${p.expiry} (منذ ${Math.abs(diffDays)} يوم)` : `ينتهي في ${diffDays} يوم (${p.expiry})`;
                                                return `
                                                <tr style="border-bottom: 1px solid #f1f5f9; transition: 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                                                    <td style="padding: 12px 16px;">
                                                        <div style="display:flex; align-items:center; gap:10px;">
                                                            <div style="width:34px; height:34px; border-radius:10px; background:#fef3c7; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">
                                                                📅
                                                            </div>
                                                            <div>
                                                                <div style="font-weight:900; color:#0f172a; font-size:0.92rem;">${escapeStr(p.name)}</div>
                                                                <div style="font-size:0.75rem; color:#64748b;">تاريخ الصلاحية: <b style="color:#0f172a;">${escapeStr(p.expiry)}</b></div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style="padding: 12px 16px; text-align:center;">
                                                        ${isExpired ? `
                                                            <span style="font-size:0.85rem; font-weight:900; color:#dc2626; background:#fee2e2; padding:3px 10px; border-radius:8px; border:1px solid #fca5a5;">❌ منتهي منذ ${Math.abs(diffDays)} يوم</span>
                                                        ` : `
                                                            <span style="font-size:0.85rem; font-weight:900; color:#d97706; background:#fef3c7; padding:3px 10px; border-radius:8px; border:1px solid #fde68a;">⏳ ينتهي خلال ${diffDays} يوم</span>
                                                        `}
                                                    </td>
                                                    <td style="padding: 12px 16px; text-align:center;">
                                                        <span style="background:${isExpired ? '#fee2e2' : '#fef3c7'}; color:${isExpired ? '#dc2626' : '#d97706'}; font-size:0.75rem; font-weight:900; padding:4px 10px; border-radius:20px;">
                                                            ${isExpired ? 'صلاحية منتهية ❌' : 'صلاحية وشيكة ⚠️'}
                                                        </span>
                                                    </td>
                                                    <td style="padding: 12px 16px; text-align:center;">
                                                        <button onclick="window.acknowledgeNotification('expiry', '${escapeStr(p.id)}', { name: '${escapeStr(p.name)}', details: '${escapeStr(pDetails)}', typeLabel: 'صلاحية قريبة/منتهية' }, 'products')" 
                                                            style="background:linear-gradient(135deg, #10b981, #059669); color:white; border:none; border-radius:9px; padding:7px 14px; font-size:0.82rem; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(16,185,129,0.3); transition:0.2s;"
                                                            title="تأكيد الاستلام ونقله لسجل الاستلام الموثق">
                                                            <span>✔️</span> استلام
                                                        </button>
                                                    </td>
                                                </tr>`;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        ` : activeTab === 'accounts' ? `
                            <!-- 3. تبويب الحسابات والديون -->
                            ${(activeAccountsTotal === 0) ? `
                                <div style="text-align: center; padding: 50px 20px; color: #64748b;">
                                    <div style="font-size: 3.5rem; margin-bottom: 12px;">✅💳</div>
                                    <div style="font-weight: 900; font-size: 1.25rem; color: #0f172a;">حسابات العملاء منتظمة بالكامل!</div>
                                    <div style="font-size: 0.9rem; margin-top: 6px; color: #64748b;">لا توجد مديونيات نشطة أو حسابات متأخرة عن السداد بانتظار التذكير.</div>
                                </div>
                            ` : `
                                <div style="margin-bottom: 14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                                    <span style="font-size:0.9rem; font-weight:900; color:#334155;">
                                        تنبيهات الحسابات النشطة (${activeAccountsTotal}): <span style="color:#ef4444; font-weight:900;">(${activeDebt.length} مديونية)</span> • <span style="color:#b45309; font-weight:900;">(${activeDelayed.length} متأخر سداد)</span>
                                    </span>
                                    <button onclick="acknowledgeAllAccountsNotifications()" style="padding: 7px 16px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 9px; font-weight: 900; font-size: 0.84rem; cursor: pointer; box-shadow:0 2px 8px rgba(59,130,246,0.3);">
                                        ✔️ استلام وتوثيق كل تنبيهات الحسابات
                                    </button>
                                </div>

                                <div style="border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                                    <table style="width:100%; border-collapse:collapse; font-size:0.88rem; text-align:right;">
                                        <thead>
                                            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 900;">
                                                <th style="padding:12px 16px;">اسم العميل / الحساب</th>
                                                <th style="padding:12px 16px; text-align:center;">المبلغ المستحق</th>
                                                <th style="padding:12px 16px; text-align:center;">حالة السداد والتأخير</th>
                                                <th style="padding:12px 16px; text-align:center; width:190px;">الإجراءات</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <!-- ديون العملاء -->
                                            ${activeDebt.map(a => {
                                                const debit = parseFloat(a.debit) || 0;
                                                const credit = parseFloat(a.credit) || 0;
                                                const balance = debit - credit;
                                                const detailsText = `المبلغ المستحق: ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م`;
                                                return `
                                                <tr style="border-bottom: 1px solid #f1f5f9; transition: 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                                                    <td style="padding: 12px 16px;">
                                                        <div style="display:flex; align-items:center; gap:10px;">
                                                            <div style="width:34px; height:34px; border-radius:10px; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">
                                                                💳
                                                            </div>
                                                            <div>
                                                                <div style="font-weight:900; color:#0f172a; font-size:0.92rem;">${escapeStr(a.name)}</div>
                                                                ${a.phone ? `<div style="font-size:0.75rem; color:#64748b;">📞 ${escapeStr(a.phone)}</div>` : ''}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style="padding: 12px 16px; text-align:center;">
                                                        <span style="font-size:1.08rem; font-weight:900; color:#e11d48; direction:ltr; display:inline-block;">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                                        <span style="font-size:0.78rem; color:#64748b; margin-right:4px;">ج.م</span>
                                                    </td>
                                                    <td style="padding: 12px 16px; text-align:center;">
                                                        <span style="background:#fee2e2; color:#be123c; font-size:0.75rem; font-weight:900; padding:4px 10px; border-radius:20px; border:1px solid #fecdd3;">مديونية مستحقة للتذكير</span>
                                                    </td>
                                                    <td style="padding: 12px 16px; text-align:center;">
                                                        <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                                                            <button class="tool-btn" style="background:#3b82f6; color:white; border-radius:8px; border:none; padding: 6px 12px; font-weight:800; font-size:0.8rem; cursor:pointer;" onclick="openStatementFromNotify('${escapeStr(a.id)}')" title="عرض كشف حساب العميل">📄 كشف</button>
                                                            <button class="tool-btn" style="background:linear-gradient(135deg, #10b981, #059669); color:white; border-radius:8px; padding: 6px 14px; font-size: 0.8rem; font-weight: 900; border: none; cursor: pointer; display:flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(16,185,129,0.3);" 
                                                                onclick="window.acknowledgeNotification('debt', '${escapeStr(a.id)}', { name: '${escapeStr(a.name)}', details: '${escapeStr(detailsText)}', typeLabel: 'مديونية عميل' }, 'accounts')" title="تأكيد الاستلام ونقله لسجل الاستلام">
                                                                <span style="font-size:0.85rem;">✔️</span> استلام
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>`;
                                            }).join('')}

                                            <!-- العملاء المتأخرين عن السداد -->
                                            ${activeDelayed.map(a => {
                                                const debit = parseFloat(a.debit) || 0;
                                                const credit = parseFloat(a.credit) || 0;
                                                const balance = debit - credit;
                                                const lastTrans = (typeof transactions !== 'undefined' && Array.isArray(transactions))
                                                    ? transactions.filter(t => t.partnerId === a.id || t.account === a.name || t.partner === a.name).sort((x, y) => new Date(y.date || y.timestamp) - new Date(x.date || x.timestamp))[0]
                                                    : null;
                                                let delayNote = "متأخر عن السداد (لا توجد دفعات مسجلة)";
                                                if (lastTrans) {
                                                    const lastDate = new Date(lastTrans.date || lastTrans.timestamp);
                                                    const diffDays = Math.ceil((today - lastDate) / (1000 * 60 * 60 * 24));
                                                    delayNote = `متأخر منذ ${diffDays} يوم (آخر حركة: ${lastTrans.date || ''})`;
                                                }
                                                const detailsText = `المبلغ: ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م (${delayNote})`;
                                                return `
                                                <tr style="border-bottom: 1px solid #f1f5f9; transition: 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                                                    <td style="padding: 12px 16px;">
                                                        <div style="display:flex; align-items:center; gap:10px;">
                                                            <div style="width:34px; height:34px; border-radius:10px; background:#fef3c7; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">
                                                                ⏳
                                                            </div>
                                                            <div>
                                                                <div style="font-weight:900; color:#0f172a; font-size:0.92rem;">${escapeStr(a.name)}</div>
                                                                ${a.phone ? `<div style="font-size:0.75rem; color:#64748b;">📞 ${escapeStr(a.phone)}</div>` : ''}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style="padding: 12px 16px; text-align:center;">
                                                        <span style="font-size:1.08rem; font-weight:900; color:#b45309; direction:ltr; display:inline-block;">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                                        <span style="font-size:0.78rem; color:#64748b; margin-right:4px;">ج.م</span>
                                                    </td>
                                                    <td style="padding: 12px 16px; text-align:center;">
                                                        <span style="background:#fffbeb; color:#b45309; font-size:0.75rem; font-weight:900; padding:4px 10px; border-radius:20px; border:1px solid #fde68a;">⏳ ${escapeStr(delayNote)}</span>
                                                    </td>
                                                    <td style="padding: 12px 16px; text-align:center;">
                                                        <div style="display:flex; gap:6px; justify-content:center; align-items:center;">
                                                            <button class="tool-btn" style="background:#3b82f6; color:white; border-radius:8px; border:none; padding: 6px 12px; font-weight:800; font-size:0.8rem; cursor:pointer;" onclick="openStatementFromNotify('${escapeStr(a.id)}')" title="عرض كشف حساب العميل">📄 كشف</button>
                                                            <button class="tool-btn" style="background:linear-gradient(135deg, #10b981, #059669); color:white; border-radius:8px; padding: 6px 14px; font-size: 0.8rem; font-weight: 900; border: none; cursor: pointer; display:flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(16,185,129,0.3);" 
                                                                onclick="window.acknowledgeNotification('delayed', '${escapeStr(a.id)}', { name: '${escapeStr(a.name)}', details: '${escapeStr(detailsText)}', typeLabel: 'متأخر عن السداد' }, 'accounts')" title="تأكيد الاستلام ونقله لسجل الاستلام">
                                                                <span style="font-size:0.85rem;">✔️</span> استلام
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>`;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        ` : activeTab === 'archived' ? `
                            <!-- 4. تبويب سجل الاستلام والتدقيق الموثق (Audit & Receipt Log) -->
                            <div style="display:flex; flex-direction:column; gap:16px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#f8fafc; padding:12px 16px; border-radius:14px; border:1px solid #e2e8f0;">
                                    <div>
                                        <span style="font-weight:900; color:#0f172a; font-size:0.95rem;">📋 سجل الاستلام والتدقيق الموثق:</span>
                                        <span style="font-size:0.82rem; color:#64748b; margin-right:8px;">توثيق رسمي لجميع التنبيهات المستلمة بالوقت واسم المستلم والمخزن.</span>
                                    </div>
                                    <div style="display:flex; gap:8px;">
                                        ${totalReceiptCount > 0 ? `
                                            <button onclick="window.resetAcknowledgedNotifications()" style="padding:6px 14px; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:8px; font-weight:900; font-size:0.8rem; cursor:pointer; transition:0.2s;" title="إعادة كافة التنبيهات للقوائم النشطة">
                                                🔄 استعادة الكل للنشط
                                            </button>
                                            <button onclick="window.clearReceiptLog()" style="padding:6px 14px; background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; border-radius:8px; font-weight:900; font-size:0.8rem; cursor:pointer; transition:0.2s;" title="مسح بيانات السجل نهائياً">
                                                🗑️ مسح السجل
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>

                                ${(totalReceiptCount === 0) ? `
                                    <div style="text-align: center; padding: 50px 20px; color: #64748b;">
                                        <div style="font-size: 3.5rem; margin-bottom: 12px;">📁📋</div>
                                        <div style="font-weight: 900; font-size: 1.25rem; color: #0f172a;">سجل الاستلام فارغ حالياً</div>
                                        <div style="font-size: 0.9rem; margin-top: 6px; color: #64748b;">عند النقر على زر <b>(✔️ استلام)</b> في أي تنبيه، سيتم توثيق اسم المستلم والمخزن وتوقيت الاستلام هنا فوراً.</div>
                                    </div>
                                ` : `
                                    <div style="border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                                        <table style="width:100%; border-collapse:collapse; font-size:0.86rem; text-align:right;">
                                            <thead>
                                                <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 900;">
                                                    <th style="padding:12px 14px; width:130px; text-align:center;">نوع التنبيه</th>
                                                    <th style="padding:12px 14px;">البيان المستلم</th>
                                                    <th style="padding:12px 14px;">التفاصيل والرصيد</th>
                                                    <th style="padding:12px 14px; text-align:center; width:110px;">👤 المستلم</th>
                                                    <th style="padding:12px 14px; text-align:center; width:110px;">🏬 المخزن</th>
                                                    <th style="padding:12px 14px; text-align:center; width:130px;">🕒 التوقيت</th>
                                                    <th style="padding:12px 14px; text-align:center; width:95px;">إجراء</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${(() => {
                                                    const maxDisplay = 100;
                                                    const displayedLog = receiptLog.slice(0, maxDisplay);
                                                    return displayedLog.map((log) => {
                                                        const isTransferRejected = log.type === 'transfer' && (log.isRejected || log.status === 'rejected');
                                                        const badgeColor = (log.type === 'low-stock') ? '#ef4444' 
                                                            : (log.type === 'expiry' ? '#d97706' 
                                                            : (log.type === 'debt' ? '#2563eb' 
                                                            : (log.type === 'delayed' ? '#b45309' 
                                                            : (log.type === 'transfer' ? (isTransferRejected ? '#dc2626' : '#059669') : '#8b5cf6'))));
                                                        
                                                        const badgeBg = (log.type === 'low-stock') ? '#fee2e2' 
                                                            : (log.type === 'expiry' ? '#fef3c7' 
                                                            : (log.type === 'debt' ? '#eff6ff' 
                                                            : (log.type === 'delayed' ? '#fffbeb' 
                                                            : (log.type === 'transfer' ? (isTransferRejected ? '#fee2e2' : '#ecfdf5') : '#f5f3ff'))));

                                                        const icon = (log.type === 'low-stock') ? '📦' 
                                                            : (log.type === 'expiry' ? '📅' 
                                                            : (log.type === 'debt' ? '💳' 
                                                            : (log.type === 'delayed' ? '⚠️' 
                                                            : (log.type === 'transfer' ? (isTransferRejected ? '❌' : '🚚') : '☁️'))));

                                                        return `
                                                        <tr style="border-bottom: 1px solid #f1f5f9; transition: 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                                                            <td style="padding: 10px 12px; text-align:center;">
                                                                <span style="background:${badgeBg}; color:${badgeColor}; font-weight:900; font-size:0.75rem; padding:4px 9px; border-radius:14px; display:inline-flex; align-items:center; gap:4px; border:1px solid ${badgeColor}33;">
                                                                    <span>${icon}</span> ${escapeStr(log.typeLabel || log.type)}
                                                                </span>
                                                            </td>
                                                            <td style="padding: 10px 12px; font-weight:900; color:#0f172a;">
                                                                ${escapeStr(log.name)}
                                                            </td>
                                                            <td style="padding: 10px 12px; color:#475569; font-weight:bold; font-size:0.82rem;">
                                                                ${escapeStr(log.details || '-')}
                                                            </td>
                                                            <td style="padding: 10px 12px; text-align:center; font-weight:900; color:#1e293b; font-size:0.82rem;">
                                                                <span style="background:#f1f5f9; padding:3px 8px; border-radius:6px;">👤 ${escapeStr(log.user || 'المدير')}</span>
                                                            </td>
                                                            <td style="padding: 10px 12px; text-align:center; color:#047857; font-weight:bold; font-size:0.8rem;">
                                                                ${escapeStr(log.warehouse || 'الرئيسي')}
                                                            </td>
                                                            <td style="padding: 10px 12px; text-align:center; color:#64748b; font-size:0.78rem; font-weight:bold;">
                                                                <div>${escapeStr(log.date || '')}</div>
                                                                <div style="color:#0f172a;">${escapeStr(log.time || '')}</div>
                                                            </td>
                                                            <td style="padding: 10px 12px; text-align:center;">
                                                                ${log.type === 'transfer' ? `
                                                                    <span style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:10px; font-weight:900; font-size:0.75rem; ${isTransferRejected ? 'background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;' : 'background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;'}">
                                                                        ${isTransferRejected ? '❌ مرفوض نهائياً' : '🔒 معتمد نهائياً'}
                                                                    </span>
                                                                ` : `
                                                                    <button onclick="window.unacknowledgeNotification('${escapeStr(log.type)}', '${escapeStr(log.targetId)}', '${escapeStr(log.logId)}')" 
                                                                        style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:8px; padding:4px 10px; font-size:0.75rem; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; gap:4px; transition:0.2s;"
                                                                        onmouseover="this.style.background='#fee2e2'; this.style.color='#dc2626'; this.style.borderColor='#fca5a5';"
                                                                        onmouseout="this.style.background='#f1f5f9'; this.style.color='#475569'; this.style.borderColor='#cbd5e1';"
                                                                        title="استعادة هذا التنبيه وإلغاء استلامه وإرجاعه للقائمة النشطة">
                                                                        <span>🔄</span> استعادة
                                                                    </button>
                                                                `}
                                                            </td>
                                                        </tr>`;
                                                    }).join('') + (receiptLog.length > maxDisplay ? `
                                                        <tr>
                                                            <td colspan="7" style="text-align:center; padding:12px; background:#f8fafc; color:#64748b; font-weight:800; font-size:0.82rem;">
                                                                ⚡ يتم عرض أحدث ${maxDisplay} حركة استلام من إجمالي (${receiptLog.length}) لسلاسة التصفح وتوفير الذاكرة.
                                                            </td>
                                                        </tr>
                                                    ` : '');
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                `}
                            </div>
                        ` : `
                            <!-- 5. تبويب الإشعارات والرسائل السحابية -->
                            <div style="display:flex; flex-direction:column; gap:16px;">
                                ${(window.cloudAnnouncementsHistory && window.cloudAnnouncementsHistory.length > 0) ? `
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; flex-wrap:wrap; gap:8px;">
                                        <span style="font-size:0.88rem; font-weight:900; color:#334155;">
                                            سجل الرسائل والتحديثات السحابية الواردة (${window.cloudAnnouncementsHistory.length}):
                                            ${activeCloudCount > 0 ? `<span style="color:#ef4444; margin-right:6px;">(${activeCloudCount} غير مقروءة)</span>` : '<span style="color:#059669; margin-right:6px;">(جميعها مقروءة ومستلمة ✔️)</span>'}
                                        </span>
                                        <div style="display:flex; gap:8px; align-items:center;">
                                            ${activeCloudCount > 0 ? `
                                                <button onclick="acknowledgeAllCloudNotifications()" style="padding: 6px 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 9px; font-weight: 900; font-size: 0.82rem; cursor: pointer; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">
                                                    ✔️ استلام وقراءة كافة الرسائل السحابية
                                                </button>
                                            ` : ''}
                                            <button onclick="if (typeof window.checkCloudAnnouncements === 'function') { window.checkCloudAnnouncements(); setTimeout(() => showNotificationsModal('cloud'), 800); }" style="padding: 6px 14px; background: #8b5cf6; color: white; border: none; border-radius: 9px; font-weight: 900; font-size: 0.8rem; cursor: pointer; box-shadow: 0 2px 6px rgba(139, 92, 246, 0.3);">
                                                🔄 فحص الرسائل السحابية الآن
                                            </button>
                                        </div>
                                    </div>
                                    ${(() => {
                                        const ackCloudSet = new Set((window.acknowledgedCloud || []).map(String));
                                        return window.cloudAnnouncementsHistory.map((item, idx) => {
                                            const annNumber = item.id ? item.id : (idx + 1);
                                            const dateFormatted = item.receivedAt ? new Date(item.receivedAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
                                            const isAcknowledged = ackCloudSet.has(String(item.id));
                                            return `
                                            <div style="background: linear-gradient(135deg, #1e113a, #0f172a); border: 2px solid ${isAcknowledged ? 'rgba(255, 255, 255, 0.15)' : 'rgba(212, 175, 55, 0.7)'}; border-radius: 20px; padding: 22px 25px; color: white; box-shadow: 0 10px 25px rgba(0,0,0,0.25); position:relative;">
                                                <div style="position:absolute; top:18px; left:20px; display:flex; gap:8px; align-items:center;">
                                                    <span style="background: rgba(255,255,255,0.15); color: #fde047; font-size: 0.75rem; font-weight: 900; padding: 3px 10px; border-radius: 20px; border: 1px solid rgba(253, 224, 71, 0.4);">
                                                        #${annNumber}
                                                    </span>
                                                    ${isAcknowledged ? `
                                                        <span style="background:rgba(16,185,129,0.25); color:#a7f3d0; font-size:0.75rem; font-weight:900; padding:3px 10px; border-radius:20px; border:1px solid rgba(16,185,129,0.4);">
                                                            تم الاستلام والمطالعة ✔️
                                                        </span>
                                                    ` : `
                                                        <span style="background:#ef4444; color:#fff; font-size:0.75rem; font-weight:900; padding:3px 10px; border-radius:20px; box-shadow: 0 2px 6px rgba(239,68,68,0.4);">
                                                            رسالة جديدة غير مقروءة 🔔
                                                        </span>
                                                    `}
                                                </div>
                                                
                                                <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
                                                    <div style="width: 46px; height: 46px; background: linear-gradient(135deg, #d4af37, #b45309); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.35);">
                                                        ${item.icon || '📢'}
                                                    </div>
                                                    <div>
                                                        <h4 style="margin: 0; font-size: 1.18rem; font-weight: 900; color: #fde047;">${escapeStr(item.title || 'إشعار سحابي')}</h4>
                                                        <p style="margin: 3px 0 0; font-size: 0.78rem; color: #94a3b8; font-weight: bold;">
                                                            رسالة مباشرة من فريق التطوير ${dateFormatted ? `• 📅 ${dateFormatted}` : ''}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div style="background: rgba(255,255,255,0.06); border-radius: 14px; padding: 16px 18px; font-size: 0.95rem; line-height: 1.8; font-weight: 700; color: #f8fafc; margin-bottom: 14px; border: 1px solid rgba(255,255,255,0.08); white-space: pre-line;">
                                                    ${escapeHtml(item.message || 'لا توجد تفاصيل.')}
                                                </div>

                                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:14px; border-top:1px solid rgba(255,255,255,0.1); padding-top:12px;">
                                                    ${item.link ? `
                                                        <button onclick="window.open('${escapeStr(item.link)}', '_blank')" style="padding: 8px 18px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 10px; font-weight: 900; font-size:0.85rem; cursor: pointer; box-shadow: 0 3px 8px rgba(59,130,246,0.3);">
                                                            ${escapeStr(item.linkText || 'معرفة التفاصيل 🔗')}
                                                        </button>
                                                    ` : '<div></div>'}

                                                    <div>
                                                        ${isAcknowledged ? `
                                                            <span style="background:rgba(16, 185, 129, 0.15); color:#34d399; font-size:0.82rem; font-weight:900; padding:6px 14px; border-radius:10px; border:1px solid rgba(52, 211, 153, 0.3); display:inline-flex; align-items:center; gap:6px;">
                                                                <span>✔️</span> تم الاستلام والمطالعة
                                                            </span>
                                                        ` : `
                                                            <button onclick="window.acknowledgeCloudFromNotify('${escapeStr(item.id)}')" style="padding: 7px 18px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 10px; font-weight: 900; font-size:0.85rem; cursor: pointer; display:inline-flex; align-items:center; gap:6px; box-shadow: 0 3px 8px rgba(16,185,129,0.3);">
                                                                <span>✔️</span> تم الاطلاع والاستلام
                                                            </button>
                                                        `}
                                                    </div>
                                                </div>
                                            </div>`;
                                        }).join('');
                                    })()}
                                ` : `
                                    <div style="text-align: center; padding: 50px 20px; color: #64748b;">
                                        <div style="font-size: 3.5rem; margin-bottom: 12px;">☁️</div>
                                        <div style="font-weight: 900; font-size: 1.2rem; color: #0f172a;">لا توجد رسائل سحابية حالياً</div>
                                        <div style="font-size: 0.9rem; margin-top: 6px; color: #64748b;">جميع التحديثات والتهاني المباشرة من فريق التطوير ستظهر لك وتتراكم هنا فور نشرها.</div>
                                        <button onclick="if (typeof window.checkCloudAnnouncements === 'function') { window.checkCloudAnnouncements(); setTimeout(() => showNotificationsModal('cloud'), 1000); }" style="margin-top: 15px; padding: 9px 20px; background: #8b5cf6; color: white; border: none; border-radius: 10px; font-weight: 900; cursor: pointer; box-shadow:0 3px 10px rgba(139,92,246,0.3);">
                                            🔄 فحص وتحديث الرسائل السحابية الآن
                                        </button>
                                    </div>
                                `}
                            </div>
                        `}
                    </div> <!-- closes scrollable content area -->

                    <!-- Footer في أسفل مساحة المحتوى مع أزرار الإجراءات وزر الإغلاق الداكن -->
                            <div style="padding: 14px 28px; background: #ffffff; border-top: 1.5px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; flex-shrink: 0;">
                                <div>
                                    ${(activeTab === 'products' && activeProductsTotal > 0) ? `
                                        <button onclick="acknowledgeAllProductsNotifications()" style="padding: 9px 20px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 10px; font-weight: 900; cursor: pointer; font-size:0.86rem; box-shadow:0 2px 8px rgba(16,185,129,0.3);">
                                            <span>✔️</span> استلام وتوثيق كل تنبيهات البضاعة والصلاحية
                                        </button>
                                    ` : (activeTab === 'accounts' && activeAccountsTotal > 0) ? `
                                        <button onclick="acknowledgeAllAccountsNotifications()" style="padding: 9px 20px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 10px; font-weight: 900; cursor: pointer; font-size:0.86rem; box-shadow:0 2px 8px rgba(59,130,246,0.3);">
                                            <span>✔️</span> استلام وتوثيق كل تنبيهات الحسابات
                                        </button>
                                    ` : (activeTab === 'cloud' && activeCloudCount > 0) ? `
                                        <button onclick="acknowledgeAllCloudNotifications()" style="padding: 9px 20px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 10px; font-weight: 900; cursor: pointer; font-size:0.86rem; box-shadow:0 2px 8px rgba(16,185,129,0.3);">
                                            <span>✔️</span> استلام وقراءة كافة الرسائل السحابية
                                        </button>
                                    ` : (activeTab === 'archived' && totalReceiptCount > 0) ? `
                                        <button onclick="window.resetAcknowledgedNotifications()" style="padding: 9px 20px; background: #fee2e2; color: #dc2626; border: 1.5px solid #fca5a5; border-radius: 10px; font-weight: 900; cursor: pointer; font-size:0.86rem;">
                                            <span>🔄</span> استعادة جميع التنبيهات المستلمة للقوائم النشطة
                                        </button>
                                    ` : ''}
                                </div>
                                <button onclick="document.getElementById('notifyModal').remove()" style="padding: 10px 32px; background: #1e293b; color: white; border: none; border-radius: 10px; font-weight: 900; font-size:0.92rem; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='#0f172a'" onmouseout="this.style.background='#1e293b'">إغلاق</button>
                            </div>

                        </div> <!-- closes left main column -->

                    </div> <!-- closes modal body (flex row) -->

                </div> <!-- closes glass-card-premium -->
            `;

            const existingModal = document.getElementById('notifyModal');
            if (existingModal) {
                existingModal.innerHTML = modalContent;
            } else {
                const fullModal = `<div id="notifyModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.75); display:flex; align-items:center; justify-content:center; z-index:99999; animation: fadeIn 0.2s ease;">${modalContent}</div>`;
                document.body.insertAdjacentHTML('beforeend', fullModal);
            }
        };

        window.openStatementFromNotify = function(accountId) {
            const canView = (typeof currentUser !== 'undefined' && currentUser && (currentUser.role === 'admin' || (typeof hasPermission === 'function' && (hasPermission('accounts_statement') || hasPermission('accounts_view')))));
            if (!canView) {
                if (typeof showToast === 'function') showToast('⛔ عذراً، لا تمتلك صلاحية لعرض كشف حساب العملاء', 'error');
                return;
            }

            const notifyModal = document.getElementById('notifyModal');
            if (notifyModal) notifyModal.remove();

            if (typeof switchSection === 'function') {
                switchSection('accounts');
            }

            window.selectedAccountID = accountId;
            if (typeof renderAccountsTable === 'function') {
                renderAccountsTable();
            }
            if (typeof generateAccountStatement === 'function') {
                generateAccountStatement();
            }
        };

        function adjustInvoiceFont(part, val) {
            const preview = document.getElementById('invoiceLivePreview');
            if (!preview) return;

            if (part === 'header') {
                const header = preview.querySelector('div[style*="font-weight: 900"]');
                if (header) header.style.fontSize = (val/10) + 'rem';
            } else if (part === 'table') {
                const table = preview.querySelector('table');
                if (table) table.style.fontSize = (val/16) + 'rem';
            }
        }

        function loadPrintTemplateChoice() {
            const saved = getStore('bayan_print_template_choice');
            if (saved) {
                const s = JSON.parse(saved);
                currentSelectedTemplateType = s.type || 'فاتورة المبيعات';
                currentSelectedTemplateId = s.template || '0010 - 80mm';
            }
            // تمييز العناصر المختارة في القوائم
            document.querySelectorAll('.template-type-item').forEach(item => {
                if (item.innerText === currentSelectedTemplateType) {
                    item.classList.add('active');
                    item.style.background = '#3498db';
                    item.style.color = 'white';
                } else {
                    item.classList.remove('active');
                    item.style.background = 'transparent';
                    item.style.color = 'inherit';
                }
            });
            document.querySelectorAll('.template-item').forEach(item => {
                const onclickAttr = item.getAttribute('onclick') || '';
                if (onclickAttr.includes("'" + currentSelectedTemplateId + "'")) {
                    item.classList.add('active');
                    item.style.background = '#3498db';
                    item.style.color = 'white';
                } else {
                    item.classList.remove('active');
                    item.style.background = 'transparent';
                    item.style.color = 'inherit';
                }
            });
            refreshPinnedVisuals();
            updatePrintPreview();
        }
        // تكرار الحماية السحابية (تم النقل للأعلى للتوحيد)
        function showLockScreen(message) {
            let lockOverlay = document.getElementById('bayanLockScreen');
            if (!lockOverlay) {
                lockOverlay = document.createElement('div');
                lockOverlay.id = 'bayanLockScreen';
                lockOverlay.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.9); 
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    z-index: 1000000; color: white; text-align: center; font-family: 'Cairo', sans-serif;
                `;
                document.body.appendChild(lockOverlay);
            }

            lockOverlay.innerHTML = `
                <div style="background: white; color: #333; padding: 40px; border-radius: 20px; box-shadow: 0 0 50px rgba(0,0,0,0.5); border-top: 5px solid #c0392b;">
                    <div style="font-size: 5rem; margin-bottom: 20px;">🛡️</div>
                    <h2 style="margin-bottom: 20px; font-weight: 900;">بَيَان - حماية النظام</h2>
                    <p style="font-size: 1.2rem; margin-bottom: 30px; line-height: 1.6;">${message}</p>
                    <button onclick="location.reload()" style="background: #27ae60; color: white; border: none; padding: 12px 30px; border-radius: 10px; font-size: 1.1rem; font-weight: bold; cursor: pointer;">🔄 تحديث الحالة</button>
                    <div style="margin-top: 20px; font-size: 0.8rem; color: #888;">Hardware ID: <span id="lock-hwid">---</span></div>
                </div>
            `;
            getUniqueHWID().then(id => {
                const idEl = document.getElementById('lock-hwid');
                if (idEl) idEl.innerText = id;
            });
        }

        function checkLocalAccess() {
            const isSubscribed = window.activeLicense && window.activeLicense.isValid && window.activeLicense.plan !== 'باقة نسخة المجانية';
            const trialBanner = document.getElementById('trialBanner');
            const subModal = document.getElementById('subscriptionModal');
            const closeBtn = document.getElementById('closeSubBtn');

            if (isSubscribed) {
                if (trialBanner) trialBanner.classList.add('hidden');
                if (subModal) subModal.classList.add('hidden');
                return true;
            }

            const installDateStr = getStore('bayan_install_date');
            if (!installDateStr) {
                setStore('bayan_install_date', new Date().toISOString());
                return true;
            }

            const diffDays = Math.floor((new Date() - new Date(installDateStr)) / (1000 * 60 * 60 * 24));
            const timeExpired = diffDays >= 30;

            if (timeExpired) {
                showLockScreen("انتهت الفترة التجريبية.. تواصل مع عمرو إيهاب 01006825905");
                return false;
            } else {
                if (trialBanner) {
                    trialBanner.classList.remove('hidden');
                    const label = document.getElementById('trialDaysLeft');
                    if (label) {
                        label.innerHTML = `⏳ باقي لك <strong style="color:var(--accent-gold);">${Math.max(0, 30 - diffDays)}</strong> يوم في الفترة التجريبية المجانية.`;
                    }
                }
                return true;
            }
        }


        // تم حذف الدوال المكررة لضمان عمل النسخة الذهبية الجديدة

        // --- دالة جلب التاريخ والوقت للعملية ---
        function showProfessionalModal(content, maxWidth = '950px') {
            let modal = document.getElementById('detailsOverlay');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'detailsOverlay';
                modal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:12000; display:flex; align-items:center; justify-content:center;";
                document.body.appendChild(modal);
            }
            modal.innerHTML = `
                <div class="modal-draggable-content" style="background:white; width:95%; max-width:${maxWidth}; border-radius:15px; overflow:hidden; box-shadow:0 15px 50px rgba(0,0,0,0.3); animation: slideUp 0.3s ease-out; position: relative;">
                    ${content}
                </div>
            `;
            modal.classList.remove('hidden');

            // تفعيل السحب للنافذة الجديدة
            const contentDiv = modal.querySelector('.modal-draggable-content');
            if (contentDiv) makeElementDraggable(contentDiv);
        }

        function makeElementDraggable(el) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            // البحث عن الهيدر (أول ديف داخلي غالباً يكون هو الهيدر الملون)
            const header = el.querySelector('div[style*="background"]');
            if (header) {
                header.style.cursor = 'move';
                header.onmousedown = dragMouseDown;
            } else {
                el.onmousedown = dragMouseDown;
            }

            function dragMouseDown(e) {
                e = e || window.event;
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;

                const parent = el.parentElement;
                if (parent && parent.style.display === 'flex') {
                    parent.style.display = 'block';
                    el.style.position = 'absolute';
                    const rect = el.getBoundingClientRect();
                    el.style.top = rect.top + 'px';
                    el.style.left = rect.left + 'px';
                    el.style.transform = 'none';
                    el.style.margin = '0';
                }
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                el.style.top = (el.offsetTop - pos2) + "px";
                el.style.left = (el.offsetLeft - pos1) + "px";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        }
        window.makeElementDraggable = makeElementDraggable;

        function closeCustomModal() {
            const modal = document.getElementById('detailsOverlay');
            if (modal) modal.classList.add('hidden');
        }

        async function printBillFromData(invoiceId, type = '') {
            if (typeof viewInvoiceItems === 'function') {
                viewInvoiceItems(invoiceId, type, true);
            } else if (typeof printInvoice === 'function') {
                let items = transactions.filter(t => t.invoiceId == invoiceId);
                if (type && items.length > 0) {
                    const cleanT = String(type).trim();
                    const filtered = items.filter(t => {
                        const tt = String(t.type || '');
                        if (cleanT.includes('مرتجع')) return tt.includes('مرتجع');
                        if (cleanT.includes('بيع') || cleanT.includes('مبيعات')) return (tt.includes('بيع') || tt.includes('مبيعات')) && !tt.includes('مرتجع');
                        if (cleanT.includes('شراء') || cleanT.includes('مشتريات')) return (tt.includes('شراء') || tt.includes('مشتريات')) && !tt.includes('مرتجع');
                        return tt.includes(cleanT);
                    });
                    if (filtered.length > 0) items = filtered;
                }
                if (items.length === 0) return alert("لا تتوفر بيانات لهذه الفاتورة.");
                const head = items[0];
                let partnerName = head.partner || head.customer || '';
                let prevBal = 0;
                if (partnerName && !window.isGenericCashPartner(partnerName)) {
                    if (typeof getHistoricalPartnerBalance === 'function') {
                        prevBal = getHistoricalPartnerBalance(partnerName, head.invoiceId || head.id);
                    } else if (typeof getAccountBalance === 'function') {
                        prevBal = getAccountBalance(partnerName, head.invoiceId || head.id);
                    }
                }
                const totalAmt = parseFloat(head.total || 0);
                const paidAmt = parseFloat(head.paidAmount || head.paid || 0);
                const deferredAmt = parseFloat(head.deferred !== undefined ? head.deferred : (totalAmt - paidAmt));
                const hType = String(head.type || '');
                const isRet = hType.includes('مرتجع') || hType.includes('return');
                const isPur = hType.includes('شراء') || hType.includes('مشتريات') || hType.includes('purchase');
                const pDocType = isRet ? (isPur ? 'return_purchase' : 'return_sales') : (isPur ? 'purchase' : 'sales');
                const pDocTitle = isRet ? (isPur ? 'مرتجع مشتريات' : 'مرتجع مبيعات') : (isPur ? 'فاتورة شراء' : 'فاتورة مبيعات');

                printInvoice({
                    invoiceNumber: head.invoiceId || head.id,
                    invoiceType: isRet ? (isPur ? 'مرتجع مشتريات' : 'مرتجع مبيعات') : (head.type || 'بيع'),
                    paymentMethod: (typeof window.formatPaymentMethodDisplay === 'function') ? window.formatPaymentMethodDisplay(head) : (head.method || head.paymentMethod || 'نقدي'),
                    isReturn: isRet,
                    isPurchase: isPur,
                    docTitle: pDocTitle,
                    date: head.dateISO || head.date || '',
                    time: head.timeISO || '',
                    cashier: head.user || head.cashier || '',
                    customer: partnerName || 'عميل نقدي',
                    items: items.map(it => ({
                        name: it.product || it.name,
                        qty: parseFloat(it.qty || 1),
                        price: parseFloat(it.price || 0),
                        unit: it.unit || 'قطعة',
                        size: it.size || it.selectedSize || '',
                        color: it.color || it.selectedColor || ''
                    })),
                    totalAmount: totalAmt,
                    paid: paidAmt,
                    deferred: deferredAmt,
                    prevBalance: prevBal,
                    currentBalance: prevBal + deferredAmt,
                    docType: pDocType
                });
            }
            if (typeof closeCustomModal === 'function') closeCustomModal();
        }


        // دالة كشف الحساب السريع من شاشة البيع بدون مغادرة الصفحة
        async function openQuickCustomerInfo() {
            const customerNameInput = document.getElementById('customerName');
            const name = customerNameInput ? customerNameInput.value.trim() : '';

            if (!name || name === '---' || name === 'عميل نقدي') {
                return showCustomAlert({
                    type: 'warning',
                    titleText: '⚠️ تنبيه',
                    msg: 'يرجى اختيار عميل أولاً لعرض كشف الحساب السريع.'
                });
            }

            const acc = accounts.find(a => a.name === name);
            if (!acc) return alert("العميل غير موجود في سجل الحسابات.");

            const bal = getAccountBalance(name);
            const lastTrans = transactions.filter(t => t.partner === name).reverse().slice(0, 5);

            let transRows = lastTrans.map(t => `
                <tr style="font-size: 0.85rem;">
                    <td>${t.date}</td>
                    <td>${t.type}</td>
                    <td style="font-weight:bold;">${(parseFloat(t.total) || parseFloat(t.price) || 0).toFixed(2)}</td>
                    <td style="color: ${t.paidAmount > 0 ? 'green' : 'red'};">${(parseFloat(t.paidAmount) || 0).toFixed(2)}</td>
                </tr>
            `).join('');

            if (transRows === '') transRows = '<tr><td colspan="4" style="text-align:center; padding:10px;">لا توجد حركات سابقة</td></tr>';

            // معالجة العناوين والهواتف المتعددة (إذا وجد فاصل | أو ,)
            const addresses = acc.address ? acc.address.split(/[|,]/).map(s => s.trim()).filter(s => s) : [];
            const mobiles = acc.mobile ? acc.mobile.split(/[|,]/).map(s => s.trim()).filter(s => s) : [];

            let multiInfo = '';
            if (addresses.length > 1 || mobiles.length > 1) {
                multiInfo = `
                <div style="background:#fff3e0; padding:10px; border-radius:8px; margin-bottom:15px; border:1px solid #ffe0b2;">
                    <label style="font-size:0.8rem; font-weight:bold; color:#e67e22;">📍 اختر العنوان/الهاتف للطباعة:</label>
                    <select id="selectedAddress" onchange="currentSessionSelectedAddress = this.value" style="width:100%; margin-top:5px; padding:5px; border:1px solid #ddd; border-radius:4px;">
                        <option value="">-- اختر عنواناً للطباعة --</option>
                        ${addresses.map(addr => `<option value="${addr}" ${currentSessionSelectedAddress === addr ? 'selected' : ''}>${addr}</option>`).join('')}
                        ${mobiles.map(m => `<option value="${m}" ${currentSessionSelectedAddress === m ? 'selected' : ''}>هاتف: ${m}</option>`).join('')}
                    </select>
                </div>`;
            }

            const content = `
                <div style="direction:rtl; text-align:right; padding:15px; font-family:sans-serif;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--main-blue); padding-bottom:10px; margin-bottom:15px;">
                        <h2 style="margin:0; color:var(--main-blue);">👤 ملف العميل السريع</h2>
                        <span style="background:var(--box-red); color:white; padding:4px 12px; border-radius:15px; font-weight:bold; font-size:1.1rem;">${bal.toFixed(2)} ج.م</span>
                    </div>

                    ${multiInfo}

                    <p style="margin-bottom:10px; font-weight:bold; color:#555;">📋 آخر 5 حركات مسجلة:</p>
                    <table style="width:100%; border-collapse:collapse; margin-bottom:20px; text-align:center;">
                        <thead style="background:#eee;">
                            <tr><th style="padding:6px; border:1px solid #ddd;">التاريخ</th><th style="padding:6px; border:1px solid #ddd;">العملية</th><th style="padding:6px; border:1px solid #ddd;">المبلغ</th><th style="padding:6px; border:1px solid #ddd;">مدفوع</th></tr>
                        </thead>
                        <tbody>${transRows}</tbody>
                    </table>

                    <div style="display:flex; gap:10px; justify-content:center;">
                        <button onclick="closeCustomModal()" style="padding:8px 30px; background:#636e72; color:white; border:none; border-radius:8px; cursor:pointer;">إغلاق</button>
                        <button onclick="switchSection('accounts'); document.getElementById('accountsSearch').value='${name}'; renderAccountsTable(); closeCustomModal();" 
                            style="padding:8px 30px; background:var(--main-blue); color:white; border:none; border-radius:8px; cursor:pointer;">📂 ملف العميل الكامل</button>
                    </div>
                </div>
            `;

            showProfessionalModal(content);
        }

        window.renderCustomInvoiceModal = function(tx, autoPrint = false) {
            let typeName = 'فاتورة مبيعات';
            let typeColor = '#27ae60';
            let isTransfer = false, isReturn = false, isPurchase = false, isAdjustment = false;
            let isReceipt = false, isDisburse = false;
            
            let tType = String(tx.type || '').toLowerCase();
            if (tType === 'sale_return' || tType.includes('مرتجع بيع') || tType.includes('مرتجع مبيعات')) {
                typeName = 'مرتجع مبيعات'; typeColor = '#e67e22'; isReturn = true;
            } else if (tType === 'purchase_return' || tType.includes('مرتجع شراء') || tType.includes('مرتجع مشتريات')) {
                typeName = 'مرتجع مشتريات'; typeColor = '#d35400'; isReturn = true; isPurchase = true;
            } else if (tType === 'sale' || tType === 'بيع' || (tType.includes('بيع') && !tType.includes('مرتجع'))) {
                typeName = 'فاتورة مبيعات'; typeColor = '#27ae60';
            } else if (tType === 'purchase' || tType === 'شراء' || (tType.includes('شراء') && !tType.includes('مرتجع')) || (tType.includes('مشتريات') && !tType.includes('مرتجع'))) {
                typeName = 'فاتورة مشتريات'; typeColor = '#2980b9'; isPurchase = true;
            } else if (tType.includes('transfer') || tType.includes('تحويل') || tType === 'stock') {
                if (tx.transferStatus === 'rejected') {
                    typeName = 'إذن تحويل مخزني (❌ ملغي ومرفوض)';
                    typeColor = '#dc2626';
                } else if (tx.transferStatus === 'pending') {
                    typeName = 'إذن تحويل مخزني (⏳ معلق بانتظار الاستلام)';
                    typeColor = '#d97706';
                } else {
                    typeName = 'إذن تحويل مخزني';
                    typeColor = '#16a085';
                }
                isTransfer = true;
            } else if (tType.includes('adjustment') || tType.includes('تسوية') || tType.includes('جرد')) {
                typeName = 'محضر تسوية مخزنية'; typeColor = '#d97706'; isAdjustment = true;
            } else if (tType === 'receipt' || tType.includes('قبض')) {
                typeName = 'سند استلام نقدية (قبض)'; typeColor = '#8e44ad'; isReceipt = true;
            } else if (tType === 'payment' || tType === 'disburse' || tType.includes('صرف') || tType.includes('دفع')) {
                typeName = 'سند صرف نقدية'; typeColor = '#c0392b'; isDisburse = true;
            }
            
            let isFinancial = isReceipt || isDisburse;
            let items = tx.items || tx.products || tx.cart || tx.details || [];

            // تصفية أسطر الهيدر المالي الوهمية الخالية من أسماء الأصناف
            if (Array.isArray(items) && items.length > 1) {
                items = items.filter(i => {
                    const n = (i.name || i.product || i.productName || '').trim();
                    const q = parseFloat(i.qty || i.quantity || 0);
                    if ((!n || n === 'صنف غير محدد') && q === 0) return false;
                    return true;
                });
            }

            const hasVariants = !isFinancial && !(typeof document !== 'undefined' && document.body.classList.contains('bayan-variants-disabled')) && (
                items.some(i => (i.size || i.selectedSize || i.color || i.selectedColor)) ||
                (typeof document !== 'undefined' && document.body.classList.contains('bayan-variants-enabled'))
            );

            let itemsHtml = '';
            let rawSubTotal = 0;
            let grandTotal = 0;
            let totalItemsDiscount = 0;
            let totalItemsAddition = 0;
            
            items.forEach(item => {
                let name = item.name || item.product || item.productName || 'صنف غير محدد';
                let qty = parseFloat(item.qty != null ? item.qty : (item.quantity || 0));
                let unit = item.selectedUnit ? (typeof item.selectedUnit === 'object' ? item.selectedUnit.unitName : item.selectedUnit) : (item.unit || '');
                let price = parseFloat(item.price != null ? item.price : (item.costPrice || item.purchasePrice || 0));
                let lineGross = qty * price;
                rawSubTotal += lineGross;

                let itemDisc = parseFloat(item.discount != null ? item.discount : (item.itemDiscount != null ? item.itemDiscount : 0)) || 0;
                let itemDiscType = item.discountType || item.itemDiscountType || 'val';
                let discAmount = (itemDiscType === 'perc' && itemDisc > 0) ? (lineGross * itemDisc / 100) : itemDisc;
                
                let itemAdd = parseFloat(item.addition != null ? item.addition : (item.extra != null ? item.extra : 0)) || 0;
                
                let total = parseFloat(item.total != null ? item.total : (lineGross - discAmount + itemAdd));
                grandTotal += total;
                totalItemsDiscount += discAmount;
                totalItemsAddition += itemAdd;
                
                let itemSize = item.size || item.selectedSize || '';
                let itemColor = item.color || item.selectedColor || '';
                let sizeBadge = itemSize ? `<span style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe; padding:2px 8px; border-radius:6px; font-weight:800; font-size:0.78rem;">${itemSize}</span>` : `<span style="color:#cbd5e1;">-</span>`;
                let colorBadge = itemColor ? `<span style="background:#f1f5f9; color:#1e293b; border:1px solid #cbd5e1; padding:2px 8px; border-radius:6px; font-weight:800; font-size:0.78rem;">${itemColor}</span>` : `<span style="color:#cbd5e1;">-</span>`;

                let discAddBadge = '';
                if (discAmount > 0.001 && itemAdd > 0.001) {
                    discAddBadge = `
                        <div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
                            <span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:1px 6px; border-radius:5px; font-weight:800; font-size:0.74rem;">خصم -${discAmount.toFixed(2)}</span>
                            <span style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:1px 6px; border-radius:5px; font-weight:800; font-size:0.74rem;">إضافة +${itemAdd.toFixed(2)}</span>
                        </div>
                    `;
                } else if (discAmount > 0.001) {
                    const percLabel = (itemDiscType === 'perc' && itemDisc > 0) ? ` (${itemDisc}%)` : '';
                    discAddBadge = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:2px 8px; border-radius:6px; font-weight:800; font-size:0.78rem; display:inline-block;" title="خصم على الصنف">-${discAmount.toFixed(2)}${percLabel}</span>`;
                } else if (itemAdd > 0.001) {
                    discAddBadge = `<span style="background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:2px 8px; border-radius:6px; font-weight:800; font-size:0.78rem; display:inline-block;" title="إضافة على الصنف">+${itemAdd.toFixed(2)} ج.م</span>`;
                } else {
                    discAddBadge = `<span style="color:#cbd5e1; font-weight:700;">-</span>`;
                }

                let method = tx.method || tx.paymentMethod || 'نقدي';
                let cashier = tx.user || tx.cashier || '-';
                
                itemsHtml += `
                    <tr style="border-bottom:1px solid #f1f5f9; transition: 0.15s;" onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='#ffffff';">
                        <td style="padding:11px 14px; text-align:right; font-weight:800; color:#0f172a; font-size:0.91rem;">${name}</td>
                        ${!isFinancial ? `
                            ${hasVariants ? `
                                <td style="padding:11px; text-align:center;">${sizeBadge}</td>
                                <td style="padding:11px; text-align:center;">${colorBadge}</td>
                            ` : ''}
                            <td style="padding:11px; text-align:center; color:#334155; font-weight:800;">${qty} <span style="font-size:0.76rem; color:#64748b;">${unit}</span></td>
                            <td style="padding:11px; text-align:center; color:#475569; font-weight:700;">${price.toFixed(2)} <span style="font-size:0.74rem; color:#94a3b8;">ج.م</span></td>
                            <td style="padding:11px; text-align:center;">${discAddBadge}</td>
                        ` : `
                            <td style="padding:11px; text-align:center; color:#475569; font-weight:700;">${method}</td>
                            <td style="padding:11px; text-align:center; color:#475569; font-weight:700;">${cashier}</td>
                        `}
                        <td style="padding:11px 14px; text-align:center; font-weight:900; color:#0f172a; font-size:0.96rem;">${total.toFixed(2)} <span style="font-size:0.74rem; color:#94a3b8;">ج.م</span></td>
                    </tr>
                `;
            });
            
            let existing = document.getElementById('customViewModalOverlay');
            if (existing) existing.remove();
            let existingVoucher = document.getElementById('financialVoucherModalOverlay');
            if (existingVoucher) existingVoucher.remove();
            
            let modal = document.createElement('div');
            modal.id = 'customViewModalOverlay';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(15, 23, 42, 0.6); 
                z-index: 12500; display: flex; align-items: center; justify-content: center;
                direction: rtl; font-family: 'Cairo', sans-serif;
            `;

            // خصم وإضافة الفاتورة العامة الصريحة فقط دون تسريب من بنود الأصناف
            let invDiscountVal = parseFloat(tx.invoiceDiscount != null ? tx.invoiceDiscount : (tx.discountAmount || 0)) || 0;
            let invDiscountType = tx.invoiceDiscountType || 'val';
            let invDiscountAmount = (invDiscountType === 'perc' && invDiscountVal > 0) ? (rawSubTotal * invDiscountVal / 100) : invDiscountVal;

            let invTaxVal = parseFloat(tx.invoiceTax != null ? tx.invoiceTax : 0) || 0;
            let invTaxType = tx.invoiceTaxType || 'val';
            let invTaxAmount = (invTaxType === 'perc' && invTaxVal > 0) ? (rawSubTotal * invTaxVal / 100) : invTaxVal;

            // حساب الخصم والإضافة الإجمالية بدقة لمنع التكرار (Double Counting)
            let totalDiscountDisplay = 0;
            if (invDiscountAmount > 0.001 && totalItemsDiscount > 0.001) {
                if (Math.abs(totalItemsDiscount - invDiscountAmount) < 0.05) {
                    totalDiscountDisplay = invDiscountAmount;
                } else {
                    totalDiscountDisplay = totalItemsDiscount + invDiscountAmount;
                }
            } else {
                totalDiscountDisplay = totalItemsDiscount > 0 ? totalItemsDiscount : invDiscountAmount;
            }

            let totalAdditionDisplay = 0;
            if (invTaxAmount > 0.001 && totalItemsAddition > 0.001) {
                if (Math.abs(totalItemsAddition - invTaxAmount) < 0.05) {
                    totalAdditionDisplay = invTaxAmount;
                } else {
                    totalAdditionDisplay = totalItemsAddition + invTaxAmount;
                }
            } else {
                totalAdditionDisplay = totalItemsAddition > 0 ? totalItemsAddition : invTaxAmount;
            }

            let invoiceFinalTotal = 0;
            if (tx.invoiceGrandTotal && parseFloat(tx.invoiceGrandTotal) > 0) {
                invoiceFinalTotal = parseFloat(tx.invoiceGrandTotal);
            } else if (tx.finalTotal && parseFloat(tx.finalTotal) > 0) {
                invoiceFinalTotal = parseFloat(tx.finalTotal);
            } else if (tx.grandTotal && parseFloat(tx.grandTotal) > 0) {
                invoiceFinalTotal = parseFloat(tx.grandTotal);
            } else {
                invoiceFinalTotal = Math.max(0, rawSubTotal - totalDiscountDisplay + totalAdditionDisplay);
            }
            if (invoiceFinalTotal <= 0 && grandTotal > 0) {
                invoiceFinalTotal = grandTotal;
            }
            
            let methodVal = String(tx.method || tx.paymentMethod || '').trim();
            let paidVal = parseFloat(tx.paidAmount != null ? tx.paidAmount : (tx.paid != null ? tx.paid : 0));
            if (isNaN(paidVal)) paidVal = 0;
            
            // التحقق من الآجل: فقط إذا كانت طريقة الدفع تنص صراحة على الآجل أو مسجل متبقي حقيقي في بيانات الفاتورة
            let isExplicitDeferred = methodVal.includes('آجل') || methodVal.includes('أجل') || methodVal.includes('ذمم') || methodVal.includes('deferred') || methodVal.includes('credit') || methodVal.includes('تقسيط');
            let recordedRemaining = parseFloat(tx.deferred != null ? tx.deferred : (tx.remaining != null ? tx.remaining : 0));
            if (isNaN(recordedRemaining) || recordedRemaining < 0.001) recordedRemaining = 0;

            let isDeferred = isExplicitDeferred || (recordedRemaining > 0.001);
            let remainingVal = 0;

            if (isDeferred) {
                if (recordedRemaining > 0.001) {
                    remainingVal = recordedRemaining;
                } else {
                    remainingVal = Math.max(0, invoiceFinalTotal - paidVal);
                }
                if (isNaN(remainingVal) || remainingVal < 0) remainingVal = Math.max(0, invoiceFinalTotal - paidVal);
            } else {
                remainingVal = 0;
                paidVal = invoiceFinalTotal; // نقدي خالص ومسدد
            }

            let displayMethod = (typeof window.formatPaymentMethodDisplay === 'function')
                ? window.formatPaymentMethodDisplay(tx, { paidVal, remainingVal, isDeferred })
                : (isDeferred ? '⏳ آجل (ذمم)' : (methodVal || '💵 نقدي (كاش)'));
            
            let modalWidth = hasVariants ? '920px' : '820px';

            let typeIcon = '🧾';
            if (isReturn) typeIcon = '↩️';
            else if (isPurchase) typeIcon = '📦';
            else if (isTransfer) typeIcon = '🚚';
            else if (isAdjustment) typeIcon = '⚖️';
            else if (isReceipt) typeIcon = '💰';
            else if (isDisburse) typeIcon = '💸';

            // استخراج وتنسيق التاريخ والوقت بدقة وبشكل واضح ومقروء
            let displayDate = '';
            let displayTime = '';
            
            // 1. استخراج التاريخ بدقة
            if (tx.dateISO) {
                displayDate = tx.dateISO;
            } else if (tx.date) {
                const rawDateStr = String(tx.date).trim();
                displayDate = rawDateStr.includes('T') ? rawDateStr.split('T')[0] : (rawDateStr.includes(' ') ? rawDateStr.split(' ')[0] : rawDateStr);
            } else if (tx.timestamp) {
                const d = new Date(tx.timestamp);
                displayDate = !isNaN(d.getTime()) ? (d.toLocaleDateString('ar-EG') || d.toISOString().slice(0, 10)) : String(tx.timestamp);
            }
            if (!displayDate) displayDate = '-';

            // 2. استخراج الوقت بدقة من كافة المصادر الممكنة
            if (tx.timeISO) {
                displayTime = tx.timeISO;
            } else if (tx.time) {
                displayTime = tx.time;
            } else if (tx.date && String(tx.date).includes(' ')) {
                displayTime = String(tx.date).trim().split(' ').slice(1).join(' ');
            } else if (tx.date && String(tx.date).includes('T')) {
                displayTime = (String(tx.date).split('T')[1] || '').split('.')[0].slice(0, 8);
            } else if (tx.dateISO && String(tx.dateISO).includes('T')) {
                displayTime = (String(tx.dateISO).split('T')[1] || '').split('.')[0].slice(0, 8);
            } else if (tx.timestamp) {
                const d = new Date(tx.timestamp);
                if (!isNaN(d.getTime())) {
                    displayTime = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                }
            }

            // 3. تنظيف وتوحيد رقم الفاتورة المعروض وتجنب أرقام المعرفات الطويلة
            let displayInvoiceId = String(tx.invoiceId != null && tx.invoiceId !== '' ? tx.invoiceId : (tx.invoiceNumber || tx.id || '-')).trim();
            if (displayInvoiceId.includes('_item_')) {
                displayInvoiceId = displayInvoiceId.split('_item_')[0];
            }
            if (displayInvoiceId.startsWith('TX_') || (displayInvoiceId.length >= 11 && /^\d+$/.test(displayInvoiceId))) {
                if (tx.invoiceId && String(tx.invoiceId) !== displayInvoiceId && !String(tx.invoiceId).startsWith('TX_') && String(tx.invoiceId).length < 11) {
                    displayInvoiceId = String(tx.invoiceId);
                } else if (tx.taxInvoiceSeq || tx.dailySeq) {
                    displayInvoiceId = String(tx.taxInvoiceSeq || tx.dailySeq);
                } else if (typeof window.extractNumericInvoiceId === 'function') {
                    const num = window.extractNumericInvoiceId(displayInvoiceId);
                    if (num > 0 && num < 100000000) displayInvoiceId = String(num);
                }
            }

            let modalContent = `
                <div style="background: #ffffff; width: ${modalWidth}; max-width: 96vw; max-height: 92vh; border-radius: 24px; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28), 0 4px 12px rgba(0,0,0,0.06); display: flex; flex-direction: column; overflow: hidden; border: 1.5px solid #cbd5e1; direction: rtl; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">
                    
                    <!-- 1. Header بتدرج بنفسجي غامق ملكي فاخر مع هوية نوع العملية ووضوح التاريخ والوقت -->
                    <div style="background: linear-gradient(135deg, #180928 0%, #2a0845 50%, #431068 100%); padding: 18px 24px; color: white; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${typeColor}; position: relative; box-shadow: 0 4px 20px rgba(42, 8, 69, 0.25);">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <div style="width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, ${typeColor}, #2a0845); display: flex; align-items: center; justify-content: center; font-size: 1.45rem; box-shadow: 0 4px 14px rgba(0,0,0,0.35); border: 1.5px solid rgba(255,255,255,0.25);">
                                ${typeIcon}
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 9px; flex-wrap: wrap;">
                                    <span style="background: ${typeColor}; color: #ffffff; font-size: 0.76rem; font-weight: 900; padding: 3px 12px; border-radius: 20px; letter-spacing: 0.3px; box-shadow: 0 2px 8px rgba(0,0,0,0.25);">${typeName}</span>
                                    <h3 style="margin: 0; font-size: 1.25rem; font-weight: 900; color: #ffffff; letter-spacing: -0.3px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                                        رقم #${displayInvoiceId}
                                    </h3>
                                </div>
                                <div style="font-size: 0.8rem; color: #f1f5f9; font-weight: 700; margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <span style="background: rgba(255,255,255,0.16); color: #ffffff; padding: 3px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.2);">
                                        <span>📅</span>
                                        <span style="font-weight: 800;">${displayDate}</span>
                                    </span>
                                    ${displayTime ? `
                                        <span style="background: rgba(255,255,255,0.16); color: #f5f3ff; padding: 3px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.2);">
                                            <span>🕒</span>
                                            <span style="font-weight: 800;">${displayTime}</span>
                                        </span>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        <button onclick="document.getElementById('customViewModalOverlay').remove()" 
                            style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #ffffff; font-size: 1.35rem; cursor: pointer; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; transition: all 0.2s;"
                            onmouseover="this.style.background='rgba(239,68,68,0.4)'; this.style.borderColor='#ef4444';"
                            onmouseout="this.style.background='rgba(255,255,255,0.15)'; this.style.borderColor='rgba(255,255,255,0.25)';">
                            &times;
                        </button>
                    </div>
                    
                    <!-- 2. محتوى النافذة الرئيسي -->
                    <div style="padding: 20px 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; background: #ffffff;" class="fast-scrollbar">
                        
                        <!-- كروت تفاصيل الفاتورة -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                            ${isTransfer ? `
                                <div style="background: #f8fafc; padding: 11px 15px; border-radius: 13px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 3px;">
                                    <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">📦 مخزن المصدر:</span>
                                    <span style="font-weight: 900; color: #2563eb; font-size: 0.94rem;">${tx.sourceWarehouse || tx.fromWarehouse || tx.from || '-'}</span>
                                </div>
                                <div style="background: #f8fafc; padding: 11px 15px; border-radius: 13px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 3px;">
                                    <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">🏁 مخزن الوجهة:</span>
                                    <span style="font-weight: 900; color: #059669; font-size: 0.94rem;">${tx.warehouse || tx.toWarehouse || tx.to || '-'}</span>
                                </div>
                            ` : isAdjustment ? `
                                <div style="background: #f8fafc; padding: 11px 15px; border-radius: 13px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 3px;">
                                    <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">⚖️ نوع العملية:</span>
                                    <span style="font-weight: 900; color: #d97706; font-size: 0.94rem;">${tx.adjustmentType || (tx.type && tx.type.includes('عجز') ? 'تسوية عجز مخزني 📉' : (tx.type && tx.type.includes('زيادة') ? 'تسوية زيادة مخزنية 📈' : 'تسوية جرد مخزني ⚖️'))}</span>
                                </div>
                                <div style="background: #f8fafc; padding: 11px 15px; border-radius: 13px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 3px;">
                                    <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">👤 الطرف / الجهة:</span>
                                    <span style="font-weight: 900; color: #0f172a; font-size: 0.94rem;">${tx.customer || tx.partner || tx.account || 'جرد مخزني'}</span>
                                </div>
                            ` : `
                                <div style="background: #f8fafc; padding: 11px 15px; border-radius: 13px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 3px;">
                                    <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">👤 ${isPurchase ? 'المورد / الحساب:' : 'العميل / الحساب:'}</span>
                                    <span style="font-weight: 900; color: #0f172a; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${tx.customer || tx.partner || tx.account || tx.supplier || (isPurchase ? 'مورد نقدي' : 'عميل نقدي')}
                                    </span>
                                </div>
                                <div style="background: #f8fafc; padding: 11px 15px; border-radius: 13px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 3px;">
                                    <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">💳 طريقة السداد والدفع:</span>
                                    <span style="font-weight: 900; color: ${isDeferred ? '#b45309' : '#047857'}; font-size: 0.9rem;">${displayMethod}</span>
                                </div>
                            `}
                            <div style="background: #f8fafc; padding: 11px 15px; border-radius: 13px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 3px;">
                                <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">🏢 المخزن والكاشير:</span>
                                <span style="font-weight: 900; color: #0f172a; font-size: 0.9rem;">
                                    <span style="color: #2563eb;">${tx.warehouse || 'المخزن الرئيسي'}</span> • <span>${tx.cashier || tx.user || '-'}</span>
                                </span>
                            </div>
                            <div style="background: #f8fafc; padding: 11px 15px; border-radius: 13px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 3px;">
                                <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">💻 جهاز الإصدار والمزامنة:</span>
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <span style="font-weight: 900; color: #0f172a; font-size: 0.88rem;">${tx.terminal || 'الجهاز الرئيسي 💻'}</span>
                                    <button type="button" onclick="if(window.showTerminalInfoModal) window.showTerminalInfoModal('${tx.invoiceId || tx.id}')" 
                                        style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:50%; width:20px; height:20px; font-size:0.7rem; font-weight:900; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; padding:0; line-height:1; transition:0.2s;" 
                                        title="تفاصيل جهاز البيع والمزامنة">❓</button>
                                </div>
                            </div>
                            ${tx.notes ? `
                                <div style="grid-column: 1 / -1; background: #fffbeb; border: 1px solid #fde68a; padding: 9px 14px; border-radius: 11px; font-size: 0.84rem; color: #92400e; font-weight: 700; display:flex; align-items:center; gap:8px;">
                                    <span>📝</span>
                                    <span><b>ملاحظات:</b> ${tx.notes}</span>
                                </div>
                            ` : ''}
                        </div>
                        
                        <!-- جدول بنود وأصناف الفاتورة -->
                        <div style="border: 1px solid #e2e8f0; border-radius: 15px; overflow-y: auto; max-height: 290px; background: white; box-shadow: 0 1px 4px rgba(0,0,0,0.03);" class="fast-scrollbar">
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem;">
                                <thead style="background: #f8fafc; position: sticky; top: 0; z-index: 5; border-bottom: 2px solid #e2e8f0;">
                                    <tr>
                                        <th style="padding: 12px 14px; text-align: right; font-size: 0.83rem; color: #334155; font-weight: 900;">${isFinancial ? 'البيان' : 'الصنف'}</th>
                                        ${!isFinancial ? `
                                            ${hasVariants ? `
                                                <th style="padding: 12px; text-align: center; font-size: 0.83rem; color: #334155; width: 85px; font-weight: 900;">المقاس</th>
                                                <th style="padding: 12px; text-align: center; font-size: 0.83rem; color: #334155; width: 85px; font-weight: 900;">اللون</th>
                                            ` : ''}
                                            <th style="padding: 12px; text-align: center; font-size: 0.83rem; color: #334155; width: 95px; font-weight: 900;">الكمية</th>
                                            <th style="padding: 12px; text-align: center; font-size: 0.83rem; color: #334155; width: 115px; font-weight: 900;">${isPurchase ? 'سعر التكلفة' : 'السعر'}</th>
                                            <th style="padding: 12px; text-align: center; font-size: 0.83rem; color: #b91c1c; width: 125px; font-weight: 900; background: #fef2f2;">الخصم / الإضافة</th>
                                        ` : `
                                            <th style="padding: 12px; text-align: center; font-size: 0.83rem; color: #334155; width: 150px; font-weight: 900;">طريقة الدفع</th>
                                            <th style="padding: 12px; text-align: center; font-size: 0.83rem; color: #334155; width: 150px; font-weight: 900;">بواسطة</th>
                                        `}
                                        <th style="padding: 12px 14px; text-align: center; font-size: 0.83rem; color: #334155; width: 135px; font-weight: 900;">${isFinancial ? 'المبلغ' : 'الإجمالي'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml || '<tr><td colspan="' + (!isFinancial ? (hasVariants ? '7' : '5') : '4') + '" style="text-align:center; padding:24px; color:#94a3b8; font-weight:bold;">لا توجد أصناف</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                        
                        <!-- شريط الملخص المالي المحاسبي الشامل -->
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding: 13px 16px; border-top: 1.5px solid #e2e8f0; background: #f8fafc; border-radius: 15px;">
                            ${(() => {
                                let pName = tx.customer || tx.partner || tx.account || tx.supplier || '';
                                if (pName && !window.isGenericCashPartner(pName) && typeof getAccountBalance === 'function') {
                                    const curBal = getAccountBalance(pName);
                                    const balColor = curBal > 0.01 ? '#dc2626' : (curBal < -0.01 ? '#059669' : '#475569');
                                    const balBg = curBal > 0.01 ? '#fef2f2' : (curBal < -0.01 ? '#ecfdf5' : '#ffffff');
                                    const balBorder = curBal > 0.01 ? '#fca5a5' : (curBal < -0.01 ? '#a7f3d0' : '#cbd5e1');
                                    const balLabel = curBal > 0.01 ? `مديونية عليه (${curBal.toFixed(2)} ج.م)` : (curBal < -0.01 ? `رصيد له (${Math.abs(curBal).toFixed(2)} ج.م)` : 'خالص (0.00 ج.م)');
                                    return `
                                        <div style="background: ${balBg}; border: 1.5px solid ${balBorder}; padding: 7px 14px; border-radius: 11px; display: flex; flex-direction: column;">
                                            <span style="font-size: 0.72rem; color: #64748b; font-weight: 800;">👤 رصيد الحساب الإجمالي:</span>
                                            <div style="font-size: 0.98rem; font-weight: 900; color: ${balColor};">${balLabel}</div>
                                        </div>
                                    `;
                                }
                                return '<div></div>';
                            })()}
                            <div style="display: flex; justify-content: flex-end; gap: 10px; align-items: center; flex-wrap: wrap;">
                                ${(totalDiscountDisplay > 0.001 || totalAdditionDisplay > 0.001) ? `
                                    <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 10px; text-align: center;">
                                        <span style="font-size: 0.72rem; color: #64748b; font-weight: bold; display: block;">المجموع قبل الخصم:</span>
                                        <span style="font-size: 0.95rem; font-weight: 800; color: #475569;">${rawSubTotal.toFixed(2)} ج.م</span>
                                    </div>
                                ` : ''}
                                ${totalDiscountDisplay > 0.001 ? `
                                    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 6px 12px; border-radius: 10px; text-align: center;">
                                        <span style="font-size: 0.72rem; color: #b91c1c; font-weight: bold; display: block;">إجمالي الخصم:</span>
                                        <span style="font-size: 1.05rem; font-weight: 900; color: #dc2626;">-${totalDiscountDisplay.toFixed(2)} ج.م</span>
                                    </div>
                                ` : ''}
                                ${totalAdditionDisplay > 0.001 ? `
                                    <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 6px 12px; border-radius: 10px; text-align: center;">
                                        <span style="font-size: 0.72rem; color: #0369a1; font-weight: bold; display: block;">إضافات / ضريبة:</span>
                                        <span style="font-size: 1.05rem; font-weight: 900; color: #0284c7;">+${totalAdditionDisplay.toFixed(2)} ج.م</span>
                                    </div>
                                ` : ''}
                                <div style="background: linear-gradient(135deg, #0f172a, #1e293b); color: white; padding: 7px 18px; border-radius: 12px; text-align: center; box-shadow: 0 4px 14px rgba(15,23,42,0.25);">
                                    <span style="font-size: 0.72rem; color: #ffffff; opacity: 0.95; font-weight: 800; display: block;">${isFinancial ? 'إجمالي المبلغ:' : 'صافي الفاتورة:'}</span>
                                    <div style="font-size: 1.28rem; font-weight: 900; color: #38bdf8;">${invoiceFinalTotal.toFixed(2)} <span style="font-size: 0.75rem; color: #cbd5e1;">ج.م</span></div>
                                </div>
                                ${!isTransfer && !isAdjustment && !isFinancial ? `
                                    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 6px 12px; border-radius: 10px; text-align: center;">
                                        <span style="font-size: 0.72rem; color: #047857; font-weight: bold; display: block;">${isReturn ? 'المبلغ المرتجع:' : 'المدفوع:'}</span>
                                        <div style="font-size: 1.1rem; font-weight: 900; color: #059669;">${paidVal.toFixed(2)} ج.م</div>
                                    </div>
                                    ${!isReturn && (isDeferred || remainingVal > 0.001) ? `
                                        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 6px 12px; border-radius: 10px; text-align: center;">
                                            <span style="font-size: 0.72rem; color: #b91c1c; font-weight: bold; display: block;">المتبقي (آجل):</span>
                                            <div style="font-size: 1.1rem; font-weight: 900; color: #dc2626;">${remainingVal.toFixed(2)} ج.م</div>
                                        </div>
                                    ` : ''}
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <!-- 3. شريط الأزرار والإجراءات السفلي -->
                    <div style="padding: 15px 24px; background: #f8fafc; border-top: 1.5px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                        <button onclick="document.getElementById('customViewModalOverlay').remove()" 
                            style="padding: 9px 22px; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 11px; font-weight: 800; color: #475569; font-size: 0.88rem; cursor: pointer; transition: 0.2s;"
                            onmouseover="this.style.background='#f1f5f9'; this.style.borderColor='#94a3b8';"
                            onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1';">
                            إغلاق ✕
                        </button>
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <button id="customPrintBtn" 
                                style="padding: 10px 26px; background: linear-gradient(135deg, #2563eb, #1d4ed8); border: none; border-radius: 11px; font-weight: 900; color: white; font-size: 0.92rem; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);"
                                onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 18px rgba(37, 99, 235, 0.45)';"
                                onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 14px rgba(37, 99, 235, 0.35)';">
                                <span>🖨️</span>
                                <span>طباعة المستند</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            const executePrint = function() {
                if (isTransfer) {
                    const shopName    = document.getElementById('shopName')?.value || 'بـيـان POS';
                    const shopAddress = document.getElementById('shopAddress')?.value || '';
                    const shopPhone   = document.getElementById('shopPhone1')?.value || '';
                    const footerMsg   = document.getElementById('printFooterMsg')?.value || 'شكراً لزيارتكم!';
                    
                    let wFrom = 'المخزن الرئيسي';
                    let wTo = 'مخزن فرعي';
                    if (tx.partner && tx.partner.includes('->')) {
                        const parts = tx.partner.split('->');
                        wFrom = parts[0].trim();
                        wTo = parts[1].trim();
                    }
                    
                    let date = tx.dateISO ? (tx.dateISO + ' ' + (tx.timeISO || '')) : (tx.date || '-');
                    
                    let rowsHtml = '';
                    let totalValue = 0;
                    items.forEach((item, idx) => {
                        const qty = parseFloat(item.qty || item.quantity || 0);
                        const price = parseFloat(item.price || item.costPrice || item.purchasePrice || 0);
                        const total = qty * price;
                        totalValue += total;
                        let sSize = item.size || item.selectedSize || '';
                        let sColor = item.color || item.selectedColor || '';

                        if (!sSize && item.name) {
                            const pInfo = (typeof productsDB !== 'undefined' && Array.isArray(productsDB)) ? productsDB.find(p => p.id === item.id || p.name === item.name) : null;
                            if (pInfo && pInfo.variants && pInfo.variants.length > 0) {
                                sSize = pInfo.variants[0].size || '';
                                sColor = pInfo.variants[0].color || '';
                            }
                        }

                        const displaySize = (sSize && sSize !== '-') ? sSize : 'عام';
                        const displayColor = (sColor && sColor !== '-') ? sColor : 'عام';

                        rowsHtml += `
                            <tr>
                                <td style="padding: 6px 8px; border: 1px solid #000;">${idx + 1}</td>
                                <td style="text-align:right; padding: 6px 10px; border: 1px solid #000; font-weight:bold;">${item.name}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000; font-weight:bold; color:#047857;">${displaySize}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000; font-weight:bold; color:#1d4ed8;">${displayColor}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000; font-weight:bold;">${qty} ${item.unit || ''}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000;">${price.toFixed(2)}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000; font-weight:bold;">${total.toFixed(2)}</td>
                            </tr>
                        `;
                    });

                    const content = `
                        <div class="print-container" style="direction:rtl; font-family:Cairo, sans-serif; padding: 20px;">
                            <div style="text-align:center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                                <h1 style="margin:0;">${shopName}</h1>
                                ${shopAddress ? `<div style="font-size:12px; color:#555; margin-top:2px;">${shopAddress}</div>` : ''}
                                ${shopPhone ? `<div style="font-size:12px; color:#555; margin-top:2px;">هاتف: ${shopPhone}</div>` : ''}
                                <h2 style="margin:5px 0; background:#000; color:#fff; display:inline-block; padding:5px 20px; border-radius:5px;">إذن تحويل مخزني</h2>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom: 20px; font-weight:bold;">
                                <div>من مخزن: <span style="text-decoration:underline;">${wFrom}</span></div>
                                <div>إلى مخزن: <span style="text-decoration:underline;">${wTo}</span></div>
                                <div>التاريخ: ${date}</div>
                            </div>
                            <table style="width:100%; border-collapse:collapse; text-align:center;" border="1">
                                <thead>
                                    <tr style="background:#f0f0f0;">
                                        <th style="padding: 8px; border: 1px solid #000;">م</th>
                                        <th style="padding: 8px; border: 1px solid #000; text-align:right;">الصنف</th>
                                        <th style="padding: 8px; border: 1px solid #000;">المقاس</th>
                                        <th style="padding: 8px; border: 1px solid #000;">اللون</th>
                                        <th style="padding: 8px; border: 1px solid #000;">الكمية</th>
                                        <th style="padding: 8px; border: 1px solid #000;">سعر التحويل</th>
                                        <th style="padding: 8px; border: 1px solid #000;">الإجمالي</th>
                                    </tr>
                                </thead>
                                <tbody>${rowsHtml}</tbody>
                                <tfoot>
                                    <tr style="font-weight:bold; background:#f0f0f0;">
                                        <td colspan="6" style="padding: 8px; border: 1px solid #000;">إجمالي قيمة التحويل</td>
                                        <td style="padding: 8px; border: 1px solid #000;">${totalValue.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                            <div style="margin-top:50px; display:flex; justify-content:space-between;">
                                <div style="text-align:center;">توقيع أمين المخزن (المصدر)<br><br>...........................</div>
                                <div style="text-align:center;">توقيع المستلم (الوجهة)<br><br>...........................</div>
                            </div>
                            <div style="text-align:center; margin-top:30px; border-top:1px dashed #000; padding-top:10px; font-size:12px;">
                                <div style="font-weight:bold;">${footerMsg}</div>
                                <div>نظام بيان POS - مبيعات متكامل</div>
                            </div>
                        </div>
                    `;
                    
                    let receiptArea = document.getElementById('receipt-area');
                    if (!receiptArea) {
                        receiptArea = document.createElement('div');
                        receiptArea.id = 'receipt-area';
                        document.body.appendChild(receiptArea);
                    }
                    receiptArea.innerHTML = content;
                    window.print();
                } else if (isAdjustment) {
                    const shopName    = document.getElementById('shopName')?.value || 'بـيـان POS';
                    const shopAddress = document.getElementById('shopAddress')?.value || '';
                    const shopPhone   = document.getElementById('shopPhone1')?.value || '';
                    const footerMsg   = document.getElementById('printFooterMsg')?.value || 'شكراً لزيارتكم!';
                    
                    let date = tx.dateISO ? (tx.dateISO + ' ' + (tx.timeISO || '')) : (tx.date || '-');
                    
                    let rowsHtml = '';
                    let totalQty = 0;
                    let totalValue = 0;
                    items.forEach((item, idx) => {
                        const qty = parseFloat(item.qty || item.quantity || 0);
                        const price = parseFloat(item.price || item.costPrice || item.purchasePrice || 0);
                        const total = qty * price;
                        totalQty += qty;
                        totalValue += total;
                        const sSize = item.size || item.selectedSize || '-';
                        const sColor = item.color || item.selectedColor || '-';
                        rowsHtml += `
                            <tr>
                                <td style="padding: 6px 8px; border: 1px solid #000;">${idx + 1}</td>
                                <td style="text-align:right; padding: 6px 10px; border: 1px solid #000; font-weight:bold;">${item.name}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000; font-weight:bold; color:#047857;">${sSize}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000; font-weight:bold; color:#1d4ed8;">${sColor}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000; font-weight:bold;">${qty} ${item.unit || ''}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000;">${price.toFixed(2)}</td>
                                <td style="padding: 6px 8px; border: 1px solid #000; font-weight:bold;">${total.toFixed(2)}</td>
                            </tr>
                        `;
                    });

                    const content = `
                        <div class="print-container" style="direction:rtl; font-family:Cairo, sans-serif; padding: 20px;">
                            <div style="text-align:center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                                <h1 style="margin:0;">${shopName}</h1>
                                ${shopAddress ? `<div style="font-size:12px; color:#555; margin-top:2px;">${shopAddress}</div>` : ''}
                                ${shopPhone ? `<div style="font-size:12px; color:#555; margin-top:2px;">هاتف: ${shopPhone}</div>` : ''}
                                <h2 style="margin:5px 0; background:#000; color:#fff; display:inline-block; padding:5px 20px; border-radius:5px;">إذن تسوية مخزنية</h2>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom: 20px; font-weight:bold;">
                                <div>المخزن: <span style="text-decoration:underline;">${tx.warehouse || 'المخزن الرئيسي'}</span></div>
                                <div>التاريخ: ${date}</div>
                            </div>
                            <table style="width:100%; border-collapse:collapse; text-align:center; margin-bottom:20px;" border="1">
                                <thead>
                                    <tr style="background:#f0f0f0;">
                                        <th style="padding: 8px; border: 1px solid #000;">م</th>
                                        <th style="padding: 8px; border: 1px solid #000; text-align:right;">الصنف</th>
                                        <th style="padding: 8px; border: 1px solid #000;">المقاس</th>
                                        <th style="padding: 8px; border: 1px solid #000;">اللون</th>
                                        <th style="padding: 8px; border: 1px solid #000;">الكمية الفعلية</th>
                                        <th style="padding: 8px; border: 1px solid #000;">السعر</th>
                                        <th style="padding: 8px; border: 1px solid #000;">الإجمالي</th>
                                    </tr>
                                </thead>
                                <tbody>${rowsHtml}</tbody>
                                <tfoot>
                                    <tr style="font-weight:bold; background:#f0f0f0;">
                                        <td colspan="4" style="padding: 8px; border: 1px solid #000;">الإجمالي الكلي</td>
                                        <td style="padding: 8px; border: 1px solid #000;">${totalQty}</td>
                                        <td style="padding: 8px; border: 1px solid #000;">-</td>
                                        <td style="padding: 8px; border: 1px solid #000;">${totalValue.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                            <div style="margin-top:50px; display:flex; justify-content:space-between;">
                                <div style="text-align:center;">توقيع المسؤول:<br><br>...........................</div>
                                <div style="text-align:center;">توقيع أمين المخزن:<br><br>...........................</div>
                            </div>
                            <div style="text-align:center; margin-top:30px; border-top:1px dashed #000; padding-top:10px; font-size:12px;">
                                <div style="font-weight:bold;">${footerMsg}</div>
                                <div>نظام بيان POS - مبيعات متكامل</div>
                            </div>
                        </div>
                    `;
                    
                    let receiptArea = document.getElementById('receipt-area');
                    if (!receiptArea) {
                        receiptArea = document.createElement('div');
                        receiptArea.id = 'receipt-area';
                        document.body.appendChild(receiptArea);
                    }
                    receiptArea.innerHTML = content;
                    window.print();
                } else if (tx.type.includes('قبض') || tx.type.includes('صرف')) {
                    const isReceipt = tx.type.includes('قبض');
                    let savedPosSettings = {};
                    try { savedPosSettings = JSON.parse(getStore('pos_settings') || '{}'); } catch(e) {}
                    const shopName = savedPosSettings.name || (document.getElementById('shopName') ? document.getElementById('shopName').value : 'مؤسستي');
                    const footerMsg = savedPosSettings.printFooterMsg || (document.getElementById('printFooterMsg') ? document.getElementById('printFooterMsg').value : 'شكراً لتعاملكم معنا!');
                    const id = tx.invoiceId || tx.id || '-';
                    const date = tx.dateISO || (tx.date ? tx.date.split(' ')[0] : new Date().toLocaleDateString('en-CA'));
                    const partnerName = tx.partner || 'غير محدد';
                    const amount = parseFloat(tx.total || tx.paidAmount || tx.price) || 0;

                    let balBefore = 0, balAfter = 0;
                    if (typeof window.getAccountBalance === 'function') {
                        const currentBalance = window.getAccountBalance(partnerName);
                        // الحركة محفوظة مسبقاً فالرصيد الحالي هو الرصيد بعد الحركة
                        balAfter = currentBalance;
                        if (isReceipt) {
                            balBefore = currentBalance + amount;
                        } else {
                            balBefore = currentBalance - amount;
                        }
                    }

                    const formatMoney = (num) => {
                        const isNeg = num < 0;
                        const formatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        return isNeg ? `-${formatted}` : formatted;
                    };

                    const title = isReceipt ? 'سند قبض نقدية' : 'سند صرف نقدية';
                    const actionLabel = isReceipt ? 'وصلنا من السيد:' : 'صرف للسيد:';
                    const amountLabel = isReceipt ? 'المبلغ المقبوض:' : 'المبلغ المنصرف:';
                    const col1Label = isReceipt ? 'الرصيد السابق' : 'كان له';
                    const col2Label = isReceipt ? 'المبلغ المقبوض' : 'المنصرف';
                    const col3Label = isReceipt ? 'المتبقي عليه' : 'المتبقي له';
                    const sign2Label = isReceipt ? 'الختم والاعتماد' : 'المدير المالي';
                    
                    const htmlContent = `
                        <html dir="rtl" lang="ar">
                        <head>
                            <meta charset="utf-8">
                            <title>${title} #${id} - ${shopName}</title>
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
                                    font-size: 10px;
                                    font-weight: 900;
                                    background: #f1f5f9;
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
                                <div class="doc-badge">${title}</div>
                                <div class="meta-row">
                                    <span>رقم: ${id}</span>
                                    <span>التاريخ: ${date}</span>
                                </div>

                                <div class="box-info">
                                    <div>${actionLabel} <b style="font-size:14px; font-weight:900;">${partnerName}</b></div>
                                    <div class="amount-container">
                                        <div>${amountLabel}</div>
                                        <div class="amount-val">${formatMoney(amount)}</div>
                                    </div>
                                </div>

                                <table class="summary-table">
                                    <thead>
                                        <tr>
                                            <th style="width:33%;">${col1Label}</th>
                                            <th style="width:34%;">${col2Label}</th>
                                            <th style="width:33%;">${col3Label}</th>
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
                                    <div class="sign-line">${sign2Label}</div>
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
                        let receiptArea = document.getElementById('receipt-area');
                        if (!receiptArea) {
                            receiptArea = document.createElement('div');
                            receiptArea.id = 'receipt-area';
                            document.body.appendChild(receiptArea);
                        }
                        receiptArea.innerHTML = htmlContent;
                        window.print();
                    }
                } else {
                    if (typeof printInvoice === 'function') {
                        let printType = tx.type || 'بيع';
                        if (printType === 'sale') printType = 'بيع';
                        if (printType === 'purchase') printType = 'شراء';
                        
                        let printDocType = isPurchase ? 'purchase' : 'sales';
                        if (isReturn) {
                            printDocType = isPurchase ? 'return_purchase' : 'return_sales';
                            printType = isPurchase ? 'مرتجع مشتريات' : 'مرتجع مبيعات';
                        }
                        const printDocTitle = isReturn ? (isPurchase ? 'مرتجع مشتريات' : 'مرتجع مبيعات') : (isPurchase ? 'فاتورة مشتريات' : 'فاتورة مبيعات');

                        // فصل التاريخ والوقت بدقة وبصيغة سليمة
                        let printDate = '';
                        let printTime = '';
                        if (tx.dateISO) {
                            printDate = tx.dateISO;
                            printTime = tx.timeISO || '';
                        } else if (tx.date) {
                            if (tx.date.includes(' ')) {
                                const parts = tx.date.split(' ');
                                printDate = parts[0];
                                printTime = parts[1] ? parts[1].substring(0, 5) : '';
                            } else {
                                printDate = tx.date;
                            }
                        }

                        let prevBal = 0;
                        let partnerName = tx.customer || tx.partner || '';
                        if (partnerName && !window.isGenericCashPartner(partnerName)) {
                            if (typeof getHistoricalPartnerBalance === 'function') {
                                prevBal = getHistoricalPartnerBalance(partnerName, tx.invoiceId || tx.invoiceNumber || tx.id);
                            } else if (typeof getAccountBalance === 'function') {
                                prevBal = getAccountBalance(partnerName, tx.invoiceId || tx.invoiceNumber || tx.id);
                            }
                        }

                        printInvoice({
                            invoiceNumber: tx.invoiceId || tx.invoiceNumber || tx.id,
                            invoiceType: isReturn ? (isPurchase ? 'مرتجع مشتريات' : 'مرتجع مبيعات') : printType,
                            paymentMethod: (typeof window.formatPaymentMethodDisplay === 'function') ? window.formatPaymentMethodDisplay(tx) : (tx.method || tx.paymentMethod || 'نقدي'),
                            isReturn: isReturn,
                            isPurchase: isPurchase,
                            docTitle: printDocTitle,
                            date: printDate,
                            time: printTime,
                            cashier: tx.cashier || tx.user || '',
                            customer: tx.customer || tx.partner || 'عميل نقدي',
                            items: items,
                            totalAmount: invoiceFinalTotal,
                            paid: paidVal,
                            deferred: isDeferred ? remainingVal : 0,
                            prevBalance: prevBal,
                            currentBalance: prevBal + (invoiceFinalTotal - paidVal),
                            docType: printDocType
                        });
                    } else {
                        alert('خطأ: محرك الطباعة غير متوفر!');
                    }
                }
            };

            if (autoPrint) {
                executePrint();
                return;
            }

            existing = document.getElementById('customViewModalOverlay');
            if (existing) existing.remove();
            
            modal = document.createElement('div');
            modal.id = 'customViewModalOverlay';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(15, 23, 42, 0.72); 
                z-index: 11000; display: flex; align-items: center; justify-content: center;
                animation: fadeIn 0.2s ease;
            `;
            
            modal.innerHTML = modalContent;
            document.body.appendChild(modal);
            
            document.getElementById('customPrintBtn').onclick = executePrint;
        };

        // ====================================================================
        // 🌟 دالة التفقيط بالعربية المعتمدة (Arabic Number to Words / Tafqeet)
        // ====================================================================
        function tafqeetArabic(num) {
            if (num === null || num === undefined || isNaN(num)) return 'صفر جنيه مصري لا غير';
            num = parseFloat(num);
            if (num === 0) return 'صفر جنيه مصري لا غير';

            const isNeg = num < 0;
            num = Math.abs(num);

            const intPart = Math.floor(num);
            const decPart = Math.round((num - intPart) * 100);

            const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
            const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
            const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
            const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

            function convertGroup(n) {
                let str = '';
                const h = Math.floor(n / 100);
                const rem = n % 100;
                const t = Math.floor(rem / 10);
                const o = rem % 10;

                if (h > 0) {
                    str += hundreds[h];
                }

                if (rem > 0) {
                    if (str !== '') str += ' و';
                    if (rem < 10) {
                        str += ones[rem];
                    } else if (rem >= 10 && rem < 20) {
                        str += teens[rem - 10];
                    } else {
                        if (o > 0) {
                            str += ones[o] + ' و';
                        }
                        str += tens[t];
                    }
                }
                return str;
            }

            let result = '';
            const millions = Math.floor(intPart / 1000000);
            const thousands = Math.floor((intPart % 1000000) / 1000);
            const remainder = intPart % 1000;

            if (millions > 0) {
                if (millions === 1) result += 'مليون';
                else if (millions === 2) result += 'مليونان';
                else if (millions >= 3 && millions <= 10) result += convertGroup(millions) + ' ملايين';
                else result += convertGroup(millions) + ' مليوناً';
            }

            if (thousands > 0) {
                if (result !== '') result += ' و';
                if (thousands === 1) result += 'ألف';
                else if (thousands === 2) result += 'ألفان';
                else if (thousands >= 3 && thousands <= 10) result += convertGroup(thousands) + ' آلاف';
                else result += convertGroup(thousands) + ' ألفاً';
            }

            if (remainder > 0) {
                if (result !== '') result += ' و';
                result += convertGroup(remainder);
            }

            let pounds = '';
            if (intPart === 0) {
                pounds = '';
            } else if (intPart === 1) {
                pounds = 'جنيه مصري واحد';
            } else if (intPart === 2) {
                pounds = 'جنيهان مصريان';
            } else if (intPart >= 3 && intPart <= 10) {
                pounds = result + ' جنيهات مصرية';
            } else {
                pounds = result + ' جنيهاً مصرياً';
            }

            let piastres = '';
            if (decPart > 0) {
                const decText = convertGroup(decPart);
                if (decPart === 1) piastres = 'قرش واحد';
                else if (decPart === 2) piastres = 'قرشان';
                else if (decPart >= 3 && decPart <= 10) piastres = decText + ' قروش';
                else piastres = decText + ' قرشاً';
            }

            let finalTafqeet = 'فقط ';
            if (intPart > 0 && decPart > 0) {
                finalTafqeet += pounds + ' و' + piastres;
            } else if (intPart > 0) {
                finalTafqeet += pounds;
            } else if (decPart > 0) {
                finalTafqeet += piastres;
            } else {
                finalTafqeet += 'صفر جنيه مصري';
            }

            finalTafqeet += ' لا غير';
            if (isNeg) finalTafqeet = 'سالب ' + finalTafqeet;
            return finalTafqeet;
        }
        window.tafqeetArabic = tafqeetArabic;

        // ====================================================================
        // 💵 نافذة السند المالي المخصصة مع التفقيط (Financial Voucher Modal)
        // ====================================================================
        window.renderFinancialVoucherModal = function(tx, autoPrint = false) {
            if (!tx) return;

            let existing = document.getElementById('financialVoucherModalOverlay');
            if (existing) existing.remove();
            let existingCustom = document.getElementById('customViewModalOverlay');
            if (existingCustom) existingCustom.remove();

            const tType = String(tx.type || '').toLowerCase();
            const isReceipt = tType.includes('قبض') || tType === 'receipt';
            const voucherTitle = isReceipt ? 'سند استلام نقدية (قبض)' : 'سند صرف نقدية';
            const voucherIcon = isReceipt ? '📥' : '📤';
            const themeGradient = isReceipt
                ? 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #059669 100%)'
                : 'linear-gradient(135deg, #7f1d1d 0%, #b91c1c 50%, #dc2626 100%)';
            const themeColor = isReceipt ? '#059669' : '#dc2626';
            const partnerLabel = isReceipt ? 'استلمنا من السيد / الطرف:' : 'صرفنا إلى السيد / الطرف:';

            const amountNum = parseFloat(tx.total || tx.price || 0) || 0;
            const tafqeetText = typeof window.tafqeetArabic === 'function' ? window.tafqeetArabic(amountNum) : `${amountNum.toFixed(2)} ج.م`;

            const docId = tx.invoiceId || tx.id || '-';
            const dateStr = tx.dateISO || (tx.date ? String(tx.date).split(' ')[0] : '-');
            const timeStr = tx.timeISO || tx.time || (tx.date && String(tx.date).includes(' ') ? String(tx.date).split(' ')[1] : '');
            const partnerName = tx.partner || tx.customer || tx.payee || tx.account || 'طرف نقدي';
            const paymentMethod = (typeof window.formatPaymentMethodDisplay === 'function' ? window.formatPaymentMethodDisplay(tx) : tx.method) || 'كاش (نقدي)';
            const notes = tx.product || tx.notes || tx.desc || 'سند مالي';
            const cashier = tx.user || tx.cashier || '-';
            const warehouse = tx.warehouse || 'المخزن الرئيسي';
            const terminal = tx.terminal || 'الجهاز الرئيسي 💻';

            const overlay = document.createElement('div');
            overlay.id = 'financialVoucherModalOverlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px);
                z-index: 12600; display: flex; align-items: center; justify-content: center;
                direction: rtl; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
            `;

            overlay.innerHTML = `
                <div style="background: #ffffff; width: 680px; max-width: 95vw; max-height: 92vh; border-radius: 20px; box-shadow: 0 25px 60px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; border: 1.5px solid #cbd5e1;">
                    
                    <!-- Header -->
                    <div style="background: ${themeGradient}; padding: 18px 24px; color: white; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.15);">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <div style="width: 46px; height: 46px; border-radius: 12px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; border: 1.5px solid rgba(255,255,255,0.3);">
                                ${voucherIcon}
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="background: rgba(255,255,255,0.25); color: #fff; font-size: 0.75rem; font-weight: 800; padding: 2px 10px; border-radius: 12px;">سند مالي معتمد</span>
                                    <h3 style="margin: 0; font-size: 1.25rem; font-weight: 900; color: #ffffff;">${voucherTitle}</h3>
                                </div>
                                <div style="font-size: 0.8rem; color: #e2e8f0; margin-top: 4px; display: flex; gap: 12px; align-items: center;">
                                    <span>🔢 رقم السند: <b>#${docId}</b></span>
                                    <span>📅 ${dateStr} ${timeStr ? '🕒 ' + timeStr : ''}</span>
                                </div>
                            </div>
                        </div>
                        <button type="button" onclick="document.getElementById('financialVoucherModalOverlay').remove()" 
                            style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); color: #ffffff; font-size: 1.3rem; cursor: pointer; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; transition: 0.2s;"
                            onmouseover="this.style.background='rgba(239,68,68,0.5)';"
                            onmouseout="this.style.background='rgba(255,255,255,0.15)';">
                            &times;
                        </button>
                    </div>

                    <!-- Body -->
                    <div style="padding: 22px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; background: #f8fafc;" class="fast-scrollbar">
                        
                        <!-- Hero Amount & Tafqeet Card -->
                        <div style="background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%); border: 2px solid ${themeColor}; border-radius: 16px; padding: 18px 20px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
                            <div style="font-size: 0.82rem; color: #64748b; font-weight: 800; margin-bottom: 4px;">المبلغ المالي الإجمالي للسند</div>
                            <div style="font-size: 2.2rem; font-weight: 900; color: ${themeColor}; line-height: 1.2; letter-spacing: -0.5px;">
                                ${amountNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style="font-size: 1.1rem; font-weight: 800; color: #64748b;">ج.م</span>
                            </div>
                            <div style="margin-top: 10px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 8px 14px; font-size: 0.88rem; font-weight: 800; color: #1e293b; display: inline-flex; align-items: center; gap: 6px;">
                                <span>✍️</span>
                                <span>${tafqeetText}</span>
                            </div>
                        </div>

                        <!-- Details Grid -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
                            <div style="background: #ffffff; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
                                <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">👤 ${partnerLabel}</span>
                                <span style="font-weight: 900; color: #0f172a; font-size: 1rem;">${partnerName}</span>
                            </div>

                            <div style="background: #ffffff; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
                                <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">💳 طريقة السداد / الخزينة:</span>
                                <span style="font-weight: 900; color: #059669; font-size: 0.95rem;">${paymentMethod}</span>
                            </div>

                            <div style="background: #ffffff; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
                                <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">🏢 المخزن والكاشير:</span>
                                <span style="font-weight: 800; color: #1e293b; font-size: 0.9rem;">${warehouse} • ${cashier}</span>
                            </div>

                            <div style="background: #ffffff; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
                                <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">💻 جهاز الإصدار:</span>
                                <span style="font-weight: 800; color: #475569; font-size: 0.9rem;">${terminal}</span>
                            </div>

                            <div style="grid-column: 1 / -1; background: #ffffff; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
                                <span style="font-size: 0.74rem; color: #64748b; font-weight: 800;">📝 البيان والغرض:</span>
                                <span style="font-weight: 800; color: #334155; font-size: 0.92rem; line-height: 1.5;">${notes}</span>
                            </div>
                        </div>

                    </div>

                    <!-- Footer Buttons -->
                    <div style="padding: 14px 24px; background: #ffffff; border-top: 1.5px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                        <button type="button" onclick="document.getElementById('financialVoucherModalOverlay').remove()" 
                            style="padding: 9px 20px; border-radius: 10px; border: 1.5px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 800; font-size: 0.88rem; cursor: pointer; transition: 0.2s;"
                            onmouseover="this.style.background='#f1f5f9';"
                            onmouseout="this.style.background='#ffffff';">
                            إغلاق
                        </button>

                        <div style="display: flex; gap: 10px;">
                            <button type="button" onclick="if(window.shareFinancialVoucherWhatsApp) window.shareFinancialVoucherWhatsApp('${docId}')" 
                                style="padding: 9px 18px; border-radius: 10px; border: none; background: #25d366; color: #ffffff; font-weight: 800; font-size: 0.88rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(37, 211, 102, 0.3);">
                                <span>💬</span> مشاركة واتساب
                            </button>
                            <button type="button" onclick="if(window.printFinancialVoucherById) window.printFinancialVoucherById('${docId}')" 
                                style="padding: 9px 22px; border-radius: 10px; border: none; background: ${themeGradient}; color: #ffffff; font-weight: 900; font-size: 0.88rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                                <span>🖨️</span> طباعة السند
                            </button>
                        </div>
                    </div>

                </div>
            `;

            document.body.appendChild(overlay);

            if (autoPrint && typeof window.printFinancialVoucherById === 'function') {
                setTimeout(() => window.printFinancialVoucherById(docId), 300);
            }
        };

        window.shareFinancialVoucherWhatsApp = function(docId) {
            if (!docId) return;
            const pool = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : (window.transactions || []);
            const t = pool.find(x => String(x.invoiceId) === String(docId) || String(x.id) === String(docId)) || {};
            const amount = parseFloat(t.total || t.price || 0).toFixed(2);
            const isReceipt = String(t.type || '').includes('قبض');
            const title = isReceipt ? 'سند استلام نقدية (قبض)' : 'سند صرف نقدية';
            const tafqeet = typeof window.tafqeetArabic === 'function' ? window.tafqeetArabic(amount) : '';
            
            const text = `📄 ${title}\n🔢 رقم السند: #${docId}\n📅 التاريخ: ${t.date || t.dateISO || '-'}\n👤 الطرف: ${t.partner || t.customer || t.payee || '-'}\n💰 المبلغ: ${amount} ج.م\n✍️ التفقيط: ${tafqeet}\n💳 طريقة الدفع: ${t.method || 'نقدي'}\n📝 البيان: ${t.product || t.notes || '-'}\n\nتم الإرسال عبر تطبيق بيان POS ✨`;

            let cleanPhone = '';
            if (typeof getPartnerPhone === 'function' && typeof formatPhoneForWhatsApp === 'function') {
                cleanPhone = formatPhoneForWhatsApp(getPartnerPhone(t.partner || t.customer || t.payee));
            }
            const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
        };

        window.printFinancialVoucherById = function(docId) {
            if (!docId) return;
            const pool = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : (window.transactions || []);
            const t = pool.find(x => String(x.invoiceId) === String(docId) || String(x.id) === String(docId));
            if (!t) return;
            
            const isReceipt = String(t.type || '').includes('قبض');
            if (isReceipt && typeof printReceiptData === 'function' && document.getElementById('receiptID')) {
                document.getElementById('receiptID').value = t.invoiceId || t.id || '';
                if (document.getElementById('receiptCustomer')) document.getElementById('receiptCustomer').value = t.partner || t.customer || '';
                if (document.getElementById('receiptAmount')) document.getElementById('receiptAmount').value = t.total || t.price || 0;
                if (document.getElementById('receiptDate')) document.getElementById('receiptDate').value = t.dateISO || (t.date ? String(t.date).split(' ')[0] : '');
                if (document.getElementById('receiptNotes')) document.getElementById('receiptNotes').value = t.product || t.notes || '';
                printReceiptData();
            } else if (!isReceipt && typeof printDisbursementData === 'function' && document.getElementById('disburseID')) {
                document.getElementById('disburseID').value = t.invoiceId || t.id || '';
                if (document.getElementById('disbursePayee')) document.getElementById('disbursePayee').value = t.partner || t.customer || t.payee || '';
                if (document.getElementById('disburseAmount')) document.getElementById('disburseAmount').value = t.total || t.price || 0;
                if (document.getElementById('disburseDate')) document.getElementById('disburseDate').value = t.dateISO || (t.date ? String(t.date).split(' ')[0] : '');
                if (document.getElementById('disburseNotes')) document.getElementById('disburseNotes').value = t.product || t.notes || '';
                printDisbursementData();
            } else {
                window.print();
            }
        };

        // ====================================================================
        // 🚀 دالة توجيه المستندات المركزية الموحدة (Master Document Router)
        // ====================================================================
        window.viewAnyDocumentUnified = async function(targetId, targetType = '', optTxId = '') {
            if (typeof checkPermission === 'function' && !checkPermission('docs_view')) return;

            if (!targetId && targetId !== 0) {
                targetId = window.selectedInvoiceId || selectedInvoiceIndex;
                targetType = targetType || window.selectedInvoiceType || '';
                optTxId = optTxId || window.selectedTxId || '';
            }

            if (!targetId && targetId !== 0 && !optTxId) {
                return showCustomAlert({
                    type: 'warning',
                    titleText: '⚠️ تنبيه',
                    msg: 'يرجى تحديد مستند أو عملية من الجدول أولاً لعرض تفاصيلها.'
                });
            }

            const sId = String(targetId || '').trim();
            const sTxId = String(optTxId || '').trim();
            let pool = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : (window.transactions || []);

            // ⚡ التأكد أولاً من تحميل الفاتورة/المستند بكافة بنوده من محرك SQLite إذا لم تكن موجودة أو كانت مقتصرة على سطر الرأس
            if (typeof window.ensureInvoiceLoaded === 'function' && sId) {
                const sampleInPool = pool.find(t => t && ((sTxId && String(t.id) === sTxId) ||
                                                        (t.invoiceId != null && String(t.invoiceId) === sId) ||
                                                        (t.id != null && String(t.id) === sId) ||
                                                        (t.transferId != null && String(t.transferId) === sId) ||
                                                        (t.adjId != null && String(t.adjId) === sId)));
                const hasItemsInPool = pool.some(t => t && ((sTxId && String(t.id) === sTxId) ||
                                                           (t.invoiceId != null && String(t.invoiceId) === sId) ||
                                                           (t.id != null && String(t.id) === sId)) &&
                                                           (t.product || t.productName || t.name));
                if (!sampleInPool || !hasItemsInPool) {
                    try {
                        await window.ensureInvoiceLoaded(sId);
                        pool = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : (window.transactions || []);
                    } catch(e) {}
                }
            }

            // 🎯 الخطوة 0: تحديد نوع العملية أولاً بدقة فائقة
            let cleanType = String(targetType || '').trim().toLowerCase();
            if (!cleanType && sTxId) {
                const txFound = pool.find(t => t && String(t.id) === sTxId);
                if (txFound && txFound.type) cleanType = String(txFound.type).trim().toLowerCase();
            }
            if (!cleanType) {
                // محاولة استخراج النوع مباشرة من الصف المحدد في الجدول إن وجد
                const selectedTr = (typeof document !== 'undefined') ? (
                    document.querySelector('#invoicesTableBody tr.selected-row') ||
                    (sTxId ? document.querySelector(`#invoicesTableBody tr[data-tx-id="${sTxId}"]`) : null) ||
                    (sId ? document.querySelector(`#invoicesTableBody tr[data-invoice-id="${sId}"]`) : null)
                ) : null;
                if (selectedTr && selectedTr.getAttribute('data-invoice-type')) {
                    cleanType = selectedTr.getAttribute('data-invoice-type').trim().toLowerCase();
                }
            }
            if (!cleanType) {
                if (window.selectedInvoiceType) {
                    cleanType = String(window.selectedInvoiceType).trim().toLowerCase();
                } else {
                    const foundSample = pool.find(t => t && (sTxId ? String(t.id) === sTxId : (sId && String(t.invoiceId) === sId)));
                    if (foundSample && foundSample.type) {
                        cleanType = String(foundSample.type).trim().toLowerCase();
                    } else if (sId && !isNaN(Number(sId)) && pool[Number(sId)] && pool[Number(sId)].type) {
                        cleanType = String(pool[Number(sId)].type).trim().toLowerCase();
                    }
                }
            }

            const isFinancial = cleanType.includes('قبض') || cleanType === 'receipt' ||
                                cleanType.includes('صرف') || cleanType.includes('دفع') ||
                                cleanType === 'payment' || cleanType === 'disburse';
            const isTransfer = cleanType.includes('تحويل') || cleanType.includes('transfer');
            const isAdjustment = cleanType.includes('تسوية') || cleanType.includes('adjustment') ||
                                 cleanType.includes('جرد') || cleanType.includes('عجز') || cleanType.includes('زيادة');
            const isPurchase = (cleanType.includes('شراء') || cleanType.includes('مشتريات') || cleanType.includes('purchase'));
            const isReturn = cleanType.includes('مرتجع');

            // ====================================================================
            // 1️⃣ الحالة الأولى: سند مالي (قبض 📥 أو صرف 📤)
            // ⛔ ممنوع نهائياً الذهاب لـ SQLite أو البحث عن أصناف بضاعة
            // ====================================================================
            if (isFinancial) {
                const isReceiptOnly = cleanType.includes('قبض') || cleanType === 'receipt';
                const isDisburseOnly = cleanType.includes('صرف') || cleanType.includes('دفع') || cleanType === 'payment' || cleanType === 'disburse';

                let voucherTx = pool.find(t => {
                    if (!t) return false;
                    const tType = String(t.type || '').toLowerCase();
                    if (isReceiptOnly && !tType.includes('قبض') && tType !== 'receipt') return false;
                    if (isDisburseOnly && !tType.includes('صرف') && !tType.includes('دفع') && tType !== 'payment' && tType !== 'disburse') return false;
                    if (sTxId && String(t.id) === sTxId) return true;
                    return (t.invoiceId != null && String(t.invoiceId) === sId) ||
                           (t.id != null && String(t.id) === sId);
                });

                if (!voucherTx && window.BayanSQLite && typeof window.BayanSQLite.getInvoiceFullDetails === 'function') {
                    voucherTx = window.BayanSQLite.getInvoiceFullDetails(sId, isReceiptOnly ? 'سند قبض' : 'سند صرف', sTxId);
                }

                if (!voucherTx && sId && !isNaN(Number(sId)) && pool[Number(sId)]) {
                    const fallbackTx = pool[Number(sId)];
                    const fType = String(fallbackTx.type || '').toLowerCase();
                    if (isReceiptOnly && (fType.includes('قبض') || fType === 'receipt')) {
                        voucherTx = fallbackTx;
                    } else if (isDisburseOnly && (fType.includes('صرف') || fType.includes('دفع') || fType === 'payment' || fType === 'disburse')) {
                        voucherTx = fallbackTx;
                    }
                }

                if (voucherTx) {
                    return window.renderFinancialVoucherModal(voucherTx);
                } else {
                    return showCustomAlert({
                        type: 'error',
                        titleText: '❌ غير موجود',
                        msg: `لم يتم العثور على بيانات السند المالي رقم (#${sId || sTxId}).`
                    });
                }
            }

            // ====================================================================
            // 2️⃣ الحالة الثانية: تسوية مخزنية (جرد / عجز / زيادة)
            // ⛔ تبحث فقط وحصرياً في حركات التسوية المخزنية
            // ====================================================================
            if (isAdjustment) {
                let adjMatches = pool.filter(t => {
                    if (!t) return false;
                    const tType = String(t.type || '').toLowerCase();
                    const isAdjType = tType.includes('تسوية') || tType.includes('adjustment') || tType.includes('جرد') || tType.includes('عجز') || tType.includes('زيادة');
                    if (!isAdjType) return false;
                    return (t.invoiceId != null && String(t.invoiceId) === sId) ||
                           (t.adjId != null && String(t.adjId) === sId) ||
                           (t.id != null && String(t.id) === sId);
                });

                if (adjMatches.length === 0 && !isNaN(Number(sId)) && pool[Number(sId)]) {
                    const fallbackTx = pool[Number(sId)];
                    const fType = String(fallbackTx.type || '').toLowerCase();
                    if (fType.includes('تسوية') || fType.includes('جرد')) {
                        adjMatches = [fallbackTx];
                    }
                }

                if (adjMatches.length === 0 && typeof window.ensureInvoiceLoaded === 'function') {
                    try {
                        await window.ensureInvoiceLoaded(sId);
                        pool = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : (window.transactions || []);
                        adjMatches = pool.filter(t => {
                            if (!t) return false;
                            const tType = String(t.type || '').toLowerCase();
                            const isAdjType = tType.includes('تسوية') || tType.includes('adjustment') || tType.includes('جرد') || tType.includes('عجز') || tType.includes('زيادة');
                            if (!isAdjType) return false;
                            return (t.invoiceId != null && String(t.invoiceId) === sId) ||
                                   (t.adjId != null && String(t.adjId) === sId) ||
                                   (t.id != null && String(t.id) === sId);
                        });
                    } catch(e) {}
                }

                if (adjMatches.length === 0) {
                    return showCustomAlert({
                        type: 'error',
                        titleText: '❌ غير موجود',
                        msg: `لم يتم العثور على محضر التسوية المخزنية رقم (#${sId}).`
                    });
                }

                const head = adjMatches.find(t => t.isInvoiceHead) || adjMatches[0];
                let tx = { ...head };
                tx.invoiceId = head.invoiceId || head.adjId || head.id || sId;
                tx.id = head.id || tx.invoiceId;
                tx.type = 'تسوية مخزنية';
                tx.warehouse = head.warehouse || 'المخزن الرئيسي';
                tx.terminal = head.terminal || 'الجهاز الرئيسي 💻';
                tx.partner = head.partner || head.customer || 'جرد مخزني';
                tx.notes = adjMatches.find(t => t.notes)?.notes || head.notes || '';

                const seenAdj = new Set();
                let uniqueAdjMatches = adjMatches.filter(i => {
                    if (!i || (!i.product && !i.productName && !i.name)) return false;
                    const p = (i.product || i.productName || i.name || '').trim();
                    const s = (i.size || i.selectedSize || '').trim();
                    const c = (i.color || i.selectedColor || '').trim();
                    const q = parseFloat(i.qty != null ? i.qty : (i.quantity || 0)) || 0;
                    const pr = parseFloat(i.price != null ? i.price : 0) || 0;
                    const sig = `${i.id || ''}|${p}|${s}|${c}|${q}|${pr}`;
                    if (seenAdj.has(sig)) return false;
                    seenAdj.add(sig);
                    return true;
                });

                // إذا كانت البنود غير مفككة في أسطر الذاكرة، نستخرجها من head.items أو head.products أو BayanSQLite
                if (uniqueAdjMatches.length === 0) {
                    let extractedItems = [];
                    if (Array.isArray(head.items) && head.items.length > 0) extractedItems = head.items;
                    else if (Array.isArray(head.products) && head.products.length > 0) extractedItems = head.products;
                    else if (Array.isArray(head.cart) && head.cart.length > 0) extractedItems = head.cart;
                    else if (window.BayanSQLite && typeof window.BayanSQLite.getInvoiceItems === 'function') {
                        extractedItems = window.BayanSQLite.getInvoiceItems(sId, 'تسوية مخزنية', optTxId || head.id) || [];
                    }
                    if (extractedItems.length > 0) {
                        uniqueAdjMatches = extractedItems.map(it => ({
                            product: it.product || it.productName || it.name || 'صنف تسوية',
                            qty: it.qty != null ? it.qty : (it.quantity || 0),
                            price: it.price != null ? it.price : (it.costPrice || 0),
                            unit: it.unit || '-',
                            size: it.size || it.selectedSize || '',
                            color: it.color || it.selectedColor || '',
                            total: it.total != null ? it.total : ((it.qty || 0) * (it.price || 0))
                        }));
                    }
                }

                tx.items = uniqueAdjMatches.map(i => {
                    const qty = parseFloat(i.qty != null ? i.qty : (i.quantity || 0));
                    const price = parseFloat(i.price != null ? i.price : (i.costPrice || 0));
                    return {
                        name: i.product || i.productName || i.name || 'صنف تسوية',
                        qty: qty,
                        unit: i.unit || '-',
                        size: i.size || i.selectedSize || '',
                        color: i.color || i.selectedColor || '',
                        price: price,
                        costPrice: price,
                        discount: 0,
                        discountType: 'val',
                        addition: 0,
                        total: parseFloat(i.total != null ? i.total : (qty * price))
                    };
                });

                const calculatedTotal = tx.items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
                tx.total = (parseFloat(head.total) > 0) ? parseFloat(head.total) : calculatedTotal;

                return window.renderCustomInvoiceModal(tx);
            }

            // ====================================================================
            // 3️⃣ الحالة الثالثة: تحويل مخزني بين الفروع والمخازن
            // ⛔ تبحث فقط وحصرياً في أذون التحويل المخزني
            // ====================================================================
            if (isTransfer) {
                let transferMatches = pool.filter(t => {
                    if (!t) return false;
                    const tType = String(t.type || '').toLowerCase();
                    if (!tType.includes('تحويل') && !tType.includes('transfer')) return false;
                    return (t.invoiceId != null && String(t.invoiceId) === sId) ||
                           (t.transferId != null && String(t.transferId) === sId) ||
                           (t.id != null && String(t.id) === sId);
                });

                if (transferMatches.length === 0 && !isNaN(Number(sId)) && pool[Number(sId)]) {
                    const fallbackTx = pool[Number(sId)];
                    const fType = String(fallbackTx.type || '').toLowerCase();
                    if (fType.includes('تحويل')) {
                        transferMatches = [fallbackTx];
                    }
                }

                if (transferMatches.length === 0 && typeof window.ensureInvoiceLoaded === 'function') {
                    try {
                        await window.ensureInvoiceLoaded(sId);
                        pool = (typeof transactions !== 'undefined' && Array.isArray(transactions)) ? transactions : (window.transactions || []);
                        transferMatches = pool.filter(t => {
                            if (!t) return false;
                            const tType = String(t.type || '').toLowerCase();
                            if (!tType.includes('تحويل') && !tType.includes('transfer')) return false;
                            return (t.invoiceId != null && String(t.invoiceId) === sId) ||
                                   (t.transferId != null && String(t.transferId) === sId) ||
                                   (t.id != null && String(t.id) === sId);
                        });
                    } catch(e) {}
                }

                if (transferMatches.length === 0) {
                    return showCustomAlert({
                        type: 'error',
                        titleText: '❌ غير موجود',
                        msg: `لم يتم العثور على إذن التحويل المخزني رقم (#${sId}).`
                    });
                }

                const head = transferMatches.find(t => t.isInvoiceHead) || transferMatches[0];
                let tx = { ...head };
                tx.invoiceId = head.invoiceId || head.transferId || head.id || sId;
                tx.id = head.id || tx.invoiceId;
                tx.type = 'تحويل مخزني';
                tx.warehouse = head.toWarehouse || head.destWarehouse || head.warehouse || 'المخزن المحول إليه';
                tx.sourceWarehouse = head.sourceWarehouse || head.fromWarehouse || head.from || 'المخزن الرئيسي';
                tx.terminal = head.terminal || 'الجهاز الرئيسي 💻';
                tx.partner = head.partner || `${tx.sourceWarehouse} -> ${tx.warehouse}`;
                tx.notes = transferMatches.find(t => t.notes)?.notes || head.notes || '';

                const seenTr = new Set();
                let uniqueTrMatches = transferMatches.filter(i => {
                    if (!i || (!i.product && !i.productName && !i.name)) return false;
                    const p = (i.product || i.productName || i.name || '').trim();
                    const s = (i.size || i.selectedSize || '').trim();
                    const c = (i.color || i.selectedColor || '').trim();
                    const q = parseFloat(i.qty != null ? i.qty : (i.quantity || 0)) || 0;
                    const sig = `${i.id || ''}|${p}|${s}|${c}|${q}`;
                    if (seenTr.has(sig)) return false;
                    seenTr.add(sig);
                    return true;
                });

                // إذا كانت البنود غير مفككة في أسطر الذاكرة، نستخرجها من head.items أو head.products أو BayanSQLite
                if (uniqueTrMatches.length === 0) {
                    let extractedItems = [];
                    if (Array.isArray(head.items) && head.items.length > 0) extractedItems = head.items;
                    else if (Array.isArray(head.products) && head.products.length > 0) extractedItems = head.products;
                    else if (Array.isArray(head.cart) && head.cart.length > 0) extractedItems = head.cart;
                    else if (window.BayanSQLite && typeof window.BayanSQLite.getInvoiceItems === 'function') {
                        extractedItems = window.BayanSQLite.getInvoiceItems(sId, 'تحويل مخزني', optTxId || head.id) || [];
                    }
                    if (extractedItems.length > 0) {
                        uniqueTrMatches = extractedItems.map(it => ({
                            product: it.product || it.productName || it.name || 'صنف محول',
                            qty: it.qty != null ? it.qty : (it.quantity || 0),
                            price: it.price != null ? it.price : (it.costPrice || 0),
                            unit: it.unit || '-',
                            size: it.size || it.selectedSize || '',
                            color: it.color || it.selectedColor || '',
                            total: it.total != null ? it.total : ((it.qty || 0) * (it.price || 0))
                        }));
                    }
                }

                tx.items = uniqueTrMatches.map(i => {
                    const qty = parseFloat(i.qty != null ? i.qty : (i.quantity || 0));
                    const price = parseFloat(i.price != null ? i.price : (i.costPrice || 0));
                    return {
                        name: i.product || i.productName || i.name || 'صنف محول',
                        qty: qty,
                        unit: i.unit || '-',
                        size: i.size || i.selectedSize || '',
                        color: i.color || i.selectedColor || '',
                        price: price,
                        costPrice: price,
                        discount: 0,
                        discountType: 'val',
                        addition: 0,
                        total: parseFloat(i.total != null ? i.total : (qty * price))
                    };
                });

                const calculatedTotal = tx.items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
                tx.total = (parseFloat(head.total) > 0) ? parseFloat(head.total) : calculatedTotal;

                return window.renderCustomInvoiceModal(tx);
            }

            // ====================================================================
            // 4️⃣ الحالة الرابعة: فاتورة مشتريات أو مرتجع مشتريات 🧺
            // ⛔ تبحث فقط وحصرياً في سجلات المشتريات وتبرز المورد والتكلفة
            // ====================================================================
            if (isPurchase) {
                let purchaseMatches = [];
                if (window.BayanSQLite && typeof window.BayanSQLite.getInvoiceItems === 'function') {
                    try {
                        const cleanPurchType = isReturn ? 'مرتجع مشتريات' : 'فاتورة مشتريات';
                        purchaseMatches = window.BayanSQLite.getInvoiceItems(sId, cleanPurchType) || [];
                    } catch(e) {}
                }

                if (purchaseMatches.length <= 1) {
                    const memPurch = pool.filter(t => {
                        if (!t) return false;
                        const tType = String(t.type || '').toLowerCase();
                        const isPurch = tType.includes('شراء') || tType.includes('مشتريات') || tType.includes('purchase');
                        if (!isPurch) return false;
                        if (isReturn && !tType.includes('مرتجع')) return false;
                        if (!isReturn && tType.includes('مرتجع')) return false;
                        return (t.invoiceId != null && String(t.invoiceId) === sId) ||
                               (t.id != null && String(t.id) === sId);
                    });
                    if (memPurch.length > purchaseMatches.length) {
                        purchaseMatches = memPurch;
                    }
                }

                if (purchaseMatches.length <= 1 && typeof window.ensureInvoiceLoaded === 'function' && sId) {
                    try {
                        await window.ensureInvoiceLoaded(sId);
                        const updatedPool = window.transactions || [];
                        const memPurch = updatedPool.filter(t => {
                            if (!t) return false;
                            const tType = String(t.type || '').toLowerCase();
                            const isPurch = tType.includes('شراء') || tType.includes('مشتريات') || tType.includes('purchase');
                            if (!isPurch) return false;
                            if (isReturn && !tType.includes('مرتجع')) return false;
                            if (!isReturn && tType.includes('مرتجع')) return false;
                            return (t.invoiceId != null && String(t.invoiceId) === sId) ||
                                   (t.id != null && String(t.id) === sId);
                        });
                        if (memPurch.length > purchaseMatches.length) {
                            purchaseMatches = memPurch;
                        }
                    } catch(e) {}
                }

                if (purchaseMatches.length === 0) {
                    return showCustomAlert({
                        type: 'error',
                        titleText: '❌ غير موجود',
                        msg: `لم يتم العثور على فاتورة مشتريات بالرقم (#${sId || sTxId}).`
                    });
                }

                const isMatchPurch = t => {
                    if (!t) return false;
                    const tType = String(t.type || '').toLowerCase();
                    const isPurch = tType.includes('شراء') || tType.includes('مشتريات') || tType.includes('purchase');
                    if (!isPurch) return false;
                    if (isReturn && !tType.includes('مرتجع')) return false;
                    if (!isReturn && tType.includes('مرتجع')) return false;
                    return (t.invoiceId != null && String(t.invoiceId) === sId) || (t.id != null && String(t.id) === sId);
                };
                const headFromPool = pool.find(t => isMatchPurch(t) && t.isInvoiceHead) || pool.find(t => isMatchPurch(t));
                const head = headFromPool || purchaseMatches.find(t => t.isInvoiceHead) || purchaseMatches[0];
                let tx = { ...head };
                let resolvedInvId = head.invoiceId || sId;
                if (String(resolvedInvId).includes('_item_')) resolvedInvId = String(resolvedInvId).split('_item_')[0];
                tx.invoiceId = resolvedInvId;
                tx.id = head.id || sTxId || tx.invoiceId;
                tx.type = isReturn ? 'مرتجع مشتريات' : 'فاتورة مشتريات';
                tx.warehouse = head.warehouse || 'المخزن الرئيسي';
                tx.partner = head.partner || head.customer || head.supplier || 'مورد نقدي';
                tx.method = head.method || head.paymentMethod || 'نقدي';
                tx.notes = head.notes || purchaseMatches.find(t => t.notes)?.notes || tx.notes || '';
                tx.time = head.time || head.timeISO || tx.time || '';
                tx.timeISO = head.timeISO || head.time || tx.timeISO || '';
                tx.date = head.date || tx.date || '';
                tx.dateISO = head.dateISO || tx.dateISO || '';

                const seenPur = new Set();
                let uniquePurMatches = purchaseMatches.filter(i => {
                    if (!i || (!i.product && !i.productName && !i.name)) return false;
                    const p = (i.product || i.productName || i.name || '').trim();
                    const s = (i.size || i.selectedSize || '').trim();
                    const c = (i.color || i.selectedColor || '').trim();
                    const q = parseFloat(i.qty != null ? i.qty : (i.quantity || 0)) || 0;
                    const pr = parseFloat(i.price != null ? i.price : 0) || 0;
                    const sig = `${i.id || ''}|${p}|${s}|${c}|${q}|${pr}`;
                    if (seenPur.has(sig)) return false;
                    seenPur.add(sig);
                    return true;
                });

                // إذا كانت البنود المستخرجة بنداً واحداً أو أقل بينما رأس الفاتورة أو SQLite يحتوي على قائمة أصناف أكبر وأشمل:
                let extracted = [];
                const isHeadActualPurch = head && head.type && (isReturn ? String(head.type).includes('مرتجع') : ((String(head.type).includes('شراء') || String(head.type).includes('مشتريات')) && !String(head.type).includes('مرتجع')));
                if (isHeadActualPurch && Array.isArray(head.items) && head.items.length > uniquePurMatches.length) extracted = head.items;
                else if (isHeadActualPurch && Array.isArray(head.products) && head.products.length > uniquePurMatches.length) extracted = head.products;
                else if (isHeadActualPurch && Array.isArray(head.cart) && head.cart.length > uniquePurMatches.length) extracted = head.cart;
                else if (window.BayanSQLite && typeof window.BayanSQLite.getInvoiceItems === 'function') {
                    const lookupInvId = resolvedInvId || head.invoiceId || sId;
                    const sqItems = window.BayanSQLite.getInvoiceItems(lookupInvId, isReturn ? 'مرتجع مشتريات' : 'فاتورة مشتريات') || [];
                    if (sqItems.length > uniquePurMatches.length) extracted = sqItems;
                }
                if (extracted.length > 0) {
                    uniquePurMatches = extracted.map(it => ({
                        product: it.product || it.productName || it.name || 'صنف مشتريات',
                        qty: it.qty != null ? it.qty : (it.quantity || 0),
                        price: it.price != null ? it.price : (it.costPrice || it.purchasePrice || 0),
                        costPrice: it.costPrice || it.purchasePrice || it.price || 0,
                        discount: it.discount || it.itemDiscount || 0,
                        discountType: it.discountType || 'val',
                        addition: it.addition || it.extra || 0,
                        unit: it.unit || '-',
                        size: it.size || it.selectedSize || '',
                        color: it.color || it.selectedColor || '',
                        total: it.total != null ? it.total : ((it.qty || 0) * (it.price || 0))
                    }));
                }

                tx.items = uniquePurMatches.map(i => {
                    const qty = parseFloat(i.qty != null ? i.qty : (i.quantity || 0));
                    const price = parseFloat(i.price != null ? i.price : (i.costPrice || i.purchasePrice || 0));
                    let disc = parseFloat(i.discount != null ? i.discount : (i.itemDiscount != null ? i.itemDiscount : 0)) || 0;
                    let addition = parseFloat(i.addition != null ? i.addition : (i.extra != null ? i.extra : 0)) || 0;
                    return {
                        name: i.product || i.productName || i.name || 'صنف مشتريات',
                        qty: qty,
                        unit: i.unit || '-',
                        size: i.size || '',
                        color: i.color || '',
                        price: price,
                        costPrice: price,
                        discount: disc,
                        discountType: i.discountType || 'val',
                        addition: addition,
                        total: parseFloat(i.total != null ? i.total : (qty * price - disc + addition))
                    };
                });

                return window.renderCustomInvoiceModal(tx);
            }

            // ====================================================================
            // 5️⃣ الحالة الخامسة: فاتورة بيع أو مرتجع بيع 🛒
            // ⛔ تبحث في بنود المبيعات فقط ولا تخلط مع أي نوع آخر
            // ====================================================================
            let saleMatches = [];

            // البحث في SQLite فقط إذا كانت العملية مبيعات صريحة
            if (window.BayanSQLite && typeof window.BayanSQLite.getInvoiceItems === 'function') {
                try {
                    const cleanSalesType = isReturn ? 'مرتجع مبيعات' : 'فاتورة مبيعات';
                    const rawSql = window.BayanSQLite.getInvoiceItems(sId, cleanSalesType, sTxId) || [];
                    saleMatches = rawSql.filter(t => {
                        if (!t) return false;
                        const tType = String(t.type || '').toLowerCase();
                        const isSaleType = (tType.includes('بيع') || tType.includes('مبيعات') || tType.includes('sale'));
                        if (!isSaleType) return false;
                        if (isReturn && !tType.includes('مرتجع')) return false;
                        if (!isReturn && tType.includes('مرتجع')) return false;
                        return true;
                    });
                } catch(e) {}
            }

            // البحث في الذاكرة transactions مع التحقق من نوع المبيعات
            if (saleMatches.length <= 1) {
                const memMatches = pool.filter(t => {
                    if (!t) return false;
                    const tType = String(t.type || '').toLowerCase();
                    const isSaleType = (tType.includes('بيع') || tType.includes('مبيعات') || tType.includes('sale'));
                    if (!isSaleType) return false;
                    if (isReturn && !tType.includes('مرتجع')) return false;
                    if (!isReturn && tType.includes('مرتجع')) return false;
                    return (t.invoiceId != null && String(t.invoiceId) === sId) ||
                           (t.id != null && String(t.id) === sId);
                });
                if (memMatches.length > saleMatches.length) {
                    saleMatches = memMatches;
                }
            }

            if (saleMatches.length <= 1 && typeof window.ensureInvoiceLoaded === 'function' && sId) {
                try {
                    await window.ensureInvoiceLoaded(sId);
                    const updatedPool = window.transactions || [];
                    const memMatches = updatedPool.filter(t => {
                        if (!t) return false;
                        const tType = String(t.type || '').toLowerCase();
                        const isSaleType = (tType.includes('بيع') || tType.includes('مبيعات') || tType.includes('sale'));
                        if (!isSaleType) return false;
                        if (isReturn && !tType.includes('مرتجع')) return false;
                        if (!isReturn && tType.includes('مرتجع')) return false;
                        return (t.invoiceId != null && String(t.invoiceId) === sId) ||
                               (t.id != null && String(t.id) === sId);
                    });
                    if (memMatches.length > saleMatches.length) {
                        saleMatches = memMatches;
                    }
                } catch(e) {}
            }

            if (saleMatches.length === 0) {
                return showCustomAlert({
                    type: 'error',
                    titleText: '❌ غير موجود',
                    msg: `لم يتم العثور على فاتورة مبيعات بالرقم (#${sId}).`
                });
            }

            // 🔍 جلب رأس الفاتورة من سجل المعاملات لاستعادة الملاحظات والوقت الحقيقيين
            const isMatchSale = (t) => {
                if (!t) return false;
                const tType = String(t.type || '').toLowerCase();
                const isSaleType = (tType.includes('بيع') || tType.includes('مبيعات') || tType.includes('sale'));
                if (!isSaleType) return false;
                if (isReturn && !tType.includes('مرتجع')) return false;
                if (!isReturn && tType.includes('مرتجع')) return false;
                return (t.invoiceId != null && String(t.invoiceId) === sId) || (t.id != null && String(t.id) === sId);
            };

            const headFromPool = (optTxId ? pool.find(t => t && String(t.id) === optTxId) : null) ||
                                 pool.find(t => isMatchSale(t) && t.isInvoiceHead) ||
                                 pool.find(t => isMatchSale(t));
            const head = headFromPool || saleMatches.find(t => t.isInvoiceHead) || saleMatches[0];
            let tx = { ...head };
            let resolvedInvId = head.invoiceId || sId;
            if (String(resolvedInvId).includes('_item_')) resolvedInvId = String(resolvedInvId).split('_item_')[0];
            tx.invoiceId = resolvedInvId;
            tx.id = head.id || optTxId || tx.invoiceId;
            tx.type = isReturn ? 'مرتجع مبيعات' : 'فاتورة مبيعات';
            tx.warehouse = head.warehouse || 'المخزن الرئيسي';
            tx.partner = head.partner || head.customer || 'عميل نقدي';
            tx.method = head.method || head.paymentMethod || 'نقدي';
            tx.notes = head.notes || saleMatches.find(t => t.notes)?.notes || tx.notes || '';
            tx.time = head.time || head.timeISO || tx.time || '';
            tx.timeISO = head.timeISO || head.time || tx.timeISO || '';
            tx.date = head.date || tx.date || '';
            tx.dateISO = head.dateISO || tx.dateISO || '';

            const seenSale = new Set();
            let uniqueSaleMatches = saleMatches.filter(i => {
                if (!i || (!i.product && !i.productName && !i.name)) return false;
                const p = (i.product || i.productName || i.name || '').trim();
                const s = (i.size || i.selectedSize || '').trim();
                const c = (i.color || i.selectedColor || '').trim();
                const q = parseFloat(i.qty != null ? i.qty : (i.quantity || 0)) || 0;
                const pr = parseFloat(i.price != null ? i.price : 0) || 0;
                const sig = `${i.id || ''}|${p}|${s}|${c}|${q}|${pr}`;
                if (seenSale.has(sig)) return false;
                seenSale.add(sig);
                return true;
            });

            // إذا كانت البنود المستخرجة بنداً واحداً أو أقل بينما رأس الفاتورة أو SQLite يحتوي على قائمة أصناف أكبر وأشمل:
            const headTypeStr = String(head.type || '').toLowerCase();
            const isHeadActualSale = (headTypeStr.includes('بيع') || headTypeStr.includes('مبيعات') || headTypeStr.includes('sale'));

            let extracted = [];
            if (isHeadActualSale && Array.isArray(head.items) && head.items.length > uniqueSaleMatches.length) extracted = head.items;
            else if (isHeadActualSale && Array.isArray(head.products) && head.products.length > uniqueSaleMatches.length) extracted = head.products;
            else if (isHeadActualSale && Array.isArray(head.cart) && head.cart.length > uniqueSaleMatches.length) extracted = head.cart;
            else if (window.BayanSQLite && typeof window.BayanSQLite.getInvoiceItems === 'function') {
                const lookupInvId = resolvedInvId || head.invoiceId || sId;
                const sqItems = window.BayanSQLite.getInvoiceItems(lookupInvId, isReturn ? 'مرتجع مبيعات' : 'فاتورة مبيعات', optTxId || sTxId) || [];
                if (sqItems.length > uniqueSaleMatches.length) extracted = sqItems;
            }
            if (extracted.length > 0) {
                uniqueSaleMatches = extracted.map(it => ({
                    product: it.product || it.productName || it.name || 'صنف',
                    qty: it.qty != null ? it.qty : (it.quantity || 0),
                    price: it.price != null ? it.price : 0,
                    costPrice: it.costPrice || it.price || 0,
                    discount: it.discount || it.itemDiscount || 0,
                    discountType: it.discountType || 'val',
                    addition: it.addition || it.extra || 0,
                    unit: it.unit || '-',
                    size: it.size || it.selectedSize || '',
                    color: it.color || it.selectedColor || '',
                    total: it.total != null ? it.total : ((it.qty || 0) * (it.price || 0))
                }));
            }

            tx.items = uniqueSaleMatches.map(i => {
                const qty = parseFloat(i.qty != null ? i.qty : (i.quantity || 0));
                const price = parseFloat(i.price != null ? i.price : 0);
                let disc = parseFloat(i.discount != null ? i.discount : (i.itemDiscount != null ? i.itemDiscount : 0)) || 0;
                let addition = parseFloat(i.addition != null ? i.addition : (i.extra != null ? i.extra : 0)) || 0;
                return {
                    name: i.product || i.productName || i.name || 'صنف',
                    qty: qty,
                    unit: i.unit || '-',
                    size: i.size || i.selectedSize || '',
                    color: i.color || i.selectedColor || '',
                    price: price,
                    costPrice: i.costPrice || price,
                    discount: disc,
                    discountType: i.discountType || 'val',
                    addition: addition,
                    total: parseFloat(i.total != null ? i.total : (qty * price - disc + addition))
                };
            });

            return window.renderCustomInvoiceModal(tx);
        };

        function selectHistoryRow(idx) {
            selectedHistoryIndex = idx;
            window.selectedHistoryIndex = idx;
            const tbody = document.getElementById('historyTableBody');
            if (!tbody) return;
            tbody.querySelectorAll('tr').forEach(tr => {
                tr.classList.remove('selected-row');
                const rad = tr.querySelector('input[type="radio"]');
                if (rad) rad.checked = false;
            });
            const targetRow = tbody.querySelector(`tr[data-orig-index="${idx}"]`);
            if (targetRow) {
                targetRow.classList.add('selected-row');
                const rad = targetRow.querySelector('input[type="radio"]');
                if (rad) rad.checked = true;
                const invId = targetRow.getAttribute('data-invoice-id');
                const invType = targetRow.getAttribute('data-invoice-type');
                if (invId) {
                    window.selectedHistoryInvoiceId = invId;
                    window.selectedInvoiceId = invId;
                }
                if (invType) {
                    window.selectedHistoryInvoiceType = invType;
                    window.selectedInvoiceType = invType;
                }
            }
        }

        function selectInvoiceRow(idx, rowEl, invId, invType, txId) {
            selectedInvoiceIndex = idx;
            window.selectedInvoiceIndex = idx;

            if (rowEl) {
                if (!invId) invId = rowEl.getAttribute('data-invoice-id');
                if (!invType) invType = rowEl.getAttribute('data-invoice-type');
                if (!txId) txId = rowEl.getAttribute('data-tx-id');
            }
            if (invId) {
                window.selectedInvoiceId = invId;
                selectedInvoiceId = invId;
            }
            if (invType) {
                window.selectedInvoiceType = invType;
                selectedInvoiceType = invType;
            }
            if (txId) {
                window.selectedTxId = txId;
                selectedTxId = txId;
            }

            const tbody = document.getElementById('invoicesTableBody');
            if (tbody) {
                tbody.querySelectorAll('tr.selected-row').forEach(r => r.classList.remove('selected-row'));
                tbody.querySelectorAll('input[name="invRad"]').forEach(rad => rad.checked = false);
                const tr = rowEl || (txId ? tbody.querySelector(`tr[data-tx-id="${txId}"]`) : null) || (invId ? (invType ? (tbody.querySelector(`tr[data-invoice-id="${invId}"][data-invoice-type="${invType}"]`) || tbody.querySelector(`tr[data-invoice-id="${invId}"]`)) : tbody.querySelector(`tr[data-invoice-id="${invId}"]`)) : tbody.querySelector(`tr[data-orig-index="${idx}"]`));
                if (tr) {
                    tr.classList.add('selected-row');
                    const rad = tr.querySelector('input[name="invRad"]');
                    if (rad) rad.checked = true;
                    if (!window.selectedInvoiceId && tr.getAttribute('data-invoice-id')) {
                        window.selectedInvoiceId = tr.getAttribute('data-invoice-id');
                        selectedInvoiceId = window.selectedInvoiceId;
                    }
                    if (!window.selectedInvoiceType && tr.getAttribute('data-invoice-type')) {
                        window.selectedInvoiceType = tr.getAttribute('data-invoice-type');
                        selectedInvoiceType = window.selectedInvoiceType;
                    }
                    if (!window.selectedTxId && tr.getAttribute('data-tx-id')) {
                        window.selectedTxId = tr.getAttribute('data-tx-id');
                        selectedTxId = window.selectedTxId;
                    }
                }
            }
        }
        window.selectInvoiceRow = selectInvoiceRow;

        function shareSelectedInvoice(platform) {
            const isInv = (typeof activeTabId === 'string' && activeTabId.startsWith('invoices'));
            let invId = (isInv && window.selectedInvoiceId) ? window.selectedInvoiceId : null;
            let invType = (isInv && window.selectedInvoiceType) ? window.selectedInvoiceType : null;
            let txId = (isInv && window.selectedTxId) ? window.selectedTxId : null;
            let t = null;

            if (isInv && txId) {
                t = transactions.find(x => String(x.id) === String(txId));
            }
            if (!t && isInv && invId) {
                t = transactions.find(x => String(x.invoiceId) === String(invId) && (!invType || (typeof window.isMatchingInvoiceType === 'function' ? window.isMatchingInvoiceType(x.type, invType) : x.type === invType)));
                if (!t) t = transactions.find(x => String(x.invoiceId) === String(invId));
            }

            if (!t) {
                const activeIdx = (isInv ? selectedInvoiceIndex : selectedHistoryIndex);
                if (activeIdx !== null && activeIdx !== undefined && transactions[activeIdx]) {
                    t = transactions[activeIdx];
                } else if (!isInv && window._currentHistoryDisplayed && activeIdx !== null && window._currentHistoryDisplayed[activeIdx]) {
                    t = window._currentHistoryDisplayed[activeIdx];
                }
            }

            if (!t) {
                return showCustomAlert({
                    type: 'warning',
                    titleText: '⚠️ تنبيه',
                    msg: 'يرجى تحديد العملية من الجدول أولاً للمشاركة.'
                });
            }

            const pmText = (typeof window.formatPaymentMethodDisplay === 'function') ? window.formatPaymentMethodDisplay(t) : (t.method || 'نقدي');
            const text = `📄 تفاصيل ${t.type}\n🔢 رقم العملية: ${t.invoiceId || '-'}\n📅 التاريخ: ${t.date}\n👤 الطرف: ${t.partner || 'بدون'}\n💳 طريقة الدفع: ${pmText}\n💰 المبلغ: ${parseFloat(t.total || t.price || 0).toFixed(2)} ج.م\n📝 البيان: ${t.product || '-'}\n\nتم الإرسال عبر تطبيق بيان POS ✨`;

            let url = '';
            if (platform === 'wa') {
                let cleanPhone = '';
                if (typeof getPartnerPhone === 'function' && typeof formatPhoneForWhatsApp === 'function') {
                    cleanPhone = formatPhoneForWhatsApp(getPartnerPhone(t.partner));
                }
                url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
            } else if (platform === 'tg') {
                url = `https://t.me/share/url?url=${encodeURIComponent('https://t.me')}&text=${encodeURIComponent(text)}`;
            }

            if (url) window.open(url, '_blank');
            try { toggleShareMenu('invoicesShareMenu'); } catch(e){}
        }

        function printSelectedInvoice() {
            const isInv = (typeof activeTabId === 'string' && activeTabId.startsWith('invoices'));
            let invId = (isInv && window.selectedInvoiceId) ? window.selectedInvoiceId : null;
            let invType = (isInv && window.selectedInvoiceType) ? window.selectedInvoiceType : null;
            let txId = (isInv && window.selectedTxId) ? window.selectedTxId : null;
            let t = null;

            if (isInv && txId) {
                t = transactions.find(x => String(x.id) === String(txId));
            }
            if (!t && isInv && invId) {
                t = transactions.find(x => String(x.invoiceId) === String(invId) && (!invType || (typeof window.isMatchingInvoiceType === 'function' ? window.isMatchingInvoiceType(x.type, invType) : x.type === invType)));
                if (!t) t = transactions.find(x => String(x.invoiceId) === String(invId));
            }

            if (!t) {
                const activeIdx = (isInv ? selectedInvoiceIndex : selectedHistoryIndex);
                if (activeIdx !== null && activeIdx !== undefined && transactions[activeIdx]) {
                    t = transactions[activeIdx];
                    if (!invId) invId = t.invoiceId;
                    if (!invType) invType = t.type;
                    if (!txId) txId = t.id;
                }
            }

            if (!t && !invId) {
                return showCustomAlert({
                    type: 'warning',
                    titleText: '⚠️ تنبيه',
                    msg: 'يرجى تحديد (الضغط على) العملية من الجدول أولاً لطباعتها.'
                });
            }
            
            if (invId) {
                if (typeof viewInvoiceItems === 'function') {
                    // Pass autoPrint = true, and pass txId
                    viewInvoiceItems(invId, invType || (t ? t.type : ''), true, txId || (t ? t.id : ''));
                }
            } else if (t) {
                // Single transaction (Receipt, Disbursement, etc.)
                window.renderCustomInvoiceModal({
                    ...t,
                    id: t.id || t.invoiceId || Math.floor(Math.random() * 10000),
                    items: [{
                        name: t.product || t.type,
                        qty: 1,
                        unit: '-',
                        price: t.total || t.price || 0,
                        total: t.total || t.price || 0
                    }],
                    paid: t.paidAmount || t.total || 0,
                    partner: t.partner || '-'
                }, true);
            }
            
            try { toggleShareMenu('invoicesShareMenu'); } catch(e){}
        }

        function viewSelectedInvoice() {
            const isInv = (typeof activeTabId === 'string' && activeTabId.startsWith('invoices'));
            let invId = (isInv && window.selectedInvoiceId) ? window.selectedInvoiceId : null;
            let invType = (isInv && window.selectedInvoiceType) ? window.selectedInvoiceType : null;
            let txId = (isInv && window.selectedTxId) ? window.selectedTxId : null;

            if (isInv) {
                const tr = document.querySelector('#invoicesTableBody tr.selected-row') ||
                           document.querySelector('#invoicesTableBody tr input[name="invRad"]:checked')?.closest('tr');
                if (tr) {
                    if (!invId) invId = tr.getAttribute('data-invoice-id');
                    if (!invType) invType = tr.getAttribute('data-invoice-type');
                    if (!txId) txId = tr.getAttribute('data-tx-id');
                }
            }

            if (!invId) {
                const activeIdx = (isInv ? selectedInvoiceIndex : selectedHistoryIndex);
                if (activeIdx !== null && activeIdx !== undefined && transactions[activeIdx]) {
                    invId = transactions[activeIdx].invoiceId || transactions[activeIdx].id || transactions[activeIdx].transferId || transactions[activeIdx].adjId;
                    invType = transactions[activeIdx].type;
                    txId = transactions[activeIdx].id;
                }
            }

            if (!invId) {
                return showCustomAlert({
                    type: 'warning',
                    titleText: '⚠️ تنبيه',
                    msg: 'يرجى تحديد (الضغط على) العملية من الجدول أولاً لعرضها.'
                });
            }

            if (typeof window.viewAnyDocumentUnified === 'function') {
                window.viewAnyDocumentUnified(invId, invType || '', txId || '');
            } else if (typeof viewInvoiceItems === 'function') {
                viewInvoiceItems(invId, invType || '', false, txId || '');
            }
        }
        window.viewSelectedInvoice = viewSelectedInvoice;

        // دالة التعديل السريع برقم الفاتورة
        window.quickEditByNumber = function() {
            const settings = JSON.parse(getStore('pos_settings') || '{}');
            const canEditHistory = !!settings.allowHistoryEdit;
            if (!canEditHistory) {
                return showCustomAlert({
                    type: 'error',
                    titleText: '🚫 صلاحية ملغاة',
                    msg: 'عذراً، صلاحية تعديل السجل (Edit History) غير مفعلة في الإعدادات.'
                });
            }

            const input = document.getElementById('quickEditInvoiceId');
            if (!input) return;
            const invId = input.value.trim();

            if (!invId) {
                showToast("⚠️ يرجى إدخال رقم الفاتورة أولاً", "warning");
                input.focus();
                return;
            }

            // البحث عن الفاتورة في قاعدة البيانات مع مراعاة الأولوية (فواتير المبيعات أولاً للكاشير ثم باقي العمليات)
            let found = transactions.find(t => t.invoiceId == invId && t.type && (t.type.includes('بيع') || t.type.includes('مبيعات')) && !t.type.includes('مرتجع'));
            if (!found) {
                found = transactions.find(t => t.invoiceId == invId);
            }
            if (!found && window.BayanSQLite && typeof window.BayanSQLite.getInvoice === 'function') {
                found = window.BayanSQLite.getInvoice(invId, 'بيع') || window.BayanSQLite.getInvoice(invId);
            }

            if (found) {
                let cleanType = '';
                const typeStr = found.type;
                if (typeStr.includes('بيع') && !typeStr.includes('مرتجع')) cleanType = 'بيع';
                else if (typeStr.includes('شراء') && !typeStr.includes('مرتجع')) cleanType = 'شراء';
                else if (typeStr.includes('مرتجع بيع')) cleanType = 'مرتجع بيع';
                else if (typeStr.includes('مرتجع شراء')) cleanType = 'مرتجع شراء';
                else if (typeStr.includes('قبض')) cleanType = 'قبض';
                else if (typeStr.includes('صرف')) cleanType = 'صرف';

                if (window.editTransaction) {
                    window.editTransaction(invId, cleanType);
                    input.value = '';
                }
            } else {
                showCustomAlert({
                    type: 'error',
                    titleText: '❌ غير موجود',
                    msg: `لم يتم العثور على فاتورة بالرقم (#${invId}).`
                });
            }
        };

        function editSelectedInvoice() {
            const isInv = (typeof activeTabId === 'string' && activeTabId.startsWith('invoices'));
            let invId = (isInv && window.selectedInvoiceId) ? window.selectedInvoiceId : (window.selectedInvoiceId || window.selectedHistoryInvoiceId || null);
            let invType = (isInv && window.selectedInvoiceType) ? window.selectedInvoiceType : (window.selectedInvoiceType || window.selectedHistoryInvoiceType || null);
            let txId = (isInv && window.selectedTxId) ? window.selectedTxId : null;
            let t = null;

            if (isInv && txId) {
                t = transactions.find(x => String(x.id) === String(txId));
            }
            if (!t && invId) {
                t = transactions.find(x => String(x.invoiceId) === String(invId) && (!invType || (typeof window.isMatchingInvoiceType === 'function' ? window.isMatchingInvoiceType(x.type, invType) : x.type === invType)));
                if (!t) t = transactions.find(x => String(x.invoiceId) === String(invId));
            }

            if (!t) {
                const activeIdx = isInv ? selectedInvoiceIndex : selectedHistoryIndex;
                if (activeIdx !== null && activeIdx !== undefined && activeIdx !== -1 && transactions[activeIdx]) {
                    t = transactions[activeIdx];
                    if (!invId) invId = t.invoiceId;
                    if (!invType) invType = t.type;
                } else if (!isInv && window._currentHistoryDisplayed && activeIdx !== null && window._currentHistoryDisplayed[activeIdx]) {
                    t = window._currentHistoryDisplayed[activeIdx];
                    if (!invId) invId = t.invoiceId;
                    if (!invType) invType = t.type;
                }
            }

            if (!t && !invId) {
                return showCustomAlert({
                    type: 'warning',
                    titleText: '⚠️ تنبيه',
                    msg: 'يرجى تحديد (الضغط على) العملية من الجدول أولاً لبدء التعديل.'
                });
            }

            let cleanType = '';
            const typeStr = (invType || (t ? t.type : '') || '');
            if (typeStr.includes('بيع') && !typeStr.includes('مرتجع')) cleanType = 'بيع';
            else if (typeStr.includes('شراء') && !typeStr.includes('مرتجع')) cleanType = 'شراء';
            else if (typeStr.includes('مرتجع بيع')) cleanType = 'مرتجع بيع';
            else if (typeStr.includes('مرتجع شراء')) cleanType = 'مرتجع شراء';
            else if (typeStr.includes('تسوية')) cleanType = 'تسوية';
            else if (typeStr.includes('قبض')) cleanType = 'قبض';
            else if (typeStr.includes('صرف')) cleanType = 'صرف';
            else if (typeStr.includes('تحويل')) cleanType = 'تحويل';

            if (window.editTransaction) {
                window.editTransaction(invId || (t ? (t.invoiceId || t.id) : null), cleanType, txId || (t ? t.id : ''));
            }
        }

        function deleteSelectedInvoice() {
            const isInv = (typeof activeTabId === 'string' && activeTabId.startsWith('invoices'));
            let invId = (isInv && window.selectedInvoiceId) ? window.selectedInvoiceId : null;
            let invType = (isInv && window.selectedInvoiceType) ? window.selectedInvoiceType : null;
            let txId = (isInv && window.selectedTxId) ? window.selectedTxId : null;

            if (isInv && invId) {
                if (typeof window.deleteInvoiceGlobal === 'function') {
                    return window.deleteInvoiceGlobal(invId, invType, txId);
                }
            }

            const activeIdx = isInv ? selectedInvoiceIndex : selectedHistoryIndex;
            if (activeIdx === null || activeIdx === undefined || activeIdx === -1) {
                return showCustomAlert({
                    type: 'warning',
                    titleText: '⚠️ تنبيه',
                    msg: 'يرجى تحديد (الضغط على) العملية من الجدول أولاً لتتمكن من حذفها.'
                });
            }

            deleteTransaction(activeIdx);
        }

        function printIndividualTransaction(idx) {
            const t = transactions[idx];
            if (!t) return;
            if (t.type.includes('بيع') || t.type.includes('شراء') || t.type.includes('مرتجع')) {
                if (t.invoiceId && typeof viewInvoiceItems === 'function') {
                    viewInvoiceItems(t.invoiceId, t.type, true, t.id);
                } else if (t.invoiceId && typeof printBillFromData === 'function') {
                    printBillFromData(t.invoiceId, t.type);
                } else {
                    alert("لا يمكن طباعة هذا البند بشكل مستقل (لا يوجد رقم فاتورة)");
                }
            } else if (t.type.includes('قبض')) {
                document.getElementById('receiptID').value = t.invoiceId || '-';
                document.getElementById('receiptDate').value = t.dateISO;
                document.getElementById('receiptCustomer').value = t.partner;
                document.getElementById('receiptAmount').value = t.price;
                document.getElementById('receiptNotes').value = t.product;
                printReceiptData();
            } else if (t.type.includes('صرف')) {
                document.getElementById('disburseID').value = t.invoiceId || '-';
                document.getElementById('disburseDate').value = t.dateISO;
                document.getElementById('disbursePayee').value = t.partner;
                document.getElementById('disburseAmount').value = t.price;
                document.getElementById('disburseNotes').value = t.product;
                printDisbursementData();
            } else {
                if (typeof showToast === 'function') {
                    showToast("تم إرسال طلب الطباعة للطابعة الافتراضية...", "success");
                }
            }
        }

        let loginClockInterval = null;