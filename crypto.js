const cryptoUtils = {
    // Generate SHA-256 hash of the password
    hashPassword: async (password) => {
        if (!password) return '';
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },
    // Check if a string is a 64-character hex hash
    isHash: (str) => {
        return /^[a-f0-9]{64}$/i.test(str);
    }
};

window.cryptoUtils = cryptoUtils;