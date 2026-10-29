import { NextResponse } from "next/server";
import {
  getVectorVariantsState,
  mutateVectorVariantsState,
} from "../../../server/db";
import {
  VECTOR_ASSET_ELEMENTS,
  VectorVariantsMutationRequestSchema,
  summarizeVectorVariantsState,
} from "../../../shared/schemas/vector-variants";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const state = getVectorVariantsState();
    const summary = summarizeVectorVariantsState(state);
    return NextResponse.json({
      ok: true,
      state,
      summary,
      elements: VECTOR_ASSET_ELEMENTS,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erreur de lecture du registre des variantes vectorielles.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const rawBody = (await request.json()) as unknown;
    const parsed = VectorVariantsMutationRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Requête de mutation de variantes vectorielles invalide.",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const result = mutateVectorVariantsState(parsed.data);
    return NextResponse.json({
      ok: true,
      state: result.state,
      newlyCreated: result.newlyCreated,
      summary: result.summary,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Erreur de sauvegarde du registre des variantes vectorielles.",
      },
      { status: 500 }
    );
  }
}
