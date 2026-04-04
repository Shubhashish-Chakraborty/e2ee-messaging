(function () {
    'use strict';

    const usersTbody  = document.getElementById('users-tbody');
    const msgsTbody   = document.getElementById('msgs-tbody');
    const usersCount  = document.getElementById('users-count');
    const msgsCount   = document.getElementById('msgs-count');
    const statUsers   = document.getElementById('stat-users');
    const statMsgs    = document.getElementById('stat-msgs');
    const statTime    = document.getElementById('stat-time');

    function esc(s) {
        if (s === null || s === undefined) return '<span class="text-slate-500 italic">NULL</span>';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function truncate(str, maxLen = 64) {
        if (!str) return '—';
        if (str.length <= maxLen) return str;
        return str.slice(0, maxLen) + '…';
    }

    function formatTs(ts) {
        if (!ts) return '—';
        try {
            const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
            return d.toISOString().replace('T', ' ').slice(0, 19);
        } catch (_) { return ts; }
    }

    function renderUsers(users) {
        usersCount.textContent = `// ${users.length} row${users.length !== 1 ? 's' : ''}`;
        statUsers.textContent  = users.length;

        if (users.length === 0) {
            usersTbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">
                No users found in database.
            </td></tr>`;
            return;
        }

        usersTbody.innerHTML = '';
        users.forEach((u, i) => {
            const tr = document.createElement('tr');
            tr.className = 'row-anim hover:bg-[#21262d]/50 transition-colors cursor-default';
            tr.style.animationDelay = `${i * 30}ms`;
            tr.innerHTML = `
                <td class="px-4 py-4 text-slate-500 font-mono text-[11px] align-top">${esc(u.id)}</td>
                <td class="px-4 py-4 text-slate-200 font-semibold text-xs align-top">${esc(u.username)}</td>
                <td class="px-4 py-4 text-[11px] font-mono leading-relaxed align-top" style="word-break: break-all;">
                    <div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-900/20 border border-amber-900/50 text-amber-500 text-[10px] mb-1.5 font-sans"><i class="fas fa-hashtag"></i> PBKDF2</div><br>
                    <span class="text-amber-500/80" title="${esc(u.password_hash)}">${esc(truncate(u.password_hash, 60))}</span>
                </td>
                <td class="px-4 py-4 text-[11px] font-mono leading-relaxed align-top" style="word-break: break-all;">
                    <div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-900/20 border border-cyan-900/50 text-cyan-500 text-[10px] mb-1.5 font-sans"><i class="fas fa-key"></i> RSA-OAEP</div><br>
                    <span class="text-cyan-500/80" title="${esc(u.public_key)}">${esc(truncate(u.public_key, 60))}</span>
                </td>
                <td class="px-4 py-4 text-slate-500 text-[11px] font-mono whitespace-nowrap align-top">${esc(formatTs(u.created_at))}</td>
            `;
            usersTbody.appendChild(tr);
        });
    }

    function renderMessages(messages) {
        msgsCount.textContent = `// ${messages.length} row${messages.length !== 1 ? 's' : ''}`;
        statMsgs.textContent  = messages.length;

        if (messages.length === 0) {
            msgsTbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500 italic">
                No messages found in database.
            </td></tr>`;
            return;
        }

        msgsTbody.innerHTML = '';
        messages.forEach((m, i) => {
            const tr = document.createElement('tr');
            tr.className = 'row-anim hover:bg-[#21262d]/50 transition-colors cursor-default';
            tr.style.animationDelay = `${i * 20}ms`;

            const shortIv     = truncate(m.iv || '', 24);
            const shortCipher = truncate(m.ciphertext || '', 80);

            tr.innerHTML = `
                <td class="px-4 py-4 text-slate-500 font-mono text-[11px] align-top">${esc(m.id)}</td>
                <td class="px-4 py-4 text-slate-300 font-medium text-xs align-top">${esc(m.sender)}</td>
                <td class="px-4 py-4 text-cyan-400 font-medium text-xs align-top">${esc(m.receiver)}</td>
                <td class="px-4 py-4 text-[11px] font-mono text-slate-400 align-top" title="${esc(m.iv)}">${esc(shortIv)}</td>
                <td class="px-4 py-4 text-[11px] font-mono leading-relaxed align-top">
                    <div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-900/20 border border-emerald-900/50 text-emerald-500 text-[10px] mb-1.5 font-sans"><i class="fas fa-lock"></i> AES-GCM</div><br>
                    <div class="text-emerald-500/80 hover:whitespace-normal hover:break-all transition-all" style="word-break: break-all;" title="${esc(m.ciphertext)}">
                        ${esc(shortCipher)}
                    </div>
                </td>
                
            `;
            msgsTbody.appendChild(tr);
        });
    }

    function setError(target, cols, msg) {
        target.innerHTML = `<tr><td colspan="${cols}" class="px-4 py-8 text-center text-rose-500 bg-rose-950/10">
            <i class="fas fa-exclamation-triangle mr-2"></i> ${esc(msg)}
        </td></tr>`;
    }

    async function fetchAndRender() {
        try {
            const res = await fetch('/api/analyse');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Bad response');

            const users    = json.data?.users    || [];
            const messages = json.data?.messages || [];

            renderUsers(users);
            renderMessages(messages);

            statTime.textContent = new Date().toISOString().slice(11, 19);
        } catch (e) {
            console.error('analyse fetch error:', e);
            setError(usersTbody, 5, `Failed to fetch: ${e.message}`);
            setError(msgsTbody,  6, `Failed to fetch: ${e.message}`);
            statUsers.textContent = 'ERR';
            statMsgs.textContent  = 'ERR';
        }
    }

    const loadingMessages = [
        'Connecting to D1 database...',
        'Querying users table...',
        'Querying messages table...',
        'Rendering raw dump...',
    ];

    let step = 0;
    function typewriterStep() {
        if (step < loadingMessages.length) {
            const msg = loadingMessages[step];
            [usersTbody, msgsTbody].forEach(tbody => {
                const td = tbody.querySelector('td');
                if (td) {
                    td.innerHTML = `<i class="fas fa-spinner fa-spin mr-2 text-cyan-500"></i> ${msg}`;
                }
            });
            step++;
            setTimeout(typewriterStep, 350);
        } else {
            fetchAndRender();
        }
    }

    setTimeout(typewriterStep, 200);

})();
