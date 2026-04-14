const style = document.createElement('style');
style.textContent = `
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}
`;
document.head.appendChild(style);

function LoadingSkeleton() {
    return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 animate-pulse">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-4 border-b border-gray-100 gap-4">
                <div className="h-8 bg-gray-200 rounded-lg w-48 md:w-64"></div>
                <div className="h-8 bg-gray-200 rounded-lg w-full sm:w-32"></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="h-64 bg-gray-200 rounded-2xl md:rounded-3xl"></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="h-32 bg-gray-200 rounded-2xl"></div>
                        <div className="h-32 bg-gray-200 rounded-2xl"></div>
                    </div>
                </div>
                <div className="lg:col-span-1 space-y-6">
                    <div className="h-40 bg-gray-200 rounded-2xl md:rounded-3xl"></div>
                    <div className="h-64 bg-gray-200 rounded-2xl md:rounded-3xl"></div>
                </div>
            </div>
        </div>
    );
}

window.LoadingSkeleton = LoadingSkeleton;