import { ResumeRecordSchema, type ResumeFileType, type ResumeRecord, type ResumeSource } from "@/lib/types";

export const RESUME_LIBRARY_STORAGE_KEY = "resume-library:v1";
export const SELECTED_RESUME_STORAGE_KEY = "selected-resume-id:v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function parseResumeRecords(raw: string | null): ResumeRecord[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ResumeRecordSchema.safeParse(item))
      .filter((result) => result.success)
      .map((result) => result.data);
  } catch {
    return [];
  }
}

function persistResumeRecords(records: ResumeRecord[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(RESUME_LIBRARY_STORAGE_KEY, JSON.stringify(records));
}

export function listStoredResumes(): ResumeRecord[] {
  if (!canUseStorage()) return [];
  const records = parseResumeRecords(window.localStorage.getItem(RESUME_LIBRARY_STORAGE_KEY));
  return [...records].sort((left, right) => {
    const leftTime = new Date(left.updatedAt).getTime();
    const rightTime = new Date(right.updatedAt).getTime();
    return rightTime - leftTime;
  });
}

export function getSelectedResumeId(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(SELECTED_RESUME_STORAGE_KEY);
}

export function setSelectedResumeId(resumeId: string | null) {
  if (!canUseStorage()) return;
  if (!resumeId) {
    window.localStorage.removeItem(SELECTED_RESUME_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(SELECTED_RESUME_STORAGE_KEY, resumeId);
}

export function saveResumeRecord(input: {
  id?: string;
  name: string;
  text: string;
  source: ResumeSource;
  fileType?: ResumeFileType;
  mimeType?: string;
}): ResumeRecord {
  const records = listStoredResumes();
  const now = new Date().toISOString();
  const existing = input.id ? records.find((record) => record.id === input.id) : undefined;
  const next: ResumeRecord = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    text: input.text,
    source: input.source,
    ...(input.fileType ? { fileType: input.fileType } : {}),
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    uploadedAt: existing?.uploadedAt ?? now,
    updatedAt: now,
    ...(existing?.lastUsedAt ? { lastUsedAt: existing.lastUsedAt } : {}),
  };

  const nextRecords = [
    next,
    ...records.filter((record) => record.id !== next.id),
  ];
  persistResumeRecords(nextRecords);
  return next;
}

export function deleteResumeRecord(resumeId: string) {
  const records = listStoredResumes().filter((record) => record.id !== resumeId);
  persistResumeRecords(records);

  if (getSelectedResumeId() === resumeId) {
    setSelectedResumeId(records[0]?.id ?? null);
  }
}

export function markResumeUsed(resumeId: string): ResumeRecord | null {
  const records = listStoredResumes();
  const target = records.find((record) => record.id === resumeId);
  if (!target) return null;

  const updated: ResumeRecord = {
    ...target,
    lastUsedAt: new Date().toISOString(),
  };

  persistResumeRecords([
    updated,
    ...records.filter((record) => record.id !== resumeId),
  ]);
  setSelectedResumeId(resumeId);
  return updated;
}

export function clearResumeLibrary() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(RESUME_LIBRARY_STORAGE_KEY);
  window.localStorage.removeItem(SELECTED_RESUME_STORAGE_KEY);
}
