"use client";

import React from "react";

type TreeFile = {
  id: string;
  folderId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { displayName: string };
};

type TreeFolder = {
  id: string;
  parentFolderId: string | null;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  children: TreeFolder[];
  files: TreeFile[];
};

async function apiErrorMessage(res: Response): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return j?.error?.message?.trim() || `Ошибка ${res.status}`;
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function flattenFolderOptions(
  folders: TreeFolder[],
  prefix = "",
): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const f of folders) {
    const label = prefix ? `${prefix} / ${f.name}` : f.name;
    out.push({ id: f.id, label });
    out.push(...flattenFolderOptions(f.children, label));
  }
  return out;
}

function FolderBlock({
  folder,
  depth,
  readOnly,
  projectId,
  uploadTargetId,
  setUploadTargetId,
  onRefresh,
  busyFolderId,
  setBusyFolderId,
  newSubfolderParent,
  setNewSubfolderParent,
  newSubfolderName,
  setNewSubfolderName,
  renameFolderId,
  setRenameFolderId,
  renameDraft,
  setRenameDraft,
}: {
  folder: TreeFolder;
  depth: number;
  readOnly: boolean;
  projectId: string;
  uploadTargetId: string;
  setUploadTargetId: (id: string) => void;
  onRefresh: () => void;
  busyFolderId: string | null;
  setBusyFolderId: (id: string | null) => void;
  newSubfolderParent: string | null;
  setNewSubfolderParent: (id: string | null) => void;
  newSubfolderName: string;
  setNewSubfolderName: (s: string) => void;
  renameFolderId: string | null;
  setRenameFolderId: (id: string | null) => void;
  renameDraft: string;
  setRenameDraft: (s: string) => void;
}) {
  const pad = Math.min(depth, 8) * 12;

  async function createSubfolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubfolderName.trim() || newSubfolderParent !== folder.id) return;
    setBusyFolderId(folder.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSubfolderName.trim(),
          parentFolderId: folder.id,
        }),
      });
      if (res.ok) {
        setNewSubfolderName("");
        setNewSubfolderParent(null);
        onRefresh();
        window.dispatchEvent(new CustomEvent("project-activity-refresh"));
      } else {
        window.alert(await apiErrorMessage(res));
      }
    } finally {
      setBusyFolderId(null);
    }
  }

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (renameFolderId !== folder.id || !renameDraft.trim()) return;
    setBusyFolderId(folder.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameDraft.trim() }),
      });
      if (res.ok) {
        setRenameFolderId(null);
        onRefresh();
        window.dispatchEvent(new CustomEvent("project-activity-refresh"));
      } else {
        window.alert(await apiErrorMessage(res));
      }
    } finally {
      setBusyFolderId(null);
    }
  }

  async function removeFolder() {
    if (!window.confirm(`Удалить папку «${folder.name}»?`)) return;
    setBusyFolderId(folder.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/folders/${folder.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onRefresh();
        window.dispatchEvent(new CustomEvent("project-activity-refresh"));
      } else {
        window.alert(await apiErrorMessage(res));
      }
    } finally {
      setBusyFolderId(null);
    }
  }

  async function removeFile(file: TreeFile) {
    if (!window.confirm(`Удалить файл «${file.originalName}»?`)) return;
    setBusyFolderId(file.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${file.id}`, { method: "DELETE" });
      if (res.ok) {
        onRefresh();
        window.dispatchEvent(new CustomEvent("project-activity-refresh"));
      } else {
        window.alert(await apiErrorMessage(res));
      }
    } finally {
      setBusyFolderId(null);
    }
  }

  async function onUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || uploadTargetId !== folder.id) return;
    const input = document.getElementById(`pf-upload-${folder.id}`) as HTMLInputElement | null;
    const f = input?.files?.[0];
    if (!f) return;
    setBusyFolderId(folder.id);
    try {
      const fd = new FormData();
      fd.set("folderId", folder.id);
      fd.set("file", f);
      const res = await fetch(`/api/projects/${projectId}/files/upload`, { method: "POST", body: fd });
      if (res.ok) {
        if (input) input.value = "";
        onRefresh();
        window.dispatchEvent(new CustomEvent("project-activity-refresh"));
      } else {
        window.alert(await apiErrorMessage(res));
      }
    } finally {
      setBusyFolderId(null);
    }
  }

  const showUpload = uploadTargetId === folder.id;
  const busy = busyFolderId === folder.id;

  return (
    <div className="border-l border-zinc-200 pl-3" style={{ marginLeft: pad }}>
      <div className="flex flex-wrap items-center gap-2 py-1">
        <span className="font-medium text-zinc-900">{folder.name}</span>
        {folder.isSystem ? (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-500">
            системная
          </span>
        ) : null}
        {!readOnly ? (
          <>
            <button
              type="button"
              className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100"
              onClick={() => {
                setUploadTargetId(showUpload ? "" : folder.id);
                setNewSubfolderParent(null);
                setRenameFolderId(null);
              }}
            >
              {showUpload ? "Скрыть загрузку" : "Загрузить"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => {
                setNewSubfolderParent(newSubfolderParent === folder.id ? null : folder.id);
                setUploadTargetId("");
                setRenameFolderId(null);
                setNewSubfolderName("");
              }}
            >
              Подпапка
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => {
                setRenameFolderId(renameFolderId === folder.id ? null : folder.id);
                setRenameDraft(folder.name);
                setUploadTargetId("");
                setNewSubfolderParent(null);
              }}
            >
              Переименовать
            </button>
            {!folder.isSystem ? (
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-900 hover:bg-red-100"
                onClick={() => void removeFolder()}
                disabled={busy}
              >
                Удалить
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {renameFolderId === folder.id ? (
        <form onSubmit={saveRename} className="mb-2 flex flex-wrap items-end gap-2">
          <label className="block text-xs text-zinc-600">
            Новое имя
            <input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="mt-0.5 block w-64 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              maxLength={120}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            OK
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            onClick={() => setRenameFolderId(null)}
          >
            Отмена
          </button>
        </form>
      ) : null}

      {newSubfolderParent === folder.id ? (
        <form onSubmit={createSubfolder} className="mb-2 flex flex-wrap items-end gap-2">
          <label className="block text-xs text-zinc-600">
            Имя подпапки
            <input
              value={newSubfolderName}
              onChange={(e) => setNewSubfolderName(e.target.value)}
              className="mt-0.5 block w-64 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              maxLength={120}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Создать
          </button>
        </form>
      ) : null}

      {showUpload && !readOnly ? (
        <form onSubmit={onUploadSubmit} className="mb-2 flex flex-wrap items-end gap-2">
          <input id={`pf-upload-${folder.id}`} type="file" className="max-w-full text-xs" />
          <button
            type="submit"
            disabled={busy}
            className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-900 disabled:opacity-50"
          >
            Отправить
          </button>
        </form>
      ) : null}

      {folder.files.length > 0 ? (
        <ul className="mb-2 space-y-1.5">
          {folder.files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-white px-2 py-1.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/projects/${projectId}/files/${file.id}`}
                  className="font-medium text-violet-700 hover:text-violet-900 break-all"
                  target="_blank"
                  rel="noreferrer"
                >
                  {file.originalName}
                </a>
                <div className="text-xs text-zinc-500">
                  {fmtBytes(file.sizeBytes)} · {file.uploadedBy.displayName} · {fmtDateTime(file.createdAt)}
                </div>
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  className="shrink-0 text-xs text-red-700 hover:text-red-900"
                  onClick={() => void removeFile(file)}
                  disabled={busyFolderId === file.id}
                >
                  Удалить
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-zinc-500">Нет файлов в этой папке.</p>
      )}

      {folder.children.map((ch) => (
        <FolderBlock
          key={ch.id}
          folder={ch}
          depth={depth + 1}
          readOnly={readOnly}
          projectId={projectId}
          uploadTargetId={uploadTargetId}
          setUploadTargetId={setUploadTargetId}
          onRefresh={onRefresh}
          busyFolderId={busyFolderId}
          setBusyFolderId={setBusyFolderId}
          newSubfolderParent={newSubfolderParent}
          setNewSubfolderParent={setNewSubfolderParent}
          newSubfolderName={newSubfolderName}
          setNewSubfolderName={setNewSubfolderName}
          renameFolderId={renameFolderId}
          setRenameFolderId={setRenameFolderId}
          renameDraft={renameDraft}
          setRenameDraft={setRenameDraft}
        />
      ))}
    </div>
  );
}

