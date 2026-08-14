import { Suspense } from "react";
import { CancelAccountDeletionContent } from "./cancel-account-deletion-content";

export default function CancelAccountDeletionPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center p-6">
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading...
          </div>
        </div>
      }
    >
      <CancelAccountDeletionContent />
    </Suspense>
  );
}
