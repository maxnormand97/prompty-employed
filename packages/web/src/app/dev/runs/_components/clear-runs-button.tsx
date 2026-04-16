"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ClearRunsButton() {
  const router = useRouter();

  async function handleClear() {
    await fetch("/api/dev/runs", { method: "DELETE" });
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClear}
      className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      Clear all
    </Button>
  );
}