export function ProjectFilesPanel({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  const [folders, setFolders] = React.useState<TreeFolder[]>([]);
  const [totalBytes, setTotalBytes] = React.useState(0);
  const [fileCount, setFileCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [uploadTargetId, setUploadTargetId] = React.useState("");
  const [busyFolderId, setBusyFolderId] = React.useState<string | null>(null);
  const [newSubfolderParent, setNewSubfolderParent] = React.useState<string | null>(null);
  const [newSubfolderName, setNewSubfolderName] = React.useState("");
  const [newRootName, setNewRootName] = React.useState("");
  const [renameFolderId, setRenameFolderId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState("");

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/files`, { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (data: {
          folders?: TreeFolder[];
          totalBytes?: number;
          fileCount?: number;
          error?: { message?: string };
        } | null) => {
          if (data?.folders) {
            setFolders(data.folders);
            setTotalBytes(data.totalBytes ?? 0);
            setFileCount(data.fileCount ?? 0);
            setError(null);
          } else {
            setError(data?.error?.message ?? "Не удалось загрузить файлы");
          }
        },
      )
      .catch(() => setError("Не удалось загрузить файлы"))
      .finally(() => setLoading(false));
  }, [projectId]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    function onRefresh() {
      load();
    }
    window.addEventListener("project-activity-refresh", onRefresh);
    return () => window.removeEventListener("project-activity-refresh", onRefresh);
  }, [load]);

  async function createRootFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newRootName.trim() || readOnly) return;
    setBusyFolderId("__root__");
    try {
      const res = await fetch(`/api/projects/${projectId}/files/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRootName.trim(), parentFolderId: null }),
      });
      if (res.ok) {
        setNewRootName("");
        load();
        window.dispatchEvent(new CustomEvent("project-activity-refresh"));
      } else {
        window.alert(await apiErrorMessage(res));
      }
    } finally {
      setBusyFolderId(null);
    }
  }

  const folderOptions = React.useMemo(() => flattenFolderOptions(folders), [folders]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-lg font-extrabold tracking-tight text-violet-900">Файлы проекта</div>
        <div className="text-xs text-zinc-500">
          {fileCount} / 15 файлов · {fmtBytes(totalBytes)} / 200 МБ
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-600">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          {!readOnly ? (
            <form onSubmit={createRootFolder} className="flex flex-wrap items-end gap-2 border-b border-zinc-200 pb-3">
              <label className="block text-xs text-zinc-600">
                Новая папка в корне
                <input
                  value={newRootName}
                  onChange={(e) => setNewRootName(e.target.value)}
                  className="mt-0.5 block w-64 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  maxLength={120}
                  placeholder="Название"
                />
              </label>
              <button
                type="submit"
                disabled={busyFolderId !== null}
                className="rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Создать
              </button>
            </form>
          ) : null}

          {folders.length === 0 ? (
            <p className="text-sm text-zinc-600">Нет папок.</p>
          ) : (
            <div className="space-y-2">
              {folders.map((f) => (
                <FolderBlock
                  key={f.id}
                  folder={f}
                  depth={0}
                  readOnly={readOnly}
                  projectId={projectId}
                  uploadTargetId={uploadTargetId}
                  setUploadTargetId={setUploadTargetId}
                  onRefresh={load}
                  busyFolderId={busyFolderId}
                  setBusyFolderId={setBusyFolderId}
                  newSubfolderParent={newSubfolderParent}
                  setNewSubfolderParent={setNewSubfolderParent}
                  newSubfolderName={newSubfolderName}
                  setNewSubfolderName={setNewSubfolderName}
                  renameFolderId={renameFolderId}
                  setRenameFolderId={setRenameFolderId}
                  renameDraft={renameDraft}
                  setRenameDraft={setRenameDraft}
                />
              ))}
            </div>
          )}

          {!readOnly && folderOptions.length > 0 ? (
            <details className="rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-600">
              <summary className="cursor-pointer font-semibold text-zinc-800">Быстрая загрузка</summary>
              <form
                className="mt-2 flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const formEl = e.currentTarget;
                  const fd = new FormData(formEl);
                  const folderId = String(fd.get("quickFolder") ?? "");
                  const file = fd.get("quickFile");
                  if (!folderId || !(file instanceof File) || !file.size) return;
                  setBusyFolderId("quick");
                  const x = new FormData();
                  x.set("folderId", folderId);
                  x.set("file", file);
                  fetch(`/api/projects/${projectId}/files/upload`, { method: "POST", body: x })
                    .then(async (r) => {
                      if (r.ok) {
                        const inp = formEl.elements.namedItem("quickFile") as HTMLInputElement | null;
                        if (inp) inp.value = "";
                        load();
                        window.dispatchEvent(new CustomEvent("project-activity-refresh"));
                      } else {
                        window.alert(await apiErrorMessage(r));
                      }
                    })
                    .finally(() => setBusyFolderId(null));
                }}
              >
                <select
                  name="quickFolder"
                  className="max-w-[min(100%,22rem)] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  required
                >
                  <option value="">Папка…</option>
                  {folderOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input name="quickFile" type="file" className="text-sm" required />
                <button
                  type="submit"
                  disabled={busyFolderId === "quick"}
                  className="rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Загрузить
                </button>
              </form>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
