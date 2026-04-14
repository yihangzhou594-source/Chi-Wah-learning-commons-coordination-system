// Simple session management using localStorage
const AUTH_KEY = 'chiwah_user_session';

const auth = {
    login: (user) => {
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    },
    
    logout: () => {
        localStorage.removeItem(AUTH_KEY);
        window.location.href = 'index.html';
    },
    
    getCurrentUser: () => {
        const userStr = localStorage.getItem(AUTH_KEY);
        return userStr ? JSON.parse(userStr) : null;
    },
    
    requireAuth: () => {
        const user = auth.getCurrentUser();
        if (!user || !user.id) {
            localStorage.removeItem(AUTH_KEY);
            window.location.href = 'index.html';
            return null;
        }
        return user;
    }
};

window.auth = auth;