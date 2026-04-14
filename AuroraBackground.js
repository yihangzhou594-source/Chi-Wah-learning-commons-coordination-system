/**
 * AuroraBackground Component
 * 
 * A beautiful animated aurora background effect component that creates mesmerizing gradient animations.
 * Perfect for hero sections, landing pages, or any content that needs an eye-catching background.
 * 
 * ================================================================================================
 * BASIC USAGE:
 * ================================================================================================
 * 
 * <AuroraBackground>
 *   <h1>Your content here</h1>
 * </AuroraBackground>
 * 
 * ================================================================================================
 * ADVANCED USAGE WITH PROPS:
 * ================================================================================================
 * 
 * <AuroraBackground 
 *   className="custom-height" 
 *   showRadialGradient={false}
 * >
 *   <div>Your content</div>
 * </AuroraBackground>
 * 
 * ================================================================================================
 * PROPS:
 * ================================================================================================
 * 
 * - className: string (optional) - Additional CSS classes to apply to the container
 * - children: ReactNode - Content to display over the aurora effect
 * - showRadialGradient: boolean (default: true) - Whether to show radial gradient mask
 * - ...props: any other props will be passed to the container div
 * 
 * ================================================================================================
 * DEPENDENCIES:
 * ================================================================================================
 * 
 * This component requires two utility functions that must be defined in your project:
 * 
 * 1. useTheme() Hook:
 *    Returns an object with theme information: { theme: 'light' | 'dark' }
 * 
 *    Example implementation:
 *    ```javascript
 *    function useTheme() {
 *      const [theme, setTheme] = useState('dark');
 *      return { theme, setTheme };
 *    }
 *    ```
 * 
 * 2. cn() Function:
 *    A utility function to conditionally join CSS class names
 * 
 *    Example implementation:
 *    ```javascript
 *    function cn(...classes) {
 *      return classes.filter(Boolean).join(' ');
 *    }
 *    ```
 * 
 * ================================================================================================
 * CSS REQUIREMENTS:
 * ================================================================================================
 * 
 * Add these CSS variables and animations to your stylesheet:
 * 
 * ```css
 * :root {
 *   --white: #ffffff;
 *   --black: #000000;
 *   --transparent: transparent;
 *   --blue-300: #93c5fd;
 *   --blue-400: #60a5fa;
 *   --blue-500: #3b82f6;
 *   --indigo-300: #a5b4fc;
 *   --violet-200: #ddd6fe;
 * }
 * 
 * @keyframes aurora {
 *   from { background-position: 50% 50%, 50% 50%; }
 *   to { background-position: 350% 50%, 350% 50%; }
 * }
 * 
 * .animate-aurora {
 *   animation: aurora 60s linear infinite;
 * }
 * ```
 * 
 * ================================================================================================
 * CUSTOMIZATION:
 * ================================================================================================
 * 
 * To customize colors, modify the CSS variables:
 * - Change --blue-300, --blue-400, --blue-500 for different blue tones
 * - Change --indigo-300, --violet-200 for different accent colors
 * 
 * To customize animation speed:
 * - Modify the animation duration in .animate-aurora (60s = slower, 30s = faster)
 * 
 * To disable theme switching:
 * - Remove useTheme() dependency and hardcode theme value:
 *   ```javascript
 *   const theme = 'dark'; // or 'light'
 *   ```
 * 
 * ================================================================================================
 * STANDALONE VERSION (No Dependencies):
 * ================================================================================================
 * 
 * If you want to use this component without useTheme() and cn() dependencies:
 * 
 * 1. Replace `const { theme } = useTheme();` with:
 *    ```javascript
 *    const theme = 'dark'; // or 'light'
 *    ```
 * 
 * 2. Replace `cn(...)` calls with regular string concatenation:
 *    ```javascript
 *    className={`base-classes ${theme === 'light' ? 'light-classes' : 'dark-classes'} ${className || ''}`}
 *    ```
 * 
 * ================================================================================================
 */

function AuroraBackground({ className, children, showRadialGradient = true, ...props }) {
  try {
    // Get current theme from context/hook - replace with hardcoded value if not using theme switching
    const { theme } = useTheme();
    
    return (
      <main>
        <div
          className={cn(
            // Base styles: full viewport height, flex container, centered content
            "relative flex flex-col h-[100vh] items-center justify-center transition-colors",
            // Theme-specific background and text colors
            theme === 'light' ? 'bg-zinc-50 text-slate-950' : 'bg-zinc-900 text-white',
            // User-provided additional classes
            className
          )}
          {...props}
          data-name="aurora-container"
        >
          {/* Aurora effect wrapper - contains all animation layers */}
          <div className="absolute inset-0 overflow-hidden" data-name="aurora-wrapper">
            <div
              className={cn(
                // Core aurora effect styles with CSS custom properties
                `
                [--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)]
                [--dark-gradient:repeating-linear-gradient(100deg,var(--black)_0%,var(--black)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--black)_16%)]
                [--aurora:repeating-linear-gradient(100deg,var(--blue-500)_10%,var(--indigo-300)_15%,var(--blue-300)_20%,var(--violet-200)_25%,var(--blue-400)_30%)]
                [background-size:300%,_200%]
                [background-position:50%_50%,50%_50%]
                filter blur-[10px]
                after:content-[""] after:absolute after:inset-0
                after:[background-size:200%,_100%] 
                after:[background-position:50%_50%,50%_50%]
                after:mix-blend-difference
                pointer-events-none
                absolute -inset-[10px] opacity-50 will-change-transform
                animate-aurora
                after:animate-aurora`,
                // Theme-specific gradient backgrounds
                theme === 'light' 
                  ? '[background-image:var(--white-gradient),var(--aurora)] after:[background-image:var(--white-gradient),var(--aurora)]'
                  : '[background-image:var(--dark-gradient),var(--aurora)] after:[background-image:var(--dark-gradient),var(--aurora)] invert-0',
                // Optional radial gradient mask for focused effect
                showRadialGradient &&
                  `[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]`
              )}
              data-name="aurora-effect"
            ></div>
          </div>
          {/* User content rendered above the aurora effect */}
          {children}
        </div>
      </main>
    );
  } catch (error) {
    console.error('AuroraBackground error:', error);
    // Fallback to simple container if aurora effect fails
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-red-400 mb-4">Aurora effect failed to load</p>
          {children}
        </div>
      </div>
    );
  }
}

