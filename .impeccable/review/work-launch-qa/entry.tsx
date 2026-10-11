import React from "react";
import { createRoot } from "react-dom/client";
import WorkQueuePage from "../../../src/app/work/page";
import { ProposalWorkspace } from "../../../src/app/proposals/ProposalWorkspace";
function Demo() {
  const [path, setPath] = React.useState(location.pathname);
  React.useEffect(() => { const change = () => setPath(location.pathname); window.addEventListener("popstate", change); return () => window.removeEventListener("popstate", change); }, []);
  return path.startsWith("/proposals/") ? <ProposalWorkspace proposalId={path.split("/").at(-1)!} /> : path === "/work" || path === "/" ? <WorkQueuePage /> : <main className="qa-shell"><h1>Открыт созданный {path.startsWith("/projects") ? "проект" : "расчёт"}</h1><p>{path}</p><a href="/work">Вернуться в очередь</a></main>;
}
createRoot(document.getElementById("root")!).render(<Demo />);
