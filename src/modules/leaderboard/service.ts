import { HttpError } from "../../lib/http-error";
import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../lib/auth-context";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

function parsePagination(rawLimit: unknown, rawOffset: unknown) {
  const limit = typeof rawLimit === "string" && rawLimit.trim() ? Number(rawLimit) : DEFAULT_LIMIT;
  const offset = typeof rawOffset === "string" && rawOffset.trim() ? Number(rawOffset) : 0;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [
      { field: "limit", message: `range_1_${MAX_LIMIT}` }
    ]);
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new HttpError(400, "validation_failed", "Payload inválido", [
      { field: "offset", message: "min_0" }
    ]);
  }

  return { limit, offset };
}

export async function getLeaderboard(params: {
  auth: AuthContext;
  limitRaw: unknown;
  offsetRaw: unknown;
}) {
  const player = await prisma.player.findUnique({
    where: { id: params.auth.playerId },
    select: { user_id: true }
  });

  if (!player || player.user_id !== params.auth.userId) {
    throw new HttpError(401, "unauthorized", "Unauthorized");
  }

  const { limit, offset } = parsePagination(params.limitRaw, params.offsetRaw);

  const [items, total] = await Promise.all([
    prisma.leaderboard.findMany({
      orderBy: [
        { score: "desc" },
        { run_time_ms: "asc" },
        { created_at: "asc" },
        { run_id: "asc" }
      ],
      take: limit,
      skip: offset,
      select: {
        run_id: true,
        user_id: true,
        nickname: true,
        score: true,
        updated_at: true,
        run: {
          select: {
            current_floor: true,
            result: true
          }
        }
      }
    }),
    prisma.leaderboard.count()
  ]);

  return {
    items: items.map((item, index) => ({
      rank: offset + index + 1,
      run_id: item.run_id,
      user_id: item.user_id,
      nickname: item.nickname,
      score: item.score,
      current_floor: item.run.current_floor,
      run_result: item.run.result,
      updated_at: item.updated_at.toISOString()
    })),
    total,
    limit,
    offset
  };
}
