"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseResumeUpload } from "@/lib/resume-upload";
import type { ResumeRecord } from "@/lib/types";
import { useResumeLibrary } from "@/hooks/use-resume-library";

function formatDate(iso?: string) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function excerpt(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function ResumeLibraryClient() {
  const router = useRouter();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [manualName, setManualName] = useState("");
  const [manualText, setManualText] = useState("");
  const [busyResumeId, setBusyResumeId] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<ResumeRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    resumes,
    selectedResume,
    saveResume,
    selectResume,
    removeResume,
  } = useResumeLibrary();

  async function handleUploadedFile(file: File, existing?: ResumeRecord) {
    setError(null);
    setBusyResumeId(existing?.id ?? "upload");
    try {
      const parsed = await parseResumeUpload(file);
      saveResume({
        id: existing?.id,
        name: existing?.name ?? parsed.name.replace(/\.[^.]+$/, ""),
        text: parsed.text,
        source: "upload",
        fileType: parsed.fileType,
        mimeType: parsed.mimeType,
      });
      setReplaceTarget(null);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to read that resume file."
      );
    } finally {
      setBusyResumeId(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }

  function handleManualSave() {
    setError(null);
    const trimmedName = manualName.trim();
    const trimmedText = manualText.trim();

    if (!trimmedName) {
      setError("Give the resume a name before saving it.");
      return;
    }

    if (trimmedText.length < 200) {
      setError("Resume text must be at least 200 characters before it can be saved.");
      return;
    }

    saveResume({
      name: trimmedName,
      text: trimmedText,
      source: "manual",
    });
    setManualName("");
    setManualText("");
  }

  return (
    <div className="space-y-6">
      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUploadedFile(file);
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && replaceTarget) void handleUploadedFile(file, replaceTarget);
        }}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upload a resume</CardTitle>
            <CardDescription>
              Upload a PDF, DOCX, or TXT file. We extract the text and keep the resume in your browser for later reuse.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
              <p>Supported formats: PDF, DOCX, TXT</p>
              <p className="mt-1">Uploaded resumes stay local to this browser until you submit an application.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => uploadInputRef.current?.click()}>
              {busyResumeId === "upload" ? "Uploading…" : "Upload resume file"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Save from pasted text</CardTitle>
            <CardDescription>
              Keep a cleaned-up master resume or alternate version without uploading a file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              placeholder="Resume name"
            />
            <Textarea
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              rows={9}
              className="resize-y font-mono text-sm leading-relaxed"
              placeholder="Paste resume text here"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {manualText.length.toLocaleString()} characters
              </span>
              <Button type="button" onClick={handleManualSave}>
                Save resume
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Saved resumes</h2>
            <p className="text-sm text-muted-foreground">
              {resumes.length} saved resume{resumes.length === 1 ? "" : "s"}
            </p>
          </div>
          {selectedResume && (
            <Button type="button" onClick={() => router.push("/")}>Use selected resume</Button>
          )}
        </div>

        {resumes.length === 0 ? (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="py-10 text-center text-muted-foreground">
              No resumes saved yet. Upload a file or paste text to create your first saved version.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {resumes.map((resume) => {
              const isSelected = selectedResume?.id === resume.id;
              return (
                <Card key={resume.id} className={isSelected ? "border-violet-500/30 bg-violet-500/5" : undefined}>
                  <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{resume.name}</CardTitle>
                        {isSelected && (
                          <Badge className="bg-violet-600/20 text-violet-200 border-violet-500/30">
                            Selected
                          </Badge>
                        )}
                        <Badge variant="outline">{resume.source}</Badge>
                        {resume.fileType && <Badge variant="outline">{resume.fileType.toUpperCase()}</Badge>}
                      </div>
                      <CardDescription>
                        Saved {formatDate(resume.uploadedAt)} · Updated {formatDate(resume.updatedAt)} · Last used {formatDate(resume.lastUsedAt)}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant={isSelected ? "secondary" : "outline"} size="sm" onClick={() => selectResume(resume.id)}>
                        {isSelected ? "Selected" : "Select"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReplaceTarget(resume);
                          replaceInputRef.current?.click();
                        }}
                        disabled={busyResumeId === resume.id}
                      >
                        {busyResumeId === resume.id ? "Replacing…" : "Replace file"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeResume(resume.id)}>
                        Delete
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{excerpt(resume.text)}…</p>
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{resume.text.length.toLocaleString()} characters</span>
                      <Link href="/" className="hover:text-foreground transition-colors">
                        Go tailor with this resume →
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
