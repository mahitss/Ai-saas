"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-lg border bg-card p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-4 size-10 text-destructive" />
        <h1 className="text-2xl font-semibold tracking-tight">We hit a runtime error.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The app stayed contained. Try again, or refresh if this keeps happening.
        </p>
        <Button type="button" className="mt-6" onClick={reset}>
          <RefreshCw className="size-4" />
          Try again
        </Button>
      </section>
    </main>
  );
}
