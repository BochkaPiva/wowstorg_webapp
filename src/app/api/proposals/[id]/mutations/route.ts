import { Prisma } from "@prisma/client";

import { requireRole } from "@/server/auth/require";
import { jsonError, jsonOk } from "@/server/http";
import { applyProposalMutation, proposalMutationSchema } from "@/server/proposals/mutate";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("WOWSTORG");
  if (!auth.ok) return auth.response;

  const { id: proposalId } = await ctx.params;
  const parsed = proposalMutationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Проверьте изменение", parsed.error.flatten());

  try {
    const proposal = await applyProposalMutation({
      proposalId,
      actorUserId: auth.user.id,
      operation: parsed.data,
    });
    return jsonOk({ proposal, changeId: parsed.data.mutationId ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "MUTATION_ID_REUSED") return jsonError(400, "Идентификатор запроса уже использован для другого изменения");
    if (error instanceof Error && error.message === "HISTORY_CONFLICT") return jsonError(409, "Это изменение больше нельзя безопасно отменить. Загрузите актуальную версию КП");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return jsonError(409, "Связанные данные изменились. Загрузите актуальную версию КП");
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError(404, "КП не найдено");
    }
    if (error instanceof Error && error.message === "READ_ONLY") {
      return jsonError(409, "КП уже преобразовано или проект находится в архиве");
    }
    if (error instanceof Error && error.message === "INVALID_TARGET") {
      return jsonError(400, "Выбранный раздел или предложение больше недоступны");
    }
    if (
      (error instanceof Error && error.message === "REVISION_CONFLICT") ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
    ) {
      return jsonError(
        409,
        "КП уже изменилось у коллеги. Обновите данные — его работа не будет перезаписана",
      );
    }
    throw error;
  }
}
