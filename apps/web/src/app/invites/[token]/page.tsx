import { Suspense } from "react";
import AuthPageSkeleton from "@/components/AuthPageSkeleton";
import InviteAcceptContent from "./invite-content";

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton titleKey="invite.title" />}>
      <InviteAcceptContent />
    </Suspense>
  );
}
