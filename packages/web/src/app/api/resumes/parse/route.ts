import { NextResponse } from "next/server";
import { getResumeParser } from "@/lib/resume-parsing";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt"]);
const MIME_TO_FILE_TYPE = new Map<string, "pdf" | "docx" | "txt">([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["text/plain", "txt"],
]);

function getExtension(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

function getFileType(file: File): "pdf" | "docx" | "txt" | null {
  const ext = getExtension(file.name);
  if (ALLOWED_EXTENSIONS.has(ext)) return ext as "pdf" | "docx" | "txt";
  const byMime = MIME_TO_FILE_TYPE.get(file.type);
  return byMime ?? null;
}

async function parseResumeFile(file: File, fileType: "pdf" | "docx" | "txt"): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parser = getResumeParser();
  const result = await parser.parse({
    fileName: file.name,
    fileType,
    mimeType: file.type || undefined,
    bytes,
  });
  return result.text;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A resume file is required" }, { status: 400 });
  }

  const fileType = getFileType(file);
  if (!fileType) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload PDF, DOCX, or TXT." },
      { status: 400 }
    );
  }

  try {
    const text = (await parseResumeFile(file, fileType)).trim();
    return NextResponse.json({
      name: file.name,
      fileType,
      mimeType: file.type || undefined,
      text,
    });
  } catch (error) {
    console.error("Failed to parse uploaded resume", {
      fileName: file.name,
      fileType,
      error,
    });
    return NextResponse.json(
      { error: "Unable to read that file. Try another file or paste the text instead." },
      { status: 422 }
    );
  }
}
