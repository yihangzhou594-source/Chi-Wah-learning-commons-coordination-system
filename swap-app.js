const { useState, useEffect } = React;

function SwapApp() {
    const [user, setUser] = useState(null);
    const [allUsers, setAllUsers] = useState([]);
    const [myBookings, setMyBookings] = useState([]);
    const [availableSwaps, setAvailableSwaps] = useState([]);
    const [incomingRequests, setIncomingRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMyBooking, setSelectedMyBooking] = useState('');
    const [message, setMessage] = useState('');
    const [feedback, setFeedback] = useState({ type: '', text: '' });
    const [activeTab, setActiveTab] = useState('market'); // market, requests

    useEffect(() => {
        const currentUser = window.auth.requireAuth();
        if (currentUser) {
            setUser(currentUser);
            loadData(currentUser.id);
        }
    }, []);

    const loadData = async (userId) => {
        setLoading(true);
        try {
            const usersRes = await window.db.getAllUsers();
            setAllUsers(usersRes);

            // 1. Get all bookings
            const bookingsResult = await window.db.getBookings(1000);
            const rawBookings = bookingsResult.items.map(item => ({ ...item.objectData, id: item.objectId }));
            const allBookings = window.db.groupBookings(rawBookings);
            
            const minDateStr = window.isTutorialMode ? '2026-04-08' : window.timeUtils.getHKTDateString(2); // 只允许交换后天及以后的时间

            // Filter my active allocated bookings (>= day after tomorrow)
            const mine = allBookings.filter(b => b.userId === userId && b.status === 'active' && b.type === 'allocated' && b.date >= minDateStr);
            setMyBookings(mine);
            if (mine.length > 0 && !selectedMyBooking) {
                setSelectedMyBooking(mine[0].id);
            }

            // Filter others active allocated bookings (Candidates for swap)
            const others = allBookings.filter(b => b.userId !== userId && b.status === 'active' && b.type === 'allocated' && b.date >= minDateStr);
            setAvailableSwaps(others);

            // 2. Get incoming swap requests
            const requestsResult = await window.db.getSwapRequests(1000);
            const myIncoming = requestsResult.items
                .map(item => ({ ...item.objectData, id: item.objectId }))
                .filter(r => {
                    const targetBooking = allBookings.find(b => b.id === r.targetBookingId);
                    return targetBooking && targetBooking.userId === userId && r.status === 'pending';
                });
            
            // Enriched requests with booking details
            const enrichedRequests = myIncoming.map(req => {
                const targetBooking = allBookings.find(b => b.id === req.targetBookingId);
                const offeredBooking = allBookings.find(b => b.id === req.offeredBookingId);
                return { ...req, targetBooking, offeredBooking };
            });

            setIncomingRequests(enrichedRequests);

        } catch (error) {
            console.warn("Failed to load swap data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestSwap = async (targetBooking) => {
        if (!selectedMyBooking) {
            setFeedback({ type: 'error', text: '请先选择你用来交换的预约' });
            return;
        }
        if (!message.trim()) {
             setFeedback({ type: 'error', text: '请填写留言，礼貌询问' });
             return;
        }

        try {
            const myBooking = myBookings.find(b => b.id === selectedMyBooking);
            
            const myDuration = myBooking.originalIds ? myBooking.originalIds.length : 1;
            const targetDuration = targetBooking.originalIds ? targetBooking.originalIds.length : 1;
            
            if (myDuration !== targetDuration) {
                setFeedback({ type: 'error', text: `只能交换相同时长的时段！(你选的是${myDuration}小时，目标是${targetDuration}小时)` });
                return;
            }
            
            await window.db.createSwapRequest({
                requesterId: user.id,
                requesterName: user.username,
                targetBookingId: targetBooking.id,
                offeredBookingId: myBooking.id,
                message: message,
                status: 'pending',
                createdAt: new Date().toISOString()
            });

            // Notify target user
            await window.db.createNotification({
                userId: targetBooking.userId,
                content: `收到来自 ${user.username} 的交换请求：想用 ${myBooking.date} ${myBooking.timeSlot} 换你的 ${targetBooking.date} ${targetBooking.timeSlot}`,
                isRead: false,
                type: 'swap_request',
                createdAt: new Date().toISOString()
            });

            setFeedback({ type: 'success', text: '交换申请已发送' });
            setMessage('');
            setTimeout(() => setFeedback({ type: '', text: '' }), 3000);
        } catch (error) {
            console.warn(error);
            setFeedback({ type: 'error', text: '发送失败' });
        }
    };

    const handleAcceptSwap = async (request) => {
        try {
            // 1. Swap ownership
            const targetBooking = request.targetBooking;
            const offeredBooking = request.offeredBooking;
            
            if (!targetBooking || !offeredBooking) {
                throw new Error("One of the bookings is no longer valid");
            }

            // Update my booking -> becomes theirs
            await window.db.updateBooking(targetBooking.id, {
                userId: request.requesterId,
                userName: request.requesterName
            });

            // Update their booking -> becomes mine
            await window.db.updateBooking(offeredBooking.id, {
                userId: user.id,
                userName: user.username
            });

            // 2. Update request status
            await window.db.updateSwapRequest(request.id, { status: 'accepted' });

            // 3. Notify requester
            await window.db.createNotification({
                userId: request.requesterId,
                content: `恭喜！${user.username} 接受了你的交换请求。`,
                isRead: false,
                type: 'swap_accepted',
                createdAt: new Date().toISOString()
            });

            setFeedback({ type: 'success', text: '交换成功！' });
            loadData(user.id); // Reload
        } catch (error) {
            console.warn(error);
            setFeedback({ type: 'error', text: '操作失败: ' + error.message });
        }
    };

    const handleRejectSwap = async (request) => {
        try {
            await window.db.updateSwapRequest(request.id, { status: 'rejected' });
             // Notify requester
             await window.db.createNotification({
                userId: request.requesterId,
                content: `很遗憾，${user.username} 拒绝了你的交换请求。`,
                isRead: false,
                type: 'swap_rejected',
                createdAt: new Date().toISOString()
            });
            setFeedback({ type: 'success', text: '已拒绝请求' });
            loadData(user.id);
        } catch (error) {
            setFeedback({ type: 'error', text: '操作失败' });
        }
    };

    if(!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <window.Header />
            {loading ? <window.LoadingSkeleton /> : (
             <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 animate-fade-in">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-3">
                    <h1 className="text-2xl font-bold text-gray-900">交换中心</h1>
                    <div className="flex space-x-2 w-full sm:w-auto overflow-x-auto pb-1">
                        <button 
                            onClick={() => setActiveTab('market')}
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'market' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                        >
                            交换大厅
                        </button>
                        <button 
                            onClick={() => setActiveTab('requests')}
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all relative ${activeTab === 'requests' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                        >
                            收到的申请
                            {incomingRequests.length > 0 && (
                                <span className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white shadow-sm">
                                    {incomingRequests.length}
                                </span>
                            )}
                        </button>
                    </div>
                 </div>

                 {feedback.text && (
                    <div className={`mb-4 p-4 rounded-xl shadow-sm ${feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {feedback.text}
                    </div>
                 )}

                 {activeTab === 'market' && (
                     <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                         {/* My Offer Section */}
                         <div className="lg:col-span-4 bg-white p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-100 h-fit relative overflow-hidden">
                             <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-bl-full -mr-10 -mt-10 opacity-50 pointer-events-none"></div>
                             <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center relative z-10">
                                 <div className="icon-arrow-up-right text-green-500 mr-2 text-2xl"></div>
                                 第 1 步: 选择你提供的
                             </h3>
                             {myBookings.length === 0 ? (
                                 <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500">
                                     <div className="icon-inbox text-3xl mb-2 opacity-40 mx-auto"></div>
                                     <p className="text-sm">你当前没有可用于交换的时段</p>
                                     <p className="text-xs text-gray-400 mt-1">只有系统分配给你的时间可以用于交换</p>
                                 </div>
                             ) : (
                                 <div className="space-y-3 relative z-10 max-h-[300px] overflow-y-auto pr-1">
                                     {myBookings.map(booking => (
                                         <div 
                                            key={booking.id}
                                            onClick={() => setSelectedMyBooking(booking.id)}
                                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all relative group ${selectedMyBooking === booking.id ? 'border-green-500 bg-green-50/50 shadow-sm' : 'border-gray-100 hover:border-green-300 hover:bg-gray-50'}`}
                                         >
                                             {selectedMyBooking === booking.id && (
                                                <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full p-1 shadow-sm">
                                                    <div className="icon-check w-3 h-3"></div>
                                                </div>
                                             )}
                                             <div className="flex justify-between items-center mb-2">
                                                 <div className="font-bold text-gray-900 text-lg tracking-tight">{booking.date}</div>
                                                 <span className={`px-2 py-0.5 rounded text-xs font-bold ${selectedMyBooking === booking.id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                     RM {booking.roomNumber}
                                                 </span>
                                             </div>
                                             <div className="flex items-center text-sm font-medium text-gray-600">
                                                 <div className="icon-clock w-4 h-4 mr-1.5 opacity-50"></div>
                                                 {booking.timeSlot}
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             )}
                             <div className="mt-6 relative z-10 border-t border-gray-100 pt-6">
                                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center">
                                    <div className="icon-message-square-text text-gray-400 mr-1.5"></div>
                                    给对方的留言
                                </label>
                                <textarea
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-green-500 focus:border-green-500 text-sm shadow-sm transition-all resize-none bg-gray-50 hover:bg-white focus:bg-white"
                                    rows="3"
                                    placeholder="你好，请问能否用这个时间段换你的..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                ></textarea>
                             </div>
                         </div>

                         {/* Market List */}
                         <div className="lg:col-span-8">
                             <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-100 h-full flex flex-col">
                                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-2 border-b border-gray-100 pb-4">
                                     <h3 className="text-xl font-bold text-gray-900 flex items-center shrink-0">
                                         <div className="icon-arrow-down-left text-orange-500 mr-2 text-2xl"></div>
                                         第 2 步: 选择你想要的
                                     </h3>
                                     <div className="flex items-center bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
                                         <div className="icon-info text-orange-500 w-4 h-4 mr-1.5"></div>
                                         <p className="text-xs font-medium text-orange-700">仅显示同日期且为后天及以后的时段</p>
                                     </div>
                                 </div>
                                 <div className="overflow-y-auto flex-1 pr-1 pb-2 min-h-[400px]">
                                     {(() => {
                                         const selectedBookingObj = myBookings.find(b => b.id === selectedMyBooking);
                                         if (!selectedBookingObj) {
                                             return (
                                                <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                                                    <div className="icon-mouse-pointer-click text-5xl mb-4 text-gray-200"></div>
                                                    <p className="text-lg font-medium text-gray-500">请先在左侧选择你提供的时段</p>
                                                    <p className="text-sm mt-2">系统将自动为你筛选出同一天的可交换资源</p>
                                                </div>
                                             );
                                         }
                                         
                                         const filteredOthers = availableSwaps.filter(b => b.date === selectedBookingObj.date);
                                         
                                         if (filteredOthers.length === 0) {
                                             return (
                                                <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                                                    <div className="icon-telescope text-5xl mb-4 text-gray-200"></div>
                                                    <p className="text-lg font-medium text-gray-500">
                                                        在 <span className="font-bold text-gray-700">{selectedBookingObj.date}</span> 这天
                                                    </p>
                                                    <p className="text-sm mt-2">暂时没有其他人的可交换时段，晚点再来看看吧</p>
                                                </div>
                                             );
                                         }

                                         return (
                                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                 {filteredOthers.map(booking => (
                                                 <div key={booking.id} className="p-5 rounded-2xl border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all bg-white group flex flex-col justify-between">
                                                     <div>
                                                         <div className="flex justify-between items-start mb-3">
                                                             <div className="flex items-center space-x-2">
                                                                 <div className="h-8 w-8 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center text-orange-700 font-bold shadow-sm">
                                                                     {booking.userName.charAt(0).toUpperCase()}
                                                                 </div>
                                                                 <span className="font-bold text-gray-900 text-sm">
                                                                     {booking.userName}
                                                                 </span>
                                                             </div>
                                                             <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">#{allUsers.find(u => u.id === booking.userId)?.studentId || '未知'}</span>
                                                         </div>
                                                         
                                                         <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-100">
                                                             <div className="text-sm font-bold text-gray-500 mb-1">
                                                                 {booking.date}
                                                             </div>
                                                             <div className="flex items-center justify-between">
                                                                 <span className="text-lg font-bold text-gray-900 tracking-tight">{booking.timeSlot}</span>
                                                                 <span className="text-orange-600 font-bold bg-orange-50 px-2 py-1 rounded-md border border-orange-100 shadow-sm text-sm">RM {booking.roomNumber}</span>
                                                             </div>
                                                         </div>
                                                     </div>
                                                     
                                                     <button
                                                        data-tutorial="swap-target"
                                                        onClick={() => handleRequestSwap(booking)}
                                                        className="w-full py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all flex justify-center items-center group-hover:-translate-y-0.5"
                                                     >
                                                         <div className="icon-send mr-1.5 w-4 h-4"></div>
                                                         发送交换申请
                                                     </button>
                                                 </div>
                                                 ))}
                                             </div>
                                         );
                                     })()}
                                 </div>
                             </div>
                         </div>
                     </div>
                 )}

                 {activeTab === 'requests' && (
                     <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-gray-100">
                         <div className="flex items-center mb-8 border-b border-gray-100 pb-4">
                             <div className="icon-inbox text-blue-600 text-2xl mr-3"></div>
                             <div>
                                 <h3 className="text-xl font-bold text-gray-900">收到的交换请求</h3>
                                 <p className="text-sm text-gray-500 mt-1">处理其他人向你发起的交换申请</p>
                             </div>
                         </div>
                         
                         {incomingRequests.length === 0 ? (
                             <div className="text-center py-16 flex flex-col items-center">
                                 <div className="icon-mail text-5xl mb-4 text-gray-200"></div>
                                 <p className="text-lg font-medium text-gray-500">暂时没有待处理的申请</p>
                             </div>
                         ) : (
                             <div className="space-y-6">
                                 {incomingRequests.map(req => (
                                     <div key={req.id} className="border border-gray-200 rounded-2xl p-5 md:p-6 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 bg-white hover:border-blue-300 hover:shadow-md transition-all relative overflow-hidden">
                                         <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                                         <div className="flex-1 w-full">
                                             <div className="flex items-center mb-4">
                                                 <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold shadow-sm mr-3">
                                                     {req.requesterName.charAt(0).toUpperCase()}
                                                 </div>
                                                 <div>
                                                     <span className="font-bold text-gray-900 text-lg mr-2">{req.requesterName}</span>
                                                     <span className="text-gray-500 text-sm">希望与你进行时间互换</span>
                                                 </div>
                                             </div>
                                             
                                             <div className="flex flex-col sm:flex-row items-center gap-3 w-full bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                 <div className="bg-white p-3 rounded-lg border border-gray-200 w-full sm:flex-1 shadow-sm relative overflow-hidden">
                                                     <div className="absolute top-0 right-0 px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-bl-lg border-l border-b border-blue-100">对方提供</div>
                                                     <div className="text-xs font-bold text-gray-400 mb-1 mt-1">Ta 的时段</div>
                                                     <div className="font-bold text-blue-700 text-base flex flex-wrap items-center gap-1.5">
                                                         {req.offeredBooking ? (
                                                             <>
                                                                 <span>{req.offeredBooking.date}</span>
                                                                 <span>{req.offeredBooking.timeSlot}</span>
                                                                 <span className="bg-blue-100 px-1.5 py-0.5 rounded text-xs ml-1">RM {req.offeredBooking.roomNumber}</span>
                                                             </>
                                                         ) : '该时段已失效'}
                                                     </div>
                                                 </div>
                                                 
                                                 <div className="flex items-center justify-center bg-white rounded-full p-2 border border-gray-200 shadow-sm shrink-0 z-10 sm:-mx-6 sm:my-0 my-[-20px]">
                                                     <div className="icon-arrow-right-left text-blue-500 sm:rotate-0 rotate-90"></div>
                                                 </div>
                                                 
                                                 <div className="bg-white p-3 rounded-lg border border-gray-200 w-full sm:flex-1 shadow-sm relative overflow-hidden">
                                                     <div className="absolute top-0 right-0 px-2 py-0.5 bg-orange-50 text-orange-600 text-[10px] font-bold rounded-bl-lg border-l border-b border-orange-100">你想换出</div>
                                                     <div className="text-xs font-bold text-gray-400 mb-1 mt-1">你的时段</div>
                                                     <div className="font-bold text-orange-700 text-base flex flex-wrap items-center gap-1.5">
                                                         {req.targetBooking ? (
                                                             <>
                                                                 <span>{req.targetBooking.date}</span>
                                                                 <span>{req.targetBooking.timeSlot}</span>
                                                                 <span className="bg-orange-100 px-1.5 py-0.5 rounded text-xs ml-1">RM {req.targetBooking.roomNumber}</span>
                                                             </>
                                                         ) : '该时段已失效'}
                                                     </div>
                                                 </div>
                                             </div>
                                             
                                             {req.message && (
                                                 <div className="mt-4 flex items-start">
                                                     <div className="icon-quote text-gray-300 mr-2 mt-0.5 shrink-0"></div>
                                                     <p className="text-sm text-gray-600 italic bg-gray-50/50 px-3 py-2 rounded-r-lg rounded-bl-lg border border-gray-100 inline-block">
                                                         {req.message}
                                                     </p>
                                                 </div>
                                             )}
                                         </div>
                                         
                                         <div className="flex flex-row xl:flex-col gap-3 w-full xl:w-auto shrink-0 border-t xl:border-t-0 xl:border-l border-gray-100 pt-4 xl:pt-0 xl:pl-6">
                                             <button 
                                                onClick={() => handleAcceptSwap(req)}
                                                className="flex-1 xl:w-32 px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-md hover:shadow-lg transition-all flex justify-center items-center hover:-translate-y-0.5"
                                             >
                                                 <div className="icon-check mr-1.5"></div>接受交换
                                             </button>
                                             <button 
                                                onClick={() => handleRejectSwap(req)}
                                                className="flex-1 xl:w-32 px-4 py-2.5 bg-white text-red-600 border border-red-200 rounded-xl font-bold hover:bg-red-50 hover:border-red-300 transition-all flex justify-center items-center"
                                             >
                                                 <div className="icon-x mr-1.5"></div>委婉拒绝
                                             </button>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         )}
                     </div>
                 )}
            </main>
            )}
        </div>
    );
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<SwapApp />);