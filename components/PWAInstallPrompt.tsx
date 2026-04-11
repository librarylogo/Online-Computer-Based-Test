import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export const PWAInstallPrompt: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setIsVisible(false);
        }
        setDeferredPrompt(null);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[999] animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative group">
                <button 
                    onClick={() => setIsVisible(false)}
                    className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-1 shadow-lg hover:bg-gray-700 transition z-10"
                >
                    <X size={12} />
                </button>
                <button 
                    onClick={handleInstallClick}
                    className="bg-blue-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 hover:bg-blue-700 transition transform hover:scale-105 border-2 border-white/20 backdrop-blur-sm"
                >
                    <div className="bg-white/20 p-2 rounded-xl">
                        <Download size={20} />
                    </div>
                    <div className="text-left pr-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Install Aplikasi</p>
                        <p className="text-sm font-bold leading-tight">Uji TKA Mandiri</p>
                    </div>
                </button>
            </div>
        </div>
    );
};
