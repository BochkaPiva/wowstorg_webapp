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
  category: "DECISION_MAKER" | "CONTRACTOR" | "VENUE" | "OTHER";
  roleNote: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  entries: Entry[];
};

const CATEGORY_OPTIONS = [
  { value: "DECISION_MAKER", label: "ЛПР" },
  { value: "CONTRACTOR", label: "Подрядчик" },
  { value: "VENUE", label: "Площадка" },
  { value: "OTHER", label: "Прочее" },
] as const;

const CATEGORY_LABEL: Record<Contact["category"], string> = {
  DECISION_MAKER: "ЛПР",
  CONTRACTOR: "Подрядчик",
  VENUE: "Площадка",
  OTHER: "Прочее",
};

const CATEGORY_TONE: Record<Contact["category"], string> = {
  DECISION_MAKER: "border-violet-200 bg-[linear-gradient(180deg,rgba(245,243,255,0.96),rgba(255,255,255,1))]",
  CONTRACTOR: "border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.98),rgba(255,255,255,1))]",
  VENUE: "border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,255,255,1))]",
  OTHER: "border-zinc-200 bg-[linear-gradient(180deg,rgba(250,250,250,0.98),rgba(255,255,255,1))]",
};

const CATEGORY_ACCENT: Record<Contact["category"], string> = {
  DECISION_MAKER: "bg-violet-500",
  CONTRACTOR: "bg-sky-500",
  VENUE: "bg-amber-500",
  OTHER: "bg-zinc-400",
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
  const [newCategory, setNewCategory] = React.useState<Contact["category"]>("DECISION_MAKER");
  const [newRoleNote, setNewRoleNote] = React.useState("");
  const [createBusy, setCreateBusy] = React.useState(false);

  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [entryBusy, setEntryBusy] = React.useState<string | null>(null);
  const [newContactOpen, setNewContactOpen] = React.useState(false);
  const [entryOpenFor, setEntryOpenFor] = React.useState<string | null>(null);
  const [showAllHistoryFor, setShowAllHistoryFor] = React.useState<Record<string, boolean>>({});
  const [menuOpenFor, setMenuOpenFor] = React.useState<string | null>(null);
  const [editingContactId, setEditingContactId] = React.useState<string | null>(null);
  const [draggedContactId, setDraggedContactId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/contacts`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { contacts?: Contact[]; error?: { message?: string } } | null) => {
        if (data?.contacts) {
          setContacts([...data.contacts].sort((a, b) => a.sortOrder - b.sortOrder));
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
          category: newCategory,
          roleNote: newRoleNote.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.contact) {
        setNewFullName("");
        setNewPhone("");
        setNewEmail("");
        setNewCategory("DECISION_MAKER");
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

  async function saveContact(contactId: string, patch: Partial<Pick<Contact, "fullName" | "phone" | "email" | "category" | "roleNote">>) {
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setEditingContactId(null);
      await load();
      notifyParentRefresh();
    } else {
      setError(data?.error?.message ?? "Не удалось обновить контакт");
    }
  }

  async function deleteContact(contactId: string) {
    if (!window.confirm("Удалить контакт и всю историю переговоров?")) return;
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/contacts/${contactId}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setMenuOpenFor(null);
      await load();
      notifyParentRefresh();
    } else {
      setError(data?.error?.message ?? "Не удалось удалить контакт");
    }
  }

  async function reorderContacts(nextContacts: Contact[]) {
    setContacts(nextContacts);
    const res = await fetch(`/api/projects/${projectId}/contacts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: nextContacts.map((contact) => contact.id) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error?.message ?? "Не удалось сохранить порядок контактов");
      await load();
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
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-extrabold tracking-tight text-violet-900">Контакты</div>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => setNewContactOpen((v) => !v)}
            className="min-h-11 rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            {newContactOpen ? "Скрыть" : "Добавить контакт"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {error}
        </div>
      ) : null}

      {!readOnly && newContactOpen ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 p-3">
          <form onSubmit={createContact} className="space-y-2">
            <input
              value={newFullName}
              onChange={(e) => setNewFullName(e.target.value)}
              placeholder="ФИО *"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              maxLength={200}
              required
            />
            <div className="grid gap-2 md:grid-cols-4">
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
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as Contact["category"])}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                value={newRoleNote}
                onChange={(e) => setNewRoleNote(e.target.value)}
                placeholder="Роль / уточнение"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                maxLength={500}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={createBusy}
                className="min-h-11 rounded-lg border border-violet-400 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {createBusy ? "Создание…" : "Сохранить контакт"}
              </button>
              <button
                type="button"
                onClick={() => setNewContactOpen(false)}
                className="min-h-11 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Отмена
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-600">Загрузка…</p>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-4">
          {contacts.map((c) => (
            <li
              key={c.id}
              className={[
                "relative rounded-2xl border bg-white p-0 shadow-sm transition-shadow hover:shadow-md",
                c.isActive ? CATEGORY_TONE[c.category] : "border-zinc-300 opacity-75",
              ].join(" ")}
              draggable={!readOnly}
              onDragStart={() => setDraggedContactId(c.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!draggedContactId || draggedContactId === c.id) return;
                const current = [...contacts];
                const from = current.findIndex((item) => item.id === draggedContactId);
                const to = current.findIndex((item) => item.id === c.id);
                if (from < 0 || to < 0) return;
                const [moved] = current.splice(from, 1);
                current.splice(to, 0, moved);
                void reorderContacts(current.map((item, index) => ({ ...item, sortOrder: index })));
                setDraggedContactId(null);
              }}
              onDragEnd={() => setDraggedContactId(null)}
            >
              <div className="h-1.5 w-full rounded-t-2xl bg-transparent">
                <div className={`h-full w-full rounded-t-2xl ${CATEGORY_ACCENT[c.category]}`} />
              </div>
              <div className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="cursor-grab text-base font-semibold text-zinc-950 active:cursor-grabbing">{c.fullName}</div>
                      <span className="rounded-full border border-white/90 bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                        {CATEGORY_LABEL[c.category]}
                      </span>
                      {!c.isActive ? (
                        <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                          Неактивен
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-zinc-600">
                      {c.phone ? <div><span className="font-semibold text-zinc-800">Тел.</span> {c.phone}</div> : null}
                      {c.email ? <div><span className="font-semibold text-zinc-800">Email</span> {c.email}</div> : null}
                      {c.roleNote ? <div><span className="font-semibold text-zinc-800">Роль</span> {c.roleNote}</div> : null}
                    </div>
                  </div>
                  {!readOnly ? (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuOpenFor((prev) => (prev === c.id ? null : c.id))}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        aria-label="Действия с контактом"
                      >
                        ...
                      </button>
                      {menuOpenFor === c.id ? (
                        <div className="absolute right-0 top-full z-20 mt-2 w-40 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
                          <button
                            type="button"
                            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                            onClick={() => {
                              setEditingContactId(c.id);
                              setMenuOpenFor(null);
                            }}
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                            onClick={() => void deleteContact(c.id)}
                          >
                            Удалить
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {editingContactId === c.id && !readOnly ? (
                  <ContactEditForm
                    contact={c}
                    onCancel={() => setEditingContactId(null)}
                    onSave={(patch) => void saveContact(c.id, patch)}
                  />
                ) : null}

                <div className="rounded-xl border border-white/80 bg-white/80 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Переговоры
                  </div>
                  {c.entries.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">Пока нет записей.</p>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-2">
                        {(showAllHistoryFor[c.id] ? c.entries : c.entries.slice(0, 3)).map((e) => (
                          <li
                            key={e.id}
                            className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-2 py-2 text-sm"
                          >
                            <div className="flex flex-wrap justify-between gap-1 text-xs text-zinc-500">
                              <span>{e.author.displayName}</span>
                              <span>{fmtDateTime(e.createdAt)}</span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-zinc-800">{e.body}</p>
                          </li>
                        ))}
                      </ul>
                      {c.entries.length > 3 ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold text-violet-700 hover:text-violet-900"
                          onClick={() =>
                            setShowAllHistoryFor((m) => ({ ...m, [c.id]: !(m[c.id] ?? false) }))
                          }
                        >
                          {showAllHistoryFor[c.id] ? "Скрыть историю" : "Показать всю историю"}
                        </button>
                      ) : null}
                    </>
                  )}

                  {!readOnly ? (
                    <div className="mt-2 space-y-2">
                      <button
                        type="button"
                        onClick={() => setEntryOpenFor((cur) => (cur === c.id ? null : c.id))}
                        className="min-h-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:px-2.5 sm:py-1.5 sm:text-xs"
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
                            className="min-h-11 rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            {entryBusy === c.id ? "Сохранение…" : "Сохранить запись"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactEditForm({
  contact,
  onCancel,
  onSave,
}: {
  contact: Contact;
  onCancel: () => void;
  onSave: (patch: Partial<Pick<Contact, "fullName" | "phone" | "email" | "category" | "roleNote">>) => void;
}) {
  const [fullName, setFullName] = React.useState(contact.fullName);
  const [phone, setPhone] = React.useState(contact.phone ?? "");
  const [email, setEmail] = React.useState(contact.email ?? "");
  const [category, setCategory] = React.useState<Contact["category"]>(contact.category);
  const [roleNote, setRoleNote] = React.useState(contact.roleNote ?? "");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white/85 p-3">
      <div className="grid gap-2">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          placeholder="ФИО"
        />
        <div className="grid gap-2 md:grid-cols-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            placeholder="Телефон"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            placeholder="Email"
          />
        </div>
        <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Contact["category"])}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={roleNote}
            onChange={(e) => setRoleNote(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            placeholder="Роль / уточнение"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onSave({
                fullName: fullName.trim(),
                phone: phone.trim() || null,
                email: email.trim() || null,
                category,
                roleNote: roleNote.trim() || null,
              })
            }
            className="min-h-10 rounded-lg border border-violet-300 bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
