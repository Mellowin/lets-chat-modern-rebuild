"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useLocale } from "@/lib/locale";
import type { TranslationKey } from "@/lib/locale";

interface AuthPageSkeletonProps {
  titleKey: TranslationKey;
}

export default function AuthPageSkeleton({ titleKey }: AuthPageSkeletonProps) {
  const { t } = useLocale();
  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t(titleKey)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("auth.loading")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
