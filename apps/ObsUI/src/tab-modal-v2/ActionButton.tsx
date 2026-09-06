import type { ButtonHTMLAttributes, ReactNode } from "react";

export function ActionButton({
  children,
  variant = "quiet",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: "primary" | "quiet" | "danger" }) {
  return <button {...props} className={`tab-modal-v2__action tab-modal-v2__action--${variant} ${className}`.trim()}>{children}</button>;
}

