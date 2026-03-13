import React, { useRef } from 'react';

interface AadhaarInputProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export const AadhaarInput: React.FC<AadhaarInputProps> = ({ value, onChange, disabled, required, className }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const rawValue = value.replace(/\D/g, '').slice(0, 12);
  
  // Format the value with spaces for the actual input
  let formattedValue = '';
  for (let i = 0; i < rawValue.length; i++) {
    if (i > 0 && i % 4 === 0) {
      formattedValue += ' ';
    }
    formattedValue += rawValue[i];
  }

  // Generate the background mask (e.g., "XXXX XXXX XXXX")
  let maskValue = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) {
      maskValue += ' ';
    }
    maskValue += 'X';
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Get the new raw value by removing non-digits
    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
    onChange(val);
  };

  return (
    <div className={`relative flex items-center bg-white border-2 border-slate-200 rounded-xl overflow-hidden focus-within:ring-4 focus-within:border-indigo-500 transition-all ${className || ''}`}>
      {/* Background mask */}
      <div className="absolute inset-y-0 left-0 flex items-center px-3 pointer-events-none font-mono tracking-widest text-xs w-full text-slate-300">
        <span className="opacity-0 font-bold">{formattedValue}</span>
        <span>{maskValue.substring(formattedValue.length)}</span>
      </div>
      
      {/* Actual input */}
      <input
        ref={inputRef}
        required={required}
        disabled={disabled}
        className="w-full p-3 bg-transparent font-mono tracking-widest text-xs text-slate-800 font-bold outline-none z-10"
        value={formattedValue}
        onChange={handleChange}
        placeholder=""
      />
    </div>
  );
};
