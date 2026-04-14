const TUTORIAL_STEPS = [
    { id: 1, path: 'dashboard.html', selector: '[data-tutorial="checkin-btn"]', title: '每日签到', text: '每天 23:50 后需打卡签到，确认明天的需求。请点击高亮的「签到」按钮。' },
    { id: 2, path: 'dashboard.html', selector: '[data-tutorial="presence-btn"]', title: '现场汇报', text: '到达自习室后可汇报在场人数，帮助大家避开拥挤。请点击「汇报人数」。' },
    { id: 3, path: 'dashboard.html', selector: '[data-tutorial="alloc-search-btn"]', title: '分配与战况查询', text: '在此可查看全员的分配结果与实时抢位战况。点击「查询全员分配战况」。' },
    { id: 4, path: 'dashboard.html', selector: '[data-tutorial="alloc-refresh-btn"]', title: '获取最新数据', text: '在查询面板中，点击「刷新最新数据」按钮。' },
    { id: 5, path: 'dashboard.html', selector: '[data-tutorial="close-alloc-modal-btn"]', title: '关闭面板', text: '浏览完大家的战况后，点击右上角的关闭按钮返回。' },
    { id: 6, path: 'dashboard.html', selector: '[data-tutorial="suggested-time-module"]', title: '查看建议时间', text: '这里显示系统分配的建议时段。如果有同学抢到了你的位置，会在这里同步。（点击高亮区域任意位置继续）' },
    { id: 7, path: 'dashboard.html', selector: '[data-tutorial="alloc-reject-btn"]', title: '释放不需要的分配', text: '对于去不了的时间，请务必点击「拒绝该时间段」，流转给其他同学。' },
    { id: 8, path: 'dashboard.html', selector: '[data-tutorial="nav-submit"]', title: '前往填报', text: '自己抢到座位或确认分配后，需要录入系统。点击导航栏「填报」。' },
    { id: 9, path: 'submit.html', selector: '[data-tutorial="submit-btn"]', title: '录入与一键确认', text: '若确认系统分配时间，可点击右侧紫色的「一键确认」快速录入。或者手动选择时间提交。' },
    { id: 10, path: 'submit.html', selector: '[data-tutorial="nav-swap"]', title: '前往交换中心', text: '对时间和房间不满意？去交换大厅换一换。点击导航栏「交换」。' },
    { id: 11, path: 'swap.html', selector: '[data-tutorial="swap-target"]', title: '申请交换', text: '选定你想换出的时段后，再选择列表中别人的时段，点击「发送交换申请」。' },
    { id: 12, path: 'swap.html', selector: '[data-tutorial="nav-courses"]', title: '前往排课表', text: '为防止系统分配到你上课的时间，请务必设置课表。点击导航栏「排课」。' },
    { id: 13, path: 'courses.html', selector: '[data-tutorial="tab-mine"]', title: '切换编辑模式', text: '请先点击「编辑我的时间」标签，进入课表编辑模式。' },
    { id: 14, path: 'courses.html', selector: '[data-tutorial="add-course-panel"]', title: '录入真实课表', text: '你可以真实体验录入一段课表，系统将保存。操作完成后，点击弹窗上的「下一步」。', manualNext: true },
    { id: 15, path: 'courses.html', selector: 'a[href="profile.html"], [data-tutorial="nav-profile"]', title: '前往个人中心', text: '最后来配置账号和偏好。点击导航栏「我的」或「个人中心」。' },
    { id: 16, path: 'profile.html', selector: '[data-tutorial="profile-status"]', title: '排班状态管理', text: '在这里可以设置某天是否休假。尝试修改状态，然后点击「下一步」。', manualNext: true },
    { id: 17, path: 'profile.html', selector: '[data-tutorial="tab-notifications"]', title: '切换消息设置', text: '点击「消息与提醒」标签，配置接收通道。' },
    { id: 18, path: 'profile.html', selector: '[data-tutorial="profile-notifications"]', title: '通知配置', text: '你可以真实开启微信或系统推送。配置完毕点击「下一步」。', manualNext: true },
    { id: 19, path: 'profile.html', selector: '[data-tutorial="tab-settings"]', title: '切换偏好设置', text: '点击「偏好设置」标签，配置系统分配规则。' },
    { id: 20, path: 'profile.html', selector: '[data-tutorial="profile-preferences"]', title: '排班与出勤偏好', text: '设置你的早晚偏好及每周默认出勤日，系统会据此分配。完成后点击「下一步」。', manualNext: true },
    { id: 21, path: 'profile.html', selector: '[data-tutorial="profile-security"]', title: '账号安全', text: '设置免密登录或重置密码。完成后记得保存，并点击「下一步」。', manualNext: true },
    { id: 22, path: 'profile.html', selector: 'none', title: '全部完成！', text: '沙盒演示结束。你现在可以退出沙盒，正常使用各项功能了！' },
];

