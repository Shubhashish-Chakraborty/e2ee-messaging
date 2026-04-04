// login.js — handles login form logic

(function () {
    // Redirect if already logged in
    if (Auth.isLoggedIn()) {
        window.location.href = '/';
        return;
    }

    const form       = document.getElementById('login-form');
    const submitBtn  = document.getElementById('submit-btn');
    const errorBox   = document.getElementById('form-error');
    const successBox = document.getElementById('form-success');

    function setError(msg) {
        errorBox.textContent = msg;
        errorBox.classList.remove('hidden');
        successBox.classList.add('hidden');
    }

    function setSuccess(msg) {
        successBox.textContent = msg;
        successBox.classList.remove('hidden');
        errorBox.classList.add('hidden');
    }

    function clearMessages() {
        errorBox.classList.add('hidden');
        successBox.classList.add('hidden');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();

        const username = form.username.value.trim();
        const password = form.password.value;

        if (!username || !password) {
            setError('Username and password are required.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const json = await res.json();

            if (!res.ok || !json.success) {
                throw new Error(json.error || json.message || 'Login failed');
            }

            Auth.saveSession(json.data.token, json.data.user);
            setSuccess(`Welcome back, ${json.data.user.username}! Redirecting, please wait...`);
            setTimeout(() => { window.location.href = '/'; }, 1200);
        } catch (err) {
            setError(err.message || 'Invalid credentials');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        }
    });
})();
