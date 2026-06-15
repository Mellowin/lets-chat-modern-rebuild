import Image from "next/image";
import { getAvatarUrl } from "@/lib/avatar-url";

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
};

export function Avatar({ src, alt = "", name, size = "md", className = "" }: AvatarProps) {
  const initials = (name || "?").slice(0, 2).toUpperCase();
  const resolved = getAvatarUrl(src || null);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center ${sizes[size]} ${className}`}
      aria-label={resolved ? undefined : alt || undefined}
      role={resolved ? undefined : "img"}
    >
      {resolved ? (
        <Image
          src={resolved}
          alt={alt || ""}
          fill
          className="object-cover"
          sizes={size === "lg" ? "40px" : size === "sm" ? "24px" : "32px"}
          unoptimized
        />
      ) : (
        <span className="font-medium text-muted-foreground select-none">{initials}</span>
      )}
    </div>
  );
}

export default Avatar;
