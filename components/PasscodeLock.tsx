
import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Unlock, X, ShieldCheck, Delete, Keyboard } from 'lucide-react';

interface PasscodeLockProps {
  onUnlock: () => void;
  onClose: () => void;
  correctPasscode: string;
  title?: string;
  subtitle?: string;
  length?: number;
}

const PasscodeLock: React.FC<PasscodeLockProps> = ({ 
  onUnlock, 
  onClose, 
  correctPasscode,
  title = "Security Access",
  subtitle = "Enter Code",
  length = 6
}) => {
  const [passcode, setPasscode] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'error' | 'success'>('idle');

  const handleKeyPress = useCallback((num: string) => {
    if (passcode.length < length && status !== 'success') {
      setPasscode(prev => prev + num);
    }
  }, [passcode.length, status, length]);

  const handleBackspace = useCallback(() => {
    if (status !== 'success') {
      setPasscode(prev => prev.slice(0, -1));
    }
  }, [status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyPress, handleBackspace, onClose]);

  useEffect(() => {
    if (passcode.length === length) {
      if (passcode === correctPasscode) {
        setStatus('success');
        setTimeout(() => {
          onUnlock();
        }, 600);
      } else {
        setStatus('error');
        setTimeout(() => {
          setPasscode('');
          setStatus('idle');
        }, 1000);
      }
    }
  }, [passcode, correctPasscode, onUnlock, length]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[999] p-4">
      {/* Semi-transparent Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-[400px] bg-slate-900 border border-white/10 rounded-[48px] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Modal Background Decor */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-20%] w-full h-full bg-indigo-600/10 blur-[80px] rounded-full" />
        </div>

        <div className="relative px-8 py-10 flex flex-col items-center">
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-2xl transition-all text-slate-500 hover:text-white active:scale-90 group"
          >
            <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>

          <div className="flex flex-col items-center mb-10">
            <div className={`relative w-20 h-20 rounded-[24px] mb-6 flex items-center justify-center transition-all duration-500 ${
              status === 'success' ? 'bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.3)] scale-110' : 
              status === 'error' ? 'bg-rose-500 animate-shake' : 
              'bg-white/5 border border-white/10'
            }`}>
              {status === 'success' ? <Unlock size={32} className="text-white" /> : 
               status === 'error' ? <ShieldCheck size={32} className="text-white" /> : 
               <Lock size={32} className="text-indigo-400 opacity-80" />}
            </div>
            
            <h2 className="text-xl font-black text-white tracking-tighter uppercase mb-2">{status === 'success' ? 'Granted' : title}</h2>
            
            <div className="flex flex-col items-center gap-2">
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] text-center">
                {status === 'error' ? 'Invalid PIN' : 
                 status === 'success' ? 'Identity Verified' : 
                 subtitle}
              </p>
              
              {status === 'idle' && (
                <div className="flex items-center gap-1.5 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20 animate-pulse">
                  <Keyboard size={10} className="text-indigo-400" />
                  <span className="text-[7px] font-black text-indigo-400 uppercase tracking-widest">Keyboard Ready</span>
                </div>
              )}
            </div>
          </div>

          {/* Passcode Indicators */}
          <div className="flex gap-3 mb-10">
            {Array.from({ length }).map((_, index) => {
              const isActive = passcode.length > index;
              return (
                <div 
                  key={index} 
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 ${
                    isActive 
                      ? status === 'success' ? 'bg-emerald-400 border-emerald-400' : 
                        status === 'error' ? 'bg-rose-400 border-rose-400' : 
                        'bg-indigo-500 border-indigo-500 scale-125 shadow-[0_0_12px_rgba(99,102,241,0.5)]' 
                      : 'border-white/10 bg-white/5'
                  }`}
                />
              );
            })}
          </div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-4 w-full max-w-[240px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((key, i) => {
              if (key === '') return <div key={`empty-${i}`} />;
              if (key === 'back') {
                return (
                  <button
                    key="back"
                    onClick={handleBackspace}
                    className="w-14 h-14 flex items-center justify-center text-slate-500 hover:text-white transition-colors active:scale-75"
                  >
                    <Delete size={20} />
                  </button>
                );
              }
              return (
                <button
                  key={`num-${key}`}
                  onClick={() => handleKeyPress(key)}
                  className="w-14 h-14 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 active:scale-90 transition-all flex items-center justify-center group"
                >
                  <span className="text-xl font-bold text-white group-hover:scale-110 transition-transform">{key}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-10 flex flex-col items-center gap-2">
            <div className="h-0.5 w-10 bg-indigo-500/20 rounded-full overflow-hidden">
               <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(passcode.length / length) * 100}%` }} />
            </div>
            <span className="text-[7px] font-black text-slate-700 uppercase tracking-[0.4em]">Secure Auth v3.2</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.15s ease-in-out 0s 4; }
      `}</style>
    </div>
  );
};

export default PasscodeLock;
