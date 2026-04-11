import React from 'react';

export const BackgroundShapes: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10 h-full w-full">
        {/* SQUARES */}
        <div className="absolute top-1/4 left-1/4 w-12 h-12 bg-red-400/40 rounded animate-float-slow backdrop-blur-sm"></div>
        <div className="absolute bottom-1/3 right-1/4 w-16 h-16 bg-blue-500/30 rounded-lg animate-float-fast backdrop-blur-sm rotate-45"></div>
        
        {/* CIRCLES */}
        <div className="absolute top-10 right-10 w-24 h-24 bg-yellow-400/30 rounded-full animate-float-medium backdrop-blur-sm"></div>
        <div className="absolute bottom-10 left-10 w-32 h-32 bg-purple-500/20 rounded-full animate-float-reverse backdrop-blur-sm"></div>
        <div className="absolute top-1/2 left-1/2 w-20 h-20 bg-pink-400/20 rounded-full animate-float-slow -translate-x-1/2"></div>
        
        {/* DOTS */}
        <div className="absolute top-1/3 left-10 w-4 h-4 bg-yellow-500 rounded-full animate-float-fast shadow-lg"></div>
        <div className="absolute top-20 right-1/3 w-5 h-5 bg-red-500 rounded-full animate-float-slow shadow-lg"></div>
        <div className="absolute bottom-20 left-1/3 w-6 h-6 bg-cyan-500 rounded-full animate-float-medium shadow-lg"></div>

        {/* TRIANGLES (CSS Shapes) */}
        {/* Orange Triangle */}
        <div className="absolute bottom-32 right-20 w-0 h-0 border-l-[25px] border-l-transparent border-r-[25px] border-r-transparent border-b-[40px] border-b-orange-400/50 animate-float-medium rotate-12"></div>
        {/* Green Triangle */}
        <div className="absolute top-32 left-32 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-b-[35px] border-b-green-400/40 animate-float-reverse -rotate-12"></div>
        {/* Blue Triangle */}
        <div className="absolute bottom-1/2 right-10 w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-b-[25px] border-b-blue-600/30 animate-float-slow rotate-90"></div>
    </div>
  );
};
