"use client";

import { MouseEvent, useEffect, useMemo, useState } from "react";

type Note = {
  id: number;
  tabId: number;
  tabName: string;
  title: string;
  content: string;
  createdAt: string;
};

type TabSummary = {
  id: number;
  name: string;
};

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "brak daty";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getNotePreview(content: string) {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > 90 ? `${clean.slice(0, 90)}...` : clean;
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tabs, setTabs] = useState<TabSummary[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [menuNoteId, setMenuNoteId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTabId, setCreateTabId] = useState<number | null>(null);
  const [createContent, setCreateContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  async function loadNotes() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/notes", { cache: "no-store" });
      const payload = (await response.json()) as { notes?: Note[]; error?: string };

      if (!response.ok || !payload.notes) {
        throw new Error(payload.error ?? "Nie udalo sie pobrac notatek.");
      }

      const loadedNotes = payload.notes;
      setNotes(loadedNotes);

      if (loadedNotes.length === 0) {
        setSelectedNoteId(null);
        setDraftContent("");
        setIsEditing(false);
        return;
      }

      const firstId = loadedNotes[0].id;
      setSelectedNoteId((prev) => {
        if (!prev) {
          return firstId;
        }

        const exists = loadedNotes.some((note) => note.id === prev);
        return exists ? prev : firstId;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wystapil nieznany blad.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTabs() {
    try {
      const response = await fetch("/api/tabs", { cache: "no-store" });
      const payload = (await response.json()) as {
        tabs?: Array<{ id: number; name: string }>;
        error?: string;
      };

      if (!response.ok || !payload.tabs) {
        throw new Error(payload.error ?? "Nie udalo sie pobrac zakladek.");
      }

      const loadedTabs = payload.tabs;
      setTabs(loadedTabs);

      if (loadedTabs.length > 0) {
        setCreateTabId((prev) => prev ?? loadedTabs[0].id);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wystapil nieznany blad.";
      setErrorMessage(message);
    }
  }

  useEffect(() => {
    void loadNotes();
    void loadTabs();
  }, []);

  useEffect(() => {
    function closeMenu() {
      setMenuNoteId(null);
    }

    window.addEventListener("click", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
    };
  }, []);

  useEffect(() => {
    if (!selectedNote) {
      setDraftContent("");
      setIsEditing(false);
      return;
    }

    setDraftContent(selectedNote.content);
  }, [selectedNote]);

  async function handleSave() {
    if (!selectedNote) {
      return;
    }

    const content = draftContent.trim();
    if (!content) {
      setErrorMessage("Notatka nie moze byc pusta.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/notes/${selectedNote.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      const payload = (await response.json()) as {
        note?: { id: number; content: string; createdAt: string };
        error?: string;
      };

      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "Nie udalo sie zapisac notatki.");
      }

      setNotes((prev) =>
        prev.map((note) =>
          note.id === selectedNote.id
            ? { ...note, content: payload.note?.content ?? content }
            : note,
        ),
      );
      setIsEditing(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wystapil nieznany blad.";
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRename(note: Note) {
    const newName = window.prompt("Nowa nazwa notatki:", note.title);

    if (newName === null) {
      return;
    }

    const title = newName.trim();
    if (!title) {
      setErrorMessage("Nazwa notatki nie moze byc pusta.");
      return;
    }

    setErrorMessage(null);

    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });

      const payload = (await response.json()) as {
        note?: { id: number; title: string };
        error?: string;
      };

      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "Nie udalo sie zmienic nazwy notatki.");
      }

      setNotes((prev) =>
        prev.map((existing) =>
          existing.id === note.id ? { ...existing, title: payload.note?.title ?? title } : existing,
        ),
      );
      setMenuNoteId(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wystapil nieznany blad.";
      setErrorMessage(message);
    }
  }

  async function handleDelete(note: Note) {
    const confirmed = window.confirm(`Usunac notatke "${note.title}"?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);

    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "DELETE",
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Nie udalo sie usunac notatki.");
      }

      setNotes((prev) => prev.filter((existing) => existing.id !== note.id));
      setMenuNoteId(null);

      if (selectedNoteId === note.id) {
        setSelectedNoteId(null);
        setIsEditing(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wystapil nieznany blad.";
      setErrorMessage(message);
    }
  }

  async function handleCreateNote() {
    if (!createTabId) {
      setErrorMessage("Najpierw utworz zakladke.");
      return;
    }

    const content = createContent.trim();
    if (!content) {
      setErrorMessage("Wpisz tresc nowej notatki.");
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/tabs/${createTabId}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      const payload = (await response.json()) as {
        note?: {
          id: number;
          tabId: number;
          title: string;
          content: string;
          createdAt: string;
        };
        error?: string;
      };

      if (!response.ok || !payload.note) {
        throw new Error(payload.error ?? "Nie udalo sie utworzyc notatki.");
      }

      const tabName = tabs.find((tab) => tab.id === payload.note?.tabId)?.name ?? "Bez zakladki";

      const createdNote: Note = {
        id: payload.note.id,
        tabId: payload.note.tabId,
        tabName,
        title: payload.note.title,
        content: payload.note.content,
        createdAt: payload.note.createdAt,
      };

      setNotes((prev) => [createdNote, ...prev]);
      setSelectedNoteId(createdNote.id);
      setCreateContent("");
      setIsCreateOpen(false);
      setIsEditing(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wystapil nieznany blad.";
      setErrorMessage(message);
    } finally {
      setIsCreating(false);
    }
  }

  function handleOpenMenu(event: MouseEvent<HTMLButtonElement>, noteId: number) {
    event.stopPropagation();
    setMenuNoteId((prev) => (prev === noteId ? null : noteId));
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1a1a28_0%,#111827_45%,#09090f_100%)] px-4 py-8 text-zinc-100 sm:px-8 lg:px-14">
      <main className="mx-auto w-full max-w-6xl rounded-3xl border border-cyan-400/20 bg-zinc-900/85 p-6 shadow-[0_28px_70px_-35px_rgba(0,0,0,0.9)] backdrop-blur sm:p-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-black uppercase tracking-tight text-cyan-300 sm:text-4xl">
            Sciaga elektroniczna
          </h1>
          <div className="flex items-center gap-2">
            {!selectedNote ? (
              <button
                type="button"
                onClick={() => setIsCreateOpen((prev) => !prev)}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/40 bg-zinc-800 text-2xl transition hover:bg-zinc-700"
                aria-label="Dodaj notatke"
                title="Dodaj notatke"
              >
                +
              </button>
            ) : null}
            {selectedNote ? (
              <button
                type="button"
                onClick={() => {
                  setIsEditing((prev) => !prev);
                  setDraftContent(selectedNote.content);
                }}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/40 bg-zinc-800 text-xl transition hover:bg-zinc-700"
                aria-label="Edytuj notatke"
                title="Edytuj notatke"
              >
                ⚙
              </button>
            ) : null}
          </div>
        </header>

        {errorMessage ? (
          <p className="mb-5 rounded-xl border border-red-400/40 bg-red-950/60 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </p>
        ) : null}

        {!selectedNote ? (
          <section>
            <h2 className="mb-4 text-xl font-bold text-zinc-100">Wybierz notatke</h2>
            {isCreateOpen ? (
              <div className="mb-4 rounded-2xl border border-cyan-500/30 bg-zinc-950/80 p-4">
                <p className="mb-3 text-sm font-semibold text-cyan-300">Nowa notatka</p>
                <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
                  <select
                    value={createTabId ?? ""}
                    onChange={(event) => setCreateTabId(Number(event.target.value))}
                    className="rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500"
                  >
                    {tabs.map((tab) => (
                      <option key={tab.id} value={tab.id}>
                        {tab.name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={createContent}
                    onChange={(event) => setCreateContent(event.target.value)}
                    rows={3}
                    placeholder="Wpisz tresc notatki..."
                    className="rounded-xl border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateNote()}
                    disabled={isCreating}
                    className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-cyan-500 disabled:opacity-60"
                  >
                    {isCreating ? "Tworzenie..." : "Utworz"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateOpen(false);
                      setCreateContent("");
                    }}
                    className="rounded-xl border border-zinc-600 px-4 py-2 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            ) : null}
            {isLoading ? (
              <p className="text-sm text-zinc-400">Ladowanie kafelkow...</p>
            ) : notes.length === 0 ? (
              <p className="text-sm text-zinc-400">Brak notatek w bazie.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {notes.map((note) => (
                  <article
                    key={note.id}
                    className="relative rounded-2xl border border-zinc-700 bg-zinc-950/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-400/70 hover:shadow-[0_16px_30px_-20px_rgba(6,182,212,0.7)]"
                  >
                    <button
                      type="button"
                      onClick={(event) => handleOpenMenu(event, note.id)}
                      className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-zinc-200 transition hover:border-cyan-400 hover:text-cyan-300"
                      aria-label="Menu notatki"
                    >
                      ⋮
                    </button>

                    {menuNoteId === note.id ? (
                      <div
                        className="absolute right-3 top-12 z-20 min-w-[140px] rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => void handleRename(note)}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(note)}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-300 transition hover:bg-red-950/60"
                        >
                          Usun
                        </button>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNoteId(note.id);
                        setIsEditing(false);
                        setDraftContent(note.content);
                      }}
                      className="w-full text-left"
                    >
                      <p className="pr-10 text-xs font-semibold uppercase tracking-wide text-cyan-300">
                        {note.tabName}
                      </p>
                      <p className="mt-2 text-base font-bold text-zinc-100">{note.title}</p>
                      <p className="mt-2 text-sm text-zinc-400">{getNotePreview(note.content)}</p>
                      <p className="mt-3 text-xs text-zinc-500">{formatDate(note.createdAt)}</p>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => {
                setSelectedNoteId(null);
                setIsEditing(false);
              }}
              className="rounded-lg border border-zinc-600 px-3 py-1 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800"
            >
              Wroc do kafelkow
            </button>

            <h2 className="text-xl font-black uppercase tracking-tight text-zinc-100">
              {selectedNote.title}
            </h2>
            <p className="text-sm text-cyan-300">Zakladka: {selectedNote.tabName}</p>

            <div className="min-h-[62vh] rounded-3xl border border-zinc-700 bg-zinc-950/80 p-5 sm:p-8">
              {isEditing ? (
                <div className="space-y-4">
                  <textarea
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    rows={20}
                    className="h-[56vh] w-full resize-y rounded-2xl border border-zinc-600 bg-zinc-900 p-4 text-base leading-7 text-zinc-100 outline-none transition focus:border-cyan-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={isSaving}
                      className="rounded-xl bg-cyan-600 px-5 py-2 text-sm font-bold text-zinc-950 transition hover:bg-cyan-500 disabled:opacity-60"
                    >
                      {isSaving ? "Zapisywanie..." : "Zapisz"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftContent(selectedNote.content);
                        setIsEditing(false);
                      }}
                      className="rounded-xl border border-zinc-600 px-5 py-2 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              ) : (
                <article className="h-[56vh] overflow-auto whitespace-pre-wrap text-lg leading-8 text-zinc-100">
                  {selectedNote.content}
                </article>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
