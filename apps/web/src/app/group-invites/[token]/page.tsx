import { Suspense } from "react";
import AuthPageSkeleton from "@/components/AuthPageSkeleton";
import GroupInviteAcceptContent from "./invite-content";

export default function GroupInviteAcceptPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton titleKey="groupInvite.title" />}>
      <GroupInviteAcceptContent />
    </Suspense>
  );
}
