(function () {
    // Redirect if already logged in!!
    if (Auth.isLoggedIn()) {
        window.location.href = '/';
        return;
    }

    const form        = document.getElementById('signup-form');
    const submitBtn   = document.getElementById('submit-btn');
    const errorBox    = document.getElementById('form-error');
    const successBox  = document.getElementById('form-success');

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

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    async function generateKeyPair() {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true, // extractable
            ["encrypt", "decrypt"]
        );

        const publicKeyBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
        const privateKeyBuffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

        return {
            publicKey: arrayBufferToBase64(publicKeyBuffer),
            privateKey: arrayBufferToBase64(privateKeyBuffer)
        };
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessages();

        const username   = form.username.value.trim();
        const githubUrl  = form.githubUrl.value.trim();
        const password   = form.password.value;

        if (!username || !githubUrl || !password) {
            setError('All fields are required.');
            return;
        }
        if (!githubUrl.startsWith('https://github.com')) {
            setError('GitHub URL must start with https://github.com');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating Keys & Signing up...';

        try {
            // Automatically generate keys on signup
            const { publicKey, privateKey } = await generateKeyPair();

            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, githubUrl, password, public_key: publicKey }),
            });
            const json = await res.json();

            if (!res.ok || !json.success) {
                throw new Error(json.error || json.message || 'Signup failed');
            }

            // Save private key locally, scoped to the username
            localStorage.setItem(`e2ee_privateKey_${username}`, privateKey);

            setSuccess(`🎉 ${json.message || 'Account created!'} Redirecting to login...`);
            setTimeout(() => { window.location.href = '/login.html'; }, 1800);
        } catch (err) {
            setError(err.message || 'Something went wrong');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
        }
    });
})();
