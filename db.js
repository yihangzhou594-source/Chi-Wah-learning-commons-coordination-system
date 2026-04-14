// Database utility functions wrapper
// Using internal Trickle DB APIs

// Global interceptor to prevent React/Trickle platform from showing red error toasts for network failures
const originalConsoleError = console.error;
console.error = (...args) => {
    const isNetworkError = args.some(a => {
        if (!a) return false;
        const str = a.message ? String(a.message) : String(a);
        return str.includes('Failed to fetch') || 
               str.includes('Network Error') || 
               str.includes("Unexpected token '<'") || 
               str.includes('is not valid JSON') ||
               str.includes('NoPermission');
    });
    
    if (isNetworkError) {
        console.warn('[Suppressed Network/Permission Error]', ...args);
        return;
    }
    originalConsoleError(...args);
};

const DB_TABLES = {
    USERS: 'users',
    BOOKINGS: 'bookings',
    SWAP_REQUESTS: 'swap_requests',
    NOTIFICATIONS: 'notifications',
    COURSES: 'courses',
    USER_DAILY_STATUSES: 'user_daily_statuses',
    APP_SETTINGS: 'app_settings',
    CHECKINS: 'checkins',
    ROOM_PRESENCES: 'room_presences'
};

const DB_INTERNAL_TIME_SLOTS = [];
for (let i = 8; i < 24; i++) {
    const start = i.toString().padStart(2, '0') + ':00';
    const end = (i + 1).toString().padStart(2, '0') + ':00';
    DB_INTERNAL_TIME_SLOTS.push(`${start}-${end}`);
}

// Global interceptor for unhandled fetch errors to prevent app crashes
window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason ? (event.reason.message || String(event.reason)) : '';
    if (msg.includes('Failed to fetch') || 
        msg.includes('Network Error') || 
        msg.includes("Unexpected token '<'") || 
        msg.includes('is not valid JSON') ||
        msg.includes('NoPermission')) {
        console.warn('[Global] Suppressed unhandled network/server/permission error:', event.reason);
        event.preventDefault(); // Suppress the default console error / overlay
    }
});

const withRetry = async (operation, retries = 3, delay = 1000) => {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const errMsg = error && error.message ? error.message : String(error);
            // Don't retry if it's a permission error
            if (errMsg.includes('NoPermission')) {
                throw error;
            }
            console.warn(`[DB] Operation failed, retrying (${i + 1}/${retries})...`, errMsg);
            if (i < retries - 1) {
                await new Promise(r => setTimeout(r, delay * (i + 1))); // exponential backoff
            }
        }
    }
    throw lastError;
};

// Helper to safely list objects without throwing (returns empty list on error)
const safeListObjects = async (table, limit, descent) => {
    try {
        const result = await withRetry(() => trickleListObjects(table, limit, descent, undefined), 3, 1000);
        const data = result || { items: [], nextPageToken: null };
        return { items: [...data.items], nextPageToken: data.nextPageToken };
    } catch (error) {
        let errMsg = error && error.message ? error.message : String(error);
        if (errMsg.includes('NoPermission')) {
            console.warn(`[DB] NoPermission to list ${table}. Treating as empty list.`, errMsg);
            return { items: [], nextPageToken: null };
        } else {
            console.warn(`[DB] Failed to list ${table}, throwing error to prevent data wipe.`, error);
            throw error;
        }
    }
};

// Helper to safely execute mutations
const safeDbCall = async (operation, ...args) => {
    try {
        const res = await withRetry(() => operation(...args), 3, 1000);
        return res;
    } catch (error) {
        let errMsg = error && error.message ? error.message : String(error);
        
        // Clean up nested "Error: Error: ..." strings
        errMsg = errMsg.replace(/^(Error:\s*)+/, '');
        
        if (errMsg.includes('Failed to fetch') || 
            errMsg.includes('Network Error') || 
            errMsg.includes("Unexpected token '<'") || 
            errMsg.includes('is not valid JSON') ||
            errMsg.includes('Load failed')) {
            console.warn(`[DB] Operation failed (Network/Server) after retries:`, errMsg);
            throw new Error(`服务器响应异常或网络连接较弱，请刷新重试`);
        }
        
        if (errMsg.includes('NoPermission')) {
            console.warn(`[DB] Permission denied:`, errMsg);
            throw new Error(`操作失败：当前无数据库访问权限 (NoPermission)。请确保您有相应的权限。`);
        }
        
        console.error(`[DB] Operation failed:`, error);
        throw new Error(errMsg);
    }
};

