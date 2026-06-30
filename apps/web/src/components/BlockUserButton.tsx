"use client";

import { useState } from "react";
import { Loader2, ShieldBan } from "lucide-react";
import { useLocale } from "@/lib/locale";
import { localizeApiError } from "@/lib/api-errors";
import { blockUser } from "@/lib/safety-api";
import { Button } from "@/components/ui/Button";

interface BlockUserButtonProps {
  accessToken: string;
  userId: string;
  userName: string;
  onBlocked?: () => void;
  variant?: "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  showLabel?: boolean;
  disabled?: boolean;
}

export function BlockUserButton({
  accessToken,
  userId,
  userName,
  onBlocked,
  variant = "secondary",
  size = "sm",
  showLabel = true,
  disabled,
}: BlockUserButtonProps) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(t("safety.confirmBlock", userName));
    if (!confirmed) return;

    setLoading(true);
    try {
      await blockUser(accessToken, { userId });
      onBlocked?.();
    } catch (err) {
      window.alert(localizeApiError(err, "safety.blockFailed", t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={disabled || loading}
      onClick={handleClick}
      aria-label={t("safety.block")}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <>
          <ShieldBan size={14} className={showLabel ? "mr-1" : ""} />
          {showLabel && t("safety.block")}
        </>
      )}
    </Button>
  );
}
