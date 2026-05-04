"use client";

import { useCallback, useMemo, useState } from "react";
import type { ResumeFileType, ResumeRecord, ResumeSource } from "@/lib/types";
import {
  deleteResumeRecord,
  getSelectedResumeId,
  listStoredResumes,
  markResumeUsed,
  saveResumeRecord,
  setSelectedResumeId,
} from "@/lib/resume-library";

export interface UseResumeLibraryState {
  resumes: ResumeRecord[];
  selectedResumeId: string | null;
  selectedResume: ResumeRecord | null;
  loaded: boolean;
  saveResume: (input: {
    id?: string;
    name: string;
    text: string;
    source: ResumeSource;
    fileType?: ResumeFileType;
    mimeType?: string;
  }) => ResumeRecord;
  selectResume: (resumeId: string | null) => void;
  removeResume: (resumeId: string) => void;
  touchResume: (resumeId: string) => ResumeRecord | null;
  refresh: () => void;
}

export function useResumeLibrary(): UseResumeLibraryState {
  const [resumes, setResumes] = useState<ResumeRecord[]>(listStoredResumes);
  const [selectedResumeId, setSelectedResumeIdState] = useState<string | null>(getSelectedResumeId);
  const [loaded, setLoaded] = useState(true);

  const refresh = useCallback(() => {
    setResumes(listStoredResumes());
    setSelectedResumeIdState(getSelectedResumeId());
  }, []);

  const saveResume = useCallback<UseResumeLibraryState["saveResume"]>((input) => {
    const next = saveResumeRecord(input);
    setSelectedResumeId(next.id);
    refresh();
    return next;
  }, [refresh]);

  const selectResume = useCallback((resumeId: string | null) => {
    setSelectedResumeId(resumeId);
    refresh();
  }, [refresh]);

  const removeResume = useCallback((resumeId: string) => {
    deleteResumeRecord(resumeId);
    refresh();
  }, [refresh]);

  const touchResume = useCallback((resumeId: string) => {
    const next = markResumeUsed(resumeId);
    refresh();
    return next;
  }, [refresh]);

  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.id === selectedResumeId) ?? null,
    [resumes, selectedResumeId]
  );

  return {
    resumes,
    selectedResumeId,
    selectedResume,
    loaded,
    saveResume,
    selectResume,
    removeResume,
    touchResume,
    refresh,
  };
}
