import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type ClassName = string | false | null | undefined;

export function cx(...values: ClassName[]) {
  return values.filter(Boolean).join(" ");
}

export function Panel({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("game-panel", className)} {...props}>{children}</section>;
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return <article className={cx("game-card", className)} {...props}>{children}</article>;
}

export function Button({ className, variant = "secondary", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  return <button className={cx("game-button", `game-button--${variant}`, className)} {...props}>{children}</button>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("game-input", className)} {...props} />;
}

export function Badge({ className, tone = "steel", children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "steel" | "orange" | "yellow" | "danger" }) {
  return <span className={cx("game-badge", `game-badge--${tone}`, className)} {...props}>{children}</span>;
}

export function Progress({ className, value, label, ...props }: HTMLAttributes<HTMLDivElement> & { value: number; label?: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return <div className={cx("game-progress", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded} {...props}><i style={{ width: `${bounded}%` }} /></div>;
}

export function NumberDisplay({ className, label, value, hint, children, ...props }: HTMLAttributes<HTMLElement> & { label?: ReactNode; value?: ReactNode; hint?: ReactNode }) {
  return <article className={cx("game-number", className)} {...props}>
    {label && <span className="game-number__label">{label}</span>}
    {value && <strong className="game-number__value">{value}</strong>}
    {hint && <small className="game-number__hint">{hint}</small>}
    {children}
  </article>;
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cx("game-divider", className)} {...props} />;
}

export function ScrollArea({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("game-scroll-area", className)} {...props}>{children}</div>;
}
