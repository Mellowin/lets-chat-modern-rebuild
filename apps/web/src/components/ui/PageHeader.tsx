import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: ReactNode;
  titleLabel?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, titleLabel, subtitle, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div>
        <h1 aria-label={titleLabel} className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">{actions}</div>}
    </div>
  );
}

export default PageHeader;
