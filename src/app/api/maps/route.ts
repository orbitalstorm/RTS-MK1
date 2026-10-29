import { NextResponse } from "next/server";
import { getCustomMapById, listCustomMaps } from "../../../server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const map = getCustomMapById(id);
      if (!map) {
        return NextResponse.json(
          { ok: false, error: `Carte '${id}' introuvable.` },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, map });
    }

    const maps = listCustomMaps(60);
    return NextResponse.json({ ok: true, maps });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur lecture des cartes." },
      { status: 500 }
    );
  }
}
