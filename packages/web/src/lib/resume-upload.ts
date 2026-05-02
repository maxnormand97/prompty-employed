import type { ResumeFileType } from "@/lib/types";

export interface ParsedResumeUpload {
  name: string;
  fileType: ResumeFileType;
  mimeType?: string;
  text: string;
}

export async function parseResumeUpload(file: File): Promise<ParsedResumeUpload> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/resumes/parse", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    name?: string;
    fileType?: ResumeFileType;
    mimeType?: string;
    text?: string;
  };

  if (!response.ok || !payload.name || !payload.fileType || typeof payload.text !== "string") {
    throw new Error(payload.error ?? "Failed to parse resume upload");
  }

  return {
    name: payload.name,
    fileType: payload.fileType,
    mimeType: payload.mimeType,
    text: payload.text,
  };
}
