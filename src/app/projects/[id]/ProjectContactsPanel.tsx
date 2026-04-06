"use client";

import React from "react";

type Entry = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string };
};

type Contact = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  roleNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  entries: Entry[];
};

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

export function ProjectContactsPanel({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}) {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [newFullName, setNewFullName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newRoleNote, setNewRoleNote] = React.useState("");
  const [createBusy, setCreateBusy] = React.useState(false);

  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [entryBusy, setEntryBusy] = React.useState<string | null>(null);
  const [newContactOpen, setNewContactOpen] = React.useState(false);
  const [entryOpenFor, setEntryOpenFor] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/contacts`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { contacts?: Contact[]; error?: { message?: string } } | null) => {
        if (data?.contacts) {
          setContacts(data.contacts);
          setError(null);
        } else {
          setError(data?.error?.message ?? "Не удалось загрузить контакты");
        }
      })
      .catch(() => setError("Не удалось загрузить контакты"))
      .finally(() => setLoading(false));
  }, [projectId]);

  React.useEffect(() => {
    load();
  }, [load]);

  function notifyParentRefresh() {
    window.dispatchEvent(new CustomEvent("project-activity-refresh"));
  }

  async function createContact(e: React.FormEvent) {
    e.preventDefault();
    if (!newFullName.trim()) return;
    setCreateBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: newFullName.trim(),
          phone: newPhone.trim() || null,
          email: newEmail.trim() || null,
          roleNote: newRoleNote.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.contact) {
        setNewFullName("");
        setNewPhone("");
        setNewEmail("");
        setNewRoleNote("");
        await load();
        notifyParentRefresh();
      } else {
        setError(data?.error?.message ?? "Не удалось создать контакт");
      }
    } finally {
      setCreateBusy(false);
    }
  }

  async function toggleActive(c: Contact) {
    if (readOnly) return;
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/contacts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      await load();
      notifyParentRefresh();
    } else {
      setError(data?.error?.message ?? "Не удалось обновить контакт");
    }
  }

  async function addEntry(contactId: string) {
    const text = (drafts[contactId] ?? "").trim();
    if (!text) return;
    setEntryBusy(contactId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        setDrafts((d) => ({ ...d, [contactId]: "" }));
        await load();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Не удалось сохранить запись");
      }
    } finally {
      setEntryBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-4">
      <div>
        <div className="text-sm font-semibold text-zinc-900">Контакты (ЛПР)</div>
        <p className="mt-1 text-xs text-zinc-500">
          Представители заказчика и заметки по переговорам. Записи журнала контакта неизменяемы.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-600">Загрузка…</p>
      ) : (
        <ul className="space-y-4">
          {contacts.map((c) => (
            <li
              key={c.id}
              className={[
                "rounded-xl border bg-white p-3 shadow-sm",
                c.isActive ? "border-zinc-200" : "border-zinc-300 opacity-75",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-zinc-900">{c.fullName}</div>
                  <div className="mt-1 text-xs text-zinc-600 space-y-0.5">
                    {c.phone ? <div>Тел.: {c.phone}</div> : null}
                    {c.email ? <div>{c.email}</div> : null}
                    {c.roleNote ? <div className="text-zinc-500">{c.roleNote}</div> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!c.isActive ? (
                    <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      Неактивен
                    </span>
                  ) : null}
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => void toggleActive(c)}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {c.isActive ? "Деактивировать" : "Активировать"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 border-t border-zinc-100 pt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Переговоры
                </div>
                {c.entries.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">Пока нет записей.</p>
                ) : (
                  <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                    {c.entries.map((e) => (
                        <li key={e.id} className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2 py-2 text-sm">
                          <div className="flex flex-wrap justify-between gap-1 text-xs text-zinc-500">
                            <span>{e.author.displayName}</span>
                            <span>{fmtDateTime(e.createdAt)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-zinc-800">{e.body}</p>
                        </li>
                      ))}
                  </ul>
                )}

                {!readOnly ? (
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => setEntryOpenFor((cur) => (cur === c.id ? null : c.id))}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      {entryOpenFor === c.id ? "Скрыть форму записи" : "Добавить запись"}
                    </button>
                    {entryOpenFor === c.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={drafts[c.id] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                          placeholder="Заметка о звонке, письме, договорённости…"
                          rows={3}
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                          maxLength={20000}
                        />
                        <button
                          type="button"
                          disabled={entryBusy === c.id || !(drafts[c.id] ?? "").trim()}
                          onClick={() => void addEntry(c.id)}
                          className="rounded-lg border border-violet-300 bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {entryBusy === c.id ? "Сохранение…" : "Сохранить запись"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!readOnly ? (
        <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-violet-900">Контакт (ЛПР)</div>
            <button
              type="button"
              onClick={() => setNewContactOpen((v) => !v)}
              className="rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50"
            >
              {newContactOpen ? "Скрыть форму" : "Добавить контакт"}
            </button>
          </div>
          {newContactOpen ? (
            <form onSubmit={createContact} className="space-y-2">
              <input
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="ФИО *"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                maxLength={200}
                required
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Телефон"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  maxLength={80}
                />
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                  maxLength={200}
                />
              </div>
              <input
                value={newRoleNote}
                onChange={(e) => setNewRoleNote(e.target.value)}
                placeholder="Роль или примечание (ЛПР, бухгалтерия…)"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                maxLength={500}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={createBusy}
                  className="rounded-lg border border-violet-400 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {createBusy ? "Создание…" : "Сохранить контакт"}
                </button>
                <button
                  type="button"
                  onClick={() => setNewContactOpen(false)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Отмена
                </button>
              </div>
            </form>
          ) : (
            <div className="text-xs text-zinc-600">
              Чтобы добавить ЛПР, нажми «Добавить контакт».
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
