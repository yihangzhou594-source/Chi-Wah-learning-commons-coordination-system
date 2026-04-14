const { useState, useEffect } = React;

function LoginApp() {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        inviteCode: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedFeature, setSelectedFeature] = useState(null);
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    
    const featureDetails = {
        radar: {
            title: "全域战术雷达",
            description: "追踪各防区实时人员部署情况，链路秒级同步。通过直观的环境可视化展示，协助您提前避开拥挤区域，直达空闲休整区，大幅节省寻路与等待的理智消耗。",
            icon: "icon-radar",
            color: "text-blue-500",
            bgColor: "bg-blue-100"
        },
        smart: {
            title: "PRTS 调度演算",
            description: "先进的 PRTS 辅助计算分配算法，自动处理跨防区和冲突部署需求，优化空间利用率。有效避免多名干员同时抢占同一阵位的逻辑悖论，确保战术安排的绝对公平与有序。",
            icon: "icon-cpu",
            color: "text-indigo-500",
            bgColor: "bg-indigo-100"
        },
        swap: {
            title: "战术区域置换",
            description: "若当前指派的时间或防区与您的个人日程不匹配，可于置换网络一键发布换班需求。终端将自动为您匹配合适的干员，完成无缝交接，轻松置换作战时间段。",
            icon: "icon-arrow-left-right",
            color: "text-purple-500",
            bgColor: "bg-purple-100"
        }
    };

    useEffect(() => {
        // Check if already logged in
        const user = window.auth.getCurrentUser();
        if (user) {
            window.location.href = 'dashboard.html';
        }
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveCardIndex((current) => (current + 1) % 3);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                // Login Logic
                const userObj = await window.db.getUserByUsername(formData.username);
                if (!userObj) {
                    throw new Error('用户不存在，请先注册');
                }
                const user = userObj.objectData;
                
                let updates = {};

                if (!user.studentId || String(user.studentId).length !== 3) {
                    updates.studentId = Math.floor(100 + Math.random() * 900).toString();
                    user.studentId = updates.studentId;
                }

                // Password check
                let needsUpgrade = false;
                if (user.isPasswordFree === false) {
                    if (!formData.password) {
                        throw new Error('该账号已关闭免密登录，请输入密码');
                    }
                    
                    const inputHash = await window.cryptoUtils.hashPassword(formData.password);
                    
                    if (user.password === inputHash) {
                        // Match with hash
                    } else if (user.password === formData.password) {
                        // Backward compatibility: match with plaintext
                        needsUpgrade = true;
                    } else {
                        throw new Error('密码错误');
                    }
                } else if (formData.password && user.password) {
                    // Even if password-free is on, if they enter a password, we should verify and potentially upgrade it
                    const inputHash = await window.cryptoUtils.hashPassword(formData.password);
                    if (user.password === formData.password) {
                        needsUpgrade = true;
                    } else if (user.password !== inputHash) {
                        throw new Error('密码错误');
                    }
                }
                
                // If matched with plaintext, upgrade to hash automatically
                if (needsUpgrade) {
                    updates.password = await window.cryptoUtils.hashPassword(formData.password);
                    user.password = updates.password;
                }
                
                if (Object.keys(updates).length > 0) {
                    await window.db.updateUser(userObj.objectId, updates);
                }

                // Save session with objectId
                window.auth.login({ ...user, id: userObj.objectId });
                window.location.href = 'dashboard.html';
                
            } else {
                // Register Logic
                const existingUser = await window.db.getUserByUsername(formData.username);
                if (existingUser) {
                    throw new Error('用户名已存在');
                }

                // Grant admin role for CHIWAH2026
                const role = formData.inviteCode === 'CHIWAH2026' ? 'admin' : 'user';
                const hashedPassword = formData.password ? await window.cryptoUtils.hashPassword(formData.password) : '';
                
                const newUser = {
                    username: formData.username,
                    password: hashedPassword, // Store hash only
                    role: role,
                    isPasswordFree: formData.password ? false : true,
                    studentId: Math.floor(100 + Math.random() * 900).toString()
                };

                const created = await window.db.createUser(newUser);
                window.auth.login({ ...newUser, id: created.objectId });
                window.location.href = 'dashboard.html';
            }
        } catch (err) {
            let errMsg = err && err.message ? err.message : String(err);
            errMsg = errMsg.replace(/^(Error:\s*)+/, '');
            
            if (errMsg.includes('Failed to fetch') || 
                errMsg.includes('Network Error') || 
                errMsg.includes('网络请求失败') || 
                errMsg.includes("Unexpected token '<'") || 
                errMsg.includes('is not valid JSON') ||
                errMsg.includes('服务器响应异常')) {
                console.warn('Network/Server error during auth:', errMsg);
                setError('服务器响应异常或网络连接失败，请刷新重试');
            } else {
                console.error(err);
                setError(errMsg || '发生错误，请重试');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col lg:flex-row bg-gray-50">
            {/* Showcase Section */}
            <div className="hidden lg:flex lg:w-1/2 bg-white items-center justify-center relative overflow-hidden p-12 border-r border-gray-100 shadow-sm">
                <div className="absolute top-0 left-0 w-full h-full opacity-60 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #e5e7eb 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
                
                <div className="z-10 flex flex-col items-center w-full max-w-lg">
                    <div className="text-center text-gray-900 mb-20">
                        <h1 className="text-4xl font-extrabold mb-4 tracking-tight text-gray-900">智华战术协作终端</h1>
                        <p className="text-gray-500 text-lg">权限认证与资源调度网络，确保战术资源高效部署</p>
                    </div>
                    
                    <div className="grid [grid-template-areas:'stack'] place-items-center w-full pl-8 cursor-pointer relative" onMouseEnter={() => {}} /* Optional pause on hover logic */>
                        {[
                            {
                                id: 'radar',
                                title: "全域战术雷达",
                                description: "战场环境秒级同步，规避路线冲突",
                                date: "Live Updates",
                                icon: "icon-radar",
                                color: "text-blue-500",
                                titleColor: "text-gray-900"
                            },
                            {
                                id: 'smart',
                                title: "PRTS 调度演算",
                                description: "神经网络演算，统筹战术干员站位",
                                date: "Smart Allocation",
                                icon: "icon-cpu",
                                color: "text-indigo-500",
                                titleColor: "text-gray-800"
                            },
                            {
                                id: 'swap',
                                title: "战术区域置换",
                                description: "快速发布防区调换指令，无缝交接",
                                date: "Quick Swap",
                                icon: "icon-arrow-left-right",
                                color: "text-purple-500",
                                titleColor: "text-gray-700"
                            }
                        ].map((card, idx) => {
                            const position = (idx - activeCardIndex + 3) % 3;
                            let positionClasses = "";
                            
                            if (position === 0) {
                                positionClasses = "z-30 bg-white border border-gray-100 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] translate-x-0 translate-y-0 opacity-100 scale-100 hover:-translate-y-4";
                            } else if (position === 1) {
                                positionClasses = "z-20 bg-gray-50 border border-gray-100 shadow-xl translate-x-8 translate-y-8 opacity-90 scale-95";
                            } else {
                                positionClasses = "z-10 bg-gray-100 border border-gray-200 shadow-lg translate-x-16 translate-y-16 opacity-80 scale-90";
                            }

                            return (
                                <StackedCard 
                                    key={card.id}
                                    title={card.title} 
                                    description={card.description} 
                                    date={card.date}
                                    icon={<div className={`${card.icon} text-xl ${card.color}`}></div>}
                                    className={`[grid-area:stack] transition-all duration-700 ease-in-out hover:scale-105 rounded-2xl p-5 ${positionClasses}`}
                                    titleClassName={`${card.titleColor} font-bold text-lg`}
                                    descriptionClassName="text-gray-500 mt-1"
                                    dateClassName="text-gray-400 text-xs"
                                    onClick={() => setSelectedFeature(card.id)}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Form Section */}
            <div className="flex-1 flex items-center justify-center py-8 px-4 sm:py-12 sm:px-6 lg:px-8 relative">
                <div className="max-w-md w-full bg-white p-8 sm:p-10 shadow-2xl relative border-t-4 border-blue-600 rounded-none before:content-[''] before:absolute before:-bottom-2 before:-right-2 before:w-16 before:h-16 before:border-b-4 before:border-r-4 before:border-gray-800">
                    {/* Tech decors */}
                    <div className="absolute top-0 right-0 p-2 text-xs font-mono text-gray-400">SYS.VER.1.2</div>
                    <div className="absolute top-4 left-0 w-1 h-8 bg-blue-500"></div>
                    
                    <div className="text-center space-y-4">
                        <div className="mx-auto h-16 w-20 bg-gray-900 flex items-center justify-center transform -skew-x-12 relative overflow-hidden border-b-2 border-blue-500 shadow-lg rounded-sm">
                            <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_25%,#fff_50%,transparent_75%)] bg-[length:10px_10px]"></div>
                            <span className="text-white font-black text-3xl italic tracking-widest transform skew-x-12 ml-1">CW</span>
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-gray-900 tracking-tight mt-6">
                                {isLogin ? '终端身份认证' : '干员档案录入'}
                            </h2>
                            <p className="mt-2 text-sm text-gray-500 font-mono tracking-wide uppercase">
                                Chi Wah Tactical Operations Center
                            </p>
                        </div>
                    </div>
                
                <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 text-sm font-medium flex items-center">
                            <div className="icon-triangle-alert mr-2 text-red-500"></div>
                            {error}
                        </div>
                    )}
                    
                    <div className="space-y-4">
                        <div className="relative group">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Identification <span className="text-blue-500">*</span></label>
                            <input
                                name="username"
                                type="text"
                                required
                                className="appearance-none rounded-none block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 focus:outline-none focus:bg-white focus:border-l-4 focus:border-l-blue-500 focus:border-gray-300 focus:ring-0 sm:text-sm font-medium transition-all"
                                placeholder="请输入干员代号/通行标识"
                                value={formData.username}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="relative group">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Security Key</label>
                            <input
                                name="password"
                                type="password"
                                className="appearance-none rounded-none block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 focus:outline-none focus:bg-white focus:border-l-4 focus:border-l-blue-500 focus:border-gray-300 focus:ring-0 sm:text-sm font-medium transition-all"
                                placeholder="请输入访问密钥 (免密节点可留空)"
                                value={formData.password}
                                onChange={handleChange}
                            />
                        </div>
                        
                        {!isLogin && (
                            <div className="relative group">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Access Code <span className="text-blue-500">*</span></label>
                                <input
                                    name="inviteCode"
                                    type="text"
                                    className="appearance-none rounded-none block w-full px-4 py-3 bg-gray-50 border border-gray-200 text-gray-900 focus:outline-none focus:bg-white focus:border-l-4 focus:border-l-blue-500 focus:border-gray-300 focus:ring-0 sm:text-sm font-medium transition-all"
                                    placeholder="权限识别码 (高权限干员必填)"
                                    value={formData.inviteCode}
                                    onChange={handleChange}
                                />
                            </div>
                        )}
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center items-center py-3 px-4 border border-transparent text-sm font-bold rounded-none text-white bg-gray-900 hover:bg-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 uppercase tracking-widest transition-all"
                        >
                            {loading ? (
                                <div className="icon-loader animate-spin mr-2"></div>
                            ) : (
                                <div className="icon-chevron-right mr-2 group-hover:translate-x-1 transition-transform"></div>
                            )}
                            {isLogin ? '建立连接 / CONNECT' : '记录档案 / REGISTER'}
                        </button>
                    </div>
                </form>
                
                <div className="text-center mt-6">
                    <button
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError('');
                            setFormData({ username: '', password: '', inviteCode: '' });
                        }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider transition-colors"
                    >
                        {isLogin ? ">> 未识别到档案？创建新身份" : "<< 已有访问权限？返回认证"}
                    </button>
                </div>
            </div>
        </div>

        {/* Feature Details Modal */}
        {selectedFeature && featureDetails[selectedFeature] && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedFeature(null)}>
                <div 
                    className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button 
                        onClick={() => setSelectedFeature(null)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-colors"
                    >
                        <div className="icon-x text-xl"></div>
                    </button>
                    
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${featureDetails[selectedFeature].bgColor}`}>
                        <div className={`${featureDetails[selectedFeature].icon} text-3xl ${featureDetails[selectedFeature].color}`}></div>
                    </div>
                    
                    <h3 className="text-2xl font-bold text-gray-900 mb-3">
                        {featureDetails[selectedFeature].title}
                    </h3>
                    
                    <p className="text-gray-600 leading-relaxed text-lg">
                        {featureDetails[selectedFeature].description}
                    </p>
                    
                    <div className="mt-8">
                        <button 
                            onClick={() => setSelectedFeature(null)}
                            className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium transition-colors"
                        >
                            确认指令
                        </button>
                    </div>
                </div>
            </div>
        )}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<LoginApp />);