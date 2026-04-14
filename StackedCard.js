/**
 * StackedCard Component
 * 
 * A single interactive card component with skewed design and hover effects.
 * Designed to be used in stacked arrangements with smooth animations.
 * 
 * @component
 * @example
 * // Basic usage
 * <StackedCard 
 *   title="Featured Content" 
 *   description="Discover amazing features" 
 *   date="Just now" 
 * />
 * 
 * @example
 * // With custom icon and styling
 * <StackedCard 
 *   icon={<div className="icon-heart text-xl text-red-400"></div>}
 *   title="Popular" 
 *   description="Trending this week"
 *   date="2 days ago"
 *   titleClassName="text-red-500"
 *   className="hover:scale-105 hover:rotate-1"
 * />
 * 
 * @example
 * // Multiple stacked cards
 * <div className="grid [grid-template-areas:'stack'] place-items-center">
 *   <StackedCard 
 *     title="Card 1" 
 *     className="[grid-area:stack] hover:-translate-y-10"
 *   />
 *   <StackedCard 
 *     title="Card 2" 
 *     className="[grid-area:stack] translate-x-12 translate-y-10"
 *   />
 * </div>
 */
function StackedCard({
    // Custom CSS classes for additional styling and positioning
    className,
    
    // Click handler for interactivity
    onClick,
    
    // Icon element (JSX) - can be any Lucide icon or custom element
    // Default: sparkles icon with blue color
    icon,
    
    // Main title text displayed prominently on the card
    // Default: "Featured"
    title,
    
    // Descriptive text below the title
    // Default: "Discover amazing content"
    description,
    
    // Date or time information shown at bottom
    // Default: "Just now"
    date,
    
    // Custom CSS classes for the icon styling
    // Default: "text-blue-500"
    iconClassName,
    
    // Custom CSS classes for the title styling
    // Default: "text-blue-500"
    titleClassName
}) {
    try {
        return (
            <div
                data-name="display-card"
                // Base card styling with skewed design, hover effects, and gradient overlay
                className={`relative flex h-36 w-[22rem] -skew-y-[8deg] select-none flex-col justify-between rounded-xl border-2 bg-muted backdrop-blur-sm px-4 py-3 transition-all duration-700 after:absolute after:-right-1 after:top-[-5%] after:h-[110%] after:w-[20rem] after:bg-gradient-to-l after:from-background after:to-transparent after:content-[''] hover:border-white/20 hover:bg-muted [&>*]:flex [&>*]:items-center [&>*]:gap-2 ${className || ''}`}
            >
                {/* Card Header - Icon and Title */}
                <div data-name="card-header">
                    <span className="relative inline-block rounded-full bg-blue-800 p-1">
                        {icon || <i className="fas fa-sparkles size-4 text-blue-300"></i>}
                    </span>
                    <p className={`text-lg font-medium ${titleClassName || 'text-blue-500'}`}>
                        {title || "Featured"}
                    </p>
                </div>
                
                {/* Card Description */}
                <p data-name="card-description" className="whitespace-nowrap text-lg">
                    {description || "Discover amazing content"}
                </p>
                
                {/* Card Date/Time */}
                <p data-name="card-date" className="text-muted-foreground">
                    {date || "Just now"}
                </p>
            </div>
        );
    } catch (error) {
        console.error('DisplayCard error:', error);
        reportError(error);
        return null;
    }
}

/*
 * USAGE NOTES:
 * 
 * 1. STACKING CARDS:
 *    Use CSS Grid with grid-template-areas:'stack' to overlay multiple cards
 *    Apply transforms (translate-x, translate-y) for stacked positioning
 * 
 * 2. HOVER EFFECTS:
 *    Add hover transforms in className prop:
 *    - "hover:-translate-y-10" for upward movement
 *    - "hover:scale-105" for scaling effect
 *    - "hover:rotate-1" for rotation effect
 * 
 * 3. ICONS:
 *    Use Lucide icons with className format: "icon-[name]"
 *    Examples: "icon-heart", "icon-star", "icon-trophy"
 *    Ensure proper color contrast with background
 * 
 * 4. THEMING:
 *    Colors use CSS variables defined in index.html:
 *    - --primary-color, --secondary-color for consistent theming
 *    - bg-muted, text-muted-foreground for background colors
 * 
 * 5. RESPONSIVE DESIGN:
 *    Fixed width (22rem) - wrap in responsive container if needed
 *    Height is fixed at 9rem (h-36) for consistent stacking
 */
