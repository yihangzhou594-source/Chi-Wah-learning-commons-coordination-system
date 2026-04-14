const { useState, useEffect, useMemo, useRef } = React;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">PRTS 错误警告</h1>
            <p className="text-gray-600 mb-4">逻辑核心计算异常，请重试。</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              重启神经连接
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const getTargetAllocDate = (now) => {
    const hour = now.getHours();
    if (hour === 23) return window.timeUtils.getHKTDateString(2);
    if (hour === 0) return window.timeUtils.getHKTDateString(1);
    return window.timeUtils.getHKTDateString(1);
};

const generateTimeSlots = () => {
    const slots = [];
    for (let i = 8; i < 24; i++) {
        const start = i.toString().padStart(2, '0') + ':00';
        const end = (i + 1).toString().padStart(2, '0') + ':00';
        slots.push(`${start}-${end}`);
    }
    return slots;
};

const TIME_SLOTS = generateTimeSlots();

function DashboardApp() {
    const [user, setUser] = useState(null);
    const [currentTime, setCurrentTime] = useState(window.timeUtils.getHKTNow());
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Preferences state
    const [timePref, setTimePref] = useState('any');
    const [isSchedulePublic, setIsSchedulePublic] = useState(true);
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isPasswordFree, setIsPasswordFree] = useState(true);
    const [defaultPresence, setDefaultPresence] = useState({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true });
    const [savingPref, setSavingPref] = useState(false);
    const [showPrefConfig, setShowPrefConfig] = useState(false);
    
    // Suggested time state
    const [suggestedDate, setSuggestedDate] = useState(() => window.isTutorialMode ? '2026-04-08' : window.timeUtils.getHKTDateString(2));
    const [showAllocModal, setShowAllocModal] = useState(false);
    const [allocQueryDate, setAllocQueryDate] = useState(() => window.isTutorialMode ? '2026-04-08' : getTargetAllocDate(window.timeUtils.getHKTNow()));
    const [showFullTimeline, setShowFullTimeline] = useState(false);
    const [hasCheckedIn, setHasCheckedIn] = useState(false);
    const [allocCheckins, setAllocCheckins] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [isRefreshingAlloc, setIsRefreshingAlloc] = useState(false);
    const [autoRefreshAlloc, setAutoRefreshAlloc] = useState(false);
    
    // Live Radar state
    const [roomPresences, setRoomPresences] = useState([]);

    // System Announcement
    const [announcement, setAnnouncement] = useState(null);

    // Timeline Date state
    const [timelineDate, setTimelineDate] = useState(() => window.timeUtils.getHKTDateString(0));

    // Swiping state
    const [swipedSlots, setSwipedSlots] = useState(() => {
        try { return JSON.parse(localStorage.getItem('swipedSlots') || '{}'); } catch(e) { return {}; }
    });
    const lastNotifiedMinuteRef = useRef(-1);
    const [showPresenceForm, setShowPresenceForm] = useState(false);
    const [presenceRoom, setPresenceRoom] = useState('13');
    const [presenceCount, setPresenceCount] = useState(1);
    const [isPresenceLoading, setIsPresenceLoading] = useState(false);

    const timelineRef = useRef(null);

    useEffect(() => {
        const currentUser = window.auth.requireAuth();
        if (currentUser) {
            window.db.getSetting('system_announcement').then(res => {
                if (res && res.settingValue) {
                    try {
                        const parsed = JSON.parse(res.settingValue);
                        setAnnouncement(typeof parsed === 'object' ? parsed : { text: res.settingValue });
                    } catch(e) {
                        setAnnouncement({ text: res.settingValue });
                    }
                }
            }).catch(e => {});
        }
        if (currentUser) {
            setUser(currentUser);
            setTimePref(currentUser.timePreference || 'any');
            setIsSchedulePublic(currentUser.isSchedulePublic !== false); // default to true
            setIsPasswordFree(currentUser.isPasswordFree !== false);
            if (currentUser.defaultPresence) {
                try {
                    setDefaultPresence(JSON.parse(currentUser.defaultPresence));
                } catch(e) {}
            }
        }
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(window.timeUtils.getHKTNow()), 10000); // 10s for more accurate check-in time
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!user) return;
        const fetchCheckin = async () => {
            try {
                const today = window.timeUtils.getHKTDateString(0);
                const checkins = await window.db.getCheckIns(today);
                if (checkins.some(c => c.userId === user.id)) {
                    setHasCheckedIn(true);
                } else {
                    setHasCheckedIn(false);
                }
            } catch(e) {}
        };
        fetchCheckin();
        
        const fetchPresences = async () => {
            try {
                const p = await window.db.getRoomPresences();
                setRoomPresences(p);
            } catch(e) {}
        };
        fetchPresences();
        // Set up periodic fetch for live radar
        const presenceTimer = setInterval(fetchPresences, 10000);
        return () => clearInterval(presenceTimer);
    }, [user, currentTime.getDate()]);

    useEffect(() => {
        if (showAllocModal) {
            const checkInDate = window.timeUtils.offsetDateString(allocQueryDate, -2);
            window.db.getCheckIns(checkInDate).then(res => setAllocCheckins(res)).catch(e => console.warn(e));
            
            if (allUsers.length === 0) {
                window.db.getAllUsers().then(setAllUsers).catch(e => console.warn(e));
            }
        }
    }, [showAllocModal, allocQueryDate]);

    const fetchBookings = async () => {
        if (!user) return;
        try {
            const result = await window.db.getBookings(2000); 
            setBookings(result.items.map(item => ({ ...item.objectData, id: item.objectId })));
        } catch (error) {
            console.warn("Failed to fetch bookings:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshAllocData = async () => {
        setIsRefreshingAlloc(true);
        try {
            await fetchBookings();
            const checkInDate = window.timeUtils.offsetDateString(allocQueryDate, -2);
            const checkinsRes = await window.db.getCheckIns(checkInDate);
            if (checkinsRes) setAllocCheckins(checkinsRes);
            const usersRes = await window.db.getAllUsers();
            if (usersRes) setAllUsers(usersRes);
        } catch(e) {
            console.warn("Failed to refresh alloc data:", e);
        } finally {
            setIsRefreshingAlloc(false);
        }
    };

    const handleRefreshAllocDataRef = useRef(handleRefreshAllocData);
    useEffect(() => {
        handleRefreshAllocDataRef.current = handleRefreshAllocData;
    });

    useEffect(() => {
        let intervalId;
        if (showAllocModal && autoRefreshAlloc) {
            intervalId = setInterval(() => {
                handleRefreshAllocDataRef.current();
            }, 10000);
        }
        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [showAllocModal, autoRefreshAlloc]);

    useEffect(() => {
        fetchBookings();
    }, [user]);

    const [rejectingId, setRejectingId] = useState(null);

    const handleRejectAllocation = async (booking) => {
        if (!confirm(`确定拒绝系统在 ${booking.timeSlot} (RM ${booking.roomNumber}) 的分配吗？\n系统将自动撤销你的分配并由AI转派给其他干员。该操作不可撤销。`)) return;
        setRejectingId(booking.id);
        try {
            await window.db.rejectAndReallocate(booking);
            // alert('已成功拒绝分配并进入AI重新调度池');
            await fetchBookings();
        } catch(e) {
            alert('拒绝操作失败，请重试');
        } finally {
            setRejectingId(null);
        }
    };

    const { currentSlotData, nextUserSlot, todayTimeline } = useMemo(() => {
        const now = currentTime;
        const currentHour = now.getHours();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        
        const isToday = timelineDate === todayStr;
        const dateBookings = bookings.filter(b => b.date === timelineDate && b.type === 'self-report');

        let currentSlotStr = null;
        if (isToday && currentHour >= 8 && currentHour < 24) {
            currentSlotStr = `${currentHour.toString().padStart(2, '0')}:00-${(currentHour + 1).toString().padStart(2, '0')}:00`;
        }
        
        const currentBooking = currentSlotStr 
            ? bookings.filter(b => b.date === todayStr && b.type === 'self-report').find(b => b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, currentSlotStr))
            : null;

        const sortedUserFutureBookings = bookings.filter(b => b.date === todayStr && b.type === 'self-report')
            .filter(b => b.userId === user?.id && b.status === 'active')
            .filter(b => {
                const parts = b.timeSlot.split('-');
                if (parts.length > 0) {
                    const bStart = parseFloat(parts[0].replace(':', '.'));
                    return !isNaN(bStart) && bStart >= currentHour + 1;
                }
                return false;
            })
            .sort((a, b) => parseFloat(a.timeSlot.split('-')[0].replace(':', '.')) - parseFloat(b.timeSlot.split('-')[0].replace(':', '.')));

        const nextSlot = sortedUserFutureBookings.length > 0 ? sortedUserFutureBookings[0] : null;

        const timeline = TIME_SLOTS.map(slot => {
            const startHour = parseInt(slot.split(':')[0]);
            let status = 'future';
            
            if (timelineDate < todayStr) {
                status = 'past';
            } else if (timelineDate === todayStr) {
                if (currentHour > startHour) status = 'past';
                if (currentHour === startHour) status = 'current';
            }

            const slotBookings = dateBookings.filter(b => b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, slot));
            slotBookings.sort((a, b) => {
                if (a.userId === user?.id) return -1;
                if (b.userId === user?.id) return 1;
                return a.roomNumber.localeCompare(b.roomNumber);
            });
            
            return { slot, status, bookings: slotBookings, totalBookings: slotBookings.length };
        });

        return { currentSlotData: { slot: currentSlotStr, booking: currentBooking }, nextUserSlot: nextSlot, todayTimeline: timeline };
    }, [currentTime, bookings, user, timelineDate]);

    useEffect(() => {
        if (!user || !currentSlotData || !currentSlotData.booking || currentSlotData.booking.userId !== user.id) return;
        
        const slot = currentSlotData.slot;
        if (swipedSlots[slot]) return;

        const currentMinute = currentTime.getMinutes();
        if (currentMinute >= 0 && currentMinute <= 15) {
            // Remind every 3 minutes (0, 3, 6, 9, 12, 15)
            if (currentMinute % 3 === 0 && lastNotifiedMinuteRef.current !== currentMinute) {
                if (window.showLocalNotification) {
                    window.showLocalNotification('刷卡/拍码提醒', {
                        body: `RM ${currentSlotData.booking.roomNumber} (${slot}) 正在进行中，请尽快完成现场签到以防违约。`,
                    });
                }
                lastNotifiedMinuteRef.current = currentMinute;
            }
        }
    }, [currentTime, currentSlotData, user, swipedSlots]);

    const handleMarkSwiped = (slot) => {
        const updated = { ...swipedSlots, [slot]: true };
        setSwipedSlots(updated);
        localStorage.setItem('swipedSlots', JSON.stringify(updated));
    };

    const handleCheckIn = async () => {
        try {
            await window.db.createCheckIn({
                userId: user.id,
                userName: user.username,
                date: window.timeUtils.getHKTDateString(0),
                checkInTime: currentTime.toLocaleTimeString('zh-CN', {hour12: false})
            });
            setHasCheckedIn(true);
            // alert('签到成功！');
        } catch (e) {
            alert('签到失败，请重试');
        }
    };

    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const isCheckInTime = currentHour === 23 && currentMinute >= 50;

    const userSuggestions = useMemo(() => {
        if (!user) return [];
        
        const groupedBookings = window.db.groupBookings(bookings);
        const allocatedBookings = groupedBookings
            .filter(b => b.userId === user.id && b.type === 'allocated' && b.status === 'active' && b.date === suggestedDate);

        return allocatedBookings.sort((a, b) => {
            const aStart = parseFloat(a.timeSlot.split('-')[0].replace(':', '.'));
            const bStart = parseFloat(b.timeSlot.split('-')[0].replace(':', '.'));
            return aStart - bStart;
        });
    }, [bookings, user, suggestedDate]);

        const handleTogglePresence = async (status, room = '', count = 1) => {
            setIsPresenceLoading(true);
            try {
                await window.db.setRoomPresence(user.id, user.username, room, status, count);
                const p = await window.db.getRoomPresences();
                setRoomPresences(p);
                setShowPresenceForm(false);
            } catch(e) {
                alert('更新在场状态失败');
            } finally {
                setIsPresenceLoading(false);
            }
        };

        const myPresence = roomPresences.find(p => p.userId === user.id && p.status === 'in');
        const activePresences = roomPresences.filter(p => p.status === 'in');
        const presencesByRoom = activePresences.reduce((acc, p) => {
            if(!acc[p.roomNumber]) acc[p.roomNumber] = [];
            acc[p.roomNumber].push(p);
            return acc;
        }, {});

        const totalEstimatedPeople = Object.values(presencesByRoom).reduce((sum, presences) => {
            const latestPresence = [...presences].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
            return sum + (Number(latestPresence?.reportedCount) || 1);
        }, 0);

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
                const updates = { timePreference: timePref, isSchedulePublic, password: finalPassword, isPasswordFree, defaultPresence: JSON.stringify(defaultPresence) };
                await window.db.updateUser(user.id, updates);
                const updatedUser = { ...user, ...updates };
                window.auth.login(updatedUser);
                setUser(updatedUser);
                setOldPassword('');
                setNewPassword('');
                setShowPrefConfig(false);
                // alert('偏好设置已保存');
            } catch (error) {
                console.warn('Failed to save pref', error);
            } finally {
                setSavingPref(false);
            }
        };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <window.Header />
            {loading ? <window.LoadingSkeleton /> : (
            <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 md:h-[calc(100vh-64px)] overflow-y-auto md:overflow-hidden animate-fade-in">
                {/* 分配查询模态框 */}
                {showAllocModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
                        <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 max-h-[80vh] flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                                    <div className="icon-search mr-2 text-purple-600"></div>
                                    全员分配查询
                                </h3>
                                <div className="flex items-center space-x-3">
                                    <label className="flex items-center text-xs text-gray-500 cursor-pointer border border-gray-200 rounded-md px-2 py-1 hover:bg-gray-50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={autoRefreshAlloc}
                                            onChange={(e) => setAutoRefreshAlloc(e.target.checked)}
                                            className="mr-1.5 rounded text-purple-600 focus:ring-purple-500 h-3 w-3"
                                        />
                                        自动刷新 (10s)
                                    </label>
                                    <button 
                                        data-tutorial="alloc-refresh-btn"
                                        onClick={handleRefreshAllocData} 
                                        disabled={isRefreshingAlloc}
                                        className="text-gray-400 hover:text-blue-600 flex items-center justify-center p-1 rounded-md transition-colors"
                                        title="刷新数据"
                                    >
                                        <div className={`icon-refresh-cw text-xl ${isRefreshingAlloc ? 'animate-spin text-blue-500' : ''}`}></div>
                                    </button>
                                    <button data-tutorial="close-alloc-modal-btn" onClick={() => setShowAllocModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                        <div className="icon-x text-xl"></div>
                                    </button>
                                </div>
                            </div>
                            
                            {(currentTime.getHours() === 23 || currentTime.getHours() === 0 || user.role === 'admin') ? (
                                <>
                                    <div className="mb-4">
                                        <label className="text-sm font-medium text-gray-700 mr-2">选择日期</label>
                                        <input 
                                            type="date" 
                                            value={allocQueryDate}
                                            onChange={(e) => setAllocQueryDate(e.target.value)}
                                            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-purple-500 focus:border-purple-500"
                                        />
                                    </div>
                                    <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
                                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                                            <thead className="bg-gray-50 sticky top-0">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-500">时间段</th>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-500">房间</th>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-500">分配干员</th>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-500">签到与实抢结果</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {(() => {
                                                    const hasAnyRecord = TIME_SLOTS.some(slot => {
                                                        return bookings.some(b => b.date === allocQueryDate && b.timeSlot === slot && b.status === 'active' && (b.type === 'allocated' || b.type === 'self-report'));
                                                    });
                                                    
                                                    if (!hasAnyRecord) {
                                                        return (
                                                            <tr>
                                                                <td colSpan="4" className="px-4 py-8 text-center text-gray-400">该日期暂无分配或填报记录</td>
                                                            </tr>
                                                        );
                                                    }

                                                    return TIME_SLOTS.map(slot => {
                                                        const slotAllocations = bookings.filter(b => b.date === allocQueryDate && b.timeSlot === slot && b.type === 'allocated' && b.status === 'active');
                                                        const slotSelfReports = bookings.filter(b => b.date === allocQueryDate && b.timeSlot === slot && b.type === 'self-report' && b.status === 'active');
                                                        
                                                        const rooms = new Set([...slotAllocations.map(a => a.roomNumber), ...slotSelfReports.map(s => s.roomNumber)]);
                                                        
                                                        const roomsToRender = Array.from(rooms).filter(room => {
                                                            const b = slotAllocations.find(a => a.roomNumber === room);
                                                            const selfReport = slotSelfReports.find(s => s.roomNumber === room);
                                                            
                                                            if (!b && selfReport) {
                                                                const userAlloc = slotAllocations.find(a => a.userId === selfReport.userId);
                                                                if (userAlloc && userAlloc.roomNumber !== room) {
                                                                    return false; // 该用户的跨房记录已在原分配房间中显示，此处不再重复显示无预分配的自由抢到记录
                                                                }
                                                            }
                                                            return true;
                                                        }).sort((a, b) => parseInt(a) - parseInt(b));

                                                        if (roomsToRender.length === 0) {
                                                            return null;
                                                        }
                                                        
                                                        return roomsToRender.map(room => {
                                                            const b = slotAllocations.find(a => a.roomNumber === room);
                                                            const selfReport = slotSelfReports.find(s => s.roomNumber === room);
                                                            
                                                            let rowClass = "hover:bg-gray-50";
                                                            let resultEl = <span className="text-gray-400">尚未填报</span>;
                                                            let isSuccess = false;
                                                            
                                                            if (selfReport) {
                                                                if (b && selfReport.userId === b.userId) {
                                                                    resultEl = <span className="text-green-600 font-medium flex items-center"><div className="icon-circle-check mr-1 text-sm"></div> 自己抢到</span>;
                                                                    isSuccess = true;
                                                                } else if (b) {
                                                                    resultEl = <span className="text-red-600 font-medium flex items-center"><div className="icon-circle-x mr-1 text-sm"></div> 被 {selfReport.userName} 抢到</span>;
                                                                } else {
                                                                    resultEl = <span className="text-blue-600 font-medium flex items-center"><div className="icon-circle-check mr-1 text-sm"></div> 自由抢到 ({selfReport.userName})</span>;
                                                                }
                                                            } else {
                                                                const parts = allocQueryDate.split('-');
                                                                const unlockDate = new Date(parts[0], parts[1] - 1, parts[2]);
                                                                unlockDate.setDate(unlockDate.getDate() - 1);
                                                                unlockDate.setHours(0, 0, 0, 0);
                                                                
                                                                if (currentTime < unlockDate) {
                                                                    rowClass = "bg-gray-50";
                                                                    resultEl = <span className="text-gray-500 font-medium flex items-center"><div className="icon-clock mr-1 text-sm"></div> 待抢</span>;
                                                                } else {
                                                                    rowClass = "bg-red-50 hover:bg-red-100";
                                                                    resultEl = <span className="text-red-600 font-bold flex items-center"><div className="icon-triangle-alert mr-1 text-sm"></div> 房间流失</span>;
                                                                }
                                                            }

                                                            const checkedIn = b ? allocCheckins.some(c => c.userId === b.userId) : false;
                                                            
                                                            let actualGrabEl = null;
                                                            if (!isSuccess && b) {
                                                                const actualGrab = slotSelfReports.find(s => s.userId === b.userId);
                                                                if (actualGrab) {
                                                                    actualGrabEl = (
                                                                        <div className="mt-1 text-[11px] text-gray-600 flex items-center bg-gray-100 px-2 py-0.5 rounded w-fit border border-gray-200">
                                                                            <div className="icon-arrow-right mr-1"></div>
                                                                            实际抢到 RM {actualGrab.roomNumber}
                                                                        </div>
                                                                    );
                                                                }
                                                            }

                                                            return (
                                                                <tr key={`${slot}-${room}`} className={rowClass}>
                                                                    <td className="px-4 py-3 text-gray-900">{slot}</td>
                                                                    <td className="px-4 py-3 text-purple-600 font-medium">RM {room}</td>
                                                                    <td className="px-4 py-3 text-gray-700">
                                                                        {b ? (
                                                                            <div className="flex items-center">
                                                                                <span className="font-bold">{b.userName}</span>
                                                                                <span className="ml-1 text-[10px] text-gray-400 font-mono">#{allUsers.find(u => u.id === b.userId)?.studentId || '未知'}</span>
                                                                                {checkedIn ? (
                                                                                    <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200">已签到</span>
                                                                                ) : (
                                                                                    <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">未签到</span>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-gray-400 italic">无预分配</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-sm">
                                                                        <div className="flex flex-col gap-1">
                                                                            <div>{resultEl}</div>
                                                                            {actualGrabEl}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        });
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <div className="py-12 text-center flex flex-col items-center justify-center flex-1">
                                    <div className="icon-clock text-4xl text-gray-300 mb-4"></div>
                                    <p className="text-gray-600 font-medium text-lg mb-2">查询时间未到</p>
                                    <p className="text-gray-500 text-sm">全员分配方案仅在每日 <span className="font-bold text-red-500">23:00 - 次日 1:00</span> 开放查询</p>
                                    <p className="text-xs text-gray-400 mt-4">当前时间: {currentTime.toLocaleTimeString('zh-CN', {hour12: false})}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 偏好设置模态框 */}
                {showPrefConfig && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                <div className="icon-settings mr-2 text-blue-600"></div>
                                个人偏好设置
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">系统排班时间偏好</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                        value={timePref}
                                        onChange={(e) => setTimePref(e.target.value)}
                                    >
                                        <option value="any">皆可 (默认)</option>
                                        <option value="early">偏早 (如 12:00-18:00)</option>
                                        <option value="late">偏晚 (如 18:00-24:00)</option>
                                    </select>
                                    <p className="mt-1 text-xs text-gray-500">AI 将根据您的偏好以及历史交换记录为您排班。</p>
                                </div>
                                <div className="flex items-center justify-between pt-2">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">公开我的全部课表</label>
                                        <p className="text-xs text-gray-500">允许其他人在公共课表中心看到您的时间安排</p>
                                    </div>
                                    <button 
                                        onClick={() => setIsSchedulePublic(!isSchedulePublic)}
                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isSchedulePublic ? 'bg-blue-600' : 'bg-gray-200'}`}
                                    >
                                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isSchedulePublic ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                    </button>
                                </div>
                                <div className="border-t border-gray-200 pt-4 mt-2">
                                    <h4 className="text-sm font-bold text-gray-900 mb-2">默认出勤设置 (按星期)</h4>
                                    <p className="text-xs text-gray-500 mb-3">蓝色表示默认接受系统分配，灰色表示默认拒绝。</p>
                                    <div className="flex gap-2">
                                        {[
                                            { id: 1, name: '一' }, { id: 2, name: '二' }, { id: 3, name: '三' },
                                            { id: 4, name: '四' }, { id: 5, name: '五' }, { id: 6, name: '六' }, { id: 7, name: '日' }
                                        ].map(day => (
                                            <button
                                                key={day.id}
                                                onClick={() => setDefaultPresence(prev => ({...prev, [day.id]: !prev[day.id]}))}
                                                className={`h-8 w-8 rounded-full text-xs font-bold transition-colors ${defaultPresence[day.id] ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                            >
                                                {day.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="border-t border-gray-200 pt-4 mt-2">
                                    <h4 className="text-sm font-bold text-gray-900 mb-3">账号安全</h4>
                                    <div className="space-y-4">
                                        {user.password ? (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">原密码</label>
                                                    <div className="relative">
                                                        <input 
                                                            type={showOldPassword ? "text" : "password"} 
                                                            className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                            placeholder="输入原密码以验证"
                                                            value={oldPassword}
                                                            onChange={(e) => setOldPassword(e.target.value)}
                                                        />
                                                        <button type="button" onClick={() => setShowOldPassword(!showOldPassword)} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600">
                                                            <div className={`icon-eye${showOldPassword ? '-off' : ''} text-lg`}></div>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">新密码 (留空则清除密码)</label>
                                                    <div className="relative">
                                                        <input 
                                                            type={showNewPassword ? "text" : "password"} 
                                                            className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                            placeholder="输入新密码"
                                                            value={newPassword}
                                                            onChange={(e) => setNewPassword(e.target.value)}
                                                        />
                                                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600">
                                                            <div className={`icon-eye${showNewPassword ? '-off' : ''} text-lg`}></div>
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">设置登录密码 (选填)</label>
                                                <div className="relative">
                                                    <input 
                                                        type={showNewPassword ? "text" : "password"} 
                                                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                        placeholder="输入新密码"
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                    />
                                                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600">
                                                        <div className={`icon-eye${showNewPassword ? '-off' : ''} text-lg`}></div>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="text-sm font-medium text-gray-700">开启免密登录</label>
                                                <p className="text-xs text-gray-500">允许不输入密码直接进入系统</p>
                                            </div>
                                            <button 
                                                onClick={() => setIsPasswordFree(!isPasswordFree)}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isPasswordFree ? 'bg-blue-600' : 'bg-gray-200'}`}
                                            >
                                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isPasswordFree ? 'translate-x-5' : 'translate-x-0'}`}></span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button 
                                    onClick={() => setShowPrefConfig(false)}
                                    className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
                                >
                                    取消
                                </button>
                                <button 
                                    onClick={handleSavePref}
                                    disabled={savingPref}
                                    className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 flex items-center"
                                >
                                    {savingPref && <div className="icon-loader animate-spin mr-2"></div>}
                                    保存设置
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {(() => {
                    if (!announcement || !announcement.text) return null;
                    const todayStr = window.timeUtils.getHKTDateString(0);
                    const isValidStart = !announcement.startDate || todayStr >= announcement.startDate;
                    const isValidEnd = !announcement.endDate || todayStr <= announcement.endDate;
                    
                    if (!isValidStart || !isValidEnd) return null;
                    
                    return (
                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-2xl shadow-sm flex items-start">
                            <div className="icon-megaphone text-yellow-500 text-xl mr-3 mt-0.5 shrink-0"></div>
                            <div>
                                <h3 className="font-bold text-yellow-800 text-sm mb-1">全站公告</h3>
                                <p className="text-yellow-700 text-sm whitespace-pre-wrap">{announcement.text}</p>
                            </div>
                        </div>
                    );
                })()}

                {isCheckInTime && !hasCheckedIn && (
                    <div className="p-5 bg-red-50 border border-red-200 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-pulse relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500 opacity-5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                        <div>
                            <h3 className="text-red-800 font-bold text-lg flex items-center">
                                <div className="icon-alarm-clock mr-2"></div>
                                每日签到时间已到！(23:50 - 24:00)
                            </h3>
                            <p className="text-red-600 text-sm mt-1">请立即签到以确认你的在线状态，这将在全员分配查询中向所有人公示。</p>
                        </div>
                        <button data-tutorial="checkin-btn" onClick={handleCheckIn} className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-sm whitespace-nowrap transition-colors">
                            立即签到
                        </button>
                    </div>
                )}
                {isCheckInTime && hasCheckedIn && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center shadow-sm">
                        <div className="icon-circle-check text-green-500 text-xl mr-2"></div>
                        <span className="text-green-700 font-medium">今日已成功签到，祝你好运！</span>
                    </div>
                )}

                {currentSlotData && currentSlotData.booking && currentSlotData.booking.userId === user.id && currentTime.getMinutes() <= 15 && !swipedSlots[currentSlotData.slot] && (
                    <div className="p-5 bg-teal-50 border border-teal-200 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500 opacity-5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                        <div className="flex items-center">
                            <div className="icon-credit-card text-teal-600 text-3xl mr-3"></div>
                            <div>
                                <h3 className="text-teal-800 font-bold text-lg">刷卡提醒 (0-15分)</h3>
                                <p className="text-teal-600 text-sm mt-0.5">您预约的 <strong>RM {currentSlotData.booking.roomNumber} ({currentSlotData.slot})</strong> 正在进行中，请确保已前往现场刷卡或拍码。</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => handleMarkSwiped(currentSlotData.slot)} 
                            className="w-full sm:w-auto px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-sm whitespace-nowrap transition-colors flex justify-center items-center"
                        >
                            <div className="icon-check mr-2 text-lg"></div>
                            我已完成刷卡
                        </button>
                    </div>
                )}

                {bookings.filter(b => b.userId === user.id).length === 0 && !hasCheckedIn && (
                    <div className="p-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-3xl shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
                        <div className="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                        <div className="relative z-10 text-white">
                            <h3 className="font-extrabold text-xl flex items-center">
                                <div className="icon-sparkles mr-2 text-yellow-300"></div>
                                欢迎来到智华自习室协调平台！
                            </h3>
                            <p className="text-sm text-blue-100 mt-1">看起来您是第一次使用，我们为您准备了一个沉浸式的互动沙盒演示。</p>
                        </div>
                        <button onClick={() => { localStorage.setItem('TUTORIAL_MODE', 'true'); window.location.href = 'dashboard.html'; }} className="relative z-10 w-full sm:w-auto px-6 py-2.5 bg-white text-blue-600 font-bold rounded-xl shadow-md hover:shadow-lg transition-all text-center flex items-center justify-center whitespace-nowrap hover:scale-105">
                            <div className="icon-gamepad-2 mr-2 text-lg"></div>
                            进入沙盒演示教程
                        </button>
                    </div>
                )}

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-sm border border-white/50 flex-shrink-0 gap-5">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">仪表盘</h1>
                            {totalEstimatedPeople > 0 && (
                                <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full flex items-center border border-green-200">
                                    <div className="icon-users mr-1"></div>
                                    现场约 {totalEstimatedPeople} 人
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-500">{currentTime.toLocaleDateString('zh-CN')} {currentTime.toLocaleTimeString('zh-CN', {hour12: false})}</p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
                        {myPresence ? (
                            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-green-50 px-3 py-1.5 rounded-xl border border-green-100 shadow-sm">
                                <span className="text-green-700 font-bold text-sm flex items-center whitespace-nowrap">
                                    <div className="icon-map-pin mr-1"></div> 已在 RM {myPresence.roomNumber}
                                </span>
                                <div className="flex items-center space-x-1 pl-1 sm:pl-2 border-l border-green-200">
                                    <span className="text-sm font-bold text-green-700 whitespace-nowrap">约</span>
                                    <input 
                                        type="number" 
                                        min="1" 
                                        max="50"
                                        key={myPresence.reportedCount}
                                        defaultValue={myPresence.reportedCount || 1}
                                        onBlur={(e) => {
                                            const newCount = parseInt(e.target.value, 10);
                                            if (newCount > 0 && newCount !== parseInt(myPresence.reportedCount || 1, 10)) {
                                                handleTogglePresence('in', myPresence.roomNumber, newCount);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.target.blur();
                                            }
                                        }}
                                        className="w-10 text-sm font-bold text-green-700 border-b border-green-300 bg-transparent px-1 py-0.5 outline-none text-center hover:bg-green-100 rounded transition-colors"
                                        title="修改人数后点击空白处或回车保存"
                                    />
                                    <span className="text-sm font-bold text-green-700 whitespace-nowrap">人</span>
                                </div>
                                <button 
                                    onClick={() => handleTogglePresence('out')}
                                    disabled={isPresenceLoading}
                                    className="ml-1 text-xs bg-white text-gray-600 px-2.5 py-1 rounded-lg border border-gray-200 shadow-sm hover:bg-gray-50 font-bold disabled:opacity-50 transition-colors"
                                >
                                    {isPresenceLoading ? '...' : '离开'}
                                </button>
                            </div>
                        ) : (
                            showPresenceForm ? (
                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100 shadow-sm">
                                    <div className="flex items-center space-x-1">
                                        <span className="text-sm font-bold text-blue-700 whitespace-nowrap">我在</span>
                                        <select 
                                            value={presenceRoom}
                                            onChange={(e) => setPresenceRoom(e.target.value)}
                                            className="text-sm font-bold text-blue-700 border-b border-blue-300 bg-transparent px-1 py-0.5 outline-none cursor-pointer hover:bg-blue-100 rounded"
                                        >
                                            {Array.from({ length: 19 }, (_, i) => (i + 1).toString()).map(r => (
                                                <option key={r} value={r}>RM {r}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <span className="text-sm font-bold text-blue-700 whitespace-nowrap">, 现场约</span>
                                        <input 
                                            type="number" 
                                            min="1" 
                                            max="50"
                                            value={presenceCount}
                                            onChange={(e) => setPresenceCount(e.target.value)}
                                            className="w-10 text-sm font-bold text-blue-700 border-b border-blue-300 bg-transparent px-1 py-0.5 outline-none text-center hover:bg-blue-100 rounded"
                                        />
                                        <span className="text-sm font-bold text-blue-700 whitespace-nowrap">人</span>
                                    </div>
                                    <div className="flex items-center ml-1 space-x-1 sm:pl-2 sm:border-l border-blue-200">
                                        <button 
                                            onClick={() => handleTogglePresence('in', presenceRoom, presenceCount)}
                                            disabled={isPresenceLoading}
                                            className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg shadow-sm hover:bg-blue-700 font-bold disabled:opacity-50 transition-colors"
                                        >
                                            {isPresenceLoading ? '...' : '确认'}
                                        </button>
                                        <button 
                                            onClick={() => setShowPresenceForm(false)}
                                            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                                        >
                                            取消
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button 
                                    data-tutorial="presence-btn"
                                    onClick={() => setShowPresenceForm(true)}
                                    className="bg-blue-50 text-blue-600 border border-blue-100 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-blue-100 transition-colors flex items-center"
                                >
                                    <div className="icon-map-pin mr-1.5"></div> 我在现场
                                </button>
                            )
                        )}

                        <a 
                            href="https://booking.lib.hku.hk"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl shadow-sm transition-colors"
                        >
                            <div className="icon-external-link mr-1.5 text-base"></div>
                            去官网抢房
                        </a>

                        <button 
                            data-tutorial="alloc-search-btn"
                            onClick={() => setShowAllocModal(true)}
                            className="flex items-center text-sm font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-2 rounded-xl border border-purple-200 transition-colors shadow-sm"
                        >
                            <div className="icon-search mr-1.5"></div>
                            分配查询
                        </button>
                    </div>
                </div>

                <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0 pb-6">
                    <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col overflow-hidden min-h-[500px]">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 z-10 flex-wrap gap-3">
                            <div className="flex items-center flex-wrap gap-3">
                                <h3 className="font-bold text-gray-900 flex items-center text-lg whitespace-nowrap">
                                    <div className="icon-clock text-blue-500 mr-2"></div>
                                    时间轴
                                </h3>
                                <input 
                                    type="date" 
                                    value={timelineDate}
                                    onChange={(e) => setTimelineDate(e.target.value)}
                                    className="px-2 py-1 text-xs font-medium border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                <button 
                                    onClick={() => setShowFullTimeline(!showFullTimeline)}
                                    className="text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded flex items-center transition-colors whitespace-nowrap"
                                >
                                    {showFullTimeline ? '收起精简版' : '查看完整版'}
                                    <div className={`icon-chevron-${showFullTimeline ? 'up' : 'down'} ml-1 text-[10px]`}></div>
                                </button>
                            </div>
                            <a href="submit.html" className="text-xs font-medium text-blue-600 hover:underline flex items-center bg-blue-50 px-2 py-1 rounded">
                                <div className="icon-plus mr-1"></div>填报
                            </a>
                        </div>
                        
                        <div ref={timelineRef} className="flex-1 overflow-y-auto p-4 space-y-3 relative">
                            {(() => {
                                const currentIndex = todayTimeline.findIndex(item => item.status === 'current');
                                let displayTimeline = todayTimeline;
                                
                                if (!showFullTimeline) {
                                    if (currentIndex !== -1) {
                                        const start = Math.max(0, currentIndex - 1);
                                        const end = Math.min(todayTimeline.length, currentIndex + 4);
                                        displayTimeline = todayTimeline.slice(start, end);
                                    } else {
                                        const currentHour = currentTime.getHours();
                                        if (currentHour < 8) displayTimeline = todayTimeline.slice(0, 5);
                                        else displayTimeline = todayTimeline.slice(-5);
                                    }
                                }

                                return displayTimeline.map((item) => {
                                    const isUserBooking = item.bookings && item.bookings.some(b => b.userId === user.id);
                                    const isCurrent = item.status === 'current';
                                    const isCompactNonCurrent = !showFullTimeline && !isCurrent;
                                    
                                    let bgClass = "bg-white";
                                    let borderClass = "border-gray-200";
                                    let containerScaleClass = "";
                                    
                                    if (isCurrent) {
                                        bgClass = "bg-blue-50";
                                        borderClass = "border-blue-300 ring-2 ring-blue-400 ring-offset-2 z-10 relative";
                                        containerScaleClass = "py-4 scale-[1.02] transform my-4 shadow-md";
                                    } else {
                                        if (item.status === 'past') {
                                            bgClass = "bg-gray-50";
                                            borderClass = "border-gray-100";
                                        } else if (isUserBooking) {
                                            bgClass = "bg-orange-50";
                                            borderClass = "border-orange-200";
                                        }
                                        if (isCompactNonCurrent) {
                                            containerScaleClass = "py-1.5 opacity-60 scale-[0.98] transform";
                                        } else {
                                            containerScaleClass = "py-2 shadow-sm";
                                        }
                                    }

                                    return (
                                        <div 
                                            key={item.slot} 
                                            data-status={item.status}
                                            className={`flex items-start sm:items-center px-3 rounded-lg border transition-all duration-300 ${borderClass} ${bgClass} ${containerScaleClass}`}
                                        >
                                            <div className={`${isCompactNonCurrent ? 'w-20' : 'w-24'} flex-shrink-0 font-mono flex flex-col items-center justify-center transition-all pt-2 sm:pt-0`}>
                                                <span className={`${isCurrent ? 'text-2xl text-blue-600' : isCompactNonCurrent ? 'text-sm text-gray-500' : 'text-base text-gray-700'} font-bold transition-all`}>
                                                    {item.slot.split('-')[0]}
                                                </span>
                                                <span className={`${isCurrent ? 'text-xs text-blue-400' : 'text-[10px] text-gray-400'}`}>
                                                    至 {item.slot.split('-')[1]}
                                                </span>
                                            </div>
                                            <div className={`flex-1 w-full ml-2 sm:ml-4 border-l-[3px] ${isCurrent ? 'border-blue-400' : 'border-gray-100'} pl-4 py-3 relative`}>
                                                {isCurrent && (
                                                    <div className="absolute -left-[5px] top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white hidden sm:block"></div>
                                                )}
                                                {item.bookings && item.bookings.length > 0 ? (
                                                    <div className={`grid gap-2 ${item.bookings.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                                                        {item.bookings.map(b => {
                                                            const isThisUserBooking = b.userId === user.id;
                                                            return (
                                                                <div key={b.id} className={`flex flex-col items-start p-3 rounded-xl border ${isThisUserBooking ? 'bg-orange-50 border-orange-200 shadow-orange-100/50' : 'bg-white border-gray-100 hover:border-gray-200'} shadow-sm transition-colors`}>
                                                                    <div className="w-full flex items-center justify-between">
                                                                        <div>
                                                                            <div className="flex items-center mb-1">
                                                                                <span className={`font-bold ${isCurrent ? 'text-sm' : 'text-xs'} ${isThisUserBooking ? 'text-orange-700' : 'text-gray-900'} transition-all`}>
                                                                                    {b.userName} {isThisUserBooking && <span className="ml-1 text-[10px] font-normal bg-orange-100 px-1 rounded">你</span>}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                                <span className={`${isCurrent ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5'} font-medium rounded-full ${isThisUserBooking ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700'} transition-all`}>
                                                                                    RM {b.roomNumber}
                                                                                </span>
                                                                                {isCurrent && presencesByRoom[b.roomNumber] && (() => {
                                                                                    const presences = presencesByRoom[b.roomNumber];
                                                                                    const latestPresence = [...presences].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
                                                                                    const displayCount = Number(latestPresence?.reportedCount) || 1;
                                                                                    
                                                                                    const latestUpdate = presences.reduce((latest, p) => {
                                                                                        if (!p.updatedAt) return latest;
                                                                                        const pTime = new Date(p.updatedAt).getTime();
                                                                                        return pTime > latest ? pTime : latest;
                                                                                    }, 0);
                                                                                    
                                                                                    let timeAgoStr = '';
                                                                                    if (latestUpdate > 0) {
                                                                                        const diffMins = Math.max(0, Math.floor((currentTime.getTime() - latestUpdate) / 60000));
                                                                                        if (diffMins < 1) timeAgoStr = '刚刚';
                                                                                        else if (diffMins < 60) timeAgoStr = `${diffMins}分钟前`;
                                                                                        else timeAgoStr = `${Math.floor(diffMins / 60)}小时前`;
                                                                                    }
                                                                                    
                                                                                    return (
                                                                                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200 flex items-center" title={timeAgoStr ? `最后更新于 ${timeAgoStr}` : ''}>
                                                                                            <div className="icon-users mr-1"></div>
                                                                                            现场 {displayCount} 人
                                                                                            {timeAgoStr && <span className="ml-1 opacity-75 font-normal">· {timeAgoStr}</span>}
                                                                                        </span>
                                                                                    );
                                                                                })()}
                                                                                {b.note && (
                                                                                    <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                                                                                        {b.note}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className={`flex items-center h-full text-gray-400 ${isCurrent ? 'text-base' : 'text-sm'} italic transition-all`}>
                                                        <div className="icon-coffee mr-2 opacity-50"></div>
                                                        该时段空闲
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    <div className="w-full xl:w-[400px] flex flex-col gap-6 flex-shrink-0 xl:h-full xl:overflow-y-auto custom-scrollbar pr-1">
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100/30 rounded-3xl shadow-sm border border-orange-100 p-7 relative overflow-hidden group">
                             <div className="absolute -top-4 -right-4 p-4 opacity-20 transform rotate-12 group-hover:scale-110 transition-transform duration-500">
                                <div className="icon-calendar-clock text-8xl text-orange-500"></div>
                            </div>
                            <h3 className="font-bold text-orange-900/80 mb-3 text-sm tracking-wide">你的下一场</h3>
                            {nextUserSlot ? (
                                <div>
                                    <div className="text-2xl font-bold text-orange-600 mb-1">{nextUserSlot.timeSlot}</div>
                                    <div className="text-sm text-gray-500">房间 {nextUserSlot.roomNumber}</div>
                                </div>
                            ) : (
                                <div className="text-gray-400 text-sm py-2">今天没有更多预约了</div>
                            )}
                        </div>

                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-3xl shadow-sm border border-emerald-100 p-7 relative overflow-hidden group">
                            <div className="absolute -bottom-4 -right-4 p-4 opacity-10 transform -rotate-12 group-hover:scale-110 transition-transform duration-500">
                                <div className="icon-fingerprint text-8xl text-emerald-500"></div>
                            </div>
                            <h3 className="font-bold text-emerald-900/80 mb-3 text-sm tracking-wide">每日出勤签到</h3>
                            {hasCheckedIn ? (
                                <div className="text-green-600 font-bold flex items-center mt-3 text-lg">
                                    <div className="icon-circle-check mr-2 text-2xl"></div>
                                    今日已签到
                                </div>
                            ) : isCheckInTime ? (
                                <button data-tutorial="checkin-btn" onClick={handleCheckIn} className="w-full mt-3 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all flex justify-center items-center animate-pulse border border-red-500">
                                    <div className="icon-scan-face mr-2 text-lg"></div>
                                    立即打卡签到
                                </button>
                            ) : (
                                <div>
                                    <div className="text-gray-500 text-sm mt-2 flex items-center">
                                        <div className="icon-clock mr-1.5 w-4 h-4"></div>
                                        开放时间: 23:50 - 24:00
                                    </div>
                                    <div className="text-orange-500 text-sm font-bold mt-2 bg-orange-50 px-3 py-1.5 rounded-lg inline-block border border-orange-100">
                                        未到签到时间
                                    </div>
                                </div>
                            )}
                        </div>
                        
                         <div data-tutorial="suggested-time-module" className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col overflow-hidden min-h-[260px]">
                             <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap justify-between items-center gap-3">
                                 <h3 className="font-bold text-gray-900 text-base flex items-center">
                                     <div className="icon-wand-sparkles text-purple-600 mr-1.5"></div>
                                     建议时间
                                 </h3>
                                 <div className="flex items-center gap-2">
                                     <a href="swap.html" className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded flex items-center transition-colors">
                                         <div className="icon-arrow-left-right mr-1"></div>去交换
                                     </a>
                                     <input 
                                         type="date" 
                                         value={suggestedDate}
                                         onChange={(e) => setSuggestedDate(e.target.value)}
                                         className="px-2 py-1 text-xs border border-gray-300 rounded bg-white w-28"
                                     />
                                 </div>
                             </div>
                             <div className="overflow-y-auto p-4 text-sm">
                                 {userSuggestions.length === 0 ? (
                                     <p className="text-gray-400 text-center py-4">所选日期无系统建议</p>
                                 ) : (
                                     <div className="space-y-3">
                                         {userSuggestions.map(item => (
                                             <div key={item.id} className="flex justify-between items-center p-2.5 bg-purple-50 border border-purple-100 rounded-lg hover:shadow-sm transition-all group">
                                                 <div>
                                                     <div className="font-bold text-purple-700 text-base">{item.timeSlot}</div>
                                                     <div className="font-medium text-gray-900 text-xs">RM {item.roomNumber}</div>
                                                 </div>
                                                 {(item.date >= window.timeUtils.getHKTDateString(2) || window.isTutorialMode) ? (
                                                     <button 
                                                        data-tutorial="alloc-reject-btn"
                                                        onClick={() => handleRejectAllocation(item)}
                                                        disabled={rejectingId === item.id || (item.originalIds && item.originalIds.length > 1)}
                                                        className={`transition-opacity px-2.5 py-1 bg-red-100 text-red-600 rounded text-xs font-bold hover:bg-red-200 border border-red-200 disabled:opacity-50 flex items-center ${(item.originalIds && item.originalIds.length > 1) ? 'hidden' : ''}`}
                                                        title="拒绝该分配"
                                                     >
                                                         {rejectingId === item.id ? <div className="icon-loader animate-spin mr-1"></div> : <div className="icon-x mr-1"></div>}
                                                         拒绝
                                                     </button>
                                                 ) : (
                                                     <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded">已锁定</span>
                                                 )}
                                             </div>
                                         ))}
                                     </div>
                                 )}
                             </div>
                         </div>
                    </div>
                </div>
            </main>
            )}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <ErrorBoundary>
        <DashboardApp />
    </ErrorBoundary>
);