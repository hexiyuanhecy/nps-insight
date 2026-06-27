'use client';

import { useState } from 'react';

export function TimePicker({ value, onChange, disabled = false }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempHour, setTempHour] = useState(parseInt(value?.split(':')[0], 10) || 10);
  const [tempMinute, setTempMinute] = useState(parseInt(value?.split(':')[1], 10) || 0);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  const handleSelect = () => {
    onChange(`${String(tempHour).padStart(2, '0')}:${String(tempMinute).padStart(2, '0')}`);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors disabled:bg-slate-50 disabled:text-slate-500"
      >
        {value || '10:00'}
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">小时</label>
            <div className="grid grid-cols-6 gap-1">
              {hours.map((h) => (
                <button
                  key={h}
                  onClick={() => setTempHour(parseInt(h, 10))}
                  className={`rounded px-2 py-1 text-xs font-mono transition-colors ${tempHour === parseInt(h, 10) ? 'bg-blue-500 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 p-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">分钟</label>
            <div className="grid grid-cols-4 gap-1">
              {minutes.map((m) => (
                <button
                  key={m}
                  onClick={() => setTempMinute(parseInt(m, 10))}
                  className={`rounded px-2 py-1 text-xs font-mono transition-colors ${tempMinute === parseInt(m, 10) ? 'bg-blue-500 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 p-2">
            <button
              onClick={handleSelect}
              className="w-full rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
