import { useState, useRef } from "react";
import { JobCard } from "./JobCard";
import { Button } from "@/components/ui/button";
import { X, Bookmark, Heart } from "lucide-react";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";

interface SwipeInterfaceProps {
  jobs: any[];
  onSwipe: (job: any, direction: 'left' | 'right') => void;
  onBookmark: (job: any) => void;
  user: any;
}

export function SwipeInterface({ jobs, onSwipe, onBookmark, user }: SwipeInterfaceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeAnimation, setSwipeAnimation] = useState<string>("");
  const cardRef = useRef<HTMLDivElement>(null);

  const handleSwipe = (direction: 'left' | 'right') => {
    if (currentIndex >= jobs.length) return;

    const currentJob = jobs[currentIndex];
    
    // Start animation
    setSwipeAnimation(direction === 'left' ? 'swipe-left' : 'swipe-right');
    
    // Call the onSwipe handler
    onSwipe(currentJob, direction);
    
    // Move to next card after animation
    setTimeout(() => {
      setCurrentIndex(prev => prev + 1);
      setSwipeAnimation("");
    }, 600);
  };

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => handleSwipe('left'),
    onSwipeRight: () => handleSwipe('right'),
  });

  if (currentIndex >= jobs.length) {
    return (
      <div className="relative px-4 mt-6 h-96 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
          <p className="text-sm">Check back later for new job opportunities.</p>
        </div>
      </div>
    );
  }

  const currentJob = jobs[currentIndex];
  const nextJob = jobs[currentIndex + 1];
  const thirdJob = jobs[currentIndex + 2];

  return (
    <div className="relative px-4 mt-6">
      {/* Job Cards Stack */}
      <div 
        ref={cardRef}
        className="relative h-96"
        {...swipeHandlers}
      >
        {/* Third Card (Back) */}
        {thirdJob && (
          <JobCard
            job={thirdJob}
            user={user}
            style={{
              zIndex: 1,
              transform: 'scale(0.9) translateY(16px)',
            }}
          />
        )}

        {/* Second Card (Behind) */}
        {nextJob && (
          <JobCard
            job={nextJob}
            user={user}
            style={{
              zIndex: 2,
              transform: 'scale(0.95) translateY(8px)',
            }}
          />
        )}

        {/* Top Card (Active) */}
        <JobCard
          job={currentJob}
          user={user}
          isTop={true}
          style={{
            zIndex: 3,
          }}
          className={swipeAnimation}
          onSwipeLeft={() => handleSwipe('left')}
          onSwipeRight={() => handleSwipe('right')}
          onBookmark={() => onBookmark(currentJob)}
        />
      </div>

      {/* Swipe Action Buttons */}
      <div className="flex items-center justify-center space-x-8 mt-8">
        <Button
          size="lg"
          variant="outline"
          className="w-14 h-14 rounded-full border-red-200 hover:bg-red-100 hover:border-red-300"
          onClick={() => handleSwipe('left')}
        >
          <X className="w-6 h-6 text-red-500" />
        </Button>
        
        <Button
          size="lg"
          variant="outline"
          className="w-14 h-14 rounded-full border-yellow-200 hover:bg-yellow-100 hover:border-yellow-300"
          onClick={() => onBookmark(currentJob)}
        >
          <Bookmark className="w-5 h-5 text-yellow-600" />
        </Button>
        
        <Button
          size="lg"
          className="w-16 h-16 rounded-full bg-success hover:bg-success/90 shadow-lg"
          onClick={() => handleSwipe('right')}
        >
          <Heart className="w-6 h-6 text-white" />
        </Button>
      </div>

      {/* Progress indicator */}
      <div className="flex justify-center mt-6 space-x-1">
        {jobs.slice(0, Math.min(5, jobs.length)).map((_, index) => (
          <div
            key={index}
            className={`w-2 h-2 rounded-full transition-colors ${
              index === currentIndex
                ? 'bg-primary'
                : index < currentIndex
                ? 'bg-success'
                : 'bg-gray-300'
            }`}
          />
        ))}
        {jobs.length > 5 && (
          <span className="text-xs text-gray-500 ml-2">
            {currentIndex + 1} of {jobs.length}
          </span>
        )}
      </div>
    </div>
  );
}
