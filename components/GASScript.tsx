import React, { useState } from 'react';
import { Clipboard, Check, Code2, ExternalLink } from 'lucide-react';
import { GAS_CODE } from '../src/utils/gasCode';

const GASScript: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(GAS_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-[#F4F5F7] overflow-y-auto p-6 md:p-10">
      <div className="max-w-4xl w-full mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Code2 size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Google Apps Script</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live Deployment Code — Always Up To Date</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg transition-all active:scale-95 shrink-0 ${copied ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            {copied ? <Check size={16} /> : <Clipboard size={16} />}
            {copied ? 'Copied!' : 'Copy All'}
          </button>
        </div>

        {/* Deployment Steps */}
        <div className="bg-amber-50 border border-amber-200 rounded-[24px] p-5 space-y-2">
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-3">Deployment Steps</p>
          {[
            'Open your Google Sheet → Extensions → Apps Script',
            'Select all existing code and delete it',
            'Paste the copied code',
            'Click Deploy → New Deployment → Web App',
            'Set "Execute as: Me" and "Who has access: Anyone"',
            'Copy the Web App URL and paste it in the Cloud Bridge settings',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <span className="text-xs font-semibold text-amber-800">{step}</span>
            </div>
          ))}
          <a
            href="https://script.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
          >
            <ExternalLink size={12} /> Open Google Apps Script
          </a>
        </div>

        {/* What's new */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-[24px] p-5">
          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-3">Latest Changes in This Version</p>
          <ul className="space-y-1">
            {[
              'Logs sheet now includes a "Fields" column showing which project fields were changed',
              'Timestamps in Logs are sent as IST from the app (2026-03-25 11:33:25 IST format)',
              'Error rows in Logs now correctly include the Fields column (empty string) to keep column alignment',
            ].map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-xs font-semibold text-emerald-800">
                <span className="text-emerald-500 mt-0.5">✓</span> {note}
              </li>
            ))}
          </ul>
        </div>

        {/* Code Block */}
        <div className="relative bg-slate-900 rounded-[24px] overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-5 py-3 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500" />
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="ml-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Code.gs</span>
            </div>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${copied ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {copied ? <Check size={12} /> : <Clipboard size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="text-[11px] text-slate-300 font-mono p-6 overflow-x-auto overflow-y-auto max-h-[60vh] custom-scrollbar leading-relaxed whitespace-pre">
            {GAS_CODE}
          </pre>
        </div>

      </div>
    </div>
  );
};

export default GASScript;
