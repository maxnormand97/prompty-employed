"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { ResumeRecord } from "@/lib/types";
import { parseResumeUpload } from "@/lib/resume-upload";
import { useResumeLibrary } from "@/hooks/use-resume-library";
import { cn } from "@/lib/utils";

interface ResumePickerCardProps {
  onResumeTextChange: (text: string) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shorten(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function ResumePickerCard({ onResumeTextChange }: ResumePickerCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { resumes, selectedResume, selectResume, saveResume, loaded } = useResumeLibrary();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);

    try {
      const parsed = await parseResumeUpload(file);
      const saved = saveResume({
        name: parsed.name.replace(/\.[^.]+$/, ""),
        text: parsed.text,
        source: "upload",
        fileType: parsed.fileType,
        mimeType: parsed.mimeType,
      });
      onResumeTextChange(saved.text);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload that resume. Try another file or paste the text below."
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleSelect(resume: ResumeRecord) {
    selectResume(resume.id);
    onResumeTextChange(resume.text);
    setError(null);
  }

  function handleClearSelection() {
    selectResume(null);
    setError(null);
  }

  return (
    <Card className="border-violet-500/20 bg-card/80">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Resume Library</CardTitle>
            <CardDescription>
              Choose a saved resume or upload a PDF, DOCX, or TXT file before tailoring.
            </CardDescription>
          </div>
          <Link
            href="/resumes"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Manage resumes
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload resume"}
          </Button>
          <Button type="button" variant="ghost" onClick={handleClearSelection}>
            Use text below only
          </Button>
          <span className="text-xs text-muted-foreground">
            {loaded ? `${resumes.length} saved resume${resumes.length === 1 ? "" : "s"}` : "Loading…"}
          </span>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {selectedResume ? (
          <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{selectedResume.name}</p>
                <p className="text-sm text-muted-foreground">
                  Selected for this application · Updated {formatDate(selectedResume.updatedAt)}
                </p>
              </div>
              <Badge className="bg-violet-600/20 text-violet-200 border-violet-500/30">
                Selected
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{shorten(selectedResume.text)}…</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
            No saved resume selected. Upload one here or paste text into the resume field below.
          </div>
        )}

        {resumes.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quick select
            </p>
            <div className="flex flex-wrap gap-2">
              {resumes.slice(0, 6).map((resume) => (
                <Button
                  key={resume.id}
                  type="button"
                  variant={selectedResume?.id === resume.id ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => handleSelect(resume)}
                >
                  {resume.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
