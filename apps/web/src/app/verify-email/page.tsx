import { Suspense } from "react";
import AuthPageSkeleton from "@/components/AuthPageSkeleton";
import VerifyEmailContent from "./verify-email-content";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton titleKey="auth.verifyEmailTitle" />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
