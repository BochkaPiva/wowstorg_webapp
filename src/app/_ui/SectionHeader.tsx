import type { ReactNode } from "react";
import styles from "./section-header.module.css";

/** Shared list-page identity; filters remain below, outside the heading. */
export function SectionHeader({ title, description, actions, children }: {
  title: string; description: string; actions?: ReactNode; children?: ReactNode;
}) {
  return <header className={styles.header}>
    <div className={styles.top}><div className={styles.copy}><h1>{title}</h1><p>{description}</p></div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}</div>
    {children ? <div className={styles.bottom}>{children}</div> : null}
  </header>;
}
