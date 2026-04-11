// Simple beep generator to avoid external asset dependencies
export const playAlertSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 880; // A5
    gainNode.gain.value = 0.1;

    oscillator.start();
    
    // Play a "warning" pattern
    setTimeout(() => { oscillator.frequency.value = 600; }, 100);
    setTimeout(() => { oscillator.frequency.value = 880; }, 200);
    setTimeout(() => { oscillator.frequency.value = 600; }, 300);
    setTimeout(() => { 
      oscillator.stop(); 
      ctx.close();
    }, 500);

  } catch (e) {
    console.error("Audio playback failed", e);
  }
};