import { Children, cloneElement, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "icon";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent",
  ghost:
    "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
  danger:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
  icon:
    "h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  asChild,
  ...props
}: ButtonProps) {
  const classes =
    variant === "icon"
      ? [base, variants.icon, className].filter(Boolean).join(" ")
      : [base, sizes[size], variants[variant], className].filter(Boolean).join(" ");

  if (asChild && children) {
    const child = Children.only(children) as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      className: [classes, child.props.className].filter(Boolean).join(" "),
      ...props,
    } as Record<string, unknown>);
  }

  return (
    <button className={classes} disabled={disabled} {...props}>
      {children}
    </button>
  );
}

export default Button;
