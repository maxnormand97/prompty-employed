"use client";

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

export function ResumeDraftCard({ tailoredCV }: { tailoredCV: string }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <div>
          <CardTitle>Resume Coaching Draft</CardTitle>
          <CardDescription>
            A reordered and refocused version of your resume to show you what to emphasise for this
            role. Review every line — do not submit this as-is. Only include claims that are
            accurate to your actual experience.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="default"
            onClick={() => copy(stripMarkdown(tailoredCV))}
            aria-label="Copy resume coaching draft as plain text"
          >
            {copied ? "Copied!" : "Copy Text"}
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={() => downloadMarkdown(tailoredCV, "tailored-cv.md")}
            aria-label="Download resume coaching draft as Markdown"
          >
            Download Draft (.md)
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-6 space-y-4">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          ⚠ This is a coaching tool, not a finished document. Verify all content before use.
        </div>
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{tailoredCV}</ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
}
