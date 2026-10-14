import type { SVGProps } from "react";

export function PositionIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: "edit" | "trash" | "search" | "plus" | "close" | "photo" | "chevron" }) {
  const paths = {
    edit: <><path d="m15 4 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14Z" /><path d="M13 20h7" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    plus: <path d="M12 4v16M4 12h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    photo: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 3-3 5 5" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
