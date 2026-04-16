"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JobStatus, TailoredOutput } from "@/lib/types";

type SSEPayload =
  | { status: "PENDING" | "DRAFTING" | "CRITIQUE" }
  | { status: "COMPLETE"; result: TailoredOutput }
  | { status: "FAILED"; errorMessage: string };

export interface JobStreamState {
  status: JobStatus;
  result: TailoredOutput | null;
  errorMessage: string;
  jdText: string;
  resultsRef: React.RefObject<HTMLDivElement | null>;
}

export function useJobStream(jobId: string): JobStreamState {
  const [status, setStatus] = useState<JobStatus>("PENDING");
  const [result, setResult] = useState<TailoredOutput | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const jdText = useMemo(
    () =>
      typeof window !== "undefined" ? (window.localStorage.getItem(`jd-${jobId}`) ?? "") : "",
    [jobId]
  );
  const resultsRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.onmessage = (event) => {
      let payload: SSEPayload;
      try {
        payload = JSON.parse(event.data as string) as SSEPayload;
      } catch {
        return;
      }

      setStatus(payload.status);

      if (payload.status === "COMPLETE") {
        setResult(payload.result);
        es.close();

        // In dev mode, attach the AI result to the existing run row in local SQLite.
        // Fire-and-forget — do not block result rendering.
        if (process.env.NODE_ENV === "development") {
          void fetch("/api/dev/runs", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId, result: payload.result }),
          });
        }

        if (!hasScrolled.current) {
          hasScrolled.current = true;
          setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 200);
        }
      }

      if (payload.status === "FAILED") {
        setErrorMessage(payload.errorMessage ?? "An unexpected error occurred.");
        es.close();
      }
    };

    es.onerror = () => {
      setStatus("FAILED");
      setErrorMessage("Lost connection to the server. Please try again.");
      es.close();
    };

    return () => es.close();
  }, [jobId]);

  return { status, result, errorMessage, jdText, resultsRef };
}
