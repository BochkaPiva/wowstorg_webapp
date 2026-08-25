type WorkEntityIconKind = "ORDER" | "ESTIMATE" | "PROJECT";

export function WorkEntityIcon({
  kind,
  className,
}: {
  kind: WorkEntityIconKind;
  className?: string;
}) {
  if (kind === "ESTIMATE") {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M8.5 4.5h11l4 4v19h-15v-23Z" />
        <path d="M19.5 4.5v5h4M12 14h8M12 18h3M18 18h2M12 22h3M18 22h2" />
      </svg>
    );
  }

  if (kind === "PROJECT") {
    return (
      <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M4.5 9h8l2.5 3h12.5v14.5h-23V9Z" />
        <path d="M9 9V5.5h10V12M11 18h10M11 22h7" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M8 7h16v21H8V7Z" />
      <path d="M12 7V4h8v3M12 13h8M12 18h8M12 23h5" />
    </svg>
  );
}

