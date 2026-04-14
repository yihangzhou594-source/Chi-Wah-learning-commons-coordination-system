window.requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        console.warn('此浏览器不支持桌面通知');
        return false;
    }
    if (Notification.permission === 'granted') {
        return true;
    }
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    return false;
};

window.showLocalNotification = (title, options) => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        try {
            new Notification(title, options);
        } catch (e) {
            console.warn('通知显示失败:', e);
        }
    }
};