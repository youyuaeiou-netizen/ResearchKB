import type { HTMLAttributes, ReactNode } from "react";

export function ContentCard({ children, className = "", accent = "steel", ...props }: HTMLAttributes<HTMLElement> & { children?: ReactNode; accent?: "steel" | "blue" | "gold" | "green" | "violet" }) {
  return <article {...props} className={`tab-modal-v2__content-card tab-modal-v2__content-card--${accent} ${className}`.trim()}>{children}</article>;
}

