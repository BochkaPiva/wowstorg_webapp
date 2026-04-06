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

function fileExt(name: string): string {
  const base = name.split("/").pop() ?? name;
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  return base.slice(i + 1).toLowerCase();
}

function fileKind(file: { originalName: string; mimeType: string }): "image" | "pdf" | "doc" | "sheet" | "zip" | "text" | "other" {
  const mime = (file.mimeType || "").toLowerCase();
  const ext = fileExt(file.originalName);
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.includes("word") || ["doc", "docx"].includes(ext)) return "doc";
  if (mime.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  if (mime.includes("zip") || ["zip", "rar", "7z"].includes(ext)) return "zip";
  if (mime.startsWith("text/") || ["txt", "md"].includes(ext)) return "text";
  return "other";
}

function FileIcon({ kind }: { kind: ReturnType<typeof fileKind> }) {
  const cls = "h-9 w-9 rounded-xl grid place-items-center border bg-white";
  if (kind === "image")
    return (
      <div className={`${cls} border-emerald-200`}>
        <span className="text-emerald-700 text-sm font-bold">IMG</span>
      </div>
    );
  if (kind === "pdf")
    return (
      <div className={`${cls} border-red-200`}>
        <span className="text-red-700 text-sm font-bold">PDF</span>
      </div>
    );
  if (kind === "doc")
    return (
      <div className={`${cls} border-sky-200`}>
        <span className="text-sky-700 text-sm font-bold">DOC</span>
      </div>
    );
  if (kind === "sheet")
    return (
      <div className={`${cls} border-amber-200`}>
        <span className="text-amber-800 text-sm font-bold">XLS</span>
      </div>
    );
  if (kind === "zip")
    return (
      <div className={`${cls} border-zinc-200`}>
        <span className="text-zinc-700 text-sm font-bold">ZIP</span>
      </div>
    );
  if (kind === "text")
    return (
      <div className={`${cls} border-violet-200`}>
        <span className="text-violet-700 text-sm font-bold">TXT</span>
      </div>
    );
  return (
    <div className={`${cls} border-zinc-200`}>
      <span className="text-zinc-700 text-sm font-bold">FILE</span>
    </div>
  );
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
  const [renameFileId, setRenameFileId] = React.useState<string | null>(null);
  const [renameFileDraft, setRenameFileDraft] = React.useState("");
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);

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

  async function uploadFile(f: File) {
    if (readOnly) return;
    setBusyFolderId(folder.id);
    try {
      const fd = new FormData();
      fd.set("folderId", folder.id);
      fd.set("file", f);
      const res = await fetch(`/api/projects/${projectId}/files/upload`, { method: "POST", body: fd });
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

  async function renameFileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!renameFileId || !renameFileDraft.trim()) return;
    setBusyFolderId(renameFileId);
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${renameFileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalName: renameFileDraft.trim() }),
      });
      if (res.ok) {
        setRenameFileId(null);
        setRenameFileDraft("");
        onRefresh();
        window.dispatchEvent(new CustomEvent("project-activity-refresh"));
      } else {
        window.alert(await apiErrorMessage(res));
      }
    } finally {
      setBusyFolderId(null);
    }
  }

  const busy = busyFolderId === folder.id;

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white/85 p-3 shadow-sm" style={{ marginLeft: pad }}>
      <input
        ref={uploadInputRef}
        id={`pf-upload-${folder.id}`}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          e.currentTarget.value = "";
          if (f) void uploadFile(f);
        }}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="break-words font-semibold text-zinc-900">{folder.name}</span>
        {folder.isSystem ? (
            <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-500">
            системная
          </span>
        ) : null}
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-10 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-100 sm:px-2.5 sm:py-1 sm:text-xs"
              onClick={() => uploadInputRef.current?.click()}
            >
              Загрузить
            </button>
            <button
              type="button"
              className="min-h-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:px-2.5 sm:py-1 sm:text-xs"
              onClick={() => {
                setNewSubfolderParent(newSubfolderParent === folder.id ? null : folder.id);
                setRenameFolderId(null);
                setNewSubfolderName("");
              }}
            >
              Подпапка
            </button>
            <button
              type="button"
              className="min-h-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:px-2.5 sm:py-1 sm:text-xs"
              onClick={() => {
                setRenameFolderId(renameFolderId === folder.id ? null : folder.id);
                setRenameDraft(folder.name);
                setNewSubfolderParent(null);
              }}
            >
              Переименовать
            </button>
            {!folder.isSystem ? (
              <button
                type="button"
                className="min-h-10 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-100 sm:px-2.5 sm:py-1 sm:text-xs"
                onClick={() => void removeFolder()}
                disabled={busy}
              >
                Удалить
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {busy ? <div className="mt-2 text-xs font-medium text-zinc-500">Загрузка…</div> : null}

      {renameFolderId === folder.id ? (
        <form onSubmit={saveRename} className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block text-xs text-zinc-600">
            Новое имя
            <input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="mt-0.5 block w-full max-w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm sm:w-64"
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
        <form onSubmit={createSubfolder} className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block text-xs text-zinc-600">
            Имя подпапки
            <input
              value={newSubfolderName}
              onChange={(e) => setNewSubfolderName(e.target.value)}
              className="mt-0.5 block w-full max-w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm sm:w-64"
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

      {folder.files.length > 0 ? (
        <ul className="mb-2 space-y-1.5">
          {folder.files.map((file) => (
            <li
              key={file.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-100 bg-white px-3 py-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <FileIcon kind={fileKind(file)} />
                <div className="min-w-0 flex-1">
                  {renameFileId === file.id ? (
                    <form onSubmit={renameFileSubmit} className="space-y-2">
                      <input
                        value={renameFileDraft}
                        onChange={(e) => setRenameFileDraft(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                        maxLength={300}
                        placeholder="Имя файла"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={busyFolderId === file.id || !renameFileDraft.trim()}
                          className="rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenameFileId(null);
                            setRenameFileDraft("");
                          }}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        >
                          Отмена
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <a
                        href={`/api/projects/${projectId}/files/${file.id}`}
                        className="font-semibold text-violet-700 hover:text-violet-900 break-all"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {file.originalName}
                      </a>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {fmtBytes(file.sizeBytes)} · {file.uploadedBy.displayName} · {fmtDateTime(file.createdAt)}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <a
                  href={`/api/projects/${projectId}/files/${file.id}`}
                  className="min-h-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:px-2.5 sm:py-1 sm:text-xs"
                >
                  Скачать
                </a>
                {!readOnly ? (
                  <>
                    <button
                      type="button"
                      className="min-h-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:px-2.5 sm:py-1 sm:text-xs"
                      onClick={() => {
                        setRenameFileId(file.id);
                        setRenameFileDraft(file.originalName);
                      }}
                      disabled={busyFolderId === file.id}
                    >
                      Переименовать
                    </button>
                    <button
                      type="button"
                      className="min-h-10 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-100 sm:px-2.5 sm:py-1 sm:text-xs"
                      onClick={() => void removeFile(file)}
                      disabled={busyFolderId === file.id}
                    >
                      Удалить
                    </button>
                  </>
                ) : null}
              </div>
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

  // (раньше использовалось для "быстрой загрузки", сейчас не нужно)

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-[linear-gradient(180deg,rgba(250,250,250,0.98),rgba(244,244,245,0.92))] p-3 sm:p-4">
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
            <form
              onSubmit={createRootFolder}
              className="grid gap-2 border-b border-zinc-200 pb-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <label className="block text-xs text-zinc-600">
                Новая папка в корне
                <input
                  value={newRootName}
                  onChange={(e) => setNewRootName(e.target.value)}
                  className="mt-0.5 block w-full max-w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm sm:w-64"
                  maxLength={120}
                  placeholder="Название"
                />
              </label>
              <button
                type="submit"
                disabled={busyFolderId !== null}
                className="min-h-11 rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:text-xs"
              >
                Создать
              </button>
            </form>
          ) : null}

          {folders.length === 0 ? (
            <p className="text-sm text-zinc-600">Нет папок.</p>
          ) : (
            <div className="space-y-3">
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

        </>
      )}
    </div>
  );
}
