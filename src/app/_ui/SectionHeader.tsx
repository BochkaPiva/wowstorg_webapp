import type { ReactNode } from "react";
import Image from "next/image";
import styles from "./section-header.module.css";

/** Shared list-page identity; filters remain below, outside the heading. */
export function SectionHeader({ title, description, actions, children, tabs, metrics, mascot = "orders", links }: {
  title: string; description: string; actions?: ReactNode; children?: ReactNode;
  tabs?: ReactNode; links?: ReactNode;
  metrics?: Array<{ label: string; value: ReactNode }>;
  mascot?: "work" | "projects" | "contractors" | "inventory" | "admin" | "orders" | "loyalty";
}) {
  return <header className={styles.header}>
    <div className={styles.hero}>
      <div className={styles.art} aria-hidden="true"><Image src={mascot === "orders" ? "/brand/dino-orders-hero.png" : mascot === "loyalty" ? "/brand/dino-rating-star-cutout.png" : `/brand/headers/dino-${mascot}.webp`} alt="" fill sizes="(max-width: 700px) 250px, 420px" className={mascot === "orders" ? styles.incumbentArt : undefined} priority /></div>
      <div className={styles.copy}><h1>{title}</h1><p>{description}</p>
        {metrics?.length ? <div className={styles.metrics} aria-label="Сводка раздела">{metrics.map(metric => <span key={metric.label}><strong>{metric.value}</strong>{metric.label}</span>)}</div> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
        {tabs ? <div className={styles.tabs}>{tabs}</div> : null}
        {links ? <nav className={styles.links} aria-label="Связанные разделы">{links}</nav> : null}
      </div>
    </div>
    {children ? <div className={styles.bottom}>{children}</div> : null}
  </header>;
}
