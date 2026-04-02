import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type NoteRow = {
  id: number;
  tab_id: number;
  tab_name: string;
  title: string;
  content: string;
  created_at: string;
};

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

export async function GET() {
  try {
    const db = await getDbPool();
    const result = await db.query<NoteRow>(`
      SELECT
        n.id,
        n.tab_id,
        t.name AS tab_name,
        n.title,
        n.content,
        n.created_at
      FROM notes n
      INNER JOIN tabs t ON t.id = n.tab_id
      ORDER BY n.created_at DESC
    `);

    const notes = result.rows.map((row) => ({
      id: row.id,
      tabId: row.tab_id,
      tabName: row.tab_name,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("GET /api/notes failed", error);
    return NextResponse.json(
      { error: getDbErrorMessage(error) },
      { status: 500 },
    );
  }
}
