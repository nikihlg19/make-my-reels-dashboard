import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, X } from 'lucide-react';

export interface PaymentQRModalProps {
  onClose: () => void;
}

const PaymentQRModal: React.FC<PaymentQRModalProps> = ({ onClose }) => {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl p-8 animate-in zoom-in-95 duration-300 relative border border-white/20 flex flex-col items-center text-center"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-all"
        >
          <X size={20} />
        </button>

        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4">
          <QrCode size={32} />
        </div>

        <h3 className="text-xl font-black text-slate-800 tracking-tight uppercase mb-1">Payment QR</h3>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">Scan to pay</p>

        <div className="bg-[#141414] p-6 rounded-2xl border border-slate-800 w-full aspect-square flex items-center justify-center overflow-hidden shadow-inner">
          <QRCodeSVG
            value={import.meta.env.VITE_UPI_ADDRESS || 'upi://pay?pa=nikhil.gandham@ybl&pn=Nikhil%20Gandham'}
            size={256}
            bgColor="#141414"
            fgColor="#ffffff"
            level="H"
            includeMargin={false}
            imageSettings={{
              src: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/PhonePe_Logo.svg/512px-PhonePe_Logo.svg.png",
              height: 48,
              width: 48,
              excavate: true,
            }}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
    </div>
  );
};

export default PaymentQRModal;
