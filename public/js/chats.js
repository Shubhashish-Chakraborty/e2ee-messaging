(function () {
    'use strict';

    // Auth guard 
    if (!Auth.isLoggedIn()) {
        const dest = encodeURIComponent(window.location.href);
        window.location.href = `/login.html?next=${dest}`;
        return;
    }

    const currentUser  = Auth.getUser();   // { id, username, public_key }
    const myUsername   = currentUser.username;

    const params         = new URLSearchParams(window.location.search);
    const chatWithName   = params.get('with');

    if (!chatWithName) {
        window.location.href = '/';
        return;
    }

    const chatHeaderInfo  = document.getElementById('chat-header-info');
    const noKeyWarning    = document.getElementById('no-key-warning');
    const chatArea        = document.getElementById('chat-area');
    const messagesArea    = document.getElementById('messages-area');
    const msgsLoading     = document.getElementById('msgs-loading');
    const msgsEmpty       = document.getElementById('msgs-empty');
    const msgInput        = document.getElementById('msg-input');
    const sendBtn         = document.getElementById('send-btn');

    let chatPartner       = null;   // { username, public_key, githubUrl }
    let myPrivateKeyB64   = null;
    let pollTimer         = null;
    let lastMessageCount  = -1;


    function bufToB64(buf) {
        const bytes = new Uint8Array(buf);
        let out = '';
        for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
        return btoa(out);
    }

    function b64ToBuf(b64) {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out.buffer;
    }

    async function importPublicKey(b64) {
        return crypto.subtle.importKey(
            'spki', b64ToBuf(b64),
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false, ['encrypt']
        );
    }

    async function importPrivateKey(b64) {
        return crypto.subtle.importKey(
            'pkcs8', b64ToBuf(b64),
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false, ['decrypt']
        );
    }

    /**
     * Encrypt plaintext for a recipient.
     * Returns { iv: string, ciphertext: string }
     *   iv         → base64(12-byte AES-GCM nonce)
     *   ciphertext → base64(RSA-wrapped AES key) + "." + base64(AES-GCM ciphertext)
     */
    async function encryptMessage(plaintext, recipientPublicKeyB64) {
        const recipientKey = await importPublicKey(recipientPublicKeyB64);

        // 1. Generate ephemeral AES-256-GCM key
        const aesKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
        );

        // 2. Encrypt plaintext with AES-GCM
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const msgBuf = new TextEncoder().encode(plaintext);
        const aesCipherBuf = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, aesKey, msgBuf
        );

        // 3. Wrap AES key with recipient's RSA-OAEP public key
        const rawAesKey    = await crypto.subtle.exportKey('raw', aesKey);
        const wrappedAesBuf = await crypto.subtle.encrypt(
            { name: 'RSA-OAEP' }, recipientKey, rawAesKey
        );

        return {
            iv:         bufToB64(iv),
            ciphertext: bufToB64(wrappedAesBuf) + '.' + bufToB64(aesCipherBuf),
        };
    }

    /**
     * Decrypt a message received for us.
     * myPrivateKeyB64 is the pkcs8 base64 private key from localStorage.
     */
    async function decryptMessage(iv, ciphertext, privateKeyB64) {
        const privateKey = await importPrivateKey(privateKeyB64);
        const dot = ciphertext.indexOf('.');
        if (dot === -1) throw new Error('Bad ciphertext format');

        const wrappedAesBuf = b64ToBuf(ciphertext.slice(0, dot));
        const aesCipherBuf  = b64ToBuf(ciphertext.slice(dot + 1));

        // 1. Unwrap AES key
        const rawAesKeyBuf = await crypto.subtle.decrypt(
            { name: 'RSA-OAEP' }, privateKey, wrappedAesBuf
        );
        const aesKey = await crypto.subtle.importKey(
            'raw', rawAesKeyBuf, { name: 'AES-GCM' }, false, ['decrypt']
        );

        // 2. Decrypt message
        const ivBuf = b64ToBuf(iv);
        const plainBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBuf }, aesKey, aesCipherBuf
        );

        return new TextDecoder().decode(plainBuf);
    }

    // LOCAL OUTBOX  – store sent plaintext keyed by iv

    function outboxKey(iv) {
        return `e2ee_sent_${myUsername}_${iv}`;
    }

    function saveSentPlaintext(iv, plaintext) {
        try { localStorage.setItem(outboxKey(iv), plaintext); } catch (_) {}
    }

    function getSentPlaintext(iv) {
        return localStorage.getItem(outboxKey(iv));
    }

    function escapeHtml(s) {
        if (!s) return '';
        return s.replace(/[&<>"']/g, c => (
            {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
        ));
    }

    function getAvatarUrl(githubUrl, username) {
        if (githubUrl) {
            const m = githubUrl.match(/github\.com\/([^/?#]+)/i);
            if (m && m[1])
                return `https://avatars.githubusercontent.com/${m[1]}?s=80&v=4`;
        }
        return `https://ui-avatars.com/api/?background=0891b2&color=fff&rounded=true&size=80&name=${encodeURIComponent(username || 'U')}&bold=true`;
    }

    function formatTimestamp(ts) {
        if (!ts) return '';
        const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
        if (isNaN(d)) return ts;
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function updateHeader() {
        const avatarSrc = getAvatarUrl(chatPartner.githubUrl, chatPartner.username);
        chatHeaderInfo.innerHTML = `
            <img src="${avatarSrc}"
                 onerror="this.src='https://ui-avatars.com/api/?background=0891b2&color=fff&rounded=true&size=80&name=${encodeURIComponent(chatPartner.username)}'"
                 class="w-8 h-8 rounded-full border border-[#30363d] object-cover" alt="${escapeHtml(chatPartner.username)}">
            <div class="text-left">
                <p class="text-sm font-bold text-slate-100 leading-none">${escapeHtml(chatPartner.username)}</p>
                <p class="text-xs text-emerald-500/80 mt-0.5 flex items-center gap-1">
                    <i class="fas fa-lock text-[9px]"></i> Encrypted
                </p>
            </div>
        `;
    }

    function showNoKeyWarning() {
        noKeyWarning.classList.remove('hidden');
        noKeyWarning.style.display = 'flex';
        chatArea.classList.add('hidden');
    }

    function showChatArea() {
        noKeyWarning.classList.add('hidden');
        chatArea.classList.remove('hidden');
        chatArea.style.display = 'flex';
    }

    function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    // render messages!

    async function renderMessages(messages) {
        // Clear existing bubbles (keep loading/empty divs)
        const existingBubbles = messagesArea.querySelectorAll('.msg-bubble');
        existingBubbles.forEach(b => b.remove());

        msgsLoading.classList.add('hidden');

        if (!messages || messages.length === 0) {
            msgsEmpty.classList.remove('hidden');
            return;
        }
        msgsEmpty.classList.add('hidden');

        for (const msg of messages) {
            const isMine = msg.sender === myUsername;
            let plaintext = null;
            let decryptFailed = false;

            if (isMine) {
                // Look up local outbox by iv
                plaintext = getSentPlaintext(msg.iv);
                if (!plaintext) {
                    plaintext = null;
                    decryptFailed = true; // sent on another device or before this session
                }
            } else {
                // Decrypt with our private key
                try {
                    plaintext = await decryptMessage(msg.iv, msg.ciphertext, myPrivateKeyB64);
                } catch (e) {
                    decryptFailed = true;
                }
            }

            const bubble = document.createElement('div');
            bubble.className = `msg-bubble flex ${isMine ? 'justify-end' : 'justify-start'} items-end gap-2`;

            let bubbleContent;
            if (decryptFailed) {
                bubbleContent = `
                    <div class="flex items-center gap-2 text-slate-600 text-xs italic px-3 py-2 rounded-xl border border-dashed border-[#30363d] bg-[#161b22] max-w-xs">
                        <i class="fas fa-lock text-[10px]"></i>
                        <span>${isMine ? 'Sent from another device' : 'Could not decrypt'}</span>
                    </div>`;
            } else {
                const bgClass  = isMine ? 'bg-cyan-700/90 text-white' : 'bg-[#21262d] text-slate-200';
                const roundClass = isMine ? 'rounded-tl-2xl rounded-tr-sm rounded-bl-2xl' : 'rounded-tr-2xl rounded-tl-sm rounded-br-2xl';
                bubbleContent = `
                    <div class="max-w-xs sm:max-w-md px-4 py-2.5 ${bgClass} ${roundClass} rounded-2xl shadow-sm">
                        <p class="text-sm leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(plaintext)}</p>
                        <p class="text-[10px] ${isMine ? 'text-cyan-200/60' : 'text-slate-600'} mt-1 text-right flex items-center justify-end gap-1">
                            ${isMine ? '<i class="fas fa-lock text-[9px]"></i>' : '<i class="fas fa-lock-open text-[9px]"></i>'}
                            ${escapeHtml(formatTimestamp(msg.timestamp))}
                        </p>
                    </div>`;
            }

            if (!isMine) {
                const avatar = getAvatarUrl(chatPartner.githubUrl, chatPartner.username);
                bubble.innerHTML = `
                    <img src="${avatar}" class="w-7 h-7 rounded-full border border-[#30363d] object-cover shrink-0 mb-0.5" alt="${escapeHtml(chatPartner.username)}">
                    ${bubbleContent}`;
            } else {
                bubble.innerHTML = bubbleContent;
            }

            messagesArea.appendChild(bubble);
        }

        scrollToBottom();
    }

    async function loadMessages(silent = false) {
        if (!silent) {
            msgsLoading.classList.remove('hidden');
            msgsEmpty.classList.add('hidden');
        }
        try {
            const res = await fetch(
                `/api/messages?chat_with=${encodeURIComponent(chatPartner.username)}`,
                { headers: { Authorization: `Bearer ${Auth.getToken()}` } }
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to load messages');

            const messages = data.data?.messages || [];
            if (silent && messages.length === lastMessageCount) return; // no change
            lastMessageCount = messages.length;

            await renderMessages(messages);
        } catch (e) {
            console.error('loadMessages:', e);
            if (!silent) {
                msgsLoading.classList.add('hidden');
                msgsEmpty.classList.remove('hidden');
                msgsEmpty.innerHTML = `
                    <div class="w-14 h-14 rounded-full bg-red-900/20 border border-red-900/30 flex items-center justify-center">
                        <i class="fas fa-exclamation-triangle text-red-400 text-xl"></i>
                    </div>
                    <p class="text-sm text-red-400">Failed to load messages</p>
                    <p class="text-xs text-slate-600">${escapeHtml(e.message)}</p>`;
            }
        }
    }

    async function sendMessage() {
        const text = msgInput.value.trim();
        if (!text) return;

        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-sm"></i>';
        msgInput.disabled = true;

        try {
            const { iv, ciphertext } = await encryptMessage(text, chatPartner.public_key);

            const res = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${Auth.getToken()}`
                },
                body: JSON.stringify({ receiver: chatPartner.username, iv, ciphertext })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send');

            // Cache plaintext so we can display our own sent message
            saveSentPlaintext(iv, text);

            msgInput.value = '';
            msgInput.style.height = 'auto';
            await loadMessages(false);
        } catch (e) {
            console.error('sendMessage:', e);
            alert(`Send failed: ${e.message}`);
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane text-sm"></i>';
            msgInput.disabled = false;
            updateSendBtn();
            msgInput.focus();
        }
    }

    // Input handling

    function updateSendBtn() {
        sendBtn.disabled = msgInput.value.trim().length === 0;
    }

    msgInput.addEventListener('input', updateSendBtn);
    msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) sendMessage();
        }
    });

    sendBtn.addEventListener('click', sendMessage);


    async function init() {
        // Load private key
        myPrivateKeyB64 = localStorage.getItem(`e2ee_privateKey_${myUsername}`);
        if (!myPrivateKeyB64) {
            showNoKeyWarning();
            return;
        }

        // Fetch all users to get chat partner's info (including public key)
        let allUsers = [];
        try {
            const res  = await fetch('/users');
            const data = await res.json();
            allUsers   = data?.data?.users || [];
        } catch (e) {
            console.error('Could not load users:', e);
        }

        chatPartner = allUsers.find(u => u.username === chatWithName);
        if (!chatPartner) {
            chatHeaderInfo.innerHTML = `<span class="text-red-400 text-sm">User "${escapeHtml(chatWithName)}" not found</span>`;
            showChatArea();
            msgsLoading.classList.add('hidden');
            msgsEmpty.classList.remove('hidden');
            msgsEmpty.innerHTML = `
                <p class="text-slate-500 text-sm">This user does not exist.</p>
                <a href="/" class="text-cyan-500 text-xs hover:underline">Go back</a>`;
            return;
        }

        updateHeader();
        showChatArea();

        // Initial load
        await loadMessages(false);

        // Poll every 5 s for new messages
        pollTimer = setInterval(() => loadMessages(true), 5000);
    }

    init();

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
        if (pollTimer) clearInterval(pollTimer);
    });

})();
