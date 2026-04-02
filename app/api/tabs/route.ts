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

type TabRow = {
  id: number;
  name: string;
  created_at: string;
  notes_count: string;
};

export async function GET() {
  try {
    const db = await getDbPool();
    const result = await db.query<TabRow>(`
      SELECT
        t.id,
        t.name,
        t.created_at,
        COUNT(n.id)::text AS notes_count
      FROM tabs t
      LEFT JOIN notes n ON n.tab_id = t.id
      GROUP BY t.id, t.name, t.created_at
      ORDER BY t.created_at ASC
    `);

    const tabs = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      notesCount: Number(row.notes_count),
    }));

    return NextResponse.json({ tabs });
  } catch (error) {
    console.error("GET /api/tabs failed", error);
    return NextResponse.json(
      { error: getDbErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json(
        { error: "Nazwa zakladki jest wymagana." },
        { status: 400 },
      );
    }

    const db = await getDbPool();
    const result = await db.query<{
      id: number;
      name: string;
      created_at: string;
    }>(
      `
      INSERT INTO tabs (name)
      VALUES ($1)
      RETURNING id, name, created_at
      `,
      [name],
    );

    const tab = result.rows[0];

    return NextResponse.json(
      {
        tab: {
          id: tab.id,
          name: tab.name,
          createdAt: tab.created_at,
          notesCount: 0,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/tabs failed", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "Zakladka o tej nazwie juz istnieje." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: getDbErrorMessage(error) },
      { status: 500 },
    );
  }
}
