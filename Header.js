function Header() {
    const user = window.auth.getCurrentUser();
    const currentPath = window.location.pathname;
    const [unreadCount, setUnreadCount] = React.useState(0);
    const [notifiedIds, setNotifiedIds] = React.useState(new Set());
    const notifiedSwipeSlotsRef = React.useRef(new Set());

    React.useEffect(() => {
        if (user) {
            const fetchUnreadAndCheckSwipe = async () => {
                try {
                    const prefsStr = user.notificationPrefs;
                    const prefs = prefsStr ? JSON.parse(prefsStr) : { alloc: true, swap: true, swipe: true };

                    // 1. Fetch DB Notifications (Alloc & Swap)
                    const result = await window.db.getNotifications(100);
                    if (result && result.items) {
                        const unreadItems = result.items.filter(item => 
                            item.objectData.userId === user.id && !item.objectData.isRead
                        );
                        setUnreadCount(unreadItems.length);
                        
                        const newItems = unreadItems.filter(item => !notifiedIds.has(item.objectId));
                        
                        if (newItems.length > 0 && notifiedIds.size > 0) {
                            newItems.forEach(n => {
                                let shouldNotify = false;
                                const type = n.objectData.type;
                                
                                if (type === 'allocation' || type === 'allocation_cancelled') {
                                    shouldNotify = prefs.alloc !== false;
                                } else if (type.startsWith('swap_')) {
                                    shouldNotify = prefs.swap !== false;
                                } else {
                                    shouldNotify = true; // default true for others
                                }

                                if (shouldNotify && window.showLocalNotification) {
                                    window.showLocalNotification('智华协调平台 新消息', { 
                                        body: n.objectData.content,
                                        icon: 'https://resource.trickle.so/coding_trickle/trickle_avatar.png'
                                    });
                                }
                            });
                        }
                        
                        if (newItems.length > 0) {
                            setNotifiedIds(prev => {
                                const next = new Set(prev);
                                newItems.forEach(n => next.add(n.objectId));
                                return next;
                            });
                        }
                    }

                    // 2. Scheduled Swipe Check
                    if (prefs.swipe !== false) {
                        const now = window.timeUtils.getHKTNow();
                        const dateStr = window.timeUtils.getHKTDateString(0);
                        const currentHour = now.getHours();
                        const currentMin = now.getMinutes();

                        // Triggers within the first 15 minutes of the hour
                        if (currentMin >= 0 && currentMin <= 15) {
                            const bookingsRes = await window.db.getBookings(1000);
                            const myTodayBookings = bookingsRes.items
                                .map(i => i.objectData)
                                .filter(b => b.userId === user.id && b.date === dateStr && b.status === 'active');
                                
                            const grouped = window.db.groupBookings(myTodayBookings);
                            
                            grouped.forEach(b => {
                                const startStr = b.timeSlot.split('-')[0]; // "08:00"
                                const startHour = parseInt(startStr.split(':')[0], 10);
                                
                                if (currentHour === startHour) {
                                    // Make key unique by date, timeslot, and room
                                    const slotKey = `${dateStr}_${b.timeSlot}_${b.roomNumber}`;
                                    if (!notifiedSwipeSlotsRef.current.has(slotKey)) {
                                        notifiedSwipeSlotsRef.current.add(slotKey);
                                        
                                        // Check if DB notification already exists to avoid duplicates from multiple tabs
                                        window.db.getNotifications(50).then(res => {
                                            const exists = res.items.some(n => 
                                                n.objectData.userId === user.id && 
                                                n.objectData.type === 'swipe_reminder' && 
                                                n.objectData.content.includes(b.timeSlot) &&
                                                n.objectData.content.includes(dateStr)
                                            );
                                            if (!exists) {
                                                window.db.createNotification({
                                                    userId: user.id,
                                                    content: `刷卡提醒：您预约的 ${dateStr} RM ${b.roomNumber} (${b.timeSlot}) 已经开始，请及时前往现场刷卡！`,
                                                    isRead: false,
                                                    type: 'swipe_reminder',
                                                    createdAt: new Date().toISOString()
                                                }).catch(e => console.warn('Failed to create swipe notification', e));
                                            }
                                        });

                                        if (window.showLocalNotification) {
                                            window.showLocalNotification('刷卡提醒', {
                                                body: `您预约的房间 RM ${b.roomNumber} (${b.timeSlot}) 已经开始，请及时前往刷卡！`,
                                                icon: 'https://resource.trickle.so/coding_trickle/trickle_avatar.png'
                                            });
                                        }
                                    }
                                }
                            });
                        }
                    }

                } catch (e) {
                    // Silent fail
                }
            };
            
            fetchUnreadAndCheckSwipe();
            // Poll every 30 seconds
            const interval = setInterval(fetchUnreadAndCheckSwipe, 30000);
            return () => clearInterval(interval);
        }
    }, [user]);

    const isActive = (path) => currentPath.includes(path) ? "text-blue-600 bg-blue-50" : "text-gray-600 hover:text-blue-600 hover:bg-gray-50";

    const handleLogout = () => {
        window.auth.logout();
    };

    return (
        <header className="bg-white/85 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <div className="flex-shrink-0 flex items-center cursor-pointer" onClick={() => window.location.href = 'dashboard.html'}>
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-2">
                                <span className="text-white font-bold text-lg">C</span>
                            </div>
                            <span className="font-bold text-xl text-gray-900 hidden sm:block">智华自习室协调平台</span>
                            <span className="hidden sm:inline-flex ml-2 items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
                                V1.2
                            </span>
                        </div>
                        <nav className="hidden md:ml-6 md:flex md:space-x-4 h-full items-center">
                            <a href="dashboard.html" className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('dashboard.html')}`}>首页</a>
                            <a data-tutorial="nav-submit" href="submit.html" className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('submit.html')}`}>填报</a>
                            <a data-tutorial="nav-swap" href="swap.html" className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('swap.html')}`}>交换</a>
                            <a data-tutorial="nav-courses" href="courses.html" className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('courses.html')}`}>公共课表</a>
                            <a href="notifications.html" className={`px-3 py-2 rounded-md text-sm font-medium relative ${isActive('notifications.html')}`}>
                                消息
                                {unreadCount > 0 && (
                                    <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                                )}
                            </a>
                            <a data-tutorial="nav-profile" href="profile.html" className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('profile.html')}`}>个人中心</a>
                            <div className="h-4 w-px bg-gray-300 mx-2"></div>
                            <button onClick={() => {
                                localStorage.setItem('TUTORIAL_MODE', 'true');
                                localStorage.setItem('TUTORIAL_STEP', '1');
                                window.location.href = 'dashboard.html';
                            }} className="px-3 py-1.5 rounded-md text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 flex items-center">
                                <div className="icon-gamepad-2 mr-1"></div>沙盒演示
                            </button>
                        </nav>
                    </div>
                    <div className="flex items-center">
                         <div className="hidden md:flex items-center mr-4">
                            <span className="text-sm text-gray-700 mr-2">{user ? user.username : '访客'}</span>
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                {user ? user.username.charAt(0).toUpperCase() : '?'}
                            </div>
                        </div>
                        <button onClick={handleLogout} className="ml-2 p-2 rounded-full text-gray-400 hover:text-gray-600" title="退出登录">
                             <div className="icon-log-out text-xl"></div>
                        </button>
                    </div>
                </div>
            </div>
            {/* Mobile Navigation */}
            <div className="md:hidden w-full border-t border-gray-200 flex justify-around py-2 bg-white shadow-sm">
                <a href="dashboard.html" className={`flex flex-col items-center p-2 ${isActive('dashboard.html')}`}>
                    <div className="icon-layout-dashboard text-lg"></div>
                    <span className="text-[10px] mt-1">首页</span>
                </a>
                <a data-tutorial="nav-submit" href="submit.html" className={`flex flex-col items-center p-2 ${isActive('submit.html')}`}>
                    <div className="icon-circle-plus text-lg"></div>
                    <span className="text-[10px] mt-1">填报</span>
                </a>
                <a data-tutorial="nav-swap" href="swap.html" className={`flex flex-col items-center p-2 ${isActive('swap.html')}`}>
                    <div className="icon-arrow-left-right text-lg"></div>
                    <span className="text-[10px] mt-1">交换</span>
                </a>
                <a data-tutorial="nav-courses" href="courses.html" className={`flex flex-col items-center p-2 ${isActive('courses.html')}`}>
                    <div className="icon-calendar-range text-lg"></div>
                    <span className="text-[10px] mt-1">课表</span>
                </a>
                 <a href="notifications.html" className={`flex flex-col items-center p-2 relative ${isActive('notifications.html')}`}>
                    <div className="icon-bell text-lg"></div>
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-3 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
                    )}
                    <span className="text-[10px] mt-1">消息</span>
                </a>
                 <a data-tutorial="nav-profile" href="profile.html" className={`flex flex-col items-center p-2 ${isActive('profile.html')}`}>
                    <div className="icon-user text-lg"></div>
                    <span className="text-[10px] mt-1">我的</span>
                </a>
            </div>
            {window.TutorialOverlay && <window.TutorialOverlay />}
        </header>
    );
}

window.Header = Header;
