(function () {
    // DOM refs
    const usersGrid       = document.getElementById('users-grid');
    const emptyStateDiv   = document.getElementById('empty-state');
    const errorAlert      = document.getElementById('error-alert');
    const errorTextSpan   = document.getElementById('error-text');
    const errorDetailSpan = document.getElementById('error-detail');
    const dismissErrorBtn = document.getElementById('dismiss-error');
    const refreshBtn      = document.getElementById('refresh-btn');
    const emptyRetryBtn   = document.getElementById('empty-retry-btn');
    const statusMsg       = document.getElementById('status-message');
    const statusDot       = document.getElementById('status-indicator');
    const navActions      = document.getElementById('nav-actions');

    const USERS_API_URL = '/users';

    // Navbar auth buttons
    function renderNavButtons() {
        if (Auth.isLoggedIn()) {
            const user = Auth.getUser();
            navActions.innerHTML = `
                <span class="text-slate-400 text-sm hidden sm:inline mr-2">
                    Hi, <strong class="text-cyan-400">${escapeHtml(user.username)}</strong>
                </span>
                <a href="/analyse.html" id="btn-analyse" class="flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg bg-violet-900/40 border border-violet-800/60 text-violet-400 text-sm font-medium hover:bg-violet-800/60 transition-colors">
                    <i class="fas fa-database"></i> <span class="hidden sm:inline">Analyse</span>
                </a>
                <a href="/chats.html" id="btn-chats" class="flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg bg-cyan-900/40 border border-cyan-800/60 text-cyan-400 text-sm font-medium hover:bg-cyan-800/60 transition-colors">
                    <i class="fas fa-comments"></i> <span class="hidden sm:inline">My Chats</span>
                </a>
                <button id="btn-logout" class="flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-slate-300 text-sm font-medium hover:bg-[#30363d] hover:text-white transition-colors shadow-sm cursor-pointer z-50 relative pointer-events-auto">
                    <i class="fas fa-sign-out-alt"></i> <span class="hidden sm:inline">Logout</span>
                </button>
            `;
            document.getElementById('btn-logout').addEventListener('click', () => {
                Auth.logout();
            });
        } else {
            navActions.innerHTML = `
                <a href="/analyse.html" class="flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg bg-violet-900/40 border border-violet-700/60 text-violet-400 text-sm font-medium hover:bg-violet-800/60 transition-colors">
                    <i class="fas fa-database"></i> <span class="hidden sm:inline">Analyse</span>
                </a>
                <a href="/signup.html" class="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors shadow shadow-cyan-900/30">
                    <i class="fas fa-user-plus hidden sm:inline"></i> Sign Up
                </a>
                <a href="/login.html" class="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-slate-300 text-sm font-medium hover:bg-[#30363d] hover:text-white transition-colors shadow-sm">
                    <i class="fas fa-sign-in-alt hidden sm:inline"></i> Login
                </a>
            `;
        }
    }

    // Status helper
    function updateStatus(type, message, loading = false) {
        if (loading) {
            statusMsg.innerHTML = `<i class="fas fa-spinner fa-spin mr-2 text-cyan-400"></i>${message}`;
            statusDot.className = 'status-dot loading';
        } else if (type === 'success') {
            statusMsg.innerHTML = `<i class="fas fa-check-circle mr-2 text-emerald-400"></i>${message}`;
            statusDot.className = 'status-dot success';
        } else if (type === 'error') {
            statusMsg.innerHTML = `<i class="fas fa-exclamation-triangle mr-2 text-red-400"></i>${message}`;
            statusDot.className = 'status-dot error';
        } else {
            statusMsg.innerHTML = `<i class="fas fa-info-circle mr-2 text-slate-400"></i>${message}`;
            statusDot.className = 'status-dot idle';
        }
    }

    // Skeleton loaders
    function showSkeletons() {
        usersGrid.innerHTML = '';
        emptyStateDiv.classList.add('hidden');
        errorAlert.classList.add('hidden');
        for (let i = 0; i < 6; i++) {
            const sk = document.createElement('div');
            sk.className = 'bg-[#161b22] border border-[#30363d] rounded-2xl p-5 shadow-sm opacity-60';
            sk.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-[#21262d] animate-pulse"></div>
                    <div class="flex-1 space-y-2">
                        <div class="h-4 bg-[#21262d] rounded w-1/2 animate-pulse"></div>
                        <div class="h-3 bg-[#21262d] rounded w-1/3 animate-pulse"></div>
                    </div>
                </div>
                <div class="mt-4 h-8 bg-[#21262d] rounded animate-pulse"></div>
                <div class="mt-3 h-9 bg-[#21262d] rounded animate-pulse"></div>
            `;
            usersGrid.appendChild(sk);
        }
    }

    function getAvatarUrl(githubUrl, username) {
        if (githubUrl) {
            const m = githubUrl.match(/github\.com\/([^/?#]+)/i);
            if (m && m[1]) return `https://avatars.githubusercontent.com/${m[1]}?s=120&v=4`;
        }
        return `https://ui-avatars.com/api/?background=0891b2&color=fff&rounded=true&size=120&name=${encodeURIComponent(username || 'U')}&bold=true`;
    }

    function formatKey(pk) {
        if (!pk || pk.length <= 16) return pk || '—';
        return `${pk.substring(0, 10)}...${pk.substring(pk.length - 8)}`;
    }

    function renderUsers(users) {
        usersGrid.innerHTML = '';
        if (!users || users.length === 0) {
            emptyStateDiv.classList.remove('hidden');
            updateStatus('info', 'No users yet');
            return;
        }
        emptyStateDiv.classList.add('hidden');
        errorAlert.classList.add('hidden');

        const isLoggedIn   = Auth.isLoggedIn();
        const currentUser  = isLoggedIn ? Auth.getUser() : null;

        users.forEach((user, idx) => {
            const { id, username, githubUrl, public_key } = user;
            const safeUser  = username || `User_${id}`;
            const avatarSrc = getAvatarUrl(githubUrl, safeUser);
            const shortKey  = formatKey(public_key);
            const isOwnCard = isLoggedIn && currentUser.username === safeUser;

            // Message button — only shown when logged in and not own card
            const messageBtnHtml = (isLoggedIn && !isOwnCard)
                ? `<button class="msg-btn w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-600/20 border border-cyan-600/40 text-cyan-400 text-sm font-medium hover:bg-cyan-600/40 hover:border-cyan-500 transition-all duration-150">
                       <i class="fas fa-lock text-xs"></i> Send Message
                   </button>`
                : (isOwnCard
                    ? `<div class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800/40 border border-[#30363d] text-slate-500 text-sm">
                           <i class="fas fa-user text-xs"></i> This is you
                       </div>`
                    : `<a href="/login.html" class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#21262d] border border-[#30363d] text-slate-400 text-sm font-medium hover:bg-[#30363d] transition-all duration-150">
                           <i class="fas fa-sign-in-alt text-xs"></i> Login to Message
                       </a>`);

            const card = document.createElement('div');
            card.className = 'bg-[#161b22] border border-[#30363d] rounded-2xl p-5 flex flex-col gap-4 hover:-translate-y-1 hover:border-cyan-700/60 hover:shadow-lg hover:shadow-cyan-900/10 transition-all duration-200 animate-fade-in group';
            card.style.animationDelay = `${idx * 0.05}s`;
            card.innerHTML = `
                <div class="flex items-center gap-3">
                    <img class="w-12 h-12 rounded-full border border-[#30363d] bg-[#21262d] object-cover ring-2 ring-transparent group-hover:ring-cyan-900 transition-all"
                         src="${avatarSrc}"
                         alt="${escapeHtml(safeUser)}"
                         loading="lazy"
                         onerror="this.src='https://ui-avatars.com/api/?background=0e7c9e&color=fff&rounded=true&size=120&name=${encodeURIComponent(safeUser)}'">
                    <div class="flex-1 min-w-0">
                        <h2 class="text-slate-100 font-bold truncate">${escapeHtml(safeUser)}</h2>
                        ${githubUrl
                            ? `<a href="${escapeHtml(githubUrl)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 text-xs text-cyan-500 hover:text-cyan-400 mt-0.5 truncate transition-colors">
                                   <i class="fab fa-github"></i> ${escapeHtml(githubUrl.replace('https://github.com/', '@'))}
                               </a>`
                            : `<span class="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5"><i class="fab fa-github"></i> No GitHub</span>`
                        }
                    </div>
                </div>
                <div class="flex items-center justify-between gap-2 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 overflow-hidden">
                    <div class="flex items-center gap-2 overflow-hidden">
                        PublicKey:
                        <i class="fas fa-key text-amber-500/80 text-xs"></i>
                        <span class="text-xs font-mono text-slate-400 truncate" title="${escapeHtml(public_key || '')}">${escapeHtml(shortKey)}</span>
                    </div>
                </div>
                ${messageBtnHtml}
            `;

            // Attach click handler for message button
            if (isLoggedIn && !isOwnCard) {
                card.querySelector('.msg-btn').addEventListener('click', () => {
                    window.location.href = `/chats.html?with=${encodeURIComponent(safeUser)}`;
                });
            }

            usersGrid.appendChild(card);
        });
    }

    // Fetch users
    async function fetchUsers() {
        showSkeletons();
        updateStatus('info', 'Fetching users...', true);
        try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(USERS_API_URL, {
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            clearTimeout(tid);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (!json?.success) throw new Error(json?.message || 'Unsuccessful response');
            const users = json?.data?.users;
            if (!Array.isArray(users)) throw new Error('Bad data format');
            renderUsers(users);
            updateStatus('success', `${users.length} user${users.length !== 1 ? 's' : ''} loaded`);
        } catch (e) {
            console.error(e);
            const isTimeout = e.name === 'AbortError';
            updateStatus('error', 'Failed to load users');
            errorTextSpan.textContent   = 'Failed to load users';
            errorDetailSpan.textContent = isTimeout ? 'Request timed out' : (e.message || 'Network error');
            errorAlert.classList.remove('hidden');
            usersGrid.innerHTML = '';
        }
    }

    // XSS guard
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function init() {
        renderNavButtons();
        fetchUsers();
        refreshBtn.addEventListener('click', () => fetchUsers());
        if (emptyRetryBtn) emptyRetryBtn.addEventListener('click', () => fetchUsers());
        dismissErrorBtn.addEventListener('click', () => errorAlert.classList.add('hidden'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
