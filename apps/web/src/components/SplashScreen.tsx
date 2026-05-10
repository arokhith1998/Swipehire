import { useEffect, useState } from "react";
import { SwipeHireLogo } from "./SwipeHireLogo";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [animationPhase, setAnimationPhase] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setAnimationPhase(1), 200);
    const timer2 = setTimeout(() => setAnimationPhase(2), 1200);
    const timer3 = setTimeout(() => setAnimationPhase(3), 2200);
    const timer4 = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 500);
    }, 2800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [onComplete]);

  if (!isVisible) return null;

  return (
    <div 
      className={`
        fixed inset-0 z-50 flex flex-col items-center justify-center 
        bg-gradient-to-br from-primary/10 via-white to-secondary/10
        transition-opacity duration-500 ease-out
        ${animationPhase === 3 ? 'opacity-0' : 'opacity-100'}
      `}
    >
      {/* Animated background circles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className={`
          absolute top-1/4 left-1/4 w-32 h-32 bg-primary/5 rounded-full
          transition-all duration-1000 ease-out
          ${animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
        `} />
        <div className={`
          absolute top-3/4 right-1/4 w-24 h-24 bg-secondary/5 rounded-full
          transition-all duration-1000 ease-out delay-300
          ${animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
        `} />
        <div className={`
          absolute bottom-1/4 left-1/3 w-20 h-20 bg-orange/5 rounded-full
          transition-all duration-1000 ease-out delay-500
          ${animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
        `} />
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center">
        {/* Logo with animation */}
        <div className={`
          transition-all duration-800 ease-out
          ${animationPhase >= 1 ? 'scale-100 opacity-100 translate-y-0' : 'scale-75 opacity-0 translate-y-8'}
        `}>
          <SwipeHireLogo size="xl" showText={false} className="justify-center mb-6" />
        </div>

        {/* Brand name with staggered animation */}
        <div className={`
          transition-all duration-800 ease-out delay-300
          ${animationPhase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}>
          <h1 className="text-4xl font-bold text-gray-900 mb-2 tracking-tight">
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              SwipeHire™
            </span>
          </h1>
        </div>

        {/* Tagline with animation */}
        <div className={`
          transition-all duration-800 ease-out delay-500
          ${animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}>
          <p className="text-lg text-brand-gray font-medium">
            Visa-aware job platform
          </p>
        </div>

        {/* Loading indicator */}
        <div className={`
          mt-12 transition-all duration-500 ease-out delay-700
          ${animationPhase >= 2 ? 'opacity-100' : 'opacity-0'}
        `}>
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-150" />
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-300" />
          </div>
          <p className="text-sm text-brand-gray mt-4 animate-pulse">
            Loading your opportunities...
          </p>
        </div>
      </div>

      {/* Swipe gesture hint animation */}
      <div className={`
        absolute bottom-20 left-1/2 transform -translate-x-1/2
        transition-all duration-1000 ease-out delay-1000
        ${animationPhase >= 2 ? 'opacity-60 translate-y-0' : 'opacity-0 translate-y-8'}
      `}>
        <div className="flex items-center space-x-4 text-brand-gray">
          <div className="w-8 h-12 border-2 border-gray-300 rounded-xl relative overflow-hidden">
            <div className="absolute inset-x-0 top-2 mx-auto w-1 h-3 bg-gray-400 rounded-full animate-bounce" />
          </div>
          <div className="text-xs">
            <div className="flex items-center space-x-1">
              <span>👈</span>
              <span>Swipe to discover</span>
              <span>👉</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}