import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ 
  title, message, confirmLabel = 'Yes, Proceed', cancelLabel = 'Cancel', variant = 'default', onConfirm, onCancel 
}) => {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div 
        onClick={e => e.stopPropagation()} 
        className="relative bg-white rounded-[28px] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
      >
        <div className="p-8 text-center">
          <div className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center ${variant === 'danger' ? 'bg-rose-50' : 'bg-indigo-50'}`}>
            <AlertTriangle size={28} className={variant === 'danger' ? 'text-rose-500' : 'text-indigo-500'} />
          </div>
          <h3 className="text-lg font-black text-slate-800 tracking-tight uppercase mb-2">{title}</h3>
          <p className="text-sm text-slate-500 font-medium leading-relaxed">{message}</p>
        </div>
        <div className="flex border-t border-slate-100">
          <button 
            onClick={onCancel} 
            className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
          >
            <X size={16} /> {cancelLabel}
          </button>
          <button 
            onClick={onConfirm} 
            className={`flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-white transition-all flex items-center justify-center gap-2 ${variant === 'danger' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            <Check size={16} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
