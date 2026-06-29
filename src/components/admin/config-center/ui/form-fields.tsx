'use client';

import { CheckCircle, Eye, EyeOff, Pencil } from 'lucide-react';
import { useState } from 'react';

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function SecretField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  saved,
  disabled = false,
  mode = 'manual',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  saved: boolean;
  disabled?: boolean;
  /** 编辑模式：manual=手动点击编辑，auto=直接可编辑（配合 AutoSaveField 使用） */
  mode?: 'manual' | 'auto';
}) {
  const [editing, setEditing] = useState(!saved);
  const [visible, setVisible] = useState(false);

  const handleEdit = () => {
    setEditing(true);
    onChange('');
  };

  const handleSave = () => {
    setEditing(false);
    setVisible(false);
  };

  // auto 模式：直接显示输入框 + 显示/隐藏按钮，由外部处理保存
  if (mode === 'auto') {
    const isSaved = value === '__SET__';
    const displayValue = isSaved ? '••••••••' : value;

    return (
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type={visible ? 'text' : 'password'}
            value={displayValue}
            data-saved={isSaved ? 'true' : 'false'}
            onChange={(e) => {
              // 如果是已保存状态，用户第一次输入时清空掩码
              if (isSaved) {
                onChange(e.target.value === '••••••••' ? '' : e.target.value);
              } else {
                onChange(e.target.value);
              }
            }}
            onFocus={(e) => {
              // 聚焦时如果是掩码状态，全选文本方便用户直接输入覆盖
              if (isSaved) {
                e.target.select();
              }
            }}
            placeholder={isSaved ? '已配置，输入新值将覆盖原有密钥' : placeholder}
            disabled={disabled}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            disabled={disabled}
            className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={visible ? '隐藏' : '显示'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {saved && !editing && !disabled ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            <span className="font-mono tracking-widest">● ● ● ● ● ● ● ●</span>
          </div>
          <button
            onClick={handleEdit}
            className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50 transition-colors"
            title="编辑"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      ) : saved && !editing && disabled ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            <span className="font-mono tracking-widest">● ● ● ● ● ● ● ●</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
          />
          <button
            onClick={() => setVisible(!visible)}
            disabled={disabled}
            className="rounded-lg border p-2 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={visible ? '隐藏' : '显示'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          {!disabled && (
            <button
              onClick={handleSave}
              className="rounded-lg border p-2 text-blue-600 hover:bg-blue-50 transition-colors"
              title="完成"
            >
              <CheckCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 3,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
