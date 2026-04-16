"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { extractKeywords } from "@/lib/ats";

export function AtsKeywordCard({
  jdText,
  tailoredCV,
}: {
  jdText: string;
  tailoredCV?: string;
}) {
  const keywords = useMemo(() => extractKeywords(jdText), [jdText]);
  const cvLower = useMemo(() => (tailoredCV ?? "").toLowerCase(), [tailoredCV]);
  const keywordEntries = useMemo(
    () =>
      keywords.map((kw) => {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return { kw, present: new RegExp(`\\b${escaped}\\b`).test(cvLower) };
      }),
    [keywords, cvLower]
  );

  if (keywords.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>ATS Keyword Snapshot</CardTitle>
        <CardDescription>
          Top keywords from the job description.{" "}
          <span className="text-emerald-400 font-medium">Green</span> = present in your draft,{" "}
          <span className="text-red-400 font-medium">red</span> = missing.
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="pt-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {keywordEntries.map(({ kw, present }) => (
            <span
              key={kw}
              className={`rounded-full px-3 py-1 text-sm font-medium border ${
                present
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-red-500/10 text-red-400 border-red-500/30"
              }`}
            >
              {kw}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Extracted from the job description you submitted. Presence checked against your coaching
          draft.
        </p>
      </CardContent>
    </Card>
  );
}
