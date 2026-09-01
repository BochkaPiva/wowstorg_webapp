"use client";

import React from "react";

import { ProjectModuleContentSkeleton } from "./ProjectModuleBoundary";

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

const folderActionBtn = "project-file-action";
const folderPrimaryBtn = "project-file-action project-file-action--primary";
const folderDangerBtn = "project-file-action project-file-action--danger";
const fileActionBtn = "project-file-action";
const fileDangerBtn = "project-file-action project-file-action--danger";

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
  const label = kind === "image" ? "IMG"
    : kind === "pdf" ? "PDF"
      : kind === "doc" ? "DOC"
        : kind === "sheet" ? "XLS"
          : kind === "zip" ? "ZIP"
            : kind === "text" ? "TXT"
              : "FILE";
  return <div className="project-file-kind" data-kind={kind}><span>{label}</span></div>;
}

function FolderBlock({
  folder,
  depth,
  readOnly,
  projectId,
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
    <section className="project-folder" style={{ marginLeft: pad }}>
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
      <div className="project-folder__header">
        <div className="project-folder__identity">
          <span className="project-folder__glyph" aria-hidden />
          <span className="break-words font-semibold text-zinc-900">{folder.name}</span>
          <span className="project-folder__count">{folder.files.length + folder.children.length}</span>
        {folder.isSystem ? (
            <span className="project-folder__system">
            системная
          </span>
        ) : null}
        </div>
        {!readOnly ? (
          <div className="project-folder__actions">
            <button
              type="button"
              className={folderPrimaryBtn}
              onClick={() => uploadInputRef.current?.click()}
              aria-label={`Загрузить файл в ${folder.name}`}
              title="Загрузить файл"
            >
              <span aria-hidden>↑</span>
            </button>
            <button
              type="button"
              className={folderActionBtn}
              onClick={() => {
                setNewSubfolderParent(newSubfolderParent === folder.id ? null : folder.id);
                setRenameFolderId(null);
                setNewSubfolderName("");
              }}
              aria-label={`Создать подпапку в ${folder.name}`}
              title="Новая подпапка"
            >
              <span aria-hidden>＋</span>
            </button>
            <button
              type="button"
              className={folderActionBtn}
              onClick={() => {
                setRenameFolderId(renameFolderId === folder.id ? null : folder.id);
                setRenameDraft(folder.name);
                setNewSubfolderParent(null);
              }}
              aria-label={`Переименовать папку ${folder.name}`}
              title="Переименовать"
            >
              <span aria-hidden>✎</span>
            </button>
            {!folder.isSystem ? (
              <button
                type="button"
                className={folderDangerBtn}
                onClick={() => void removeFolder()}
                disabled={busy}
                aria-label={`Удалить папку ${folder.name}`}
                title="Удалить папку"
              >
                <span aria-hidden>×</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {busy ? <div className="project-folder__busy">Обновляем…</div> : null}

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
        <ul className="project-folder__files">
          {folder.files.map((file) => (
            <li
              key={file.id}
              className="project-file-row"
            >
              <div className="project-file-row__identity">
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
                        className="project-file-row__name"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {file.originalName}
                      </a>
                      <div className="project-file-row__meta">
                        {fmtBytes(file.sizeBytes)} · {file.uploadedBy.displayName} · {fmtDateTime(file.createdAt)}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="project-file-row__actions">
                <a
                  href={`/api/projects/${projectId}/files/${file.id}`}
                  className={fileActionBtn}
                  aria-label={`Скачать ${file.originalName}`}
                  title="Скачать"
                >
                  <span aria-hidden>↓</span>
                </a>
                {!readOnly ? (
                  <>
                    <button
                      type="button"
                      className={fileActionBtn}
                      onClick={() => {
                        setRenameFileId(file.id);
                        setRenameFileDraft(file.originalName);
                      }}
                      disabled={busyFolderId === file.id}
                      aria-label={`Переименовать ${file.originalName}`}
                      title="Переименовать"
                    >
                      <span aria-hidden>✎</span>
                    </button>
                    <button
                      type="button"
                      className={fileDangerBtn}
                      onClick={() => void removeFile(file)}
                      disabled={busyFolderId === file.id}
                      aria-label={`Удалить ${file.originalName}`}
                      title="Удалить"
                    >
                      <span aria-hidden>×</span>
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="project-folder__empty">Перетащите сюда первый файл или нажмите ↑.</p>
      )}

      {folder.children.map((ch) => (
        <FolderBlock
          key={ch.id}
          folder={ch}
          depth={depth + 1}
          readOnly={readOnly}
          projectId={projectId}
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
    </section>
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

  const [busyFolderId, setBusyFolderId] = React.useState<string | null>(null);
  const [newSubfolderParent, setNewSubfolderParent] = React.useState<string | null>(null);
  const [newSubfolderName, setNewSubfolderName] = React.useState("");
  const [newRootName, setNewRootName] = React.useState("");
  const [renameFolderId, setRenameFolderId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const [showRootComposer, setShowRootComposer] = React.useState(false);

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
        setShowRootComposer(false);
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
    <div className="project-files-panel">
      <div className="project-files-panel__toolbar">
        <div className="project-files-panel__usage" aria-label="Использование хранилища">
          <span>{fileCount} из 15 файлов</span>
          <span className="project-files-panel__usage-track" aria-hidden>
            <i style={{ width: `${Math.min(100, totalBytes / (200 * 1024 * 1024) * 100)}%` }} />
          </span>
          <span>{fmtBytes(totalBytes)} из 200 МБ</span>
        </div>
        {!readOnly ? (
          <button
            type="button"
            className="project-files-panel__new-folder"
            onClick={() => setShowRootComposer((current) => !current)}
            aria-expanded={showRootComposer}
          >
            <span aria-hidden>＋</span> Папка
          </button>
        ) : null}
      </div>

      {loading ? (
        <ProjectModuleContentSkeleton rows={4} />
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <>
          {!readOnly && showRootComposer ? (
            <form
              onSubmit={createRootFolder}
              className="project-files-panel__root-composer"
            >
              <label>
                <span className="sr-only">Название новой папки</span>
                <input
                  value={newRootName}
                  onChange={(e) => setNewRootName(e.target.value)}
                  className="block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  maxLength={120}
                  placeholder="Название папки"
                />
              </label>
              <button
                type="submit"
                disabled={busyFolderId !== null}
                className="project-files-panel__create"
              >
                Создать
              </button>
            </form>
          ) : null}

          {folders.length === 0 ? (
            <div className="project-files-panel__empty">
              <strong>Здесь пока пусто</strong>
              <span>Создайте папку для договоров, презентаций или технических файлов.</span>
            </div>
          ) : (
            <div className="project-files-panel__tree">
              {folders.map((f) => (
                <FolderBlock
                  key={f.id}
                  folder={f}
                  depth={0}
                  readOnly={readOnly}
                  projectId={projectId}
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