window.timeUtils = {
    getHKTNow: () => {
        const str = new Date().toLocaleString("en-US", {timeZone: "Asia/Hong_Kong"});
        return new Date(str);
    },
    getHKTDateString: (offsetDays = 0) => {
        const d = window.timeUtils.getHKTNow();
        d.setDate(d.getDate() + offsetDays);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    getDayOfWeek: (dateStr) => {
        const [y, m, d] = dateStr.split('-');
        const dateObj = new Date(y, m - 1, d);
        return dateObj.getDay() || 7;
    },
    offsetDateString: (dateStr, offsetDays) => {
        const [y, m, d] = dateStr.split('-');
        const dateObj = new Date(y, m - 1, d);
        dateObj.setDate(dateObj.getDate() + offsetDays);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    formatToHKT: (isoString, dateOnly = false) => {
        if (!isoString) return '';
        const opts = { timeZone: "Asia/Hong_Kong", hour12: false };
        if (dateOnly) {
            return new Date(isoString).toLocaleDateString("zh-CN", opts);
        }
        return new Date(isoString).toLocaleString("zh-CN", opts);
    },
    checkTimeOverlap: (slot1, slot2) => {
        if (!slot1 || !slot2) return false;
        if (slot1 === slot2) return true;
        
        const parseTimeRange = (str) => {
            const parts = str.split('-');
            if (parts.length !== 2) return null;
            const start = parseFloat(parts[0].replace(':', '.'));
            const end = parseFloat(parts[1].replace(':', '.'));
            if (isNaN(start) || isNaN(end)) return null;
            return { start, end };
        };

        const range1 = parseTimeRange(slot1);
        const range2 = parseTimeRange(slot2);
        
        if (!range1 || !range2) return false;
        return range1.start < range2.end && range2.start < range1.end;
    },
    checkStartTimeConflict: (busySlot, allocSlot) => {
        if (!busySlot || !allocSlot) return false;
        const busyParts = busySlot.split('-');
        const allocParts = allocSlot.split('-');
        if (busyParts.length !== 2 || allocParts.length !== 2) return false;
        
        const busyStart = busyParts[0].trim();
        const busyEnd = busyParts[1].trim();
        const allocStart = allocParts[0].trim();
        
        return allocStart >= busyStart && allocStart < busyEnd;
    }
};

const db = {
    groupBookings: (bookings) => {
        if (!bookings || !bookings.length) return [];
        
        const sorted = [...bookings].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.roomNumber !== b.roomNumber) return a.roomNumber.localeCompare(b.roomNumber);
            if (a.userId !== b.userId) return a.userId.localeCompare(b.userId);
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            if (a.status !== b.status) return a.status.localeCompare(b.status);
            
            const aSlot = a.timeSlot || '00:00-00:00';
            const bSlot = b.timeSlot || '00:00-00:00';
            const aStart = parseFloat((aSlot.split('-')[0] || '').replace(':', '.'));
            const bStart = parseFloat((bSlot.split('-')[0] || '').replace(':', '.'));
            return (isNaN(aStart) ? 0 : aStart) - (isNaN(bStart) ? 0 : bStart);
        });

        const grouped = [];
        let currentGroup = null;

        for (const b of sorted) {
            if (!currentGroup) {
                currentGroup = { ...b, originalIds: [b.id || b.objectId], originalSlots: [b.timeSlot] };
            } else {
                const isSameEntity = 
                    currentGroup.date === b.date &&
                    currentGroup.roomNumber === b.roomNumber &&
                    currentGroup.userId === b.userId &&
                    currentGroup.type === b.type &&
                    currentGroup.status === b.status;
                    
                if (isSameEntity) {
                    const currSlot = currentGroup.timeSlot || '00:00-00:00';
                    const bSlot = b.timeSlot || '00:00-00:00';
                    const currEnd = currSlot.split('-')[1];
                    const bStart = bSlot.split('-')[0];
                    
                    if (currEnd && bStart && currEnd === bStart) {
                        currentGroup.timeSlot = `${currSlot.split('-')[0]}-${bSlot.split('-')[1] || bSlot.split('-')[0]}`;
                        currentGroup.originalIds.push(b.id || b.objectId);
                        currentGroup.originalSlots.push(b.timeSlot);
                        currentGroup.id = currentGroup.originalIds.join(',');
                        currentGroup.objectId = currentGroup.id;
                    } else {
                        grouped.push(currentGroup);
                        currentGroup = { ...b, originalIds: [b.id || b.objectId], originalSlots: [b.timeSlot] };
                        currentGroup.id = currentGroup.originalIds.join(',');
                        currentGroup.objectId = currentGroup.id;
                    }
                } else {
                    grouped.push(currentGroup);
                    currentGroup = { ...b, originalIds: [b.id || b.objectId], originalSlots: [b.timeSlot] };
                    currentGroup.id = currentGroup.originalIds.join(',');
                    currentGroup.objectId = currentGroup.id;
                }
            }
        }
        if (currentGroup) {
            if (!currentGroup.id) {
                currentGroup.id = currentGroup.originalIds.join(',');
                currentGroup.objectId = currentGroup.id;
            }
            grouped.push(currentGroup);
        }
        return grouped;
    },

    // User operations
    createUser: async (userData) => {
        return safeDbCall(trickleCreateObject, DB_TABLES.USERS, userData);
    },
    
    getUserByUsername: async (username) => {
        try {
            const allUsers = await trickleListObjects(DB_TABLES.USERS, 1000, true, undefined);
            if (!allUsers || !allUsers.items) return undefined;
            return allUsers.items.find(u => u.objectData.username === username);
        } catch (e) {
            let errMsg = e && e.message ? e.message : String(e);
            errMsg = errMsg.replace(/^(Error:\s*)+/, '');
            
            if (errMsg.includes('NoPermission')) {
                console.warn("[DB] Failed to fetch user (NoPermission). Treating as non-existent user.", errMsg);
                return undefined;
            }
            
            console.warn("[DB] Failed to fetch user by username", errMsg);
            throw new Error(`网络请求失败，请检查网络连接`);
        }
    },

    getAllUsers: async () => {
        const result = await safeListObjects(DB_TABLES.USERS, 1000, true);
        return result.items.map(item => ({ ...item.objectData, id: item.objectId }));
    },
    
    updateUser: async (userId, data) => {
        return safeDbCall(trickleUpdateObject, DB_TABLES.USERS, userId, data);
    },

    // Booking operations
    createBooking: async (bookingData) => {
        return safeDbCall(trickleCreateObject, DB_TABLES.BOOKINGS, bookingData);
    },

    getBookings: async (limit = 1000) => {
        return await safeListObjects(DB_TABLES.BOOKINGS, limit, true);
    },

    updateBooking: async (bookingId, data) => {
        if (typeof bookingId === 'string' && bookingId.includes(',')) {
            const ids = bookingId.split(',');
            const promises = ids.map(id => safeDbCall(trickleUpdateObject, DB_TABLES.BOOKINGS, id, data));
            const res = await Promise.all(promises);
            return res[0];
        }
        return safeDbCall(trickleUpdateObject, DB_TABLES.BOOKINGS, bookingId, data);
    },

    deleteBooking: async (bookingId) => {
        if (typeof bookingId === 'string' && bookingId.includes(',')) {
            const ids = bookingId.split(',');
            const promises = ids.map(id => safeDbCall(trickleDeleteObject, DB_TABLES.BOOKINGS, id));
            await Promise.all(promises);
            return;
        }
        return safeDbCall(trickleDeleteObject, DB_TABLES.BOOKINGS, bookingId);
    },
    
    // Swap operations
    createSwapRequest: async (swapData) => {
        return safeDbCall(trickleCreateObject, DB_TABLES.SWAP_REQUESTS, swapData);
    },
    
    getSwapRequests: async (limit = 100) => {
        return await safeListObjects(DB_TABLES.SWAP_REQUESTS, limit, true);
    },

    updateSwapRequest: async (requestId, data) => {
        return safeDbCall(trickleUpdateObject, DB_TABLES.SWAP_REQUESTS, requestId, data);
    },

    // Notification operations
    createNotification: async (notifData) => {
        return safeDbCall(trickleCreateObject, DB_TABLES.NOTIFICATIONS, notifData);
    },

    getNotifications: async (limit = 100) => {
        return await safeListObjects(DB_TABLES.NOTIFICATIONS, limit, true);
    },

    updateNotification: async (notifId, data) => {
        return safeDbCall(trickleUpdateObject, DB_TABLES.NOTIFICATIONS, notifId, data);
    },

    // Course operations
    createCourse: async (courseData) => {
        return safeDbCall(trickleCreateObject, DB_TABLES.COURSES, courseData);
    },

    getCourses: async (limit = 1000) => {
        return await safeListObjects(DB_TABLES.COURSES, limit, true);
    },

    updateCourse: async (courseId, data) => {
        return safeDbCall(trickleUpdateObject, DB_TABLES.COURSES, courseId, data);
    },

    deleteCourse: async (courseId) => {
        return safeDbCall(trickleDeleteObject, DB_TABLES.COURSES, courseId);
    },

    // App Settings
    getSetting: async (key) => {
        const res = await safeListObjects(DB_TABLES.APP_SETTINGS, 100, true);
        const setting = res.items.find(s => s.objectData.settingKey === key);
        return setting ? { ...setting.objectData, id: setting.objectId } : null;
    },
    setSetting: async (key, value, description = '') => {
        const res = await safeListObjects(DB_TABLES.APP_SETTINGS, 100, true);
        const existing = res.items.find(s => s.objectData.settingKey === key);
        if (existing) {
            return safeDbCall(trickleUpdateObject, DB_TABLES.APP_SETTINGS, existing.objectId, { settingKey: key, settingValue: value, description });
        } else {
            return safeDbCall(trickleCreateObject, DB_TABLES.APP_SETTINGS, { settingKey: key, settingValue: value, description });
        }
    },
    
    setRoomPresence: async (userId, userName, roomNumber, status, reportedCount = 1) => {
        const all = await safeListObjects(DB_TABLES.ROOM_PRESENCES, 1000, true);
        const existing = all.items.find(i => i.objectData.userId === userId);
        const data = { userId, userName, roomNumber, status, reportedCount, updatedAt: new Date().toISOString() };
        if (existing) {
            return safeDbCall(trickleUpdateObject, DB_TABLES.ROOM_PRESENCES, existing.objectId, data);
        } else {
            return safeDbCall(trickleCreateObject, DB_TABLES.ROOM_PRESENCES, data);
        }
    },
    getRoomPresences: async () => {
        const result = await safeListObjects(DB_TABLES.ROOM_PRESENCES, 1000, true);
        return result.items.map(item => ({ ...item.objectData, id: item.objectId }));
    },

    createCheckIn: async (data) => {
        return safeDbCall(trickleCreateObject, DB_TABLES.CHECKINS, data);
    },
    getCheckIns: async (date) => {
        const result = await safeListObjects(DB_TABLES.CHECKINS, 1000, true);
        return result.items
            .filter(item => item.objectData.date === date)
            .map(item => ({ ...item.objectData, id: item.objectId }));
    },
    getUserCheckIns: async (userId) => {
        const result = await safeListObjects(DB_TABLES.CHECKINS, 1000, true);
        return result.items
            .filter(item => item.objectData.userId === userId)
            .map(item => ({ ...item.objectData, id: item.objectId }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    setUserStatus: async (userId, date, status) => {
        const allStatuses = await safeListObjects(DB_TABLES.USER_DAILY_STATUSES, 1000, true);
        const existing = allStatuses.items.find(s => s.objectData.userId === userId && s.objectData.date === date);
        
        if (existing) {
            return safeDbCall(trickleUpdateObject, DB_TABLES.USER_DAILY_STATUSES, existing.objectId, { status });
        } else {
            return safeDbCall(trickleCreateObject, DB_TABLES.USER_DAILY_STATUSES, { userId, date, status });
        }
    },

    getUserStatuses: async (date) => {
        const allStatuses = await safeListObjects(DB_TABLES.USER_DAILY_STATUSES, 1000, true);
        return allStatuses.items
            .filter(s => s.objectData.date === date)
            .map(s => ({ ...s.objectData, id: s.objectId }));
    },
    
    getAllUserStatuses: async (limit=2000) => {
        const result = await safeListObjects(DB_TABLES.USER_DAILY_STATUSES, limit, true);
        return result.items.map(s => ({ ...s.objectData, id: s.objectId }));
    },

    rejectAndReallocate: async (booking) => {
        try {
            const [usersRes, bookingsRes, coursesRes, statusesRes, swapHistoryRes] = await Promise.all([
                db.getAllUsers(),
                safeListObjects(DB_TABLES.BOOKINGS, 2000, true),
                safeListObjects(DB_TABLES.COURSES, 2000, true),
                safeListObjects(DB_TABLES.USER_DAILY_STATUSES, 2000, true),
                safeListObjects(DB_TABLES.SWAP_REQUESTS, 1000, true)
            ]);

            const allUsers = usersRes;
            const allBookings = bookingsRes.items.map(i => ({...i.objectData, id: i.objectId}));
            const allCourses = coursesRes.items.map(i => ({...i.objectData}));
            const userStatuses = statusesRes.items.map(i => i.objectData);
            const swapHistory = swapHistoryRes.items.map(i => i.objectData);

            const dayOfWeek = window.timeUtils.getDayOfWeek(booking.date);
            const groupedBookings = window.db.groupBookings(allBookings);
            const dateBookings = groupedBookings.filter(b => b.date === booking.date && b.status === 'active');
            const isEarlySlot = ['08','09','10','11','12','13','14','15','16','17'].some(h => booking.timeSlot.startsWith(h));

            const candidateIds = allUsers.filter(u => {
                if(u.id === booking.userId) return false;
                const status = userStatuses.find(s => s.userId === u.id && s.date === booking.date);
                let isPresent = true;
                if (status) {
                    isPresent = status.status === 'present';
                } else {
                    try {
                        const dp = u.defaultPresence ? JSON.parse(u.defaultPresence) : null;
                        if (dp && dp[dayOfWeek] !== undefined) isPresent = dp[dayOfWeek];
                    } catch(e) {}
                }
                if(!isPresent) return false;

                const hasBooking = dateBookings.some(b => b.userId === u.id && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, booking.timeSlot));
                if(hasBooking) return false;

                const userCourses = allCourses.filter(c => c.userId === u.id && Number(c.dayOfWeek) === Number(dayOfWeek));
                const hasConflict = userCourses.some(c => window.timeUtils.checkStartTimeConflict(`${c.startTime}-${c.endTime}`, booking.timeSlot));
                if(hasConflict) return false;

                return true;
            }).map(u => u.id);

            const getDynamicPrefScore = (uid) => {
                const userSwaps = swapHistory.filter(s => s.requesterId === uid && s.status === 'accepted');
                return userSwaps.length > 0 ? 0.5 : 0;
            };

            candidateIds.sort((a, b) => {
                const prefA = allUsers.find(u => u.id === a)?.timePreference || 'any';
                const prefB = allUsers.find(u => u.id === b)?.timePreference || 'any';
                let scoreA = (isEarlySlot ? (prefA==='early'?1000:prefA==='any'?500:-1000) : (prefA==='late'?1000:prefA==='any'?500:-1000)) + getDynamicPrefScore(a);
                let scoreB = (isEarlySlot ? (prefB==='early'?1000:prefB==='any'?500:-1000) : (prefB==='late'?1000:prefB==='any'?500:-1000)) + getDynamicPrefScore(b);
                return scoreB - scoreA;
            });

            if (candidateIds.length > 0) {
                const newUserId = candidateIds[0];
                const newUser = allUsers.find(u => u.id === newUserId);
                
                await db.createBooking({
                    userId: newUser.id,
                    userName: newUser.username,
                    date: booking.date,
                    timeSlot: booking.timeSlot,
                    roomNumber: booking.roomNumber,
                    status: 'active',
                    type: 'allocated'
                });
                await db.createNotification({
                    userId: newUser.id,
                    content: `[AI 自动替补] 由于原干员退出了排班，请于0点抢 ${booking.date} ${booking.roomNumber} 房间的 ${booking.timeSlot} 时间段。`,
                    isRead: false,
                    type: 'allocation',
                    createdAt: new Date().toISOString()
                });
            }
            
            await db.deleteBooking(booking.id);
            return true;
        } catch(e) {
            console.error('rejectAndReallocate error', e);
            throw e;
        }
    },

    // Extracted robust AI Auto Allocation Logic
    runAIAllocation: async (targetDate, targetRoom, timeRangesStr, specificUserIds = null) => {
        const ranges = timeRangesStr.split(',').map(s => s.trim());
        const allowedSlots = new Set();
        DB_INTERNAL_TIME_SLOTS.forEach(slot => {
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
                allPairs.push([slot1, slot2]);
            }
        }

        if (allPairs.length === 0) {
            throw new Error('输入的时间段内无法生成连续的2小时分配块');
        }

        const [usersRes, bookingsRes, coursesRes, statusesRes, swapsRes] = await Promise.all([
            db.getAllUsers(),
            safeListObjects(DB_TABLES.BOOKINGS, 2000, true),
            safeListObjects(DB_TABLES.COURSES, 2000, true),
            safeListObjects(DB_TABLES.USER_DAILY_STATUSES, 2000, true),
            safeListObjects(DB_TABLES.SWAP_REQUESTS, 1000, true)
        ]);

        const allUsers = usersRes;
        const allBookings = bookingsRes.items.map(b => ({ ...b.objectData, id: b.objectId }));
        const allCourses = coursesRes.items.map(c => ({ ...c.objectData }));
        const userStatuses = statusesRes.items.map(s => s.objectData);
        const swapHistory = swapsRes.items.map(s => s.objectData);
        const dateBookings = allBookings.filter(b => b.date === targetDate);

        const dayOfWeek = window.timeUtils.getDayOfWeek(targetDate);
        let userPoolIds = [];

        if (specificUserIds && specificUserIds.length > 0) {
            userPoolIds = [...specificUserIds];
        } else {
            userPoolIds = allUsers.filter(u => {
                const status = userStatuses.find(s => s.userId === u.id && s.date === targetDate);
                if (status) return status.status === 'present';
                try {
                    const dp = u.defaultPresence ? JSON.parse(u.defaultPresence) : null;
                    if (dp && dp[dayOfWeek] !== undefined) return dp[dayOfWeek];
                } catch(e) {}
                return true;
            }).map(u => u.id);
        }

        if (userPoolIds.length === 0) {
            throw new Error('没有可分配的用户');
        }

        const thirtyDaysAgoStr = window.timeUtils.getHKTDateString(-30);
        const userBookingCounts = {};
        let totalRecentBookings = 0;
        
        for (const b of allBookings) {
            if (b.status === 'active' && b.date >= thirtyDaysAgoStr) {
                userBookingCounts[b.userId] = (userBookingCounts[b.userId] || 0) + 1;
                totalRecentBookings++;
            }
        }

        const userTodayHours = {};
        const roomAssignedSlots = new Set();
        for (const b of dateBookings) {
            if (b.status === 'active') {
                userTodayHours[b.userId] = (userTodayHours[b.userId] || 0) + 1;
                if (b.roomNumber === targetRoom) {
                    roomAssignedSlots.add(b.timeSlot);
                }
            }
        }

        let allocatedCount = 0;

        for (const pair of allPairs) {
            if (roomAssignedSlots.has(pair[0]) || roomAssignedSlots.has(pair[1])) continue;

            const isEarlySlot = parseFloat(pair[0].split(':')[0]) < 18;

            const getDynamicPrefScore = (userId, targetIsEarly) => {
                const userSwaps = swapHistory.filter(s => s.requesterId === userId && s.status === 'accepted');
                return userSwaps.length > 0 ? 0.5 : 0;
            };

            const sortedCandidates = [...userPoolIds].sort((a, b) => {
                const prefA = allUsers.find(u => u.id === a)?.timePreference || 'any';
                const prefB = allUsers.find(u => u.id === b)?.timePreference || 'any';
                
                let scoreA = isEarlySlot ? (prefA === 'early' ? 1000 : prefA === 'any' ? 500 : -1000) : (prefA === 'late' ? 1000 : prefA === 'any' ? 500 : -1000);
                let scoreB = isEarlySlot ? (prefB === 'early' ? 1000 : prefB === 'any' ? 500 : -1000) : (prefB === 'late' ? 1000 : prefB === 'any' ? 500 : -1000);
                
                scoreA += getDynamicPrefScore(a, isEarlySlot);
                scoreB += getDynamicPrefScore(b, isEarlySlot);
                
                const ratioA = totalRecentBookings > 0 ? (userBookingCounts[a] || 0) / totalRecentBookings : 0;
                const ratioB = totalRecentBookings > 0 ? (userBookingCounts[b] || 0) / totalRecentBookings : 0;
                
                scoreA += Math.min(ratioA * 2000, 200); 
                scoreB += Math.min(ratioB * 2000, 200);
                
                return scoreB - scoreA;
            });

            let selectedUser = null;
            for (const userId of sortedCandidates) {
                if ((userTodayHours[userId] || 0) >= 2) continue;

                const hasBooking1 = dateBookings.some(b => b.userId === userId && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, pair[0]));
                const hasBooking2 = dateBookings.some(b => b.userId === userId && b.status === 'active' && window.timeUtils.checkTimeOverlap(b.timeSlot, pair[1]));
                if (hasBooking1 || hasBooking2) continue;

                const userCourses = allCourses.filter(c => c.userId === userId && Number(c.dayOfWeek) === Number(dayOfWeek));
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
                await db.createBooking({
                    userId: selectedUser.id,
                    userName: selectedUser.username,
                    date: targetDate,
                    timeSlot: pair[0],
                    roomNumber: targetRoom,
                    status: 'active',
                    type: 'allocated'
                });
                await db.createBooking({
                    userId: selectedUser.id,
                    userName: selectedUser.username,
                    date: targetDate,
                    timeSlot: pair[1],
                    roomNumber: targetRoom,
                    status: 'active',
                    type: 'allocated'
                });
                
                const mergedSlot = `${pair[0].split('-')[0]}-${pair[1].split('-')[1]}`;
                await db.createNotification({
                    userId: selectedUser.id,
                    content: `[系统分配] 请于0点抢 ${targetDate} ${targetRoom} 房间的 ${mergedSlot} 时间段`,
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
        return allocatedCount;
    },

    // Global Cron logic for Auto Allocation
    checkAutoCron: async () => {
        try {
            const configObj = await db.getSetting('auto_allocate_config');
            if (!configObj || !configObj.settingValue) return;
            
            let config;
            try { config = JSON.parse(configObj.settingValue); } catch(e) { return; }
            if (!config.enabled) return;

            const now = window.timeUtils.getHKTNow();
            const todayStr = window.timeUtils.getHKTDateString(0);
            
            // Check if it already ran today
            const lastRunObj = await db.getSetting('last_auto_allocate_date');
            if (lastRunObj && lastRunObj.settingValue === todayStr) return;

            // Check if current time is past executeTime
            if (config.executeTime) {
                const [execHour, execMin] = config.executeTime.split(':').map(Number);
                const execTimeDate = window.timeUtils.getHKTNow();
                execTimeDate.setHours(execHour, execMin, 0, 0);

                if (now >= execTimeDate) {
                    // Lock execution immediately
                    await db.setSetting('last_auto_allocate_date', todayStr, '最后自动分配执行日期');
                    
                    const targetDate = window.timeUtils.getHKTDateString(1); // Next day
                    console.log(`[Cron] Executing scheduled auto allocation for ${targetDate}`);
                    await db.runAIAllocation(targetDate, config.targetRoom, config.targetTimeRanges, null);
                }
            }
        } catch(e) {
            console.error("[Cron Error]", e);
        }
    }
};

window.db = db;
window.DB_TABLES = DB_TABLES;

// Start Cron interval (Checks every minute)
setInterval(() => {
    if (window.db && window.db.checkAutoCron) window.db.checkAutoCron();
}, 60000);
// Trigger a check shortly after load
setTimeout(() => {
    if (window.db && window.db.checkAutoCron) window.db.checkAutoCron();
}, 5000);