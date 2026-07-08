import { useCallback, useEffect, useState } from "react";

const DEFAULT_COOLDOWN_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;

export interface UseResendCooldownOptions {
  cooldownSeconds?: number;
  maxAttempts?: number;
}

export function useResendCooldown(options: UseResendCooldownOptions = {}) {
  const cooldownSeconds = options.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const [cooldown, setCooldown] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;

    const id = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(id);
  }, [cooldown]);

  const startCooldown = useCallback(() => {
    setCooldown(cooldownSeconds);
    setAttempts((prev) => {
      const next = prev + 1;
      if (next >= maxAttempts) {
        setLimitReached(true);
      }
      return next;
    });
  }, [cooldownSeconds, maxAttempts]);

  const reset = useCallback(() => {
    setCooldown(0);
    setAttempts(0);
    setLimitReached(false);
  }, []);

  return {
    cooldown,
    attempts,
    limitReached,
    canResend: cooldown === 0 && !limitReached,
    startCooldown,
    reset,
  };
}
