// Local persistence in IndexedDB. Nothing leaves the device.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Exam, Patient } from '../domain/records';

/** A stored radiograph: original file plus a small JPEG thumbnail. */
export interface StoredImage {
  id: string;
  examId: string;
  patientId: string;
  name: string;
  type: string;
  width: number;
  height: number;
  addedAt: string;
  blob: Blob;
  thumb: Blob;
}

interface PerioDB extends DBSchema {
  patients: { key: string; value: Patient };
  exams: { key: string; value: Exam; indexes: { byPatient: string } };
  settings: { key: string; value: unknown };
  images: { key: string; value: StoredImage; indexes: { byExam: string; byPatient: string } };
}

let dbPromise: Promise<IDBPDatabase<PerioDB>> | null = null;

function db(): Promise<IDBPDatabase<PerioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PerioDB>('periodiag', 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('patients', { keyPath: 'id' });
          const exams = d.createObjectStore('exams', { keyPath: 'id' });
          exams.createIndex('byPatient', 'patientId');
          d.createObjectStore('settings');
        }
        if (oldVersion < 2) {
          const images = d.createObjectStore('images', { keyPath: 'id' });
          images.createIndex('byExam', 'examId');
          images.createIndex('byPatient', 'patientId');
        }
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
  const tx = d.transaction(['patients', 'exams', 'images'], 'readwrite');
  const exams = await tx.objectStore('exams').index('byPatient').getAllKeys(id);
  for (const k of exams) await tx.objectStore('exams').delete(k);
  const images = await tx.objectStore('images').index('byPatient').getAllKeys(id);
  for (const k of images) await tx.objectStore('images').delete(k);
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
  const d = await db();
  const tx = d.transaction(['exams', 'images'], 'readwrite');
  const images = await tx.objectStore('images').index('byExam').getAllKeys(id);
  for (const k of images) await tx.objectStore('images').delete(k);
  await tx.objectStore('exams').delete(id);
  await tx.done;
}

// ------------------------------------------------------------------ images

export async function saveImage(image: StoredImage): Promise<void> {
  await (await db()).put('images', image);
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return (await db()).get('images', id);
}

export async function deleteImage(id: string): Promise<void> {
  await (await db()).delete('images', id);
}

export async function listImagesForPatient(patientId: string): Promise<StoredImage[]> {
  return (await db()).getAllFromIndex('images', 'byPatient', patientId);
}

export async function listAllImages(): Promise<StoredImage[]> {
  return (await db()).getAll('images');
}

export async function importRecords(
  patients: Patient[],
  exams: Exam[],
  images: StoredImage[],
  mode: 'merge' | 'replace',
): Promise<void> {
  const d = await db();
  const tx = d.transaction(['patients', 'exams', 'images'], 'readwrite');
  if (mode === 'replace') {
    await tx.objectStore('patients').clear();
    await tx.objectStore('exams').clear();
    await tx.objectStore('images').clear();
  }
  for (const p of patients) await tx.objectStore('patients').put(p);
  for (const e of exams) await tx.objectStore('exams').put(e);
  for (const im of images) await tx.objectStore('images').put(im);
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
