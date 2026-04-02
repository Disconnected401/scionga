import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

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

type ParamsContext = {
  params: Promise<{ tabId: string }>;
};

type NoteRow = {
  id: number;
  tab_id: number;
  title: string;
  content: string;
  created_at: string;
};

function deriveNoteTitle(content: string): string {
  const firstLine = content.split("\n")[0]?.trim() ?? "";
  if (!firstLine) {
    return "Nowa notatka";
  }

  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}...` : firstLine;
}

function parseTabId(rawTabId: string): number | null {
  const parsed = Number(rawTabId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export async function GET(_request: Request, context: ParamsContext) {
  try {
    const { tabId } = await context.params;
    const parsedTabId = parseTabId(tabId);

    if (!parsedTabId) {
      return NextResponse.json({ error: "Nieprawidlowe ID zakladki." }, { status: 400 });
    }

    const db = await getDbPool();
    const result = await db.query<NoteRow>(
      `
      SELECT id, tab_id, title, content, created_at
      FROM notes
      WHERE tab_id = $1
      ORDER BY created_at DESC
      `,
      [parsedTabId],
    );

    const notes = result.rows.map((row) => ({
      id: row.id,
      tabId: row.tab_id,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("GET /api/tabs/[tabId]/notes failed", error);
    return NextResponse.json(
      { error: getDbErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: ParamsContext) {
  try {
    const { tabId } = await context.params;
    const parsedTabId = parseTabId(tabId);

    if (!parsedTabId) {
      return NextResponse.json({ error: "Nieprawidlowe ID zakladki." }, { status: 400 });
    }

    const body = await request.json();
    const content = typeof body?.content === "string" ? body.content.trim() : "";

    if (!content) {
      return NextResponse.json(
        { error: "Tresc notatki jest wymagana." },
        { status: 400 },
      );
    }

    const db = await getDbPool();
    const title = deriveNoteTitle(content);

    const result = await db.query<NoteRow>(
      `
      INSERT INTO notes (tab_id, title, content)
      VALUES ($1, $2, $3)
      RETURNING id, tab_id, title, content, created_at
      `,
      [parsedTabId, title, content],
    );

    const note = result.rows[0];

    return NextResponse.json(
      {
        note: {
          id: note.id,
          tabId: note.tab_id,
          title: note.title,
          content: note.content,
          createdAt: note.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/tabs/[tabId]/notes failed", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23503"
    ) {
      return NextResponse.json(
        { error: "Nie znaleziono zakladki." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: getDbErrorMessage(error) },
      { status: 500 },
    );
  }
}
