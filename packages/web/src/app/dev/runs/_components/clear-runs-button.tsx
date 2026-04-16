"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ClearRunsButton() {
  const router = useRouter();
  const [error, setError] = useState(false);

  async function handleClear() {
    setError(false);
    try {
      const res = await fetch("/api/dev/runs", { method: "DELETE" });
      if (!res.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClear}
        className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        Clear all
      </Button>
      {error && (
        <span className="text-xs text-destructive">Failed to clear runs. Please try again.</span>
      )}
    </div>
  );
}
