// content.js - يعمل في صفحات المواقع لكشف الرسائل والرد عليها

let settings = {
    enabled: false,
    replyMessage: 'شكراً لتواصلك! سأرد عليك قريباً.',
    onlyOnce: false,
    repliedUsers: []
};

let isProcessing = false;

// تحميل الإعدادات من التخزين
async function loadSettings() {
    try {
        const data = await chrome.storage.local.get([
            'enabled', 
            'replyMessage', 
            'onlyOnce', 
            'repliedUsers'
        ]);
        settings.enabled = data.enabled || false;
        settings.replyMessage = data.replyMessage || 'شكراً لتواصلك! سأرد عليك قريباً.';
        settings.onlyOnce = data.onlyOnce || false;
        settings.repliedUsers = data.repliedUsers || [];
    } catch (error) {
        console.error('خطأ في تحميل الإعدادات من content:', error);
    }
}

// حفظ المستخدمين المردود عليهم
async function saveRepliedUsers() {
    try {
        await chrome.storage.local.set({ repliedUsers: settings.repliedUsers });
    } catch (error) {
        console.error('خطأ في حفظ المستخدمين:', error);
    }
}

// البحث عن حقل إدخال النص
function findInputField() {
    const selectors = [
        'textarea',
        'input[type="text"]',
        'input[type="search"]',
        'input[type="email"]',
        'div[contenteditable="true"]',
        '[role="textbox"]',
        '.message-input',
        '.chat-input',
        '#message-input',
        '#chat-input',
        '.input-message',
        '[data-testid="conversation-compose-box-input"]',
        '[contenteditable="true"]'
    ];

    for (const selector of selectors) {
        try {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.offsetParent !== null) {
                    return el;
                }
            }
        } catch (error) {
            // تجاهل الأخطاء
        }
    }

    // البحث العام عن أي حقل إدخال
    const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
    for (const input of inputs) {
        if (input.offsetParent !== null) {
            const type = input.getAttribute('type');
            if (!type || type === 'text' || type === 'search' || type === 'email') {
                return input;
            }
            if (input.tagName === 'TEXTAREA' || input.getAttribute('contenteditable') === 'true') {
                return input;
            }
        }
    }
    return null;
}

// البحث عن زر الإرسال
function findSendButton() {
    const selectors = [
        'button[type="submit"]',
        '.send-button',
        '.chat-send',
        '#send-button',
        '[aria-label*="send" i]',
        '[aria-label*="إرسال"]',
        '[data-testid="compose-btn-send"]',
        'button:has(svg)'
    ];

    for (const selector of selectors) {
        try {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.offsetParent !== null) {
                    return el;
                }
            }
        } catch (error) {
            // تجاهل الأخطاء
        }
    }

    // البحث عن أي زر يحتوي على كلمات مفتاحية
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        if (btn.offsetParent === null) continue;
        const text = (btn.textContent || '').toLowerCase();
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (text.includes('send') || text.includes('إرسال') || text.includes('ارسال') ||
            aria.includes('send') || aria.includes('إرسال')) {
            return btn;
        }
    }
    return null;
}

