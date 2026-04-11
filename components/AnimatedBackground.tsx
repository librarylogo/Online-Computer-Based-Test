import React from 'react';

export const AnimatedBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      <div className="blob w-96 h-96 bg-kid-purple rounded-full mix-blend-multiply filter blur-xl opacity-20 -top-20 -left-20 animate-pulse"></div>
      <div className="blob w-96 h-96 bg-kid-blue rounded-full mix-blend-multiply filter blur-xl opacity-20 top-1/2 right-10 animate-pulse delay-1000"></div>
      <div className="blob w-80 h-80 bg-kid-pink rounded-full mix-blend-multiply filter blur-xl opacity-20 -bottom-20 left-1/3 animate-pulse delay-2000"></div>
    </div>
  );
};