function TutorialOverlay() {
    const [step, setStep] = React.useState(() => parseInt(localStorage.getItem('TUTORIAL_STEP')) || 1);
    const [targetRects, setTargetRects] = React.useState([]);
    const [overlayActive, setOverlayActive] = React.useState(window.isTutorialMode);
    const scrolledRef = React.useRef(-1);

    const currentStep = TUTORIAL_STEPS.find(s => s.id === step);

    React.useEffect(() => {
        if (!overlayActive || !currentStep) return;
        
        const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';
        if (currentStep.path !== currentPath && currentPath !== '') {
            return;
        }

        if (currentStep.selector === 'none') {
            setTargetRects([]);
            return;
        }

        const interval = setInterval(() => {
            const els = Array.from(document.querySelectorAll(currentStep.selector)).filter(e => e.offsetParent !== null);
            if (els.length > 0) {
                if (scrolledRef.current !== step) {
                    els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    scrolledRef.current = step;
                }
                setTargetRects(els.map(el => {
                    const rect = el.getBoundingClientRect();
                    return { 
                        top: rect.top, 
                        left: rect.left, 
                        width: rect.width, 
                        height: rect.height,
                        bottom: rect.bottom,
                        right: rect.right
                    };
                }));
            } else {
                setTargetRects([]);
            }
        }, 200);

        return () => clearInterval(interval);
    }, [step, currentStep]);

    const nextStep = () => {
        const next = step + 1;
        localStorage.setItem('TUTORIAL_STEP', next.toString());
        setStep(next);
        if (next > TUTORIAL_STEPS.length) exitTutorial();
    };

    const exitTutorial = () => {
        localStorage.removeItem('TUTORIAL_MODE');
        localStorage.removeItem('TUTORIAL_STEP');
        setOverlayActive(false);
        window.location.href = 'dashboard.html';
    };

    React.useEffect(() => {
        if (!overlayActive || !currentStep || currentStep.selector === 'none') return;
        
        const handleClick = (e) => {
            if (currentStep.manualNext) return; // Disable auto advance for interactive steps
            const els = Array.from(document.querySelectorAll(currentStep.selector));
            const el = els.find(el => el.contains(e.target) || el === e.target);
            if (el) {
                // Synchronously save to local storage to prevent data loss on fast page navigation
                const next = step + 1;
                localStorage.setItem('TUTORIAL_STEP', next.toString());
                setTimeout(() => nextStep(), 50); 
            }
        };
        
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, [currentStep, step]);

    if (!overlayActive || !currentStep) return null;

    let clipPathStyle = {};
    let unionRect = null;
    let dialogStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    
    if (targetRects.length > 0) {
        const pad = 10;
        let polygonString = `0% 0%`;
        const sortedRects = [...targetRects].sort((a, b) => a.left - b.left);
        
        sortedRects.forEach(rect => {
            const l = rect.left - pad;
            const r = rect.right + pad;
            const t = rect.top - pad;
            const b = rect.bottom + pad;
            polygonString += `, ${l}px 0%, ${l}px ${t}px, ${l}px ${b}px, ${r}px ${b}px, ${r}px ${t}px, ${l}px ${t}px, ${l}px 0%`;
        });
        polygonString += `, 100% 0%, 100% 100%, 0% 100%`;
        
        clipPathStyle = {
            clipPath: `polygon(${polygonString})`
        };

        unionRect = targetRects.reduce((acc, r) => ({
            top: Math.min(acc.top, r.top),
            left: Math.min(acc.left, r.left),
            right: Math.max(acc.right, r.right),
            bottom: Math.max(acc.bottom, r.bottom)
        }), { top: Infinity, left: Infinity, right: -Infinity, bottom: -Infinity });
        unionRect.width = unionRect.right - unionRect.left;
        unionRect.height = unionRect.bottom - unionRect.top;

        const isMobile = window.innerWidth < 640;
        const dialogWidth = isMobile ? window.innerWidth - 32 : 320;
        const approxHeight = 180;
        const screenMargin = 16;

        let topPos = unionRect.bottom + screenMargin;
        if (topPos + approxHeight > window.innerHeight) {
            topPos = unionRect.top - approxHeight - screenMargin;
        }
        if (topPos < screenMargin) topPos = screenMargin;
        if (topPos + approxHeight > window.innerHeight) topPos = window.innerHeight - approxHeight - screenMargin;

        let leftPos = unionRect.left + (unionRect.width / 2) - (dialogWidth / 2);
        if (leftPos < screenMargin) leftPos = screenMargin;
        if (leftPos + dialogWidth > window.innerWidth) leftPos = window.innerWidth - dialogWidth - screenMargin;

        dialogStyle = { top: `${topPos}px`, left: `${leftPos}px`, width: `${dialogWidth}px` };
    }

    return (
        <div className="fixed inset-0 z-[100] pointer-events-none">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300 pointer-events-auto"
                 style={clipPathStyle}
            ></div>
            
            {targetRects.map((rect, i) => (
                <div key={i} className="absolute border-2 border-blue-400 rounded-lg animate-pulse pointer-events-none transition-all duration-300"
                     style={{
                         top: rect.top - 8,
                         left: rect.left - 8,
                         width: rect.width + 16,
                         height: rect.height + 16,
                         boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.4)'
                     }}>
                </div>
            ))}

            <div className="absolute bg-white p-4 sm:p-5 rounded-2xl shadow-2xl border-[3px] border-blue-500 pointer-events-auto transition-all duration-500 z-[110]"
                 style={dialogStyle}>
                <div className="flex justify-between items-start mb-2 sm:mb-3">
                    <h3 className="font-extrabold text-blue-700 text-sm sm:text-base flex items-center">
                        <div className="icon-map-pin mr-1.5 opacity-80"></div>
                        {currentStep.title}
                    </h3>
                    <span className="text-[10px] sm:text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap ml-2">
                        {step} / {TUTORIAL_STEPS.length}
                    </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-5 leading-relaxed">{currentStep.text}</p>
                <div className="flex justify-between items-center mt-auto">
                    <button onClick={exitTutorial} className="text-[10px] sm:text-xs text-gray-400 hover:text-gray-600 font-medium underline underline-offset-2">跳过并退出</button>
                    {currentStep.manualNext && (
                        <button onClick={nextStep} className="px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-95">下一步</button>
                    )}
                    {currentStep.selector === 'none' && (
                        <button onClick={exitTutorial} className="px-4 py-2 bg-blue-600 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-95 flex items-center">
                            <div className="icon-check mr-1.5"></div>
                            完成并退出
                        </button>
                    )}
                </div>
            </div>

            <button onClick={exitTutorial} className="absolute top-3 right-3 sm:top-4 sm:right-4 pointer-events-auto bg-black/40 hover:bg-black/60 text-white border border-white/20 backdrop-blur-md px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-[10px] sm:text-xs font-bold transition-all shadow-sm flex items-center">
                <div className="icon-door-open mr-1.5"></div>
                退出沙盒模式
            </button>
        </div>
    );
}
window.TutorialOverlay = TutorialOverlay;