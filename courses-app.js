const { useState, useEffect } = React;

const DAYS = [
    { id: 1, name: '周一', shortName: 'Mon' },
    { id: 2, name: '周二', shortName: 'Tue' },
    { id: 3, name: '周三', shortName: 'Wed' },
    { id: 4, name: '周四', shortName: 'Thu' },
    { id: 5, name: '周五', shortName: 'Fri' },
    { id: 6, name: '周六', shortName: 'Sat' },
    { id: 7, name: '周日', shortName: 'Sun' },
];

function CoursesApp() {
    const [user, setUser] = useState(null);
    const [courses, setCourses] = useState([]);
    const [activeTab, setActiveTab] = useState('public');
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [selectedUserFilters, setSelectedUserFilters] = useState([]);
    const [showWeekends, setShowWeekends] = useState(false);
    
    // Form state for adding course
    const [newCourse, setNewCourse] = useState({
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '09:50',
        courseName: '',
        location: ''
    });

    const [editingCourse, setEditingCourse] = useState(null);
    const [editForm, setEditForm] = useState({ dayOfWeek: 1, startTime: '', endTime: '', courseName: '', location: '' });
    const [semesters, setSemesters] = useState([]);

    useEffect(() => {
        const currentUser = window.auth.requireAuth();
        if (currentUser) {
            setUser(currentUser);
            setSelectedUserFilters([currentUser.id]);
            loadData(currentUser.id);
        }
    }, []);

    const loadData = async (userId) => {
        setLoading(true);
        try {
            const [coursesRes, usersRes, settingSemestersObj] = await Promise.all([
                window.db.getCourses(2000),
                window.db.getAllUsers(),
                window.db.getSetting('semesters_list')
            ]);
            
            let sems = [];
            if (settingSemestersObj && settingSemestersObj.settingValue) {
                try {
                    sems = JSON.parse(settingSemestersObj.settingValue);
                    sems.sort((a,b) => new Date(a.endDate) - new Date(b.endDate));
                    setSemesters(sems);
                } catch(e) {}
            }

            const coursesData = coursesRes.items.map(c => ({ ...c.objectData, id: c.objectId, createdAt: c.createdAt }));
            setCourses(coursesData);
            setUsers(usersRes);
        } catch (error) {
            console.warn("Failed to load data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddCourse = async (e) => {
        e.preventDefault();
        try {
            await window.db.createCourse({
                userId: user.id,
                username: user.username,
                courseName: newCourse.courseName,
                location: newCourse.location,
                isPublic: true,
                dayOfWeek: newCourse.dayOfWeek,
                startTime: newCourse.startTime,
                endTime: newCourse.endTime
            });
            alert('时间段添加成功');
            loadData(user.id);
            
            // Smart next time calculation
            let sHour = parseInt(newCourse.endTime.split(':')[0]);
            let sMin = parseInt(newCourse.endTime.split(':')[1]) + 10;
            if (sMin >= 60) { sHour += 1; sMin -= 60; }
            if (sHour >= 24) sHour = 23;
            
            let eHour = sHour;
            let eMin = sMin + 50;
            if (eMin >= 60) { eHour += 1; eMin -= 60; }
            if (eHour >= 24) eHour = 23;
            
            const pad = n => n.toString().padStart(2, '0');
            const nextStart = `${pad(sHour)}:${pad(sMin)}`;
            const nextEnd = `${pad(eHour)}:${pad(eMin)}`;

            setNewCourse({
                ...newCourse,
                startTime: nextStart,
                endTime: nextEnd,
                courseName: '',
                location: ''
            });
        } catch (error) {
            alert('添加失败');
        }
    };

    const openEdit = (course) => {
        setEditingCourse(course);
        setEditForm({
            dayOfWeek: course.dayOfWeek,
            startTime: course.startTime,
            endTime: course.endTime,
            courseName: course.courseName || '',
            location: course.location || ''
        });
    };

    const handleUpdateCourse = async (e) => {
        e.preventDefault();
        try {
            await window.db.updateCourse(editingCourse.id, editForm);
            setEditingCourse(null);
            loadData(user.id);
        } catch (error) {
            alert('修改失败');
        }
    };

    const handleDeleteCourse = async (courseId) => {
        if(!confirm('确定删除?')) return;
        try {
            await window.db.deleteCourse(courseId);
            loadData(user.id);
        } catch (error) {
            alert('删除失败');
        }
    };

    const validCourses = courses.filter(c => {
        const courseDate = new Date(c.createdAt);
        const now = window.timeUtils.getHKTNow();
        
        const targetSemester = semesters.find(s => courseDate <= new Date(s.endDate + "T23:59:59"));
        if (targetSemester) {
            if (now > new Date(targetSemester.endDate + "T23:59:59")) {
                return false;
            }
        }

        const courseOwner = users.find(u => u.id === c.userId);
        const ownerIsPublic = courseOwner ? courseOwner.isSchedulePublic !== false : true;
        
        if (!ownerIsPublic && c.userId !== user?.id) return false;
        return true;
    });

    const filteredCourses = validCourses.filter(c => {
        if (selectedUserFilters.length > 0 && !selectedUserFilters.includes(c.userId)) return false;
        return true;
    });

    const visibleUsers = users.filter(u => {
        // Only show users who have at least one valid/public course
        return validCourses.some(c => c.userId === u.id);
    });

    const toggleUserFilter = (uid) => {
        if (selectedUserFilters.includes(uid)) {
            setSelectedUserFilters(selectedUserFilters.filter(id => id !== uid));
        } else {
            setSelectedUserFilters([...selectedUserFilters, uid]);
        }
    };

    const getCoursesByDay = (dayId, courseList) => {
        return courseList
            .filter(c => c.dayOfWeek === parseInt(dayId))
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <window.Header />
            {loading ? <window.LoadingSkeleton /> : (
            <>
            {editingCourse && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                            <div className="icon-pencil mr-2 text-blue-600"></div>
                            修改课表时间段
                        </h3>
                        <form onSubmit={handleUpdateCourse} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">星期</label>
                                <select 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    value={editForm.dayOfWeek}
                                    onChange={e => setEditForm({...editForm, dayOfWeek: parseInt(e.target.value)})}
                                >
                                    {DAYS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">开始时间</label>
                                    <input required type="time" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" value={editForm.startTime} onChange={e => setEditForm({...editForm, startTime: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">结束时间</label>
                                    <input required type="time" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" value={editForm.endTime} onChange={e => setEditForm({...editForm, endTime: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">课程名称/事务</label>
                                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm" value={editForm.courseName} onChange={e => setEditForm({...editForm, courseName: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">地点</label>
                                <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} />
                            </div>
                            <div className="mt-6 flex justify-end space-x-3">
                                <button type="button" onClick={() => setEditingCourse(null)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md">取消</button>
                                <button type="submit" className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md">保存修改</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 animate-fade-in">
                {semesters.length > 0 && (() => {
                    const now = window.timeUtils.getHKTNow();
                    const activeSemester = semesters.find(s => now <= new Date(s.endDate + "T23:59:59") && now >= new Date(s.startDate + "T00:00:00"));
                    return (
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg shadow-sm">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <div className="icon-info text-blue-500 mt-0.5"></div>
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-bold text-blue-800">
                                        {activeSemester ? `当前为 ${activeSemester.name} 学期课表模式` : '当前处于学期间隔或假期模式'}
                                    </h3>
                                    <p className="text-sm text-blue-700 mt-1">
                                        系统根据管理员设置的多学期时间段自动管理您的课表。往期课表已自动隐藏，您当前新填报的课表将在{activeSemester ? `本学期（${activeSemester.endDate}）` : '下一个学期'}结束后失效。
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })()}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">公共课表中心</h1>
                        <p className="text-[12px] sm:text-sm text-gray-500 mt-1">
                            仅显示公开的不可分配时间段
                        </p>
                    </div>
                    <div className="flex space-x-2 w-full sm:w-auto">
                        <button 
                            onClick={() => setActiveTab('public')}
                            className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'public' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}
                        >
                            <div className="flex items-center">
                                <div className="icon-globe text-sm mr-2"></div>
                                所有时间
                            </div>
                        </button>
                        <button 
                            data-tutorial="tab-mine"
                            onClick={() => setActiveTab('mine')}
                            className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === 'mine' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}
                        >
                            <div className="flex items-center">
                                <div className="icon-pencil text-sm mr-2"></div>
                                编辑我的时间
                            </div>
                        </button>
                    </div>
                </div>

                {activeTab === 'public' && (
                    <div className="space-y-4 md:space-y-6">
                         <div className="bg-white p-4 md:p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col space-y-3">
                             <div className="flex items-center justify-between">
                                 <div className="flex items-center text-sm font-bold text-gray-800">
                                     <div className="icon-list-filter text-blue-500 mr-2"></div>
                                     筛选显示用户 (可多选)
                                 </div>
                                 <button
                                     onClick={() => setShowWeekends(!showWeekends)}
                                     className="flex items-center text-xs font-medium text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 px-2 py-1.5 rounded transition-colors border border-gray-200"
                                 >
                                     <div className={`icon-${showWeekends ? 'eye-off' : 'eye'} mr-1`}></div>
                                     {showWeekends ? '隐藏周末' : '显示周末'}
                                 </button>
                             </div>
                             <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pt-1">
                                 {visibleUsers.length === 0 ? (
                                     <span className="text-xs text-gray-400">暂无公开课表的用户</span>
                                 ) : visibleUsers.map(u => (
                                     <button
                                         key={u.id}
                                         onClick={() => toggleUserFilter(u.id)}
                                         className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all shadow-sm ${
                                             selectedUserFilters.includes(u.id) 
                                             ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200' 
                                             : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                                         }`}
                                     >
                                         {u.username}
                                     </button>
                                 ))}
                             </div>
                         </div>

                        <div className={`flex flex-col md:grid gap-3 pb-6 ${showWeekends ? 'md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7' : 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'}`}>
                            {(showWeekends ? DAYS : DAYS.slice(0, 5)).map(day => (
                                <div key={day.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-100 flex flex-col overflow-hidden min-h-[100px] md:min-h-[250px]">
                                    <div className="bg-white px-3 py-2 border-b border-gray-100 flex justify-between items-center sticky top-0 z-10">
                                        <h3 className="font-extrabold text-gray-800 flex items-center text-sm">
                                            <div className="w-1 h-3.5 bg-blue-500 rounded-full mr-1.5"></div>
                                            {day.name}
                                        </h3>
                                        <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-wider">{day.shortName}</span>
                                    </div>
                                    <div className="p-3 space-y-2.5 flex-1 bg-gray-50/30 relative">
                                        {getCoursesByDay(day.id, filteredCourses).length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-10 opacity-60">
                                                <div className="icon-coffee text-3xl mb-3 text-gray-300"></div>
                                                <span className="text-sm font-medium">无排课记录</span>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <div className="absolute top-1 bottom-1 left-[9px] w-0.5 bg-gray-200 rounded-full"></div>
                                                <div className="space-y-2.5 relative z-10">
                                                    {getCoursesByDay(day.id, filteredCourses).map(course => (
                                                        <div key={course.id} className="relative pl-5">
                                                            <div className="absolute left-[6px] top-1.5 w-2 h-2 bg-white border-2 border-blue-500 rounded-full shadow-sm"></div>
                                                            <div className="bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group">
                                                                <div className="font-bold text-gray-900 text-xs mb-1 flex justify-between items-center">
                                                                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] border border-blue-100 font-mono tracking-tight">{course.startTime} - {course.endTime}</span>
                                                                </div>
                                                                {(course.courseName || course.location) && (
                                                                    <div className="mb-1.5 mt-1 space-y-0.5">
                                                                        {course.courseName && <div className="text-xs font-bold text-gray-800 break-words leading-tight">{course.courseName}</div>}
                                                                        {course.location && <div className="text-[10px] text-gray-500 flex items-start"><div className="icon-map-pin w-3 h-3 mr-0.5 mt-px shrink-0"></div><span className="break-words">{course.location}</span></div>}
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center pt-1.5 border-t border-gray-50">
                                                                    <div className="h-4 w-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-[9px] mr-1.5 shrink-0 shadow-sm border border-blue-200">
                                                                        {course.username.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-gray-600 truncate">
                                                                        {course.username} <span className="font-normal text-gray-400">#{users.find(u => u.id === course.userId)?.studentId || '未知'}</span>
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'mine' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div data-tutorial="add-course-panel" className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-100 h-fit">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-900">添加不可分配时间段</h3>
                            </div>
                            
                            <form onSubmit={handleAddCourse} className="space-y-4 animate-fade-in">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">星期</label>
                                    <select 
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                        value={newCourse.dayOfWeek}
                                        onChange={e => setNewCourse({...newCourse, dayOfWeek: parseInt(e.target.value)})}
                                    >
                                        {DAYS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">开始时间</label>
                                        <input 
                                            required
                                            type="time" 
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                            value={newCourse.startTime}
                                            onChange={e => setNewCourse({...newCourse, startTime: e.target.value})}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">结束时间</label>
                                        <input 
                                            required
                                            type="time" 
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                            value={newCourse.endTime}
                                            onChange={e => setNewCourse({...newCourse, endTime: e.target.value})}
                                        />
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">课程名称/事务 (选填)</label>
                                    <input 
                                        type="text" 
                                        placeholder="如: 机器学习"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                        value={newCourse.courseName}
                                        onChange={e => setNewCourse({...newCourse, courseName: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">地点 (选填)</label>
                                    <input 
                                        type="text" 
                                        placeholder="如: CB 101"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                        value={newCourse.location}
                                        onChange={e => setNewCourse({...newCourse, location: e.target.value})}
                                    />
                                </div>
                                
                                <p className="text-xs text-gray-500 mt-2">
                                    提示：课表是否对外公开可以在 <a href="dashboard.html" className="text-blue-600 underline">首页-偏好设置</a> 中统一管理。默认对外开放。
                                </p>

                                <button 
                                    type="submit" 
                                    className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 mt-4"
                                >
                                    保存时间段
                                </button>
                            </form>
                        </div>

                        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center border-b border-gray-100 pb-4">
                                <div className="icon-list mr-2 text-blue-600"></div>
                                我的时间段列表
                            </h3>
                            <div className="space-y-6">
                                {(() => {
                                    const myValidCourses = courses.filter(c => {
                                        if (c.userId !== user.id) return false;
                                        const courseDate = new Date(c.createdAt);
                                        const now = window.timeUtils.getHKTNow();
                                        
                                        const targetSemester = semesters.find(s => courseDate <= new Date(s.endDate + "T23:59:59"));
                                        if (targetSemester) {
                                            if (now > new Date(targetSemester.endDate + "T23:59:59")) {
                                                return false;
                                            }
                                        }
                                        return true;
                                    });

                                    if (myValidCourses.length === 0) {
                                        return (
                                            <div className="text-center py-12 flex flex-col items-center">
                                                <div className="icon-calendar-x text-5xl text-gray-200 mb-4"></div>
                                                <p className="text-gray-500 font-medium">暂无录入的时间段，请在左侧添加</p>
                                            </div>
                                        );
                                    }

                                    return DAYS.map(day => {
                                        const dayCourses = myValidCourses.filter(c => c.dayOfWeek === day.id).sort((a,b) => a.startTime.localeCompare(b.startTime));
                                        if (dayCourses.length === 0) return null;
                                        return (
                                            <div key={day.id} className="relative">
                                                <div className="sticky top-0 bg-white/90 backdrop-blur-sm z-10 py-2 mb-2 flex items-center">
                                                    <div className="bg-blue-100 text-blue-800 font-extrabold text-sm px-3 py-1 rounded-lg border border-blue-200 flex items-center">
                                                        <div className="icon-calendar-days mr-1.5"></div>
                                                        {day.name}
                                                    </div>
                                                </div>
                                                <div className="relative pl-4 border-l-2 border-gray-100 ml-4 space-y-4 py-2">
                                                    {dayCourses.map(course => (
                                                        <div key={course.id} className="relative">
                                                            <div className="absolute -left-[23px] top-4 w-3 h-3 bg-white border-[3px] border-blue-500 rounded-full"></div>
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-gray-100 rounded-xl bg-gray-50/50 group hover:border-blue-300 hover:shadow-sm transition-all ml-2">
                                                                <div className="flex flex-col mb-2 sm:mb-0 w-full sm:w-auto">
                                                                    <div className="font-bold text-gray-900 flex items-center text-lg mb-1">
                                                                        <span className="font-mono text-blue-700">{course.startTime} - {course.endTime}</span>
                                                                        {!course.isPublic && <span className="ml-3 text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full border border-gray-300 font-medium">仅自己可见</span>}
                                                                    </div>
                                                                    {(course.courseName || course.location) && (
                                                                        <div className="text-sm text-gray-600 flex flex-col sm:flex-row sm:items-center sm:space-x-3 gap-1 sm:gap-0">
                                                                            {course.courseName && <span className="font-bold">{course.courseName}</span>}
                                                                            {course.courseName && course.location && <span className="hidden sm:block text-gray-300">•</span>}
                                                                            {course.location && <span className="flex items-center text-gray-500"><div className="icon-map-pin w-3.5 h-3.5 mr-1"></div>{course.location}</span>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex space-x-2 sm:self-center self-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white p-1 rounded-lg border border-gray-100 shadow-sm">
                                                                    <button 
                                                                        onClick={() => openEdit(course)}
                                                                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded-md transition-colors flex items-center justify-center"
                                                                        title="修改"
                                                                    >
                                                                        <div className="icon-pencil w-4 h-4"></div>
                                                                    </button>
                                                                    <div className="w-px bg-gray-200 my-1"></div>
                                                                    <button 
                                                                        onClick={() => handleDeleteCourse(course.id)}
                                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-md transition-colors flex items-center justify-center"
                                                                        title="删除"
                                                                    >
                                                                        <div className="icon-trash-2 w-4 h-4"></div>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </main>
            </>
            )}
        </div>
    );
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<CoursesApp />);