// استخراج اسم المرسل من عنصر الرسالة
function extractSender(messageElement) {
    const selectors = [
        '.sender-name', 
        '.username', 
        '.author', 
        '.from',
        '[data-author]', 
        '[data-user]', 
        '.message-author',
        '.chat-user-name', 
        '.name', 
        '.user-name', 
        '.display-name'
    ];

    for (const selector of selectors) {
        try {
            const el = messageElement.querySelector(selector);
            if (el && el.textContent.trim()) {
                return el.textContent.trim();
            }
        } catch (error) {
            // تجاهل الأخطاء
        }
    }

    // محاولة استخراج من النص
    const children = messageElement.children;
    for (const child of children) {
        if (child.textContent.trim() && child.textContent.trim().length < 30) {
            return child.textContent.trim();
        }
    }

    // استخدام معرف فريد
    const id = messageElement.getAttribute('data-user-id') ||
        messageElement.getAttribute('data-author') ||
        messageElement.id;
    if (id) return id;

    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

// التحقق من أن الرسالة جديدة ولم يتم الرد عليها
function isNewMessage(messageElement) {
    // تم الرد عليها مسبقاً
    if (messageElement.querySelector('.auto-replied, [data-replied="true"]')) {
        return false;
    }

    // رسالة من المستخدم نفسه (نحن)
    if (messageElement.closest('.own-message, .message-out, .outgoing, [data-own="true"]')) {
        return false;
    }

    // تجنب الرسائل القديمة
    if (messageElement.getAttribute('data-old') === 'true') {
        return false;
    }

    return true;
}

// إرسال الرد التلقائي
async function sendReply(messageElement) {
    if (isProcessing) return;
    if (!settings.enabled) {
        console.log('الرد التلقائي غير مفعل');
        return;
    }

    const sender = extractSender(messageElement);

    // التحقق من الرد مرة واحدة لكل مستخدم
    if (settings.onlyOnce && settings.repliedUsers.includes(sender)) {
        console.log('تم الرد بالفعل على:', sender);
        return;
    }

    const inputField = findInputField();
    const sendButton = findSendButton();

    if (!inputField || !sendButton) {
        console.warn('لم يتم العثور على حقل الإدخال أو زر الإرسال');
        return;
    }

    isProcessing = true;

    try {
        // إدخال النص في حقل الكتابة
        if (inputField.tagName === 'INPUT' || inputField.tagName === 'TEXTAREA') {
            inputField.value = settings.replyMessage;
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (inputField.getAttribute('contenteditable') === 'true') {
            inputField.textContent = settings.replyMessage;
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // إضافة علامة للرسالة بأنه تم الرد عليها
        messageElement.setAttribute('data-replied', 'true');
        const badge = document.createElement('span');
        badge.className = 'auto-replied';
        badge.textContent = ' 🤖 تم الرد';
        badge.style.cssText = 'color: #2d7d9e; font-size: 11px; margin-left: 8px; font-weight: 500;';
        messageElement.appendChild(badge);

        // إضافة المستخدم إلى قائمة المردود عليهم
        if (!settings.repliedUsers.includes(sender)) {
            settings.repliedUsers.push(sender);
            await saveRepliedUsers();
        }

        // تأخير صغير ثم الضغط على زر الإرسال
        setTimeout(() => {
            sendButton.click();
            console.log('✅ تم إرسال الرد التلقائي إلى:', sender);
            isProcessing = false;
        }, 400);

    } catch (error) {
        console.error('خطأ في إرسال الرد:', error);
        isProcessing = false;
    }
}

// مراقبة الرسائل الجديدة باستخدام MutationObserver
function observeMessages() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                let messageElement = null;

                // التحقق من أن العنصر هو رسالة
                if (node.matches && node.matches(
                        '.message, .chat-message, .msg, .message-item, [role="article"], ._1htf, .copyable-text'
                    )) {
                    messageElement = node;
                } else {
                    // البحث داخل العنصر
                    const found = node.querySelector(
                        '.message, .chat-message, .msg, .message-item, [role="article"], ._1htf, .copyable-text'
                    );
                    if (found) {
                        messageElement = found;
                    }
                }

                if (messageElement && isNewMessage(messageElement)) {
                    setTimeout(() => {
                        sendReply(messageElement);
                    }, 600);
                }
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false
    });

    console.log('🚀 Smart Auto Responder يعمل على هذه الصفحة');
}

// الاستماع لتحديثات الإعدادات من popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SETTINGS_UPDATED') {
        settings.enabled = request.data.enabled;
        settings.replyMessage = request.data.message;
        settings.onlyOnce = request.data.once;
        settings.repliedUsers = request.data.users;
        console.log('📦 تم تحديث الإعدادات:', settings);
    }
});

// بدء تشغيل الإضافة
async function init() {
    await loadSettings();
    observeMessages();
    console.log('✅ Smart Auto Responder جاهز للعمل');
    console.log('📋 الإعدادات الحالية:', settings);
}

// تأخير البدء للتأكد من تحميل الصفحة
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
      }
