import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground">
      <div className="inline-flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="size-4 animate-spin text-primary" />
        Loading Logicra...
      </div>
    </main>
  );
}
