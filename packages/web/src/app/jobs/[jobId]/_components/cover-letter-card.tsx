"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { downloadMarkdown, stripMarkdown } from "@/lib/markdown";

export function CoverLetterCard({ coverLetter }: { coverLetter: string }) {
  const [expanded, setExpanded] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Cover Letter</CardTitle>
            <CardDescription>A cover letter drafted specifically for this role.</CardDescription>
          </div>
          {expanded && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="default"
                onClick={() => copy(stripMarkdown(coverLetter))}
                aria-label="Copy cover letter as plain text"
              >
                {copied ? "Copied!" : "Copy Text"}
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => downloadMarkdown(coverLetter, "cover-letter.md")}
                aria-label="Download cover letter as Markdown"
              >
                Download .md
              </Button>
            </div>
          )}
        </div>
        {!expanded && (
          <div className="mt-4">
            <Button
              onClick={() => setExpanded(true)}
              className="bg-violet-600 hover:bg-violet-500 text-white"
            >
              Show Cover Letter
            </Button>
          </div>
        )}
      </CardHeader>
      {expanded && (
        <>
          <Separator />
          <CardContent className="pt-6">
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{coverLetter}</ReactMarkdown>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
