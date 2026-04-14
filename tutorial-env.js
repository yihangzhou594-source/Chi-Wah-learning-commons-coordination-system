window.isTutorialMode = localStorage.getItem('TUTORIAL_MODE') === 'true';

if (window.isTutorialMode) {
    console.log('[Tutorial Mode] Intercepting environment...');

    // Mock Time to trigger check-in visibility
    const mockDate = new Date('2026-04-07T23:55:00+08:00');
    window.timeUtils.getHKTNow = () => mockDate;
    window.timeUtils.getHKTDateString = (offsetDays = 0) => {
        const d = new Date(mockDate);
        d.setDate(d.getDate() + offsetDays);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const realDb = window.db;
    const getMockUser = () => window.auth.getCurrentUser() || { id: 'mock', username: '干员' };
    
    // Initialize mutable mock state for the tutorial session
    let mockCheckIns = [
        { userId: 'other-user', userName: '小明' }
    ];
    
    // Mutable mock bookings state
    let mockBookings = [];
    let bookingsInitialized = false;

    window.db = {
        ...realDb,
        getCheckIns: async (date) => {
            return [...mockCheckIns];
        },
        createCheckIn: async (data) => { 
            console.log('Mock checkin operation intercepted', data);
            const me = getMockUser();
            // Add user to mock check-ins so UI updates to "Checked In" status
            if (!mockCheckIns.find(c => c.userId === me.id)) {
                mockCheckIns.push({ userId: me.id, userName: me.username });
            }
        },
        createBooking: async (data) => {
            console.log('Mock createBooking intercepted', data);
            const newId = 'mock-new-' + Date.now();
            mockBookings.push({ objectId: newId, objectData: { ...data, id: newId } });
            return { objectId: newId, objectData: data };
        },
        deleteBooking: async (id) => {
            console.log('Mock deleteBooking intercepted', id);
            mockBookings = mockBookings.filter(b => b.objectId !== id && b.objectData.id !== id);
        },
        updateBooking: async (id, data) => {
            console.log('Mock updateBooking intercepted', id, data);
            const index = mockBookings.findIndex(b => b.objectId === id || b.objectData.id === id);
            if (index !== -1) {
                mockBookings[index].objectData = { ...mockBookings[index].objectData, ...data };
            }
        },
        getBookings: async (limit) => {
            const me = getMockUser();
            const today = '2026-04-07';
            const targetDate = '2026-04-08'; // Fixed to April 8th
            
            if (!bookingsInitialized) {
                mockBookings = [
                    // Allocations for Target Date (April 8th)
                    { objectId: 'mock-alloc-1', objectData: { userId: me.id, userName: me.username, date: targetDate, timeSlot: '14:00-16:00', roomNumber: '13', status: 'active', type: 'allocated', id: 'mock-alloc-1' } },
                    { objectId: 'mock-alloc-2', objectData: { userId: me.id, userName: me.username, date: targetDate, timeSlot: '18:00-20:00', roomNumber: '11', status: 'active', type: 'allocated', id: 'mock-alloc-2' } },
                    { objectId: 'mock-alloc-3', objectData: { userId: 'other-user', userName: '小明', date: targetDate, timeSlot: '10:00-12:00', roomNumber: '15', status: 'active', type: 'allocated', id: 'mock-alloc-3' } },
                    { objectId: 'mock-alloc-4', objectData: { userId: 'user-3', userName: '张三', date: targetDate, timeSlot: '08:00-10:00', roomNumber: '14', status: 'active', type: 'allocated', id: 'mock-alloc-4' } },
                    
                    // Self-reports (Simulating actual bookings by users)
                    // 小明 successfully snatched his own allocation
                    { objectId: 'mock-self-1', objectData: { userId: 'other-user', userName: '小明', date: targetDate, timeSlot: '10:00-12:00', roomNumber: '15', status: 'active', type: 'self-report', id: 'mock-self-1' } },
                    // 张三 snatched your room 13!
                    { objectId: 'mock-self-2', objectData: { userId: 'user-3', userName: '张三', date: targetDate, timeSlot: '14:00-16:00', roomNumber: '13', status: 'active', type: 'self-report', id: 'mock-self-2' } },
                    
                    // Today's timeline data so Dashboard looks alive
                    { objectId: 'mock-today-1', objectData: { userId: me.id, userName: me.username, date: today, timeSlot: '20:00-22:00', roomNumber: '13', status: 'active', type: 'self-report', note: '留卡', id: 'mock-today-1' } },
                    { objectId: 'mock-today-2', objectData: { userId: 'other-user', userName: '小明', date: today, timeSlot: '23:00-24:00', roomNumber: '15', status: 'active', type: 'self-report', id: 'mock-today-2' } }
                ];
                bookingsInitialized = true;
            }
            
            return {
                items: [...mockBookings]
            };
        },
        getAllUsers: async () => {
            const me = getMockUser();
            return [
                me, 
                { id: 'other-user', username: '小明', studentId: '30301111' },
                { id: 'user-3', username: '张三', studentId: '30302222' }
            ];
        },
        rejectAndReallocate: async (booking) => { 
            console.log('Mock reject', booking); 
            mockBookings = mockBookings.filter(b => b.objectId !== booking.id && b.objectData.id !== booking.id);
            return true;
        },
        createSwapRequest: async () => { console.log('Mock swap request'); },
        getSwapRequests: async () => ({ items: [] }),
        getCourses: realDb.getCourses, // Allow reading real courses
        createCourse: realDb.createCourse, // Allow writing real courses
        updateCourse: realDb.updateCourse,
        deleteCourse: realDb.deleteCourse,
        updateUser: async (id, data) => { console.log('Mock updateUser'); return { objectId: id, objectData: data }; },
    };
}
