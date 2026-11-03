import { useEffect, useState } from 'react';

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

export function safeFilename(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'patient';
}

/** Per-device UI preference persisted in localStorage (falls back to memory). */
export function useLocalSetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`periodiag.${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`periodiag.${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep in memory */
    }
  }, [key, value]);
  return [value, setValue];
}

export const isCoarsePointer = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}
