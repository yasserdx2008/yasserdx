// popup.js - التحكم في واجهة الإضافة

// عناصر DOM
const toggleSwitch = document.getElementById('toggleSwitch');
const replyMessage = document.getElementById('replyMessage');
const saveBtn = document.getElementById('saveBtn');
const onlyOnce = document.getElementById('onlyOnce');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const userCount = document.getElementById('userCount');
const clearBtn = document.getElementById('clearBtn');
const toast = document.getElementById('toast');

let toastTimer = null;

// عرض رسالة منبثقة
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// تحميل الإعدادات من التخزين
async function loadSettings() {
    try {
        const data = await chrome.storage.local.get([
            'enabled', 
            'replyMessage', 
            'onlyOnce', 
            'repliedUsers'
        ]);

        // تحديث حالة التبديل
        if (data.enabled) {
            toggleSwitch.classList.add('active');
            statusDot.className = 'dot on';
            statusText.textContent = 'مفعل';
        } else {
            toggleSwitch.classList.remove('active');
            statusDot.className = 'dot off';
            statusText.textContent = 'غير مفعل';
        }

        // تحديث نص الرد
        if (data.replyMessage) {
            replyMessage.value = data.replyMessage;
        }

        // تحديث خيار الرد مرة واحدة
        onlyOnce.checked = data.onlyOnce || false;

        // تحديث عدد المستخدمين
        const users = data.repliedUsers || [];
        userCount.textContent = users.length;
    } catch (error) {
        console.error('خطأ في تحميل الإعدادات:', error);
    }
}

// حفظ الإعدادات
async function saveSettings() {
    try {
        const enabled = toggleSwitch.classList.contains('active');
        const message = replyMessage.value.trim() || 'شكراً لتواصلك! سأرد عليك قريباً.';
        const once = onlyOnce.checked;

        // جلب المستخدمين الحاليين
        const data = await chrome.storage.local.get(['repliedUsers']);
        const users = data.repliedUsers || [];

        // حفظ الإعدادات
        await chrome.storage.local.set({
            enabled: enabled,
            replyMessage: message,
            onlyOnce: once,
            repliedUsers: users
        });

        // تحديث الواجهة
        loadSettings();

        // إعلام content script بتحديث الإعدادات
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0] && tabs[0].id) {
            try {
                await chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SETTINGS_UPDATED',
                    data: { enabled, message, once, users }
                });
            } catch (error) {
                // تجاهل إذا لم يكن content script جاهزاً
            }
        }

        showToast('✅ تم حفظ الإعدادات بنجاح');
    } catch (error) {
        console.error('خطأ في حفظ الإعدادات:', error);
        showToast('❌ حدث خطأ في الحفظ');
    }
}

// تبديل حالة التشغيل
toggleSwitch.addEventListener('click', saveSettings);

// حفظ الإعدادات عند الضغط على زر الحفظ
saveBtn.addEventListener('click', saveSettings);

// تغيير خيار الرد مرة واحدة
onlyOnce.addEventListener('change', saveSettings);

// مسح سجل المستخدمين
clearBtn.addEventListener('click', async () => {
    if (confirm('هل أنت متأكد من مسح سجل المستخدمين؟')) {
        try {
            await chrome.storage.local.set({ repliedUsers: [] });
            showToast('🗑️ تم مسح السجل بنجاح');
            loadSettings();
        } catch (error) {
            console.error('خطأ في مسح السجل:', error);
            showToast('❌ حدث خطأ في المسح');
        }
    }
});

// تحميل الإعدادات عند فتح النافذة
document.addEventListener('DOMContentLoaded', loadSettings);

// الاستماع لتغييرات التخزين من الخلفية
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        loadSettings();
    }
});

console.log('✅ Popup جاهز للعمل');
