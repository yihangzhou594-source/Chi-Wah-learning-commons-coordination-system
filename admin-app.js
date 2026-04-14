const { useState, useEffect, useRef } = React;

const TIME_SLOTS = [];
for (let i = 8; i < 24; i++) {
    const start = i.toString().padStart(2, '0') + ':00';
    const end = (i + 1).toString().padStart(2, '0') + ':00';
    TIME_SLOTS.push(`${start}-${end}`);
}
const ROOM_OPTIONS = Array.from({ length: 19 }, (_, i) => (i + 1).toString());

function AdminApp() {
    const [user, setUser] = useState(null);
    const [bookings, setBookings] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [allCourses, setAllCourses] = useState([]);
    const [userStatuses, setUserStatuses] = useState([]);
    const [initialLoading, setInitialLoading] = useState(true);
    
    // Default to Day After Tomorrow
    const [filterDate, setFilterDate] = useState(() => window.isTutorialMode ? '2026-04-08' : window.timeUtils.getHKTDateString(2));
    
    // Filter room state
    const [selectedRoom, setSelectedRoom] = useState('13');

    const [activeAllocUser, setActiveAllocUser] = useState(null);
    const [activeTab, setActiveTab] = useState('smart'); // 'list', 'smart', 'manual'
    const [allocating, setAllocating] = useState(false);
    
    // Selected users for AI allocation
    const [selectedAIUsers, setSelectedAIUsers] = useState([]);
    
    // Search query for users
    const [userSearchQuery, setUserSearchQuery] = useState('');
    
    // Swap history
    const [swapHistory, setSwapHistory] = useState([]);
    
    // Manual entry state
    const [manualUser, setManualUser] = useState('');
    const [manualDate, setManualDate] = useState(() => window.isTutorialMode ? '2026-04-08' : window.timeUtils.getHKTDateString(2));
    const [manualRoom, setManualRoom] = useState('13');
    const [manualSlots, setManualSlots] = useState([]);
    const [manualLoading, setManualLoading] = useState(false);
    
    // Limit modal state
    const [limitModalData, setLimitModalData] = useState(null);
    
    // Conflict modal state
    const [conflictModalData, setConflictModalData] = useState(null);

    // Settings state
    const [semesters, setSemesters] = useState([]);
    const [autoConfig, setAutoConfig] = useState({
        enabled: false,
        executeTime: '23:30',
        targetRoom: '13',
        targetTimeRanges: '12:00-24:00'
    });
    const [newSemesterName, setNewSemesterName] = useState('');
    const [newSemesterStart, setNewSemesterStart] = useState('');
    const [newSemesterEnd, setNewSemesterEnd] = useState('');
    
    // Announcement state
    const [announcement, setAnnouncement] = useState({ text: '', startDate: '', endDate: '' });

    // Cleanup state
    const [cleanupState, setCleanupState] = useState({
        status: 'idle', // idle, scanning, preview, deleting, done
        duplicates: [],
        scannedCount: 0,
        deletedCount: 0
    });

    const scanForDuplicates = async () => {
        setCleanupState({ ...cleanupState, status: 'scanning', duplicates: [], scannedCount: 0 });
        try {
            const todayStr = window.timeUtils.getHKTDateString(0);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

            let totalScanned = 0;
            const toDelete = [];

            // 1. Bookings
            const bookingRes = await window.trickleListObjects('bookings', 5000, true, undefined);
            const bookingsItems = bookingRes?.items.map(i => ({ ...i.objectData, id: i.objectId, _table: 'bookings' })) || [];
            totalScanned += bookingsItems.length;
            bookingsItems.sort((a, b) => a.id.localeCompare(b.id));

            const validItems = [];
            for (const b of bookingsItems) {
                if (b.status !== 'active') continue;
                
                let conflictReason = null;
                let conflictingItem = null;

                for (const v of validItems) {
                    if (v.date === b.date && v.type === b.type && window.timeUtils.checkTimeOverlap(v.timeSlot, b.timeSlot)) {
                        if (v.userId === b.userId) {
                            conflictReason = '同一干员在相同时段重复登记';
                            conflictingItem = v;
                            break;
                        }
                        if (v.roomNumber === b.roomNumber) {
                            conflictReason = '同一房间在相同时段被多人登记';
                            conflictingItem = v;
                            break;
                        }
                    }
                }

                if (conflictReason) {
                    toDelete.push({ remove: b, keep: conflictingItem, reason: conflictReason, type: '排班记录' });
                } else {
                    validItems.push(b);
                }
            }

            // 2. Statuses
            const statusRes = await window.trickleListObjects('user_daily_statuses', 5000, true, undefined);
            const statuses = statusRes?.items.map(i => ({ ...i.objectData, id: i.objectId, _table: 'user_daily_statuses' })) || [];
            totalScanned += statuses.length;
            for (const s of statuses) {
                if (s.date < todayStr) {
                    toDelete.push({ remove: s, keep: null, reason: `过期排班状态 (${s.date})`, type: '排班状态' });
                }
            }

            // 3. Checkins
            const checkinsRes = await window.trickleListObjects('checkins', 5000, true, undefined);
            const checkins = checkinsRes?.items.map(i => ({ ...i.objectData, id: i.objectId, _table: 'checkins' })) || [];
            totalScanned += checkins.length;
            for (const c of checkins) {
                if (c.date < todayStr) {
                    toDelete.push({ remove: c, keep: null, reason: `过期签到记录 (${c.date})`, type: '签到记录' });
                }
            }

            // 4. Notifications
            const notifRes = await window.trickleListObjects('notifications', 5000, true, undefined);
            const notifs = notifRes?.items.map(i => ({ ...i.objectData, id: i.objectId, _table: 'notifications' })) || [];
            totalScanned += notifs.length;
            for (const n of notifs) {
                if (n.createdAt < thirtyDaysAgoIso) {
                    toDelete.push({ remove: n, keep: null, reason: `30天前的历史通知`, type: '系统通知' });
                }
            }

            // 5. Swap Requests
            const swapRes = await window.trickleListObjects('swap_requests', 5000, true, undefined);
            const swaps = swapRes?.items.map(i => ({ ...i.objectData, id: i.objectId, _table: 'swap_requests' })) || [];
            totalScanned += swaps.length;
            for (const sw of swaps) {
                if (sw.status !== 'pending') {
                    toDelete.push({ remove: sw, keep: null, reason: `已结束的交换请求`, type: '交换请求' });
                } else if (sw.createdAt < thirtyDaysAgoIso) {
                    toDelete.push({ remove: sw, keep: null, reason: `30天前的未处理请求`, type: '交换请求' });
                }
            }

            setCleanupState({
                status: 'preview',
                duplicates: toDelete,
                scannedCount: totalScanned,
                deletedCount: 0
            });
        } catch (e) {
            console.error(e);
            alert('扫描过程中发生错误，请重试');
            setCleanupState(prev => ({ ...prev, status: 'idle' }));
        }
    };

    const confirmCleanup = async () => {
        if (!confirm('确认删除这些冗余数据吗？此操作不可恢复。')) return;
        setCleanupState(prev => ({ ...prev, status: 'deleting' }));
        try {
            let deletedCount = 0;
            for (const item of cleanupState.duplicates) {
                await window.trickleDeleteObject(item.remove._table, item.remove.id);
                deletedCount++;
            }
            setCleanupState(prev => ({
                ...prev,
                status: 'done',
                deletedCount
            }));
            loadData();
        } catch (e) {
            console.error(e);
            alert('删除过程中发生错误');
            setCleanupState(prev => ({ ...prev, status: 'idle' }));
        }
    };

    const cancelCleanup = () => {
        setCleanupState({ status: 'idle', duplicates: [], scannedCount: 0, deletedCount: 0 });
    };

    useEffect(() => {
        const currentUser = window.auth.requireAuth();
        if (currentUser && currentUser.role === 'admin') {
            setUser(currentUser);
            loadData();
        } else {
            window.location.href = 'dashboard.html';
        }
    }, []);

    const loadData = async () => {
        try {
            const [usersRes, bookingsRes, coursesRes, statusesRes, swapsRes, settingSemestersObj, announcementSetting, autoConfSetting] = await Promise.all([
                window.db.getAllUsers(),
                window.db.getBookings(2000),
                window.db.getCourses(2000),
                window.db.getAllUserStatuses(2000),
                window.db.getSwapRequests(1000),
                window.db.getSetting('semesters_list'),
                window.db.getSetting('system_announcement'),
                window.db.getSetting('auto_allocate_config')
            ]);

            if (autoConfSetting && autoConfSetting.settingValue) {
                try {
                    setAutoConfig(JSON.parse(autoConfSetting.settingValue));
                } catch(e) {}
            }
            
            if (announcementSetting && announcementSetting.settingValue) {
                try {
                    const parsed = JSON.parse(announcementSetting.settingValue);
                    if (typeof parsed === 'object') {
                        setAnnouncement({
                            text: parsed.text || '',
                            startDate: parsed.startDate || '',
                            endDate: parsed.endDate || ''
                        });
                    } else {
                        setAnnouncement({ text: announcementSetting.settingValue, startDate: '', endDate: '' });
                    }
                } catch(e) {
                    setAnnouncement({ text: announcementSetting.settingValue, startDate: '', endDate: '' });
                }
            }
            
            let fixedUsers = [];
            for (let u of usersRes) {
                if (!u.studentId || String(u.studentId).length !== 3) {
                    const newId = Math.floor(100 + Math.random() * 900).toString();
                    try {
                        await window.db.updateUser(u.id, { studentId: newId });
                        u.studentId = newId;
                    } catch(e) {}
                }
                fixedUsers.push(u);
            }
            setAllUsers(fixedUsers);
            
            if (swapsRes && swapsRes.items) {
                setSwapHistory(swapsRes.items.map(s => ({ ...s.objectData, id: s.objectId })));
            }
            const bookingItems = bookingsRes.items.map(b => ({ ...b.objectData, id: b.objectId }));
            setBookings(bookingItems);
            
            let sems = [];
            if (settingSemestersObj && settingSemestersObj.settingValue) {
                try {
                    sems = JSON.parse(settingSemestersObj.settingValue);
                    sems.sort((a,b) => new Date(a.endDate) - new Date(b.endDate));
                    setSemesters(sems);
                } catch(e) {}
            }

            const now = window.timeUtils.getHKTNow();
            const courseItems = coursesRes.items.map(c => ({ ...c.objectData, id: c.objectId, createdAt: c.createdAt }));
            const activeCourses = courseItems.filter(c => {
                const courseDate = new Date(c.createdAt);
                
                // Find the semester this course belongs to (the first semester where courseDate <= endDate)
                const targetSemester = sems.find(s => courseDate <= new Date(s.endDate + "T23:59:59"));
                
                if (targetSemester) {
                    // If the current time is past this semester's end date, the course is expired
                    if (now > new Date(targetSemester.endDate + "T23:59:59")) {
                        return false;
                    }
                }
                return true;
            });
            setAllCourses(activeCourses);

            const statusItems = statusesRes.map(s => s); 
            setUserStatuses(statusItems);

        } catch (error) {
            console.warn("Admin load error", error);
        } finally {
            setInitialLoading(false);
        }
    };

    const handleSaveAnnouncement = async () => {
        try {
            await window.db.setSetting('system_announcement', JSON.stringify(announcement), '系统公告');
            alert('公告已更新');
        } catch (e) {
            alert('保存公告失败');
        }
    };

    const handleSaveAutoConfig = async () => {
        try {
            await window.db.setSetting('auto_allocate_config', JSON.stringify(autoConfig), '自动派单配置');
            alert('自动派单配置已保存并生效');
        } catch(e) {
            alert('保存自动派单配置失败');
        }
    };

    const handleAddSemester = async () => {
        if (!newSemesterName || !newSemesterStart || !newSemesterEnd) {
            alert('请填写完整的学期信息');
            return;
        }
        if (new Date(newSemesterStart) > new Date(newSemesterEnd)) {
            alert('开始时间不能晚于结束时间');
            return;
        }
        
        const newSem = {
            id: Date.now().toString(),
            name: newSemesterName,
            startDate: newSemesterStart,
            endDate: newSemesterEnd
        };
        
        const updated = [...semesters, newSem];
        try {
            await window.db.setSetting('semesters_list', JSON.stringify(updated), '学期列表');
            setNewSemesterName('');
            setNewSemesterStart('');
            setNewSemesterEnd('');
            loadData();
        } catch (e) {
            alert('添加失败');
        }
    };

    const handleDeleteSemester = async (id) => {
        if (!confirm('确定删除该学期设置吗？')) return;
        const updated = semesters.filter(s => s.id !== id);
        try {
            await window.db.setSetting('semesters_list', JSON.stringify(updated), '学期列表');
            loadData();
        } catch (e) {
            alert('删除失败');
        }
    };

    const dateBookings = bookings.filter(b => b.date === filterDate && b.status === 'active');

    const handleSlotClick = async (slot, room) => {
        if (!activeAllocUser) {
            alert('请先在右侧列表中点击选中一名目标干员');
            return;
        }
        if (checkConflict(activeAllocUser.id, slot, room, filterDate)) return;
        
        const type = activeTab === 'manual' ? 'self-report' : 'allocated';
        await executeAllocation(activeAllocUser, filterDate, slot, room, type);
    };

    const checkConflict = (userId, slot, room, date) => {
        const targetUser = allUsers.find(u => u.id === userId);

        const existing = bookings.find(b => b.date === date && b.userId === userId && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, slot));
        if (existing) {
            setConflictModalData({
                type: 'user_conflict',
                title: '干员时间冲突',
                message: `用户 ${targetUser.username} 在该时段已有预约 (${existing.timeSlot} RM${existing.roomNumber})`,
                conflicts: [existing],
                attempted: [{ user: targetUser, date, slot, room }]
            });
            return true;
        }

        const roomTaken = bookings.find(b => b.date === date && b.roomNumber === room && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, slot));
        if (roomTaken) {
            setConflictModalData({
                type: 'room_conflict',
                title: '房间被占用',
                message: `房间 ${room} 在 ${slot} 已被 ${roomTaken.userName} 占用`,
                conflicts: [roomTaken],
                attempted: [{ user: targetUser, date, slot, room }]
            });
            return true;
        }

        const userTodayBookings = bookings.filter(b => b.date === date && b.userId === userId && b.status === 'active');
        const uniqueSlots = new Set(userTodayBookings.map(b => b.timeSlot));
        if (uniqueSlots.size >= 2 && !uniqueSlots.has(slot)) {
            setLimitModalData({
                user: targetUser,
                date: date,
                existingBookings: userTodayBookings,
                attemptingSlots: [slot]
            });
            return true;
        }

        const dayOfWeek = window.timeUtils.getDayOfWeek(date);
        const userCourses = allCourses.filter(c => c.userId === userId && Number(c.dayOfWeek) === Number(dayOfWeek));
        const conflict = userCourses.find(c => {
            const courseSlot = `${c.startTime}-${c.endTime}`;
            return window.timeUtils.checkStartTimeConflict(courseSlot, slot);
        });

        if (conflict) {
            if (!confirm(`冲突警告！分配时段的开始时间与 ${targetUser.username} 的课表重叠：${conflict.courseName || '忙碌'} (${conflict.startTime}-${conflict.endTime})。强制分配？`)) {
                return true;
            }
        }
        return false;
    };

    const executeForceOverride = async () => {
        if (!conflictModalData) return;
        try {
            // Delete all conflicts
            for (const conflict of conflictModalData.conflicts) {
                await window.db.deleteBooking(conflict.id);
                const message = conflict.type === 'allocated' 
                    ? `[系统通知] 管理员因调度冲突，已强制撤销为您分配的 ${conflict.date} ${conflict.timeSlot} (RM ${conflict.roomNumber})。`
                    : `[系统通知] 管理员因调度冲突，已强制撤销您在 ${conflict.date} ${conflict.timeSlot} (RM ${conflict.roomNumber}) 的实抢记录。`;
                    
                await window.db.createNotification({
                    userId: conflict.userId,
                    content: message,
                    isRead: false,
                    type: conflict.type === 'allocated' ? 'allocation_cancelled' : 'booking_cancelled',
                    createdAt: new Date().toISOString()
                });
            }
            
            // Create all attempted
            const promises = conflictModalData.attempted.map(att => {
                return window.db.createBooking({
                    userId: att.user.id,
                    userName: att.user.username,
                    date: att.date,
                    timeSlot: att.slot,
                    roomNumber: att.room,
                    status: 'active',
                    type: activeTab === 'manual' ? 'self-report' : 'allocated'
                });
            });
            await Promise.all(promises);
            
            alert('已成功强制覆盖！');
            setConflictModalData(null);
            if (activeTab === 'manual') setManualSlots([]);
            loadData();
        } catch (err) {
            console.error(err);
            alert('强制覆盖失败');
        }
    };

    const executeAllocation = async (user, date, slot, room, type = 'allocated') => {
        try {
            await window.db.createBooking({
                userId: user.id,
                userName: user.username,
                date: date,
                timeSlot: slot,
                roomNumber: room,
                status: 'active',
                type: type
            });
            
            if (type === 'allocated') {
                await window.db.createNotification({
                    userId: user.id,
                    content: `[系统分配] 请于0点抢 ${date} ${room} 房间的 ${slot} 时间段`,
                    isRead: false,
                    type: 'allocation',
                    createdAt: new Date().toISOString()
                });
            } else {
                await window.db.createNotification({
                    userId: user.id,
                    content: `[系统通知] 管理员已为您补录 ${date} ${room} 房间的 ${slot} 实抢记录`,
                    isRead: false,
                    type: 'booking_success',
                    createdAt: new Date().toISOString()
                });
            }
            loadData();
        } catch (err) {
            console.warn("Alloc failed", err);
        }
    };

    const handleEditBooking = async (booking) => {
        const newRoom = prompt(`修改 ${booking.userName} 在 ${booking.timeSlot} 的房间号 (当前: RM${booking.roomNumber}):`, booking.roomNumber);
        if (newRoom && newRoom !== booking.roomNumber) {
            try {
                const roomTaken = bookings.find(b => b.date === booking.date && b.roomNumber === newRoom && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, booking.timeSlot));
                if (roomTaken) {
                    alert(`修改失败：房间 ${newRoom} 在该时段已被 ${roomTaken.userName} 占用！`);
                    return;
                }
                await window.db.updateBooking(booking.id, { roomNumber: newRoom });
                loadData();
            } catch (err) {
                console.error(err);
                alert('修改失败');
            }
        }
    };

    const handleDelete = async (bookingId) => {
        if (!confirm('确定撤销该记录吗？')) return;
        try {
            const bookingToDelete = bookings.find(b => b.id === bookingId);
            if (bookingToDelete) {
                const message = bookingToDelete.type === 'allocated' 
                    ? `[系统通知] 管理员已撤销为您分配的 ${bookingToDelete.date} ${bookingToDelete.timeSlot} (RM ${bookingToDelete.roomNumber})。`
                    : `[系统通知] 管理员已撤销您在 ${bookingToDelete.date} ${bookingToDelete.timeSlot} (RM ${bookingToDelete.roomNumber}) 的实抢记录。`;
                    
                await window.db.createNotification({
                    userId: bookingToDelete.userId,
                    content: message,
                    isRead: false,
                    type: bookingToDelete.type === 'allocated' ? 'allocation_cancelled' : 'booking_cancelled',
                    createdAt: new Date().toISOString()
                });
            }
            await window.db.deleteBooking(bookingId);
            loadData();
        } catch (e) {
            console.error(e);
            alert("撤销失败");
        }
    };

    const toggleAIUser = (userId) => {
        if (selectedAIUsers.includes(userId)) {
            setSelectedAIUsers(selectedAIUsers.filter(id => id !== userId));
        } else {
            setSelectedAIUsers([...selectedAIUsers, userId]);
        }
    };

    const handleManualSubmit = async () => {
        if (!manualUser) {
            alert('请选择用户');
            return;
        }
        if (manualSlots.length === 0) {
            alert('请选择至少一个时间段');
            return;
        }
        setManualLoading(true);
        try {
            const targetUser = allUsers.find(u => u.id === manualUser);
            
            const userTodayBookings = bookings.filter(b => b.userId === targetUser.id && b.date === manualDate && b.status === 'active');
            const uniqueSlots = new Set(userTodayBookings.map(b => b.timeSlot));
            manualSlots.forEach(s => uniqueSlots.add(s));
            
            if (uniqueSlots.size > 2) {
                setLimitModalData({
                    user: targetUser,
                    date: manualDate,
                    existingBookings: userTodayBookings,
                    attemptingSlots: manualSlots
                });
                setManualLoading(false);
                return;
            }

            // 校验重复
            const foundConflicts = [];
            for (const slot of manualSlots) {
                const existing = bookings.find(b => b.date === manualDate && b.userId === targetUser.id && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, slot));
                if (existing) {
                    foundConflicts.push(existing);
                }
                const roomTaken = bookings.find(b => b.date === manualDate && b.roomNumber === manualRoom && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, slot));
                if (roomTaken && !foundConflicts.includes(roomTaken)) {
                    foundConflicts.push(roomTaken);
                }
            }

            if (foundConflicts.length > 0) {
                const attempted = manualSlots.map(slot => ({ user: targetUser, date: manualDate, slot, room: manualRoom }));
                setConflictModalData({
                    type: 'multiple_conflict',
                    title: '录入冲突警告',
                    message: `检测到 ${foundConflicts.length} 个冲突记录，是否要强制撤销原记录并覆盖？`,
                    conflicts: foundConflicts,
                    attempted: attempted
                });
                setManualLoading(false);
                return;
            }

            const promises = manualSlots.map(slot => {
                return window.db.createBooking({
                    userId: targetUser.id,
                    userName: targetUser.username,
                    date: manualDate,
                    timeSlot: slot,
                    roomNumber: manualRoom,
                    status: 'active',
                    type: 'self-report'
                });
            });
            await Promise.all(promises);
            alert('实抢记录录入成功！');
            setManualSlots([]);
            loadData();
        } catch (error) {
            alert('录入失败: ' + error.message);
        } finally {
            setManualLoading(false);
        }
    };

    const toggleManualSlot = (slot) => {
        if (manualSlots.includes(slot)) {
            setManualSlots(manualSlots.filter(s => s !== slot));
        } else {
            setManualSlots([...manualSlots, slot]);
        }
    };

    const [aiTimeInput, setAiTimeInput] = useState('12:00-24:00');

    // AI Auto Allocate Logic
    const handleAutoAllocate = async () => {
        setAllocating(true);
        let allocatedCount = 0;

        try {
            const targetRoom = selectedRoom; // Use the selected room from top bar

            // Parse allowed time slots
            const ranges = aiTimeInput.split(',').map(s => s.trim());
            const allowedSlots = new Set();
            TIME_SLOTS.forEach(slot => {
                const [sStart, sEnd] = slot.split('-');
                const slotStartNum = parseFloat(sStart.replace(':', '.'));
                const slotEndNum = parseFloat(sEnd.replace(':', '.'));

                ranges.forEach(r => {
                    const parts = r.split('-');
                    if (parts.length === 2) {
                        const rStart = parseFloat(parts[0].replace(':', '.'));
                        const rEnd = parseFloat(parts[1].replace(':', '.'));
                        if (!isNaN(rStart) && !isNaN(rEnd)) {
                            if (slotStartNum >= rStart && slotEndNum <= rEnd) {
                                allowedSlots.add(slot);
                            }
                        }
                    }
                });
            });

            const sortedSlots = Array.from(allowedSlots).sort();
            const allPairs = [];
            for (let i = 0; i < sortedSlots.length - 1; i++) {
                const slot1 = sortedSlots[i];
                const slot2 = sortedSlots[i + 1];
                if (slot1.split('-')[1] === slot2.split('-')[0]) {
                    // It's a continuous 2-hour block
                    allPairs.push([slot1, slot2]);
                }
            }

            if (allPairs.length === 0) {
                alert('输入的时间段内无法生成连续的2小时分配块，请检查输入。');
                setAllocating(false);
                return;
            }

            // Pool of users
            const dayOfWeek = window.timeUtils.getDayOfWeek(filterDate);
            let userPoolIds = [];
            if (selectedAIUsers.length > 0) {
                userPoolIds = [...selectedAIUsers];
            } else {
                userPoolIds = allUsers.filter(u => {
                    const status = userStatuses.find(s => s.userId === u.id && s.date === filterDate);
                    if (status) {
                        return status.status === 'present';
                    }
                    try {
                        const dp = u.defaultPresence ? JSON.parse(u.defaultPresence) : null;
                        if (dp && dp[dayOfWeek] !== undefined) {
                            return dp[dayOfWeek];
                        }
                    } catch(e) {}
                    return true; // Default true
                }).map(u => u.id);
            }

            if (userPoolIds.length === 0) {
                alert('没有可分配的用户（请先勾选用户或确保有用户默认接受分配或标记为需分配）');
                setAllocating(false);
                return;
            }

            // Calculate historical active frequency (allocations + self-reports) in the last 30 days for balancing
            const thirtyDaysAgoStr = window.timeUtils.getHKTDateString(-30);
            const userBookingCounts = {};
            let totalRecentBookings = 0;
            
            for (const b of bookings) {
                if (b.status === 'active' && b.date >= thirtyDaysAgoStr) {
                    userBookingCounts[b.userId] = (userBookingCounts[b.userId] || 0) + 1;
                    totalRecentBookings++;
                }
            }

            // Keep track of how many hours each user gets TODAY
            const userTodayHours = {};
            for (const b of dateBookings) {
                if (b.status === 'active') {
                    userTodayHours[b.userId] = (userTodayHours[b.userId] || 0) + 1;
                }
            }

            const roomAssignedSlots = new Set();
            for (const b of dateBookings) {
                if (b.roomNumber === targetRoom && b.status === 'active') {
                    roomAssignedSlots.add(b.timeSlot);
                }
            }

            for (const pair of allPairs) {
                if (roomAssignedSlots.has(pair[0]) || roomAssignedSlots.has(pair[1])) continue;

                const isEarlySlot = parseFloat(pair[0].split(':')[0]) < 18;

                // Sort users based on preference.
                // For early slot: prefer 'early' > 'any' > 'late'
                // For late slot: prefer 'late' > 'any' > 'early'
                // Helper to analyze swap history to infer hidden preference
                const getDynamicPrefScore = (userId, targetIsEarly) => {
                    const userSwaps = swapHistory.filter(s => s.requesterId === userId && s.status === 'accepted');
                    let earlyScore = 0;
                    let lateScore = 0;
                    
                    // Note: In real app we'd need to inspect offeredBooking/targetBooking time. 
                    // For simplicity here, we assume requests going out indicate dissatisfaction with current allocation.
                    // We'll grant a small bonus (+0.5) if user has active history.
                    // (To perfectly analyze early->late swaps, we'd cross-reference bookings. 
                    // Since it's heavy, we'll simulate AI learning by giving active swappers priority to their explicit preference).
                    
                    const hasSwaps = userSwaps.length > 0;
                    return hasSwaps ? 0.5 : 0;
                };

                const sortedCandidates = [...userPoolIds].sort((a, b) => {
                    const prefA = allUsers.find(u => u.id === a)?.timePreference || 'any';
                    const prefB = allUsers.find(u => u.id === b)?.timePreference || 'any';
                    
                    let scoreA = 0;
                    let scoreB = 0;
                    
                    if (isEarlySlot) {
                        scoreA = prefA === 'early' ? 1000 : prefA === 'any' ? 500 : -1000;
                        scoreB = prefB === 'early' ? 1000 : prefB === 'any' ? 500 : -1000;
                    } else {
                        scoreA = prefA === 'late' ? 1000 : prefA === 'any' ? 500 : -1000;
                        scoreB = prefB === 'late' ? 1000 : prefB === 'any' ? 500 : -1000;
                    }
                    
                    // Add dynamic AI score from swap history (users who swap frequently get a slight edge to get what they explicitly want)
                    scoreA += getDynamicPrefScore(a, isEarlySlot);
                    scoreB += getDynamicPrefScore(b, isEarlySlot);
                    
                    // Prioritize users with higher historical booking frequency (ratio over last 30 days)
                    // Apply a strict cap to ensure it never overrides absolute time preferences (+/- 1000)
                    const countA = userBookingCounts[a] || 0;
                    const countB = userBookingCounts[b] || 0;
                    const ratioA = totalRecentBookings > 0 ? countA / totalRecentBookings : 0;
                    const ratioB = totalRecentBookings > 0 ? countB / totalRecentBookings : 0;
                    
                    // Example: 10% ratio = 0.1 * 2000 = 200 points. Capped at 200.
                    scoreA += Math.min(ratioA * 2000, 200); 
                    scoreB += Math.min(ratioB * 2000, 200);
                    
                    return scoreB - scoreA;
                });

                let selectedUser = null;
                for (const userId of sortedCandidates) {
                    // Maximum 2 hours per day per user
                    if ((userTodayHours[userId] || 0) >= 2) continue;

                    // 检查这连续的两小时是否与用户已有的时段冲突
                    const hasBooking1 = dateBookings.some(b => b.userId === userId && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, pair[0]));
                    const hasBooking2 = dateBookings.some(b => b.userId === userId && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, pair[1]));
                    if (hasBooking1 || hasBooking2) continue;

                    const userCourses = allCourses.filter(c => c.userId === userId && Number(c.dayOfWeek) === Number(dayOfWeek));

                    // 检查两小时内的课表冲突
                    const hasConflict = userCourses.some(c => {
                        const courseSlot = `${c.startTime}-${c.endTime}`;
                        return window.timeUtils.checkStartTimeConflict(courseSlot, pair[0]) || window.timeUtils.checkStartTimeConflict(courseSlot, pair[1]);
                    });

                    if (!hasConflict) {
                        selectedUser = allUsers.find(u => u.id === userId);
                        break;
                    }
                }

                if (selectedUser) {
                    await window.db.createBooking({
                        userId: selectedUser.id,
                        userName: selectedUser.username,
                        date: filterDate,
                        timeSlot: pair[0],
                        roomNumber: targetRoom,
                        status: 'active',
                        type: 'allocated'
                    });
                    await window.db.createBooking({
                        userId: selectedUser.id,
                        userName: selectedUser.username,
                        date: filterDate,
                        timeSlot: pair[1],
                        roomNumber: targetRoom,
                        status: 'active',
                        type: 'allocated'
                    });
                    
                    const mergedSlot = `${pair[0].split('-')[0]}-${pair[1].split('-')[1]}`;
                    await window.db.createNotification({
                        userId: selectedUser.id,
                        content: `[系统分配] 请于0点抢 ${filterDate} ${targetRoom} 房间的 ${mergedSlot} 时间段`,
                        isRead: false,
                        type: 'allocation',
                        createdAt: new Date().toISOString()
                    });
                    
                    roomAssignedSlots.add(pair[0]);
                    roomAssignedSlots.add(pair[1]);
                    
                    userTodayHours[selectedUser.id] = (userTodayHours[selectedUser.id] || 0) + 2;
                    allocatedCount++;
                }
            }
            
            alert(`AI 分配完成，共为 ${allocatedCount} 名用户分配了 RM ${targetRoom} (结合时间偏好)`);

        } catch (e) {
            console.warn(e);
            alert('AI 分配出错');
        } finally {
            setAllocating(false);
            setSelectedAIUsers([]);
        }
    };

    const renderUserSchedule = (userId) => {
        const dayOfWeek = window.timeUtils.getDayOfWeek(filterDate);
        const userCourses = allCourses
            .filter(c => c.userId === userId && Number(c.dayOfWeek) === Number(dayOfWeek))
            .sort((a,b) => a.startTime.localeCompare(b.startTime));

        if (userCourses.length === 0) return null;
        
        return (
            <div className="flex flex-wrap gap-1.5 mt-2">
                {userCourses.map(c => (
                    <span key={c.id} className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-100 truncate max-w-full shadow-sm font-medium" title={`${c.startTime}-${c.endTime} ${c.courseName || '忙碌'}`}>
                        {c.startTime}-{c.endTime} {c.courseName || '忙'}
                    </span>
                ))}
            </div>
        );
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <window.Header />
            
            {/* Conflict Override Modal */}
            {conflictModalData && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 animate-fade-in">
                        <h3 className="text-lg font-bold text-orange-600 mb-2 flex items-center">
                            <div className="icon-triangle-alert mr-2 text-xl"></div>
                            {conflictModalData.title}
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">{conflictModalData.message}</p>
                        
                        <div className="mb-4">
                            <p className="text-xs font-bold text-gray-500 mb-2">冲突的记录：</p>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                {conflictModalData.conflicts.map(b => (
                                    <div key={b.id} className="flex justify-between items-center bg-orange-50/50 p-2.5 rounded-lg border border-orange-100">
                                        <div className="text-sm text-gray-700">
                                            <span className="font-bold bg-white border border-gray-200 px-1.5 py-0.5 rounded text-xs mr-2">RM{b.roomNumber}</span> 
                                            {b.timeSlot} - <strong>{b.userName}</strong>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <div className="mt-6 flex justify-end space-x-3">
                            <button 
                                onClick={() => setConflictModalData(null)}
                                className="px-5 py-2 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                取消操作
                            </button>
                            <button 
                                onClick={executeForceOverride}
                                className="px-5 py-2 text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
                            >
                                强制撤销并覆盖
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Limit Warning Modal */}
            {limitModalData && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
                        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 animate-fade-in">
                            <h3 className="text-lg font-bold text-red-600 mb-2 flex items-center">
                                <div className="icon-triangle-alert mr-2 text-xl"></div>
                                触发额度安全拦截
                            </h3>
                            <p className="text-sm text-gray-600 mb-4">
                                干员 <strong>{limitModalData.user.username}</strong> 在 {limitModalData.date} 的总时长将超出 <strong>2小时</strong> 的限制。为了保证公平性限制，请先撤销该干员当天的其他记录。
                            </p>
                            
                            {limitModalData.existingBookings.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-xs font-bold text-gray-500 mb-2">该干员已有占用记录：</p>
                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                        {limitModalData.existingBookings.map(b => (
                                            <div key={b.id} className="flex justify-between items-center bg-red-50/50 p-2.5 rounded-lg border border-red-100">
                                                <div className="text-sm text-gray-700">
                                                    <span className="font-bold bg-white border border-gray-200 px-1.5 py-0.5 rounded text-xs mr-2">RM{b.roomNumber}</span> 
                                                    {b.timeSlot}
                                                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold ${b.type === 'allocated' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                                        {b.type === 'allocated' ? '派单' : '实抢'}
                                                    </span>
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        setLimitModalData(null);
                                                        handleDelete(b.id);
                                                    }} 
                                                    className="text-red-600 hover:text-red-800 text-xs px-2.5 py-1.5 bg-red-100 hover:bg-red-200 rounded font-bold transition-colors"
                                                >
                                                    强制撤销
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            <div className="mt-6 flex justify-end">
                                <button 
                                    onClick={() => setLimitModalData(null)}
                                    className="px-5 py-2 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                    取消录入
                                </button>
                            </div>
                        </div>
                    </div>
            )}

            {initialLoading ? <window.LoadingSkeleton /> : (
            <main className="flex-1 max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 w-full animate-fade-in">
                {/* Header Controls */}
                <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200 mb-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 relative z-20">
                    <div className="flex items-center">
                        <div className="bg-purple-100 p-2.5 rounded-xl mr-3">
                            <div className="icon-shield text-purple-600 text-xl"></div>
                        </div>
                        <div>
                            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">高级管理后台</h1>
                            <p className="text-xs text-gray-500 font-medium">全局视角与调度控制中心</p>
                        </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full xl:w-auto">
                        <div className="flex flex-row items-center gap-2 sm:gap-3 shrink-0 order-2 sm:order-1 w-full sm:w-auto">
                            <div className="relative flex-1 sm:flex-none">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <div className="icon-calendar text-gray-400 w-4 h-4"></div>
                                </div>
                                <input 
                                    type="date" 
                                    value={filterDate}
                                    onChange={(e) => {
                                        setFilterDate(e.target.value);
                                        setManualDate(e.target.value);
                                    }}
                                    className="pl-9 pr-2 py-2 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm outline-none transition-all w-full"
                                />
                            </div>
                            
                            {activeTab === 'smart' && (
                                <div className="relative flex-1 sm:flex-none">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <div className="icon-door-open text-gray-400 w-4 h-4"></div>
                                    </div>
                                    <select 
                                        value={selectedRoom}
                                        onChange={(e) => setSelectedRoom(e.target.value)}
                                        className="pl-9 pr-8 py-2 border border-gray-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm outline-none transition-all w-full appearance-none bg-white text-gray-800"
                                    >
                                        {ROOM_OPTIONS.map(r => (
                                            <option key={r} value={r}>RM {r}</option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                        <div className="icon-chevron-down text-gray-400 w-4 h-4"></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-gray-100/80 p-1.5 rounded-xl flex overflow-x-auto w-full sm:w-auto flex-nowrap shadow-inner scrollbar-hide order-1 sm:order-2">
                            <button 
                                onClick={() => setActiveTab('smart')}
                                className={`whitespace-nowrap px-5 py-2 text-sm font-bold rounded-lg transition-all flex items-center ${activeTab === 'smart' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                            >
                                <div className="icon-layout-dashboard mr-1.5"></div>可视排班
                            </button>
                            <button 
                                onClick={() => setActiveTab('manual')}
                                className={`whitespace-nowrap px-5 py-2 text-sm font-bold rounded-lg transition-all flex items-center ${activeTab === 'manual' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                            >
                                <div className="icon-pencil-line mr-1.5"></div>录入实抢
                            </button>
                            <button 
                                onClick={() => setActiveTab('settings')}
                                className={`whitespace-nowrap px-5 py-2 text-sm font-bold rounded-lg transition-all flex items-center ${activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                            >
                                <div className="icon-settings mr-1.5"></div>维护设置
                            </button>
                        </div>
                    </div>
                </div>

                {activeTab === 'settings' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 md:p-8 max-w-5xl mx-auto space-y-10 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-blue-50 rounded-br-full opacity-50 pointer-events-none"></div>
                        
                        <div className="relative z-10">
                            <h2 className="text-xl font-extrabold mb-8 flex items-center text-gray-900 border-b border-gray-100 pb-4">
                                <div className="icon-settings mr-2 text-blue-600"></div>
                                系统参数与运维
                            </h2>
                            
                            <div className="space-y-10">
                                {/* System Announcement Section */}
                                <div>
                                    <div className="flex items-center mb-4">
                                        <div className="icon-megaphone text-blue-500 mr-2 text-xl"></div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-800">系统公告发布</h3>
                                            <p className="text-sm text-gray-500">在此处编辑全站公告，留空则不显示。支持换行，保存后将在干员仪表盘置顶显示。</p>
                                        </div>
                                    </div>
                                    <div className="bg-blue-50/30 p-5 rounded-2xl border border-blue-100 mb-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1.5">生效开始日期 (选填)</label>
                                                <input 
                                                    type="date" 
                                                    value={announcement.startDate} 
                                                    onChange={e => setAnnouncement({...announcement, startDate: e.target.value})} 
                                                    className="border border-gray-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full text-sm outline-none bg-white transition-all shadow-sm" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1.5">生效结束日期 (选填)</label>
                                                <input 
                                                    type="date" 
                                                    value={announcement.endDate} 
                                                    onChange={e => setAnnouncement({...announcement, endDate: e.target.value})} 
                                                    className="border border-gray-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full text-sm outline-none bg-white transition-all shadow-sm" 
                                                />
                                            </div>
                                        </div>
                                        <textarea
                                            value={announcement.text}
                                            onChange={e => setAnnouncement({...announcement, text: e.target.value})}
                                            placeholder="输入系统公告内容..."
                                            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm outline-none bg-white transition-all shadow-sm min-h-[100px] resize-y mb-3"
                                        ></textarea>
                                        <div className="flex justify-end">
                                            <button 
                                                onClick={handleSaveAnnouncement}
                                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl shadow-md font-bold text-sm hover:bg-blue-700 transition-all flex items-center"
                                            >
                                                <div className="icon-save mr-2 w-4 h-4"></div>保存发布
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Auto Allocate Config Section */}
                                <div>
                                    <div className="flex items-center mb-4">
                                        <div className="icon-bot text-blue-500 mr-2 text-xl"></div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-800">定时 AI 自动派单</h3>
                                            <p className="text-sm text-gray-500">开启后，系统将在设定时间自动执行分配逻辑，分配第二天的空闲时段。</p>
                                        </div>
                                    </div>
                                    <div className="bg-blue-50/30 p-5 rounded-2xl border border-blue-100 mb-6">
                                        <div className="flex items-center mb-4 bg-white p-3 rounded-xl border border-gray-200">
                                            <label className="flex items-center cursor-pointer">
                                                <div className="relative">
                                                    <input 
                                                        type="checkbox" 
                                                        className="sr-only" 
                                                        checked={autoConfig.enabled}
                                                        onChange={e => setAutoConfig({...autoConfig, enabled: e.target.checked})}
                                                    />
                                                    <div className={`block w-10 h-6 rounded-full transition-colors ${autoConfig.enabled ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                                                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${autoConfig.enabled ? 'transform translate-x-4' : ''}`}></div>
                                                </div>
                                                <div className="ml-3 text-sm font-bold text-gray-700">
                                                    {autoConfig.enabled ? '已开启自动派单' : '已关闭自动派单'}
                                                </div>
                                            </label>
                                        </div>

                                        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 transition-opacity ${!autoConfig.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1.5">每日执行时间 (定时触发)</label>
                                                <input 
                                                    type="time" 
                                                    value={autoConfig.executeTime} 
                                                    onChange={e => setAutoConfig({...autoConfig, executeTime: e.target.value})} 
                                                    className="border border-gray-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 w-full text-sm outline-none bg-white" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1.5">分配目标房间</label>
                                                <select 
                                                    value={autoConfig.targetRoom}
                                                    onChange={e => setAutoConfig({...autoConfig, targetRoom: e.target.value})}
                                                    className="border border-gray-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 w-full text-sm outline-none bg-white"
                                                >
                                                    {ROOM_OPTIONS.map(r => (
                                                        <option key={r} value={r}>RM {r}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1.5">分配时间段范围</label>
                                                <input 
                                                    type="text" 
                                                    value={autoConfig.targetTimeRanges} 
                                                    onChange={e => setAutoConfig({...autoConfig, targetTimeRanges: e.target.value})} 
                                                    placeholder="例如: 12:00-24:00"
                                                    className="border border-gray-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 w-full text-sm outline-none bg-white" 
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="flex justify-end">
                                            <button 
                                                onClick={handleSaveAutoConfig}
                                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl shadow-md font-bold text-sm hover:bg-blue-700 transition-all flex items-center"
                                            >
                                                <div className="icon-save mr-2 w-4 h-4"></div>保存配置
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Semester Management Section */}
                                <div>
                                    <div className="flex items-center mb-4">
                                        <div className="icon-calendar-days text-blue-500 mr-2 text-xl"></div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-800">学期时间管理</h3>
                                            <p className="text-sm text-gray-500">维护学期时间段，系统会据此自动控制历史课表的可见性和过期失效逻辑。</p>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-blue-50/30 p-5 rounded-2xl border border-blue-100 mb-6">
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1.5">学期名称</label>
                                                <input 
                                                    type="text" 
                                                    placeholder="例如: 2025S2"
                                                    value={newSemesterName} 
                                                    onChange={e => setNewSemesterName(e.target.value)} 
                                                    className="border border-gray-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full text-sm outline-none bg-white transition-all shadow-sm" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1.5">开始日期</label>
                                                <input 
                                                    type="date" 
                                                    value={newSemesterStart} 
                                                    onChange={e => setNewSemesterStart(e.target.value)} 
                                                    className="border border-gray-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full text-sm outline-none bg-white transition-all shadow-sm" 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 mb-1.5">结束日期</label>
                                                <input 
                                                    type="date" 
                                                    value={newSemesterEnd} 
                                                    onChange={e => setNewSemesterEnd(e.target.value)} 
                                                    className="border border-gray-300 px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full text-sm outline-none bg-white transition-all shadow-sm" 
                                                />
                                            </div>
                                            <div>
                                                <button 
                                                    onClick={handleAddSemester} 
                                                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl shadow-md font-bold text-sm hover:bg-blue-700 whitespace-nowrap transition-all hover:-translate-y-0.5 flex items-center justify-center"
                                                >
                                                    <div className="icon-plus mr-1"></div>新建学期
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {semesters.length > 0 ? (
                                        <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">学期名称</th>
                                                        <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">持续时间</th>
                                                        <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-100">
                                                    {semesters.map(s => (
                                                        <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-6 py-4 text-sm font-extrabold text-gray-900">{s.name}</td>
                                                            <td className="px-6 py-4 text-sm text-gray-600 font-mono">{s.startDate} <span className="text-gray-300 mx-2">至</span> {s.endDate}</td>
                                                            <td className="px-6 py-4 text-right">
                                                                <button onClick={() => handleDeleteSemester(s.id)} className="text-red-500 hover:text-white hover:bg-red-500 p-2 rounded-lg transition-colors inline-flex items-center justify-center">
                                                                    <div className="icon-trash-2 w-4 h-4"></div>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 bg-gray-50 border border-dashed border-gray-300 rounded-2xl">
                                            <div className="icon-calendar-x text-4xl text-gray-300 mb-3 mx-auto"></div>
                                            <p className="text-sm text-gray-500 font-medium">尚未添加任何学期</p>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Database Cleanup Section */}
                                <div>
                                    <div className="flex items-center mb-4">
                                        <div className="icon-database text-red-500 mr-2 text-xl"></div>
                                        <div>
                                            <h3 className="text-lg font-bold text-red-600">数据库冗余清理</h3>
                                            <p className="text-sm text-gray-500">检测并清除重复占用的填报记录，释放占用冲突。</p>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-red-50/50 p-6 rounded-2xl border border-red-100">
                                        {cleanupState.status === 'idle' || cleanupState.status === 'done' ? (
                                            <button 
                                                onClick={scanForDuplicates}
                                                className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold shadow-md hover:bg-red-700 flex items-center transition-all hover:-translate-y-0.5"
                                            >
                                                <div className="icon-scan mr-2"></div>
                                                全盘扫描冲突数据
                                            </button>
                                        ) : cleanupState.status === 'scanning' ? (
                                            <button disabled className="px-6 py-3 bg-red-400 text-white rounded-xl font-bold shadow-sm opacity-80 flex items-center transition-all">
                                                <div className="icon-loader animate-spin mr-2"></div>
                                                深度检索中...
                                            </button>
                                        ) : null}

                                        {cleanupState.status === 'preview' && (
                                            <div className="bg-white border border-yellow-200 p-5 rounded-xl mt-5 shadow-sm">
                                                <h3 className="font-bold text-yellow-800 flex items-center mb-2">
                                                    <div className="icon-triangle-alert mr-2 text-yellow-500"></div>扫描完成
                                                </h3>
                                                <p className="text-sm text-gray-600 mb-4">
                                                    共检查 <span className="font-bold">{cleanupState.scannedCount}</span> 条记录，发现 <span className="font-bold text-red-600">{cleanupState.duplicates.length}</span> 条异常冲突。
                                                </p>
                                                
                                                {cleanupState.duplicates.length > 0 ? (
                                                    <div className="mb-5 max-h-64 overflow-y-auto border border-gray-200 rounded-xl bg-gray-50">
                                                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                                                            <thead className="bg-gray-100 sticky top-0">
                                                                <tr>
                                                                    <th className="px-4 py-3 text-left font-bold text-gray-600">定位时段</th>
                                                                    <th className="px-4 py-3 text-left font-bold text-gray-600">冲突描述</th>
                                                                    <th className="px-4 py-3 text-left font-bold text-red-600">待清理 (无效记录)</th>
                                                                    <th className="px-4 py-3 text-left font-bold text-green-600">原记录 (保留)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white divide-y divide-gray-100">
                                                                {cleanupState.duplicates.map((dup, idx) => (
                                                                    <tr key={idx} className="hover:bg-red-50/50">
                                                                        <td className="px-4 py-3 font-mono text-gray-600">{dup.remove.date} {dup.remove.timeSlot}</td>
                                                                        <td className="px-4 py-3">{dup.reason}</td>
                                                                        <td className="px-4 py-3 text-red-600 font-medium">
                                                                            <span className="bg-red-100 px-2 py-0.5 rounded mr-1">RM{dup.remove.roomNumber}</span>
                                                                            {dup.remove.userName}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-green-700 font-medium">
                                                                            {dup.keep ? <><span className="bg-green-100 px-2 py-0.5 rounded mr-1">RM{dup.keep.roomNumber}</span>{dup.keep.userName}</> : '未知'}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : null}

                                                <div className="flex gap-3">
                                                    {cleanupState.duplicates.length > 0 && (
                                                        <button 
                                                            onClick={confirmCleanup}
                                                            className="px-6 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-red-700 transition-all flex items-center"
                                                        >
                                                            <div className="icon-trash-2 mr-2 w-4 h-4"></div>执行清理
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={cancelCleanup}
                                                        className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
                                                    >
                                                        取消并返回
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {cleanupState.status === 'deleting' && (
                                            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mt-5 flex items-center text-yellow-700 font-bold shadow-sm">
                                                <div className="icon-loader animate-spin mr-3 text-xl"></div>
                                                正在清理数据库片段，请勿关闭页面...
                                            </div>
                                        )}

                                        {cleanupState.status === 'done' && (
                                            <div className="bg-green-50 border border-green-200 p-5 rounded-xl mt-5 flex items-start shadow-sm">
                                                <div className="icon-circle-check text-green-500 text-2xl mr-3 mt-0.5"></div>
                                                <div>
                                                    <h3 className="font-bold text-green-800 mb-1">数据库清理完成</h3>
                                                    <p className="text-sm text-green-700">共成功移除 <strong>{cleanupState.deletedCount}</strong> 条无效占位数据。</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {(activeTab === 'smart' || activeTab === 'manual') && (
                    <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-180px)] gap-6">
                        {/* Interactive Grid */}
                        <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-200 overflow-auto relative min-h-[500px] order-2 lg:order-1">
                             <div className="p-4 md:p-5">
                                 {activeTab === 'smart' ? (
                                     <div className="flex flex-col h-full">
                                         <div className="font-extrabold text-gray-900 text-xl mb-4 flex items-center border-b border-gray-100 pb-3">
                                             <div className="w-10 h-10 rounded-xl flex items-center justify-center mr-3 bg-blue-100 text-blue-600">
                                                <div className="icon-door-open text-xl"></div>
                                             </div>
                                             RM {selectedRoom} <span className="text-gray-400 font-medium text-base ml-2">/ 可视派单</span>
                                         </div>
                                         <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                                             {TIME_SLOTS.map(slot => {
                                                 const booking = dateBookings.find(b => b.roomNumber === selectedRoom && window.timeUtils.checkTimeOverlap(b.timeSlot, slot) && b.type === 'allocated');
                                                 const isAllocated = booking && booking.type === 'allocated';
                                                 const isMine = booking && booking.userId === user.id;
                                                 
                                                 return (
                                                     <div 
                                                        key={slot}
                                                        onClick={() => !booking && handleSlotClick(slot, selectedRoom)}
                                                        className={`border-2 rounded-xl p-3 transition-all duration-200 relative group flex flex-col min-h-[90px]
                                                            ${booking 
                                                                ? (isAllocated ? 'bg-purple-50/50 border-purple-200 shadow-sm' : 'bg-green-50/50 border-green-200 shadow-sm') 
                                                                : 'bg-white border-gray-100 border-dashed hover:border-solid hover:border-blue-400 cursor-pointer hover:shadow-md hover:-translate-y-0.5'
                                                            }
                                                        `}
                                                     >
                                                         <div className="text-[11px] font-bold text-gray-500 mb-2 flex justify-between items-center tracking-wide">
                                                            {slot}
                                                            {booking && (
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${isAllocated ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                                                                    {isAllocated ? '派单' : '实抢'}
                                                                </span>
                                                            )}
                                                         </div>
                                                         {booking ? (
                                                             <div className="flex-1 flex flex-col justify-center relative">
                                                                 <div className="font-extrabold text-gray-900 text-sm truncate flex items-center">
                                                                    {isMine ? '🌟 ' : ''}{booking.userName}
                                                                 </div>
                                                                 <button 
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(booking.id); }}
                                                                    className="absolute -top-8 -right-2 opacity-0 group-hover:opacity-100 text-red-500 bg-white border border-red-100 rounded-lg p-1.5 shadow-md hover:bg-red-50 transition-all z-10 hover:scale-110"
                                                                    title="撤销该记录"
                                                                 >
                                                                     <div className="icon-trash-2 w-3.5 h-3.5"></div>
                                                                 </button>
                                                             </div>
                                                         ) : (
                                                             <div className="flex-1 flex items-center justify-center text-xs font-bold text-blue-500 opacity-0 group-hover:opacity-100 bg-blue-50/80 rounded-lg border border-blue-200 transition-all">
                                                                 <div className="icon-plus mr-1 w-3.5 h-3.5"></div>
                                                                 {activeAllocUser ? `派给 ${activeAllocUser.username}` : '点击选人'}
                                                             </div>
                                                         )}
                                                     </div>
                                                 );
                                             })}
                                         </div>
                                     </div>
                                 ) : (
                                     <div className="flex flex-col h-full">
                                         <div className="font-extrabold text-gray-900 text-xl mb-4 flex items-center border-b border-gray-100 pb-3 gap-3">
                                             <div className="w-10 h-10 rounded-xl flex items-center justify-center mr-3 bg-indigo-100 text-indigo-600">
                                                <div className="icon-layout-grid text-xl"></div>
                                             </div>
                                             全场馆视图 <span className="text-gray-400 font-medium text-base ml-2">/ 实抢补录</span>
                                         </div>
                                         <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                             {TIME_SLOTS.map(slot => {
                                                 const slotBookings = dateBookings.filter(b => b.type !== 'allocated' && window.timeUtils.checkTimeOverlap(b.timeSlot, slot));
                                                 
                                                 return (
                                                     <div 
                                                        key={slot}
                                                        onClick={() => handleSlotClick(slot, selectedRoom)}
                                                        className="bg-white border border-dashed border-gray-300 hover:border-solid hover:border-blue-400 rounded-xl p-3 transition-all duration-200 relative group flex flex-col min-h-[100px] cursor-pointer hover:shadow-md"
                                                     >
                                                         <div className="text-[11px] font-bold text-gray-500 mb-2 flex justify-between items-center tracking-wide border-b border-gray-100 pb-1.5">
                                                            {slot}
                                                            <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">{slotBookings.length} 记录</span>
                                                         </div>
                                                         
                                                         <div className="flex-1 flex flex-col relative z-20">
                                                             {slotBookings.length > 0 ? (
                                                                 <div className="flex flex-wrap gap-1 mt-1">
                                                                     {slotBookings.map(b => {
                                                                         return (
                                                                             <div key={b.id} className="group/badge flex items-center px-1.5 py-1 rounded text-[10px] font-bold border relative bg-green-50 text-green-700 border-green-200" onClick={e => e.stopPropagation()}>
                                                                                 <span className="opacity-70 mr-1 font-mono text-[9px]">RM{b.roomNumber}</span>
                                                                                 <span className="truncate max-w-[60px]">{b.userName}</span>
                                                                                 <div className="absolute -top-2 -right-2 opacity-0 group-hover/badge:opacity-100 flex gap-0.5 z-30 transition-all">
                                                                                     <button 
                                                                                        onClick={(e) => { e.stopPropagation(); handleEditBooking(b); }}
                                                                                        className="text-white bg-blue-500 rounded-full p-1 shadow-md hover:bg-blue-600 hover:scale-110"
                                                                                        title="修改房间"
                                                                                     >
                                                                                         <div className="icon-pencil w-2 h-2"></div>
                                                                                     </button>
                                                                                     <button 
                                                                                        onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                                                                                        className="text-white bg-red-500 rounded-full p-1 shadow-md hover:bg-red-600 hover:scale-110"
                                                                                        title="撤销记录"
                                                                                     >
                                                                                         <div className="icon-x w-2 h-2"></div>
                                                                                     </button>
                                                                                 </div>
                                                                             </div>
                                                                         )
                                                                     })}
                                                                 </div>
                                                             ) : (
                                                                 <div className="flex-1 flex items-center justify-center text-gray-300 text-[11px] font-medium">
                                                                     空
                                                                 </div>
                                                             )}
                                                         </div>

                                                         <div className="absolute bottom-2 right-2 pointer-events-none z-10">
                                                             <div className="text-[10px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 bg-white/90 backdrop-blur-sm rounded border border-blue-200 transition-all px-2 py-1 shadow-sm flex items-center translate-y-1 group-hover:translate-y-0">
                                                                 <div className="icon-plus mr-1 w-2.5 h-2.5"></div>
                                                                 {activeAllocUser ? `补录到 RM${selectedRoom}` : '请先选人'}
                                                             </div>
                                                         </div>
                                                     </div>
                                                 );
                                             })}
                                         </div>
                                     </div>
                                 )}
                             </div>
                        </div>

                        {/* Sidebar: AI Allocation & Users */}
                        <div className="w-full lg:w-[480px] bg-white rounded-3xl shadow-sm border border-gray-200 flex flex-col h-[600px] lg:h-auto order-1 lg:order-2 shrink-0 overflow-hidden">
                            {activeTab === 'smart' && (
                            <div className="p-4 border-b border-gray-100 bg-gradient-to-br from-purple-50 to-indigo-50 relative flex flex-col gap-3">
                                <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                                    <div className="icon-cpu text-4xl text-purple-700"></div>
                                </div>
                                <div className="flex items-center justify-between relative z-10">
                                    <h3 className="font-extrabold text-gray-900 text-base flex items-center">
                                        <div className="icon-wand-sparkles text-purple-600 mr-1.5"></div>
                                        AI 调度引擎
                                    </h3>
                                </div>
                                <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <input 
                                        type="text"
                                        value={aiTimeInput}
                                        onChange={e => setAiTimeInput(e.target.value)}
                                        placeholder="时间范围 (如: 12:00-18:00)"
                                        className="flex-1 px-3 py-2 text-xs border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none shadow-sm"
                                    />
                                    <button
                                        onClick={handleAutoAllocate}
                                        disabled={allocating}
                                        className="shrink-0 px-4 py-2 bg-gray-900 text-white rounded-lg font-bold shadow-md hover:bg-black transition-all flex justify-center items-center disabled:opacity-50 text-xs"
                                    >
                                        {allocating ? (
                                            <div className="icon-loader animate-spin mr-1.5"></div>
                                        ) : (
                                            <div className="icon-play w-3.5 h-3.5 mr-1.5"></div>
                                        )}
                                        生成排班
                                    </button>
                                </div>
                            </div>
                            )}
                            
                            <div className="flex-1 overflow-y-auto p-3 bg-white relative">
                                {activeTab === 'manual' && (
                                    <div className="mb-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between shadow-sm">
                                        <div className="flex items-center">
                                            <div className="icon-door-open text-indigo-500 mr-2 text-lg"></div>
                                            <span className="text-indigo-800 font-bold text-sm">补录目标房间</span>
                                        </div>
                                        <div className="flex items-center bg-white rounded-lg border border-indigo-200 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                                            <span className="px-2 text-gray-500 font-bold text-xs bg-gray-50 border-r border-indigo-100 h-full flex items-center">RM</span>
                                            <input 
                                                type="text" 
                                                value={manualRoom}
                                                onChange={e => setManualRoom(e.target.value)}
                                                placeholder="13"
                                                className="w-16 px-2 py-1.5 text-sm font-extrabold outline-none text-center text-indigo-700"
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-col gap-2 mb-3 px-1 sticky top-0 bg-white/90 backdrop-blur-sm py-2 z-10">
                                    <div className="flex justify-between items-center mt-1">
                                        <div className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">{activeTab === 'manual' ? '选择目标干员' : '干员资源池'}</div>
                                        {selectedAIUsers.length > 0 ? (
                                            <div className="text-[10px] text-purple-700 font-bold bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                                                圈选: {selectedAIUsers.length} 人
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-gray-400">全体空闲干员</div>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                            <div className="icon-search text-gray-400 w-3.5 h-3.5"></div>
                                        </div>
                                        <input 
                                            type="text"
                                            placeholder="搜索干员姓名或学号..."
                                            value={userSearchQuery}
                                            onChange={(e) => setUserSearchQuery(e.target.value)}
                                            className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <div className={`grid ${activeTab === 'manual' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-1.5' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-2'} pb-4`}>
                                    {[...allUsers].filter(u => u.username.toLowerCase().includes(userSearchQuery.toLowerCase()) || (u.studentId && u.studentId.includes(userSearchQuery))).sort((a, b) => {
                                        const hoursA = bookings.filter(bk => bk.userId === a.id && bk.date === filterDate && bk.status === 'active').length;
                                        const hoursB = bookings.filter(bk => bk.userId === b.id && bk.date === filterDate && bk.status === 'active').length;
                                        const maxedA = hoursA >= 2;
                                        const maxedB = hoursB >= 2;
                                        if (maxedA && !maxedB) return 1;
                                        if (!maxedA && maxedB) return -1;
                                        return a.username.localeCompare(b.username);
                                    }).map(u => {
                                        const status = userStatuses.find(s => s.userId === u.id && s.date === filterDate);
                                        let isPresent = true;
                                        let statusText = '需排班';
                                        
                                        // Compute how many hours they have today
                                        const userHours = bookings.filter(b => b.userId === u.id && b.date === filterDate && b.status === 'active').length;
                                        const maxedOut = userHours >= 2;

                                        if (status) {
                                            isPresent = status.status === 'present';
                                            statusText = isPresent ? '需排班(单日)' : '已请假(单日)';
                                        } else {
                                            const dayOfWeek = window.timeUtils.getDayOfWeek(filterDate);
                                            try {
                                                const dp = u.defaultPresence ? JSON.parse(u.defaultPresence) : null;
                                                if (dp && dp[dayOfWeek] !== undefined) {
                                                    isPresent = dp[dayOfWeek];
                                                }
                                            } catch(e) {}
                                            statusText = isPresent ? '需排班(默认)' : '已请假(默认)';
                                        }

                                        if (maxedOut) {
                                            isPresent = false;
                                            statusText = '已满额(2h)';
                                        }
                                        
                                        const isSelected = selectedAIUsers.includes(u.id);
                                        const pref = u.timePreference === 'early' ? '偏早' : u.timePreference === 'late' ? '偏晚' : '皆可';
                                        const isManual = activeTab === 'manual';

                                        return (
                                            <div 
                                                key={u.id}
                                                className={`border rounded-xl transition-all flex flex-col justify-between group 
                                                    ${activeAllocUser?.id === u.id ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-500/20' : 'border-gray-100 bg-white hover:border-blue-300 hover:shadow-sm'}
                                                    ${(!isPresent && !maxedOut) && activeAllocUser?.id !== u.id ? 'opacity-60 hover:opacity-100' : ''}
                                                    ${maxedOut ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'cursor-pointer'}
                                                    ${isManual ? 'p-2' : 'p-3'}
                                                `}
                                                onClick={() => {
                                                    if (maxedOut) {
                                                        alert('该干员今日已满额(2h)，不可再分配');
                                                        return;
                                                    }
                                                    setActiveAllocUser(u);
                                                }}
                                            >
                                                <div className={`flex items-start justify-between ${isManual ? '' : 'mb-2'}`}>
                                                    <div className="flex items-center gap-3 overflow-hidden w-full">
                                                        {!isManual && (
                                                            <div onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                if (maxedOut) {
                                                                    alert('该干员今日已满额(2h)，不可再分配');
                                                                    return;
                                                                }
                                                                toggleAIUser(u.id); 
                                                            }} className="shrink-0 flex items-center bg-white rounded-md p-0.5 border border-gray-200 shadow-sm">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={isSelected}
                                                                    onChange={() => {}} 
                                                                    disabled={maxedOut}
                                                                    className="cursor-pointer h-4 w-4 text-purple-600 rounded border-none focus:ring-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <span className="font-extrabold text-gray-900 text-sm truncate">{u.username}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono mt-0.5">#{u.studentId || '未知'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {!isManual && (
                                                    <>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            <span className={`text-[10px] px-2 py-1 rounded-md font-bold border ${isPresent ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                                                {statusText}
                                                            </span>
                                                            <span className="text-[10px] px-2 py-1 rounded-md font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                                偏好: {pref}
                                                            </span>
                                                        </div>
                                                        {renderUserSchedule(u.id)}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}


            </main>
            )}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<AdminApp />);