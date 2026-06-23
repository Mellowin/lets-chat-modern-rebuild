import type { ReactNode } from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div
      className={`group overflow-hidden rounded-xl border border-border bg-gradient-to-br from-card via-card to-muted/40 text-card-foreground shadow-md transition-shadow hover:shadow-lg dark:to-muted/20 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: CardProps) {
  return <div className={`flex flex-col gap-1.5 p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }: CardProps) {
  return <h3 className={`text-base sm:text-lg font-semibold leading-tight tracking-tight ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = "" }: CardProps) {
  return <p className={`text-sm text-muted-foreground leading-relaxed ${className}`}>{children}</p>;
}

export function CardContent({ children, className = "" }: CardProps) {
  return <div className={`p-5 pt-0 sm:p-6 sm:pt-0 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = "" }: CardProps) {
  return <div className={`flex items-center p-5 pt-0 sm:p-6 sm:pt-0 ${className}`}>{children}</div>;
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;
