const { useState, useEffect } = React;

const TIME_SLOTS = [];
for (let i = 8; i < 24; i++) {
    const start = i.toString().padStart(2, '0') + ':00';
    const end = (i + 1).toString().padStart(2, '0') + ':00';
    TIME_SLOTS.push(`${start}-${end}`);
}

const ROOM_OPTIONS = Array.from({ length: 19 }, (_, i) => (i + 1).toString());

function SubmitApp() {
    const [user, setUser] = useState(null);
    const [selectedDate, setSelectedDate] = useState(() => window.isTutorialMode ? '2026-04-08' : window.timeUtils.getHKTDateString(1));
    const [selectedSlots, setSelectedSlots] = useState([]);
    const [roomNumber, setRoomNumber] = useState('13');
    const [initialLoading, setInitialLoading] = useState(true);
    const [customSlot, setCustomSlot] = useState('');
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [showAllHistory, setShowAllHistory] = useState(false);
    const [allocatedPending, setAllocatedPending] = useState([]);
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    
    // Edit modal state
    const [editingItem, setEditingItem] = useState(null);
    
    // Limit warning modal state
    const [limitWarningData, setLimitWarningData] = useState(null);
    const [editForm, setEditForm] = useState({ roomNumber: '', timeSlot: '', note: '' });
    const [currentTime, setCurrentTime] = useState(window.timeUtils.getHKTNow());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(window.timeUtils.getHKTNow()), 30000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const currentUser = window.auth.requireAuth();
        if (currentUser) {
            setUser(currentUser);
            fetchData(currentUser.id, selectedDate);
        }
    }, [selectedDate]);

    const fetchData = async (userId, targetDate) => {
        try {
            const result = await window.db.getBookings(1000);
            const allUserBookings = result.items
                .map(item => ({ ...item.objectData, id: item.objectId }))
                .filter(b => b.userId === userId && b.status === 'active');

            // Find history (self-report) - Get all records, sorted by newest first
            const groupedBookings = window.db.groupBookings(allUserBookings);
            const selfReported = groupedBookings
                .filter(b => b.type === 'self-report')
                .sort((a, b) => new Date(b.date) - new Date(a.date));
            setHistory(selfReported);

            // Find allocated for specific date that haven't been confirmed
            const allocatedForDate = groupedBookings.filter(b => b.type === 'allocated' && b.date === targetDate);
            
            const pendingConfirm = allocatedForDate.filter(alloc => {
                // Check if there's a corresponding self-report for exact date and timeslot (or overlap)
                const confirmed = selfReported.some(self => self.date === alloc.date && self.roomNumber === alloc.roomNumber && window.timeUtils.checkTimeOverlap(self.timeSlot, alloc.timeSlot));
                return !confirmed;
            });

            setAllocatedPending(pendingConfirm);

        } catch (error) {
            console.warn("Fetch data failed", error);
        } finally {
            setInitialLoading(false);
        }
    };

    const toggleSlot = (slot) => {
        if (selectedSlots.includes(slot)) {
            setSelectedSlots(selectedSlots.filter(s => s !== slot));
        } else {
            setSelectedSlots([...selectedSlots, slot]);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('确定要撤销这条记录吗？')) return;
        setLoading(true);
        try {
            await window.db.deleteBooking(id);
            setFeedback({ type: 'success', message: '记录已撤销' });
            fetchData(user.id, selectedDate);
            setTimeout(() => setFeedback({ type: '', message: '' }), 3000);
        } catch (error) {
            setFeedback({ type: 'error', message: '撤销失败' });
        } finally {
            setLoading(false);
        }
    };

    const openEdit = (item) => {
        setEditingItem(item);
        setEditForm({ roomNumber: item.roomNumber, timeSlot: item.timeSlot, note: item.note || '' });
    };

    const handleUpdate = async () => {
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
            
            setFeedback({ type: 'success', message: '修改成功' });
            setEditingItem(null);
            fetchData(user.id, selectedDate);
            setTimeout(() => setFeedback({ type: '', message: '' }), 3000);
        } catch (error) {
            alert('修改失败');
        } finally {
            setLoading(false);
        }
    };

    const handleQuickConfirm = async () => {
        if (allocatedPending.length === 0) return;
        setLoading(true);
        try {
            const newBookings = [];
            allocatedPending.forEach(alloc => {
                if (alloc.originalSlots) {
                    alloc.originalSlots.forEach(slot => {
                        newBookings.push({
                            userId: user.id,
                            userName: user.username,
                            date: alloc.date,
                            timeSlot: slot,
                            roomNumber: alloc.roomNumber,
                            status: 'active',
                            type: 'self-report',
                            note: note
                        });
                    });
                } else {
                    newBookings.push({
                        userId: user.id,
                        userName: user.username,
                        date: alloc.date,
                        timeSlot: alloc.timeSlot,
                        roomNumber: alloc.roomNumber,
                        status: 'active',
                        type: 'self-report',
                        note: note
                    });
                }
            });

            const promises = newBookings.map(b => window.db.createBooking(b));
            await Promise.all(promises);

            try {
                const prefs = user.notificationPrefs ? JSON.parse(user.notificationPrefs) : {};
                if (prefs.calendar && window.calendarUtils) {
                    window.calendarUtils.downloadICS(newBookings);
                }
            } catch(e) {
                console.warn("Calendar generation failed", e);
            }

            setFeedback({ type: 'success', message: '一键确认填报成功！' });
            fetchData(user.id, selectedDate);
            setTimeout(() => setFeedback({ type: '', message: '' }), 3000);
        } catch (error) {
            setFeedback({ type: 'error', message: '确认失败，请重试' });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (selectedSlots.length === 0 && !customSlot) {
            setFeedback({ type: 'error', message: '请至少选择一个时间段或输入自定义时间段' });
            return;
        }

        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            const slotsToSubmit = [...selectedSlots];
            if (customSlot) {
                slotsToSubmit.push(customSlot);
            }

            const allB = await window.db.getBookings(2000);
            const allItems = allB.items.map(i => ({ ...i.objectData, id: i.objectId }));

            // 检查 2 小时跨房间总额度限制
            const userTodayBookings = allItems.filter(b => b.userId === user.id && b.date === selectedDate && b.status === 'active');
            const uniqueSlots = new Set(userTodayBookings.map(b => b.timeSlot));
            slotsToSubmit.forEach(s => uniqueSlots.add(s));
            if (uniqueSlots.size > 2) {
                setLimitWarningData({
                    date: selectedDate,
                    existingBookings: userTodayBookings,
                    attemptingSlots: slotsToSubmit
                });
                setLoading(false);
                return;
            }

            for (const slot of slotsToSubmit) {
                const dup = allItems.find(b => b.userId === user.id && b.date === selectedDate && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, slot) && b.type === 'self-report');
                if (dup) {
                    throw new Error(`您在 ${slot} 已经提交过填报记录，不可重复提交`);
                }
            }

            const newBookings = slotsToSubmit.map(slot => ({
                userId: user.id,
                userName: user.username,
                date: selectedDate,
                timeSlot: slot,
                roomNumber: roomNumber,
                status: 'active',
                type: 'self-report',
                note: note
            }));

            const promises = newBookings.map(b => window.db.createBooking(b));
            await Promise.all(promises);

            try {
                const prefs = user.notificationPrefs ? JSON.parse(user.notificationPrefs) : {};
                if (prefs.calendar && window.calendarUtils) {
                    window.calendarUtils.downloadICS(newBookings);
                }
            } catch(e) {
                console.warn("Calendar generation failed", e);
            }

            setFeedback({ type: 'success', message: '填报成功！' });
            setSelectedSlots([]);
            setCustomSlot('');
            fetchData(user.id, selectedDate);
            
            setTimeout(() => setFeedback({ type: '', message: '' }), 3000);

        } catch (error) {
            console.warn(error);
            setFeedback({ type: 'error', message: '提交失败，请重试' });
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <window.Header />
            
            {/* Limit Warning Modal */}
            {limitWarningData && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 animate-fade-in">
                        <h3 className="text-lg font-bold text-red-600 mb-2 flex items-center">
                            <div className="icon-triangle-alert mr-2 text-xl"></div>
                            超出每日填报额度
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                            系统限制每人每天最多只能填报 <strong>2小时</strong> 的资源。您本次试图提交 <strong>{limitWarningData.attemptingSlots.length}</strong> 个时段，加上已有的记录，将超过总额度限制。
                        </p>
                        
                        {limitWarningData.existingBookings.length > 0 && (
                            <div className="mb-4">
                                <p className="text-xs font-bold text-gray-500 mb-2">您在 {limitWarningData.date} 的已有记录：</p>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                    {limitWarningData.existingBookings.map(b => (
                                        <div key={b.id} className="flex justify-between items-center bg-red-50/50 p-2.5 rounded-lg border border-red-100">
                                            <div className="text-sm text-gray-700">
                                                <span className="font-bold bg-white border border-gray-200 px-1.5 py-0.5 rounded text-xs mr-2">RM{b.roomNumber}</span> 
                                                {b.timeSlot}
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    setLimitWarningData(null);
                                                    handleDelete(b.id);
                                                }} 
                                                className="text-red-600 hover:text-red-800 text-xs px-2.5 py-1.5 bg-red-100 hover:bg-red-200 rounded font-bold transition-colors"
                                            >
                                                撤销
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        <div className="mt-6 flex justify-end">
                            <button 
                                onClick={() => setLimitWarningData(null)}
                                className="px-5 py-2 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                我知道了，返回修改
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingItem && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                            <div className="icon-pencil mr-2 text-blue-600"></div>
                            修改记录 ({editingItem.date})
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">房间号</label>
                                <select 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                                    value={editForm.roomNumber}
                                    onChange={(e) => setEditForm({...editForm, roomNumber: e.target.value})}
                                >
                                    {ROOM_OPTIONS.map(room => (
                                        <option key={room} value={room}>RM {room}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">时间段</label>
                                <input 
                                    type="text"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                                    value={editForm.timeSlot}
                                    onChange={(e) => setEditForm({...editForm, timeSlot: e.target.value})}
                                    placeholder="例如: 12:00-14:00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                                <select 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                                    value={editForm.note}
                                    onChange={(e) => setEditForm({...editForm, note: e.target.value})}
                                >
                                    <option value="">无特殊情况</option>
                                    <option value="留卡">留卡</option>
                                    <option value="拍码">拍码</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end space-x-3">
                            <button 
                                onClick={() => setEditingItem(null)}
                                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md"
                            >
                                取消
                            </button>
                            <button 
                                onClick={handleUpdate}
                                disabled={loading}
                                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 flex items-center"
                            >
                                {loading && <div className="icon-loader animate-spin mr-2"></div>}
                                保存修改
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {initialLoading ? <window.LoadingSkeleton /> : (
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 animate-fade-in">
                <div className="mb-4 md:mb-8 flex flex-col md:flex-row md:items-end justify-between border-b border-gray-200 pb-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 flex items-center">
                            <div className="icon-calendar-plus text-blue-600 mr-3"></div>
                            填报预约结果
                        </h1>
                        <p className="text-sm text-gray-500 mt-2">将您抢到的房间和时段录入系统，以供协调和交换</p>
                    </div>
                    <div className="mt-2 md:mt-0 text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center shadow-sm">
                        <div className="icon-clock mr-1.5"></div>
                        {currentTime.toLocaleDateString('zh-CN')} {currentTime.toLocaleTimeString('zh-CN', {hour12: false})}
                    </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -mr-10 -mt-10 opacity-50 pointer-events-none"></div>
                            
                            {/* Quick Confirm Banner */}
                            {allocatedPending.length > 0 && (
                                <div className="mb-8 p-5 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 shadow-sm relative overflow-hidden">
                                    <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-purple-100 to-transparent opacity-50"></div>
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center relative z-10 gap-4">
                                        <div>
                                            <h4 className="font-bold text-purple-900 flex items-center text-base">
                                                <div className="icon-wand-sparkles mr-2 text-purple-600"></div>
                                                发现系统分配建议
                                            </h4>
                                            <div className="text-sm text-purple-800 mt-2 font-medium">
                                                {allocatedPending.map((a, index) => (
                                                    <span key={`${a.id}-${index}`} className="inline-block mr-2 mb-1 bg-white border border-purple-200 px-2.5 py-1 rounded shadow-sm">
                                                        RM{a.roomNumber} <span className="text-gray-500 font-normal">({a.timeSlot})</span>
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-xs text-purple-600 mt-2 opacity-80">如果你成功预约了这些时段，点击右侧按钮可直接录入。</p>
                                        </div>
                                        <button 
                                            data-tutorial="submit-btn"
                                            onClick={handleQuickConfirm}
                                            disabled={loading}
                                            className="w-full md:w-auto px-5 py-2.5 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 shadow-md transition-colors flex items-center justify-center shrink-0"
                                        >
                                            {loading ? <div className="icon-loader animate-spin mr-2"></div> : <div className="icon-check-check mr-2"></div>}
                                            一键确认
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative z-10">
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center">
                                        <div className="icon-calendar text-gray-400 mr-1.5"></div>选择日期
                                    </label>
                                    <input 
                                        type="date" 
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all"
                                    />
                                </div>

                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center">
                                        <div className="icon-door-open text-gray-400 mr-1.5"></div>房间号
                                    </label>
                                    <div className="flex space-x-2">
                                        <select 
                                            value={roomNumber} 
                                            onChange={(e) => setRoomNumber(e.target.value)}
                                            className="w-1/2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all"
                                        >
                                            {ROOM_OPTIONS.map(room => (
                                                <option key={room} value={room}>RM {room}</option>
                                            ))}
                                        </select>
                                        <input 
                                            type="text" 
                                            value={roomNumber}
                                            onChange={(e) => setRoomNumber(e.target.value)}
                                            placeholder="手动输入"
                                            className="w-1/2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mb-8 relative z-10">
                                <div className="flex justify-between items-end mb-3">
                                    <label className="block text-sm font-bold text-gray-700 flex items-center">
                                        <div className="icon-clock-4 text-gray-400 mr-1.5"></div>选择时间段
                                        <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded">支持多选</span>
                                    </label>
                                    {selectedSlots.length > 0 && (
                                        <span className="text-xs font-bold text-blue-600">已选 {selectedSlots.length} 个时段</span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                    {TIME_SLOTS.map(slot => {
                                        const isSelected = selectedSlots.includes(slot);
                                        return (
                                            <button
                                                key={slot}
                                                onClick={() => toggleSlot(slot)}
                                                className={`py-2 px-1 text-sm rounded-lg transition-all flex items-center justify-center font-medium border ${
                                                    isSelected
                                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-[1.02]'
                                                        : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 hover:shadow-sm'
                                                }`}
                                            >
                                                {isSelected && <div className="icon-check w-4 h-4 mr-1"></div>}
                                                {slot}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative z-10">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center">
                                        <div className="icon-pencil-line text-gray-400 mr-1.5"></div>自定义时间段 <span className="text-xs font-normal text-gray-400 ml-1">(选填)</span>
                                    </label>
                                    <input 
                                        type="text" 
                                        value={customSlot}
                                        onChange={(e) => setCustomSlot(e.target.value)}
                                        placeholder="例如: 12:30-14:00"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center">
                                        <div className="icon-message-square-text text-gray-400 mr-1.5"></div>特殊情况备注 <span className="text-xs font-normal text-gray-400 ml-1">(选填)</span>
                                    </label>
                                    <select 
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all"
                                    >
                                        <option value="">本人在场 (无特殊情况)</option>
                                        <option value="留卡">需留卡</option>
                                        <option value="拍码">需拍码</option>
                                    </select>
                                </div>
                            </div>

                            {feedback.message && (
                                <div className={`mb-6 p-4 rounded-xl border flex items-start shadow-sm transition-all relative z-10 ${
                                    feedback.type === 'success' 
                                    ? 'bg-green-50 border-green-200 text-green-800' 
                                    : 'bg-red-50 border-red-200 text-red-800'
                                }`}>
                                    <div className={`mr-3 mt-0.5 ${feedback.type === 'success' ? 'icon-circle-check text-green-500' : 'icon-circle-x text-red-500'} text-xl`}></div>
                                    <div className="font-medium text-sm pt-0.5">{feedback.message}</div>
                                </div>
                            )}

                            <button
                                data-tutorial="submit-btn"
                                onClick={handleSubmit}
                                disabled={loading}
                                className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-base font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all relative z-10 hover:-translate-y-0.5"
                            >
                                {loading ? (
                                    <><div className="icon-loader animate-spin mr-2 text-xl"></div>提交中...</>
                                ) : (
                                    <><div className="icon-send text-xl mr-2"></div>提交预约结果</>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="lg:col-span-1">
                        <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-100 h-full flex flex-col">
                            <div className="flex justify-between items-center mb-6 pb-3 border-b border-gray-100">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                                    <div className="icon-history mr-2 text-blue-500"></div>
                                    我的填报记录
                                </h3>
                                <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-full">{history.length} 条</span>
                            </div>
                            
                            {(() => {
                                const todayStr = window.timeUtils.getHKTDateString(0);
                                const defaultDisplayed = history.filter(b => b.date >= todayStr);
                                const displayedHistory = showAllHistory ? history : defaultDisplayed;
                                const pastCount = history.length - defaultDisplayed.length;
                                
                                return (
                                    <div className="space-y-3 max-h-[600px] overflow-y-auto flex-1 pr-1 custom-scrollbar pb-4">
                                        {history.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                                                <div className="icon-inbox text-4xl mb-3 opacity-50"></div>
                                                <p className="text-sm font-medium">暂无提交记录</p>
                                            </div>
                                        ) : (
                                            <>
                                                {displayedHistory.length === 0 && !showAllHistory && (
                                                    <div className="text-center py-6 text-gray-500 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">今日及未来暂无记录</div>
                                                )}
                                                
                                                {displayedHistory.map((item, index) => (
                                                    <div key={`${item.id}-${index}`} className={`p-4 bg-white rounded-xl border shadow-sm relative group transition-all hover:border-blue-400 hover:shadow-md ${item.date < todayStr ? 'border-gray-100 opacity-60 hover:opacity-100' : 'border-gray-200'}`}>
                                                        <div className={`absolute top-0 left-0 w-1 h-full rounded-l-xl ${item.date < todayStr ? 'bg-gray-300' : 'bg-blue-500'}`}></div>
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div className="font-bold text-gray-900 text-sm tracking-tight">{item.date}</div>
                                                            <div className={`text-xs font-bold px-2 py-0.5 rounded border ${item.date < todayStr ? 'bg-gray-50 text-gray-600 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                                                RM {item.roomNumber}
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <div className="text-gray-700 text-sm font-medium flex items-center">
                                                                <div className="icon-clock text-gray-400 w-3.5 h-3.5 mr-1.5"></div>
                                                                {item.timeSlot}
                                                                {item.note && <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-yellow-100 text-yellow-800 rounded font-bold border border-yellow-200">{item.note}</span>}
                                                            </div>
                                                            <div className="flex space-x-1.5">
                                                                <button onClick={() => openEdit(item)} className="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition-colors" title="修改">
                                                                    <div className="icon-pencil w-4 h-4"></div>
                                                                </button>
                                                                <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded transition-colors" title="撤销">
                                                                    <div className="icon-trash-2 w-4 h-4"></div>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                {pastCount > 0 && !showAllHistory && (
                                                    <button 
                                                        onClick={() => setShowAllHistory(true)}
                                                        className="w-full py-2.5 mt-2 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-xs font-bold rounded-xl border border-dashed border-gray-200 transition-colors flex items-center justify-center"
                                                    >
                                                        <div className="icon-chevron-down w-4 h-4 mr-1"></div>
                                                        展开 {pastCount} 条历史记录
                                                    </button>
                                                )}

                                                {showAllHistory && pastCount > 0 && (
                                                    <button 
                                                        onClick={() => setShowAllHistory(false)}
                                                        className="w-full py-2.5 mt-2 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-xs font-bold rounded-xl border border-gray-200 transition-colors flex items-center justify-center"
                                                    >
                                                        <div className="icon-chevron-up w-4 h-4 mr-1"></div>
                                                        收起历史记录
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </main>
            )}
        </div>
    );
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<SubmitApp />);