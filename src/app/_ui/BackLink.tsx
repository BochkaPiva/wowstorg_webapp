import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";
import styles from "./back-link.module.css";

function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 10H4m0 0 5-5m-5 5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function BackLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={`${styles.back} ${className}`}><Arrow /><span>{children}</span></Link>;
}

export function BackButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type="button" className={`${styles.back} ${className}`}><Arrow /><span>{children}</span></button>;
}
