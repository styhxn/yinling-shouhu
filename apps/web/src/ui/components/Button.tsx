import React from "react";
import { Link } from "react-router-dom";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "accent" | "danger";
  to?: string;
  size?: "default" | "large";
}

export function Button({ variant = "default", className, to, size = "default", children, ...props }: ButtonProps) {
  const baseClass = "btn";
  const variantClass =
    variant === "primary"
      ? "btnPrimary"
      : variant === "accent"
      ? "btnAccent"
      : variant === "danger"
      ? "btnDanger"
      : "";
  const sizeClass = size === "large" ? "btnLarge" : "";
  const combined = [baseClass, variantClass, sizeClass, className].filter(Boolean).join(" ");

  if (to) {
    // If it's a link, we render a Link but style it like a button.
    // Note: We filter out button-specific props that Link doesn't support if needed,
    // but React Router's Link generally passes through props to the anchor.
    // However, type, disabled etc. are button specific.
    const { type, disabled, ...linkProps } = props as any;
    return (
      <Link to={to} className={combined} {...linkProps}>
        {children}
      </Link>
    );
  }

  return (
    <button className={combined} {...props}>
      {children}
    </button>
  );
}
