const { useState, useEffect, useMemo } = React;

function NotificationsApp() {
    const [user, setUser] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'unread'

    useEffect(() => {
        const currentUser = window.auth.requireAuth();
        if (currentUser) {
            setUser(currentUser);
            fetchNotifications(currentUser.id);
        }
    }, []);

    const fetchNotifications = async (userId) => {
        setLoading(true);
        try {
            const result = await window.db.getNotifications(100);
            const userNotifs = result.items
                .map(item => ({ ...item.objectData, id: item.objectId }))
                .filter(n => n.userId === userId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setNotifications(userNotifs);
        } catch (error) {
            console.warn(error);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (notif) => {
        if (notif.isRead) return;
        try {
            // Optimistic update
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
            await window.db.updateNotification(notif.id, { isRead: true });
        } catch (error) {
            console.warn("Failed to mark read", error);
            // Revert on error
            fetchNotifications(user.id);
        }
    };

    const markAllAsRead = async () => {
        try {
            const unread = notifications.filter(n => !n.isRead);
            if (unread.length === 0) return;
            
            // Optimistic update
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            await Promise.all(unread.map(n => window.db.updateNotification(n.id, { isRead: true })));
        } catch (error) {
            console.warn("Failed to mark all read", error);
            fetchNotifications(user.id);
        }
    };

    const getIconForType = (type) => {
        switch(type) {
            case 'swap_request': return { icon: 'icon-arrow-left-right', color: 'text-blue-600', bg: 'bg-blue-100' };
            case 'swap_accepted': return { icon: 'icon-check', color: 'text-green-600', bg: 'bg-green-100' };
            case 'swap_rejected': return { icon: 'icon-x', color: 'text-red-600', bg: 'bg-red-100' };
            case 'allocation': return { icon: 'icon-wand-sparkles', color: 'text-purple-600', bg: 'bg-purple-100' };
            case 'allocation_cancelled': return { icon: 'icon-circle-x', color: 'text-orange-600', bg: 'bg-orange-100' };
            case 'booking_cancelled': return { icon: 'icon-circle-x', color: 'text-orange-600', bg: 'bg-orange-100' };
            case 'swipe_reminder': return { icon: 'icon-credit-card', color: 'text-teal-600', bg: 'bg-teal-100' };
            default: return { icon: 'icon-bell', color: 'text-gray-500', bg: 'bg-gray-100' };
        }
    };

    const filteredNotifications = useMemo(() => {
        if (filter === 'unread') return notifications.filter(n => !n.isRead);
        return notifications;
    }, [notifications, filter]);

    if (!user) return null;

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <window.Header />
            {loading && notifications.length === 0 ? <window.LoadingSkeleton /> : (
             <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 animate-fade-in">
                 
                 {/* Header Section */}
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                            <div className="icon-inbox text-blue-600 mr-3 text-3xl"></div>
                            消息中心
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">查看和处理您的系统通知与提醒</p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        <div className="bg-gray-200/50 p-1 rounded-xl flex gap-1 w-full sm:w-auto">
                            <button 
                                onClick={() => setFilter('all')} 
                                className={`flex-1 sm:flex-none px-5 py-2 text-sm font-bold rounded-lg transition-all ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                            >
                                全部
                            </button>
                            <button 
                                onClick={() => setFilter('unread')} 
                                className={`flex-1 sm:flex-none px-5 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center ${filter === 'unread' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                            >
                                未读
                                {unreadCount > 0 && (
                                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${filter === 'unread' ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600'}`}>
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                        </div>
                        {unreadCount > 0 && (
                            <button 
                                onClick={markAllAsRead}
                                className="shrink-0 flex items-center px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors border border-blue-100 w-full sm:w-auto justify-center"
                            >
                                <div className="icon-check-check mr-2 text-lg"></div>
                                全部标为已读
                            </button>
                        )}
                    </div>
                 </div>
                 
                 {/* List Section */}
                 <div className="relative min-h-[400px]">
                    {filteredNotifications.length === 0 ? (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
                            <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                <div className="icon-bell-off text-gray-300 text-5xl"></div>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">
                                {filter === 'unread' ? '没有未读消息' : '收件箱为空'}
                            </h3>
                            <p className="text-gray-500 text-sm max-w-sm">
                                {filter === 'unread' ? '太棒了！您已处理完所有未读消息。' : '当系统为您分配座位或有其他人申请交换时，您将在这里收到通知。'}
                            </p>
                            {filter === 'unread' && notifications.length > 0 && (
                                <button 
                                    onClick={() => setFilter('all')}
                                    className="mt-6 px-6 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    查看全部消息
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3 md:space-y-4">
                            {filteredNotifications.map(notif => {
                                const { icon, color, bg } = getIconForType(notif.type);
                                return (
                                    <div 
                                        key={notif.id} 
                                        onClick={() => markAsRead(notif)}
                                        className={`group relative p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer overflow-hidden ${
                                            notif.isRead 
                                            ? 'bg-white border-gray-100 hover:border-gray-300 shadow-sm' 
                                            : 'bg-blue-50/30 border-blue-200 hover:border-blue-400 shadow-md transform hover:-translate-y-0.5'
                                        }`}
                                    >
                                        {!notif.isRead && (
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                                        )}
                                        
                                        <div className="flex items-start gap-4">
                                            <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center shadow-sm border border-white ${bg} ${color}`}>
                                                <div className={`${icon} text-xl`}></div>
                                            </div>
                                            
                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4 mb-2">
                                                    <p className={`text-sm md:text-base leading-relaxed break-words ${notif.isRead ? 'text-gray-600' : 'text-gray-900 font-bold'}`}>
                                                        {notif.content}
                                                    </p>
                                                    <span className="text-xs text-gray-400 whitespace-nowrap flex items-center shrink-0 font-medium">
                                                        <div className="icon-clock w-3.5 h-3.5 mr-1 opacity-70"></div>
                                                        {window.timeUtils.formatToHKT(notif.createdAt)}
                                                    </span>
                                                </div>
                                                
                                                {notif.type === 'swap_request' && !notif.isRead && (
                                                    <div className="mt-3">
                                                        <a 
                                                            href="swap.html" 
                                                            onClick={(e) => e.stopPropagation()} 
                                                            className="inline-flex items-center text-xs font-bold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                                        >
                                                            前往处理 <div className="icon-arrow-right ml-1 w-3.5 h-3.5"></div>
                                                        </a>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                 </div>
            </main>
            )}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<NotificationsApp />);