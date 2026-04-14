const { useState, useEffect } = React;

const TIME_SLOTS = [];
for (let i = 8; i < 24; i++) {
    const start = i.toString().padStart(2, '0') + ':00';
    const end = (i + 1).toString().padStart(2, '0') + ':00';
    TIME_SLOTS.push(`${start}-${end}`);
}

const ROOM_OPTIONS = Array.from({ length: 19 }, (_, i) => (i + 1).toString());

function ProfileApp() {
    const [user, setUser] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [activeTab, setActiveTab] = useState('records'); // records, notifications, settings
    
    // Data for tabs
    const [myBookings, setMyBookings] = useState([]);
    const [mySwaps, setMySwaps] = useState([]);
    const [myCheckins, setMyCheckins] = useState([]);

    // Preferences
    const [timePref, setTimePref] = useState('any');
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isPasswordFree, setIsPasswordFree] = useState(true);
    const [isSchedulePublic, setIsSchedulePublic] = useState(true);
    const [defaultPresence, setDefaultPresence] = useState({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true });
    
    // Notifications Preferences
    const [notifAlloc, setNotifAlloc] = useState(true);
    const [notifSwap, setNotifSwap] = useState(true);
    const [notifSwipe, setNotifSwipe] = useState(true);
    const [notifCalendar, setNotifCalendar] = useState(false);
    
    const [savingPref, setSavingPref] = useState(false);

    // Status states
    const [statusDate, setStatusDate] = useState(() => window.timeUtils.getHKTDateString(1));
    const [userStatus, setUserStatus] = useState('present');

    // Edit Modal State
    const [editingItem, setEditingItem] = useState(null);
    const [editForm, setEditForm] = useState({ roomNumber: '', timeSlot: '', note: '' });
    
    const [rejectingId, setRejectingId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        const currentUser = window.auth.requireAuth();
        if (currentUser) {
            setUser(currentUser);
            setIsAdmin(currentUser.role === 'admin');
            setTimePref(currentUser.timePreference || 'any');
            setIsPasswordFree(currentUser.isPasswordFree !== false);
            setIsSchedulePublic(currentUser.isSchedulePublic !== false);
            if (currentUser.defaultPresence) {
                try {
                    setDefaultPresence(JSON.parse(currentUser.defaultPresence));
                } catch(e) {}
            }
            if (currentUser.notificationPrefs) {
                try {
                    const prefs = JSON.parse(currentUser.notificationPrefs);
                    setNotifAlloc(prefs.alloc !== false);
                    setNotifSwap(prefs.swap !== false);
                    setNotifSwipe(prefs.swipe !== false);
                    setNotifCalendar(prefs.calendar === true);
                } catch(e) {}
            }
            
            // Sync with fresh DB data to ensure studentId and other fields are up to date
            window.db.getAllUsers().then(users => {
                const freshUser = users.find(u => u.id === currentUser.id);
                if (freshUser && freshUser.studentId !== currentUser.studentId) {
                    setUser(freshUser);
                    window.auth.login(freshUser); // Update local storage session
                }
            }).catch(e => console.warn('Failed to sync fresh user data', e));
            
            fetchUserData(currentUser.id);
        }
    }, []);

    const fetchUserData = async (userId) => {
        try {
            // Bookings
            const bookingsRes = await window.db.getBookings(1000);
            const userBookings = bookingsRes.items
                .map(item => ({ ...item.objectData, id: item.objectId }))
                .filter(b => b.userId === userId);
            
            const groupedUserBookings = window.db.groupBookings(userBookings)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            setMyBookings(groupedUserBookings);

            // Swaps
            const swapsRes = await window.db.getSwapRequests(100);
            const userSwaps = swapsRes.items
                .map(item => ({ ...item.objectData, id: item.objectId }))
                .filter(s => s.requesterId === userId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setMySwaps(userSwaps);

            const checkinsRes = await window.db.getUserCheckIns(userId);
            setMyCheckins(checkinsRes);

        } catch (e) {
            console.warn("Failed to fetch user data", e);
        } finally {
            setInitialLoading(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        const fetchStatus = async () => {
            try {
                const statuses = await window.db.getUserStatuses(statusDate);
                const myStatus = statuses.find(s => s.userId === user.id);
                setUserStatus(myStatus ? myStatus.status : 'present');
            } catch (error) {
                console.warn("Failed to fetch status:", error);
            }
        };
        fetchStatus();
    }, [user, statusDate]);

    const handleStatusChange = async (newStatus) => {
        setUserStatus(newStatus);
        try {
            await window.db.setUserStatus(user.id, statusDate, newStatus);
        } catch (e) {
            console.warn("Failed to update status", e);
        }
    };

    const handleSavePref = async () => {
        if (user.password && (oldPassword || newPassword)) {
            const oldHash = await window.cryptoUtils.hashPassword(oldPassword);
            if (oldHash !== user.password && oldPassword !== user.password) {
                alert('原密码错误，无法修改密码');
                return;
            }
        }

        let finalPassword = user.password || '';
        if (oldPassword || newPassword) {
            finalPassword = newPassword ? await window.cryptoUtils.hashPassword(newPassword) : '';
        }

        if (!isPasswordFree && !finalPassword) {
            alert('关闭免密登录时，必须设置登录密码');
            return;
        }

        setSavingPref(true);
        try {
            const updates = { 
                timePreference: timePref,
                password: finalPassword,
                isPasswordFree: isPasswordFree,
                isSchedulePublic: isSchedulePublic,
                defaultPresence: JSON.stringify(defaultPresence),
                notificationPrefs: JSON.stringify({ alloc: notifAlloc, swap: notifSwap, swipe: notifSwipe, calendar: notifCalendar })
            };
            await window.db.updateUser(user.id, updates);
            // update session
            const updatedUser = { ...user, ...updates };
            window.auth.login(updatedUser);
            setUser(updatedUser);
            setOldPassword('');
            setNewPassword('');
            alert('设置已保存');
        } catch (error) {
            alert('保存失败');
        } finally {
            setSavingPref(false);
        }
    };

    const mergedRecords = React.useMemo(() => {
        const arr = [];
        myBookings.forEach(b => {
            const time = b.timeSlot ? b.timeSlot.split('-')[0] : '00:00';
            const sortTime = new Date(`${b.date}T${time}:00`).getTime();
            arr.push({ ...b, recordType: 'booking', sortTime: isNaN(sortTime) ? 0 : sortTime });
        });
        mySwaps.forEach(s => {
            const sortTime = new Date(s.createdAt).getTime();
            arr.push({ ...s, recordType: 'swap', sortTime: isNaN(sortTime) ? 0 : sortTime });
        });
        myCheckins.forEach(c => {
            let timeStr = c.checkInTime || '00:00:00';
            if (timeStr.length === 5) timeStr += ':00';
            const sortTime = new Date(`${c.date}T${timeStr}`).getTime();
            arr.push({ ...c, recordType: 'checkin', sortTime: isNaN(sortTime) ? 0 : sortTime });
        });
        return arr.sort((a, b) => b.sortTime - a.sortTime);
    }, [myBookings, mySwaps, myCheckins]);

    const handleRejectAllocation = async (booking) => {
        if (!confirm(`确定拒绝该系统分配 ${booking.date} ${booking.timeSlot} (RM ${booking.roomNumber}) 吗？系统将自动转派给其他干员。`)) return;
        setRejectingId(booking.id);
        try {
            await window.db.rejectAndReallocate(booking);
            fetchUserData(user.id);
        } catch(e) {
            alert('操作失败');
        } finally {
            setRejectingId(null);
        }
    };

    const handleDeleteBooking = async (id) => {
        if (!confirm('确定要撤销这条填报记录吗？')) return;
        try {
            await window.db.deleteBooking(id);
            fetchUserData(user.id);
        } catch (error) {
            alert('撤销失败');
        }
    };

    const openEdit = (item) => {
        setEditingItem(item);
        setEditForm({ roomNumber: item.roomNumber, timeSlot: item.timeSlot, note: item.note || '' });
    };

    const handleUpdateBooking = async () => {
        if (!editForm.timeSlot || !editForm.roomNumber) {
            alert('请填写完整信息');
            return;
        }
        setLoading(true);
        try {
            const allB = await window.db.getBookings(2000);
            const allItems = allB.items.map(i => ({ ...i.objectData, id: i.objectId }));
            
            const dups = allItems.filter(b => 
                b.userId === user.id && 
                b.date === editingItem.date && 
                b.status === 'active' && 
                window.timeUtils.checkTimeOverlap(b.timeSlot, editForm.timeSlot) && 
                b.type === 'self-report' && 
                b.id !== editingItem.id
            );
            
            if (dups.length > 0) {
                if (editForm.timeSlot !== editingItem.timeSlot) {
                    if (!confirm(`修改后的时间段与您的已有记录冲突。是否确认覆盖冲突的记录并继续保存？`)) {
                        setLoading(false);
                        return;
                    }
                }
                for (const d of dups) {
                    await window.db.deleteBooking(d.id);
                }
            }

            await window.db.deleteBooking(editingItem.id);
            await window.db.createBooking({
                userId: user.id,
                userName: user.username,
                date: editingItem.date,
                timeSlot: editForm.timeSlot,
                roomNumber: editForm.roomNumber,
                status: 'active',
                type: 'self-report',
                note: editForm.note
            });
            
            setEditingItem(null);
            fetchUserData(user.id);
        } catch (error) {
            alert('修改失败');
        } finally {
            setLoading(false);
        }
    };

    if(!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <window.Header />
            
            {initialLoading ? <window.LoadingSkeleton /> : (
            <>
            {/* Edit Modal */}
            {editingItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                            <div className="icon-pencil mr-2 text-blue-600"></div>
                            修改填报记录 <span className="text-gray-400 text-sm ml-2 font-normal">({editingItem.date})</span>
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">房间号</label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white transition-all"
                                    value={editForm.roomNumber}
                                    onChange={(e) => setEditForm({...editForm, roomNumber: e.target.value})}
                                >
                                    {ROOM_OPTIONS.map(room => (
                                        <option key={room} value={room}>RM {room}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">时间段</label>
                                <input 
                                    type="text"
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white transition-all"
                                    value={editForm.timeSlot}
                                    onChange={(e) => setEditForm({...editForm, timeSlot: e.target.value})}
                                    placeholder="例如: 12:00-14:00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">备注</label>
                                <select 
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white transition-all"
                                    value={editForm.note}
                                    onChange={(e) => setEditForm({...editForm, note: e.target.value})}
                                >
                                    <option value="">无特殊情况</option>
                                    <option value="留卡">留卡</option>
                                    <option value="拍码">拍码</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-8 flex justify-end space-x-3">
                            <button 
                                onClick={() => setEditingItem(null)}
                                className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleUpdateBooking}
                                disabled={loading}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 flex items-center shadow-md transition-all hover:-translate-y-0.5"
                            >
                                {loading && <div className="icon-loader animate-spin mr-2"></div>}
                                保存修改
                            </button>
                        </div>
                    </div>
                </div>
            )}

             <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 animate-fade-in">
                 <div className="flex items-center justify-between mb-8">
                     <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">个人中心</h1>
                 </div>
                 
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                     {/* User Info Card */}
                     <div className="lg:col-span-2 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-6 md:p-8 rounded-3xl shadow-lg relative overflow-hidden text-white">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-40 h-40 bg-white opacity-5 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>
                        
                        <div className="relative z-10 flex items-center space-x-6">
                            <div className="h-20 w-20 md:h-24 md:w-24 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 shadow-inner flex items-center justify-center text-white font-bold text-4xl shrink-0">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-2xl md:text-3xl font-bold flex items-center flex-wrap gap-3 mb-1">
                                    <span className="truncate">{user.username}</span>
                                    {isAdmin && (
                                        <a href="admin.html" className="px-2.5 py-0.5 text-xs bg-purple-500/30 text-purple-100 hover:text-white hover:bg-purple-500/60 rounded-full border border-purple-400/50 whitespace-nowrap backdrop-blur-sm font-medium transition-colors cursor-pointer flex items-center shadow-sm">
                                            <div className="icon-shield w-3 h-3 mr-1"></div>高级管理后台
                                            <div className="icon-arrow-right w-3 h-3 ml-1"></div>
                                        </a>
                                    )}
                                </h2>
                                <div className="flex items-center text-blue-100 text-sm font-medium flex-wrap gap-2">
                                    <span className="bg-black/20 px-2 py-0.5 rounded-md font-mono">#{user.studentId || '未知'}</span>
                                    <span className="opacity-50 hidden sm:inline">•</span>
                                    <span className="flex items-center"><div className="icon-calendar-check w-4 h-4 mr-1"></div> {myBookings.length} 次填报</span>
                                </div>
                                
                                <button onClick={() => { localStorage.setItem('TUTORIAL_MODE', 'true'); window.location.href = 'dashboard.html'; }} className="mt-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold backdrop-blur-sm transition-all flex items-center shadow-sm border border-white/30 w-fit text-white">
                                    <div className="icon-gamepad-2 mr-1.5"></div>
                                    进入沙盒演示教程
                                </button>
                            </div>
                        </div>
                     </div>

                     {/* Status Card */}
                     <div data-tutorial="profile-status" className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <div className="icon-calendar-clock text-6xl text-blue-600"></div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 flex items-center mb-1 relative z-10">
                            排班状态
                        </h3>
                        <p className="text-xs text-gray-500 mb-4 relative z-10">设置单日系统分配意愿</p>
                        
                        <div className="relative z-10 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">选择日期</span>
                                <input 
                                    type="date" 
                                    value={statusDate}
                                    onChange={(e) => setStatusDate(e.target.value)}
                                    className="px-2 py-1 text-xs font-medium border border-gray-200 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 outline-none shadow-sm"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleStatusChange('present')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all flex justify-center items-center ${userStatus === 'present' ? 'bg-green-500 text-white shadow-md' : 'text-gray-600 hover:bg-white bg-gray-100 border border-gray-200 hover:border-green-300 hover:text-green-600'}`}
                                >
                                    <div className="icon-circle-check w-4 h-4 mr-1.5"></div>
                                    需分配
                                </button>
                                <button 
                                    onClick={() => handleStatusChange('absent')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all flex justify-center items-center ${userStatus === 'absent' ? 'bg-red-500 text-white shadow-md' : 'text-gray-600 hover:bg-white bg-gray-100 border border-gray-200 hover:border-red-300 hover:text-red-600'}`}
                                >
                                    <div className="icon-circle-x w-4 h-4 mr-1.5"></div>
                                    不分配
                                </button>
                            </div>
                        </div>
                     </div>
                 </div>

                 {/* Tab Navigation */}
                 <div className="bg-gray-100/80 p-1.5 rounded-2xl flex overflow-x-auto whitespace-nowrap scrollbar-hide mb-6 shadow-inner w-full md:w-fit">
                     <button
                        onClick={() => setActiveTab('records')}
                        className={`py-2 px-6 text-sm font-bold rounded-xl transition-all flex items-center ${activeTab === 'records' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                     >
                         <div className="icon-list mr-2"></div>全部记录
                     </button>
                     <button
                        data-tutorial="tab-notifications"
                        onClick={() => setActiveTab('notifications')}
                        className={`py-2 px-6 text-sm font-bold rounded-xl transition-all flex items-center ${activeTab === 'notifications' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                     >
                         <div className="icon-bell-ring mr-2"></div>消息与提醒
                     </button>
                     <button
                        data-tutorial="tab-settings"
                        onClick={() => setActiveTab('settings')}
                        className={`py-2 px-6 text-sm font-bold rounded-xl transition-all flex items-center ${activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                     >
                         <div className="icon-settings mr-2"></div>偏好设置
                     </button>
                 </div>

                 {/* Tab Content */}
                 <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-[400px] mb-8 relative">
                     {activeTab === 'records' && (
                         <div className="flex flex-col h-full max-h-[800px]">
                             <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <h3 className="font-bold text-gray-800 text-lg">我的活动记录</h3>
                                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">共 {mergedRecords.length} 条</span>
                             </div>
                             <div className="overflow-y-auto p-4 md:p-6 space-y-4">
                                {mergedRecords.length === 0 ? (
                                    <div className="py-16 text-center">
                                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-50 mb-4">
                                            <div className="icon-inbox text-gray-300 text-3xl"></div>
                                        </div>
                                        <p className="text-gray-500 font-medium">暂无任何记录</p>
                                    </div>
                                ) : mergedRecords.map((record, index) => {
                                    if (record.recordType === 'booking') {
                                        const b = record;
                                        const todayStr = window.timeUtils.getHKTDateString(0);
                                        const isPast = b.date < todayStr;
                                        return (
                                            <div key={`b_${b.id}_${index}`} className={`p-4 rounded-2xl border ${isPast ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-white border-gray-200'} shadow-sm hover:shadow-md transition-all group`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center">
                                                        <div className={`p-2.5 rounded-xl mr-4 border ${b.type === 'allocated' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                            <div className={`text-xl ${b.type === 'allocated' ? 'icon-wand-sparkles' : 'icon-calendar-check'}`}></div>
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-900 text-lg">{b.date} <span className="text-gray-500 font-mono ml-2 text-base">{b.timeSlot}</span></div>
                                                            <div className="text-xs font-bold mt-1 inline-flex items-center px-2 py-0.5 rounded-md border bg-white">
                                                                {b.type === 'allocated' ? '系统派发' : '实抢记录'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="bg-gray-100 text-gray-800 font-bold px-3 py-1.5 rounded-lg text-sm border border-gray-200">RM {b.roomNumber}</span>
                                                </div>
                                                <div className="flex justify-end border-t border-gray-100 pt-3 mt-2">
                                                    {b.type === 'self-report' ? (
                                                        <div className="flex space-x-2">
                                                            <button onClick={() => openEdit(b)} className="text-blue-600 bg-blue-50 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-600 hover:text-white transition-colors shadow-sm">修改</button>
                                                            <button onClick={() => handleDeleteBooking(b.id)} className="text-red-600 bg-red-50 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-600 hover:text-white transition-colors shadow-sm">撤销</button>
                                                        </div>
                                                    ) : (
                                                        b.date >= window.timeUtils.getHKTDateString(2) ? (
                                                            <button onClick={() => handleRejectAllocation(b)} disabled={rejectingId === b.id} className="text-orange-600 bg-orange-50 px-4 py-2 rounded-xl text-xs font-bold hover:bg-orange-600 hover:text-white transition-colors disabled:opacity-50 shadow-sm flex items-center">
                                                                {rejectingId === b.id ? <><div className="icon-loader animate-spin mr-1"></div>处理中...</> : '拒绝该分配'}
                                                            </button>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg font-bold border border-gray-200">已锁定 (不可拒)</span>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }
                                    if (record.recordType === 'swap') {
                                        const s = record;
                                        return (
                                            <div key={`s_${s.id}_${index}`} className="p-4 rounded-2xl border bg-white border-gray-200 shadow-sm hover:shadow-md transition-all">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center">
                                                        <div className="p-2.5 rounded-xl mr-4 bg-orange-50 text-orange-600 border border-orange-100">
                                                            <div className="icon-arrow-left-right text-xl"></div>
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-900 text-lg mb-1">发起交换请求</div>
                                                            <div className="text-xs font-medium text-gray-500 flex items-center bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100 w-fit">
                                                                <div className="icon-clock w-3.5 h-3.5 mr-1"></div> {window.timeUtils.formatToHKT(s.createdAt, false)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className={`px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center shadow-sm ${s.status === 'accepted' ? 'bg-green-50 text-green-700 border-green-200' : s.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                                        {s.status === 'accepted' ? <div className="icon-check mr-1"></div> : s.status === 'rejected' ? <div className="icon-x mr-1"></div> : <div className="icon-clock mr-1"></div>}
                                                        {s.status === 'accepted' ? '已成功' : s.status === 'rejected' ? '被拒绝' : '待处理'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    if (record.recordType === 'checkin') {
                                        const c = record;
                                        return (
                                            <div key={`c_${c.id}_${index}`} className="p-4 rounded-2xl border bg-white border-gray-200 shadow-sm hover:shadow-md transition-all">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center">
                                                        <div className="p-2.5 rounded-xl mr-4 bg-teal-50 text-teal-600 border border-teal-100">
                                                            <div className="icon-fingerprint text-xl"></div>
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-900 text-lg mb-1">每日签到</div>
                                                            <div className="text-xs font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100 w-fit">{c.date} <span className="font-mono ml-1">{c.checkInTime}</span></div>
                                                        </div>
                                                    </div>
                                                    <span className="px-3 py-1.5 text-xs font-bold rounded-lg border bg-teal-50 text-teal-700 border-teal-200 flex items-center shadow-sm">
                                                        <div className="icon-check-check w-4 h-4 mr-1"></div>已打卡
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }
                                })}
                             </div>
                         </div>
                     )}

                     {activeTab === 'notifications' && (
                         <div className="p-6 md:p-8 max-w-2xl">
                             <div className="space-y-8" data-tutorial="profile-notifications">
                                 {/* PWA & Notifications Section */}
                                 <div className="bg-gray-50/50 p-5 md:p-6 rounded-2xl border border-gray-100">
                                     <h4 className="text-sm font-extrabold text-gray-800 mb-6 uppercase tracking-wider flex items-center">
                                         <div className="icon-bell-ring mr-2 text-blue-500"></div>
                                         系统通知与 PWA 桌面应用
                                     </h4>
                                     <div className="space-y-6">
                                         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200/50 pb-5">
                                             <div>
                                                 <div className="font-bold text-gray-800 text-sm">浏览器消息通知总开关</div>
                                                 <div className="text-xs text-gray-500 mt-1">需开启此系统权限，下方的各项分类通知才能正常弹窗。</div>
                                             </div>
                                             <button onClick={async () => {
                                                 const granted = await window.requestNotificationPermission();
                                                 if (granted) {
                                                     alert('通知权限已开启！');
                                                     if (window.showLocalNotification) {
                                                         window.showLocalNotification('通知测试', { body: '您已成功开启浏览器通知！' });
                                                     }
                                                 } else {
                                                     alert('通知权限被拒绝或无法开启，请在浏览器设置中检查。');
                                                 }
                                             }} className="shrink-0 px-4 py-2.5 bg-blue-50 text-blue-600 font-bold rounded-xl text-sm hover:bg-blue-100 border border-blue-100 transition-colors shadow-sm">
                                                 {'Notification' in window && Notification.permission === 'granted' ? '总开关已开启' : '点击授权通知'}
                                             </button>
                                         </div>
                                         
                                         <div className="space-y-5">
                                             <div className="flex items-center justify-between">
                                                 <div>
                                                     <label className="text-sm font-bold text-gray-800">系统分配通知</label>
                                                     <p className="text-xs text-gray-500 mt-0.5">当系统自动为您分配房间时提醒</p>
                                                 </div>
                                                 <button 
                                                     onClick={() => setNotifAlloc(!notifAlloc)}
                                                     className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${notifAlloc ? 'bg-blue-600' : 'bg-gray-300'}`}
                                                 >
                                                     <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${notifAlloc ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                                 </button>
                                             </div>
                                             <div className="flex items-center justify-between">
                                                 <div>
                                                     <label className="text-sm font-bold text-gray-800">交换请求与结果通知</label>
                                                     <p className="text-xs text-gray-500 mt-0.5">当收到他人的交换请求或您的请求被处理时提醒</p>
                                                 </div>
                                                 <button 
                                                     onClick={() => setNotifSwap(!notifSwap)}
                                                     className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${notifSwap ? 'bg-blue-600' : 'bg-gray-300'}`}
                                                 >
                                                     <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${notifSwap ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                                 </button>
                                             </div>
                                             <div className="flex items-center justify-between">
                                                 <div>
                                                     <label className="text-sm font-bold text-gray-800">刷卡提醒通知</label>
                                                     <p className="text-xs text-gray-500 mt-0.5">在您预约时段开始时提醒您刷卡（连续时段仅首小时提醒）</p>
                                                 </div>
                                                 <button 
                                                     onClick={() => setNotifSwipe(!notifSwipe)}
                                                     className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${notifSwipe ? 'bg-blue-600' : 'bg-gray-300'}`}
                                                 >
                                                     <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${notifSwipe ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                                 </button>
                                             </div>
                                         </div>

                                         <div className="flex items-center justify-between mt-5 pt-5 border-t border-gray-200/50">
                                             <div>
                                                 <label className="text-sm font-bold text-gray-800">日历自动导出</label>
                                                 <p className="text-xs text-gray-500 mt-0.5">填报成功或确认分配后，自动生成并下载日程 (.ics) 文件</p>
                                             </div>
                                             <button 
                                                 onClick={() => setNotifCalendar(!notifCalendar)}
                                                 className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${notifCalendar ? 'bg-blue-600' : 'bg-gray-300'}`}
                                             >
                                                 <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${notifCalendar ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                             </button>
                                         </div>
                                     </div>
                                 </div>
                                 
                                 <button 
                                    onClick={handleSavePref}
                                    disabled={savingPref}
                                    className="w-full md:w-auto px-8 py-3.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-black shadow-lg transition-all disabled:opacity-50 flex items-center justify-center"
                                 >
                                     {savingPref ? <><div className="icon-loader animate-spin mr-2"></div>保存中...</> : '保存消息设置'}
                                 </button>
                             </div>
                         </div>
                     )}

                     {activeTab === 'settings' && (
                         <div className="p-6 md:p-8 max-w-2xl">
                             <div className="space-y-8">
                                 <div data-tutorial="profile-preferences" className="space-y-8">
                                 {/* AI Preference Section */}
                                 <div className="bg-gray-50/50 p-5 md:p-6 rounded-2xl border border-gray-100">
                                    <h4 className="text-sm font-extrabold text-gray-800 mb-5 uppercase tracking-wider flex items-center">
                                        <div className="icon-wand-sparkles mr-2 text-purple-500"></div>
                                        系统排班偏好
                                    </h4>
                                     <div className="mb-5">
                                         <label className="block text-sm font-bold text-gray-800 mb-2">时间偏好</label>
                                         <select 
                                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm bg-white text-sm"
                                            value={timePref}
                                            onChange={(e) => setTimePref(e.target.value)}
                                         >
                                             <option value="any">皆可 (默认，由系统随机安排)</option>
                                             <option value="early">偏早 (倾向于安排在 12:00-18:00)</option>
                                             <option value="late">偏晚 (倾向于安排在 18:00-24:00)</option>
                                         </select>
                                         <p className="mt-3 text-xs text-gray-500 bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                            💡 AI 将根据您的偏好以及您的历史交换记录综合为您排班。
                                         </p>
                                     </div>

                                     <div className="flex items-center justify-between py-3 border-t border-gray-200/50 mt-4">
                                         <div>
                                             <label className="text-sm font-bold text-gray-800">公开我的全部课表</label>
                                             <p className="text-[11px] text-gray-500 mt-0.5">允许其他人在公共课表中心看到您的时间安排</p>
                                         </div>
                                         <button 
                                             onClick={() => setIsSchedulePublic(!isSchedulePublic)}
                                             className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${isSchedulePublic ? 'bg-blue-600' : 'bg-gray-300'}`}
                                         >
                                             <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isSchedulePublic ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                         </button>
                                     </div>
                                 </div>

                                 {/* Default Presence Section */}
                                 <div className="bg-gray-50/50 p-5 md:p-6 rounded-2xl border border-gray-100">
                                    <h4 className="text-sm font-extrabold text-gray-800 mb-4 uppercase tracking-wider flex items-center">
                                        <div className="icon-calendar-days mr-2 text-green-500"></div>
                                        默认出勤设置 (按星期)
                                    </h4>
                                    <p className="text-xs text-gray-500 mb-5 leading-relaxed">开启表示您默认希望在这一天被分配房间。您也可以随时在上方修改具体某一天的状态。</p>
                                    <div className="flex flex-wrap gap-2 md:gap-3">
                                        {[
                                            { id: 1, name: '一' }, { id: 2, name: '二' }, { id: 3, name: '三' },
                                            { id: 4, name: '四' }, { id: 5, name: '五' }, { id: 6, name: '六' }, { id: 7, name: '日' }
                                        ].map(day => (
                                            <button
                                                key={day.id}
                                                onClick={() => setDefaultPresence(prev => ({...prev, [day.id]: !prev[day.id]}))}
                                                className={`h-12 w-12 rounded-2xl text-sm font-bold transition-all shadow-sm ${defaultPresence[day.id] ? 'bg-green-500 text-white shadow-md transform -translate-y-0.5' : 'bg-white text-gray-400 border border-gray-200 hover:border-green-300 hover:text-green-500'}`}
                                            >
                                                {day.name}
                                            </button>
                                        ))}
                                     </div>
                                 </div>
                                 </div>

                                 {/* Security Section */}
                                 <div data-tutorial="profile-security" className="bg-gray-50/50 p-5 md:p-6 rounded-2xl border border-gray-100">
                                     <h4 className="text-sm font-extrabold text-gray-800 mb-5 uppercase tracking-wider flex items-center">
                                        <div className="icon-shield-check mr-2 text-orange-500"></div>
                                        账号安全
                                     </h4>
                                     <div className="space-y-5">
                                        {user.password ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-800 mb-2">原密码</label>
                                                    <div className="relative">
                                                        <input 
                                                            type={showOldPassword ? "text" : "password"} 
                                                            className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm bg-white"
                                                            placeholder="输入原密码以验证"
                                                            value={oldPassword}
                                                            onChange={(e) => setOldPassword(e.target.value)}
                                                        />
                                                        <button type="button" onClick={() => setShowOldPassword(!showOldPassword)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                                                            <div className={`icon-eye${showOldPassword ? '-off' : ''} text-lg`}></div>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-800 mb-2">新密码 (留空则清除)</label>
                                                    <div className="relative">
                                                        <input 
                                                            type={showNewPassword ? "text" : "password"} 
                                                            className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm bg-white"
                                                            placeholder="输入新密码"
                                                            value={newPassword}
                                                            onChange={(e) => setNewPassword(e.target.value)}
                                                        />
                                                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                                                            <div className={`icon-eye${showNewPassword ? '-off' : ''} text-lg`}></div>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-xs font-bold text-gray-800 mb-2">设置登录密码 (选填)</label>
                                                <div className="relative">
                                                    <input 
                                                        type={showNewPassword ? "text" : "password"} 
                                                        className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm bg-white"
                                                        placeholder="输入新密码"
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                    />
                                                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                                                        <div className={`icon-eye${showNewPassword ? '-off' : ''} text-lg`}></div>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                         <div className="flex items-center justify-between pt-4 border-t border-gray-200/50 mt-5">
                                             <div>
                                                 <label className="text-sm font-bold text-gray-800">开启免密登录</label>
                                                 <p className="text-[11px] text-gray-500 mt-0.5">允许不输入密码直接进入系统</p>
                                             </div>
                                             <button 
                                                 onClick={() => setIsPasswordFree(!isPasswordFree)}
                                                 className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${isPasswordFree ? 'bg-blue-600' : 'bg-gray-300'}`}
                                             >
                                                 <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isPasswordFree ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                             </button>
                                         </div>
                                     </div>
                                 </div>

                                 <button 
                                    onClick={handleSavePref}
                                    disabled={savingPref}
                                    className="w-full md:w-auto px-8 py-3.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-black shadow-lg transition-all disabled:opacity-50 flex items-center justify-center"
                                 >
                                     {savingPref ? <><div className="icon-loader animate-spin mr-2"></div>保存中...</> : '保存偏好设置'}
                                 </button>
                             </div>
                         </div>
                     )}
                 </div>

            </main>
            </>
            )}
        </div>
    );
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ProfileApp />);