import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type ParamsContext = {
  params: Promise<{ noteId: string }>;
};

type NoteRow = {
  id: number;
  tab_id: number;
  title: string;
  content: string;
  created_at: string;
};

function parseNoteId(rawNoteId: string): number | null {
  const parsed = Number(rawNoteId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getDbErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "28P01"
  ) {
    return "Blad logowania do PostgreSQL. Sprawdz PGUSER/PGPASSWORD lub DATABASE_URL.";
  }

  if (error instanceof Error && error.message.includes("Brak konfiguracji PostgreSQL")) {
    return error.message;
  }

  return "Nie udalo sie polaczyc z baza danych.";
}

export async function PATCH(request: Request, context: ParamsContext) {
  try {
    const { noteId } = await context.params;
    const parsedNoteId = parseNoteId(noteId);

    if (!parsedNoteId) {
      return NextResponse.json({ error: "Nieprawidlowe ID notatki." }, { status: 400 });
    }

    const body = await request.json();
    const title = typeof body?.title === "string" ? body.title.trim() : undefined;
    const content = typeof body?.content === "string" ? body.content.trim() : undefined;

    const hasTitle = typeof title === "string";
    const hasContent = typeof content === "string";

    if (!hasTitle && !hasContent) {
      return NextResponse.json(
        { error: "Musisz podac title albo content." },
        { status: 400 },
      );
    }

    if (hasTitle && !title) {
      return NextResponse.json({ error: "Nazwa notatki jest wymagana." }, { status: 400 });
    }

    if (hasContent && !content) {
      return NextResponse.json({ error: "Tresc notatki jest wymagana." }, { status: 400 });
    }

    const db = await getDbPool();
    let result;

    if (hasTitle && hasContent) {
      result = await db.query<NoteRow>(
        `
        UPDATE notes
        SET title = $1, content = $2
        WHERE id = $3
        RETURNING id, tab_id, title, content, created_at
        `,
        [title, content, parsedNoteId],
      );
    } else if (hasTitle) {
      result = await db.query<NoteRow>(
        `
        UPDATE notes
        SET title = $1
        WHERE id = $2
        RETURNING id, tab_id, title, content, created_at
        `,
        [title, parsedNoteId],
      );
    } else {
      result = await db.query<NoteRow>(
        `
        UPDATE notes
        SET content = $1
        WHERE id = $2
        RETURNING id, tab_id, title, content, created_at
        `,
        [content, parsedNoteId],
      );
    }

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Nie znaleziono notatki." }, { status: 404 });
    }

    const note = result.rows[0];

    return NextResponse.json({
      note: {
        id: note.id,
        tabId: note.tab_id,
        title: note.title,
        content: note.content,
        createdAt: note.created_at,
      },
    });
  } catch (error) {
    console.error("PATCH /api/notes/[noteId] failed", error);
    return NextResponse.json(
      { error: getDbErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: ParamsContext) {
  try {
    const { noteId } = await context.params;
    const parsedNoteId = parseNoteId(noteId);

    if (!parsedNoteId) {
      return NextResponse.json({ error: "Nieprawidlowe ID notatki." }, { status: 400 });
    }

    const db = await getDbPool();
    const result = await db.query("DELETE FROM notes WHERE id = $1", [parsedNoteId]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Nie znaleziono notatki." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/notes/[noteId] failed", error);
    return NextResponse.json(
      { error: getDbErrorMessage(error) },
      { status: 500 },
    );
  }
}
