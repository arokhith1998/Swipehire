interface SwipeHireLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export function SwipeHireLogo({ size = 'md', showText = true, className = '' }: SwipeHireLogoProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl'
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* SwipeHire Logo SVG */}
      <div className={`${sizeClasses[size]} flex-shrink-0`}>
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Background circle with gradient */}
          <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00ABA8" />
              <stop offset="100%" stopColor="#00969C" />
            </linearGradient>
          </defs>
          
          {/* Main circle background */}
          <circle cx="20" cy="20" r="18" fill="url(#logoGradient)" stroke="#ffffff" strokeWidth="2"/>
          
          {/* Swipe gesture icon - curved arrow */}
          <path 
            d="M12 16 C12 16, 16 12, 20 16 C24 12, 28 16, 28 16" 
            stroke="#ffffff" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            fill="none"
          />
          
          {/* Briefcase/job icon */}
          <rect x="15" y="22" width="10" height="7" rx="1" fill="#ffffff"/>
          <rect x="17" y="20" width="6" height="2" rx="1" fill="#ffffff"/>
          <circle cx="18.5" cy="25" r="0.8" fill="#00ABA8"/>
          <circle cx="21.5" cy="25" r="0.8" fill="#00ABA8"/>
        </svg>
      </div>
      
      {/* SwipeHire Text */}
      {showText && (
        <span className={`font-bold brand-teal ${textSizeClasses[size]}`}>
          SwipeHire
        </span>
      )}
    </div>
  );
}