import React from "react";

export interface CardProps {
  className?: string;
  children: React.ReactNode;
  variant?: "default" | "glass" | "outline";
  padding?: "default" | "none";
}

export function Card({ className, children, variant = "default", padding = "default" }: CardProps) {
  const base = "card";
  const variantClass = variant === "glass" ? "cardGlass" : variant === "outline" ? "cardOutline" : "";
  const paddingClass = padding === "none" ? "p-0" : "";
  
  return (
    <div className={[base, variantClass, paddingClass, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={["cardHeader", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={["cardTitle", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function CardDesc({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={["cardDesc", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function CardActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={["cardActions", className].filter(Boolean).join(" ")}>{children}</div>;
}
