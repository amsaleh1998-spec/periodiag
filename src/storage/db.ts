// Local persistence in IndexedDB. Nothing leaves the device.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Exam, Patient } from '../domain/records';

interface PerioDB extends DBSchema {
  patients: { key: string; value: Patient };
  exams: { key: string; value: Exam; indexes: { byPatient: string } };
  settings: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<PerioDB>> | null = null;

function db(): Promise<IDBPDatabase<PerioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PerioDB>('periodiag', 1, {
      upgrade(d) {
        d.createObjectStore('patients', { keyPath: 'id' });
        const exams = d.createObjectStore('exams', { keyPath: 'id' });
        exams.createIndex('byPatient', 'patientId');
        d.createObjectStore('settings');
      },
    });
  }
  return dbPromise;
}

export async function listPatients(): Promise<Patient[]> {
  const all = await (await db()).getAll('patients');
  return all.sort((a, b) => a.label.localeCompare(b.label));
}

export async function savePatient(p: Patient): Promise<void> {
  await (await db()).put('patients', { ...p, updatedAt: new Date().toISOString() });
}

export async function deletePatient(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['patients', 'exams'], 'readwrite');
  const exams = await tx.objectStore('exams').index('byPatient').getAllKeys(id);
  for (const k of exams) await tx.objectStore('exams').delete(k);
  await tx.objectStore('patients').delete(id);
  await tx.done;
}

export async function listExams(patientId: string): Promise<Exam[]> {
  const all = await (await db()).getAllFromIndex('exams', 'byPatient', patientId);
  return all.sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
}

export async function listAllExams(): Promise<Exam[]> {
  return (await db()).getAll('exams');
}

export async function saveExam(e: Exam): Promise<void> {
  await (await db()).put('exams', e);
}

export async function deleteExam(id: string): Promise<void> {
  await (await db()).delete('exams', id);
}

export async function importRecords(patients: Patient[], exams: Exam[], mode: 'merge' | 'replace'): Promise<void> {
  const d = await db();
  const tx = d.transaction(['patients', 'exams'], 'readwrite');
  if (mode === 'replace') {
    await tx.objectStore('patients').clear();
    await tx.objectStore('exams').clear();
  }
  for (const p of patients) await tx.objectStore('patients').put(p);
  for (const e of exams) await tx.objectStore('exams').put(e);
  await tx.done;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const v = await (await db()).get('settings', key);
  return v === undefined ? fallback : (v as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put('settings', value, key);
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
