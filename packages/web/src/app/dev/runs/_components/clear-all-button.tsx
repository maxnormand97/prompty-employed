"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ClearAllButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClear() {
    setPending(true);
    try {
      await fetch("/api/dev/runs", { method: "DELETE" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleClear}
      disabled={pending}
    >
      {pending ? "Clearing…" : "Clear all"}
    </Button>
  );
}
