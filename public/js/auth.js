// shared auth utilities used across all pages
const Auth = {
    TOKEN_KEY: 'e2ee_token',
    USER_KEY:  'e2ee_user',

    saveSession(token, user) {
        localStorage.setItem(this.TOKEN_KEY, token);
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    },

    getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    },

    getUser() {
        try {
            return JSON.parse(localStorage.getItem(this.USER_KEY));
        } catch {
            return null;
        }
    },

    isLoggedIn() {
        return !!this.getToken() && !!this.getUser();
    },

    logout() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        window.location.href = '/';
    },
};
