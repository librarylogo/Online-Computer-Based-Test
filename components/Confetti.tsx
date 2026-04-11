import React, { useEffect, useState } from 'react';

export const Confetti: React.FC = () => {
  const [pieces, setPieces] = useState<any[]>([]);

  useEffect(() => {
    // Generate 50 confetti pieces
    const colors = ['#ffc107', '#0d6efd', '#dc3545', '#198754', '#6610f2', '#fd7e14'];
    const newPieces = Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100, // percent
      delay: Math.random() * 2, // seconds
      duration: 2 + Math.random() * 3, // seconds
      bg: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
    }));
    setPieces(newPieces);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute w-3 h-3 rounded-sm"
          style={{
            left: `${p.x}%`,
            top: '-20px',
            backgroundColor: p.bg,
            transform: `rotate(${p.rotation}deg)`,
            animation: `fall ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
