export type AchievementLevelUi = "NONE" | "BRONZE" | "SILVER" | "GOLD";

export function levelBadgeTone(level: AchievementLevelUi): string {
  if (level === "GOLD") return "border-amber-300 bg-amber-50 text-amber-900";
  if (level === "SILVER") return "border-slate-300 bg-slate-50 text-slate-800";
  if (level === "BRONZE") return "border-orange-300 bg-orange-50 text-orange-900";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

export function levelLabel(level: AchievementLevelUi): string {
  if (level === "GOLD") return "Золото";
  if (level === "SILVER") return "Серебро";
  if (level === "BRONZE") return "Бронза";
  return "Нет";
}

export function achievementImageSrc(code: string, level: AchievementLevelUi): string {
  const key =
    code === "PERFECT_ORDERS"
      ? "perfect_orders"
      : code === "TOWER_SCORE"
        ? "tower_score"
        : code === "ORDER_VOLUME"
          ? "order_volume"
          : code === "BIGGEST_CHECK"
            ? "biggest_check"
            : code === "CLOSED_ORDERS"
              ? "closed_orders"
              : "no_cancel_streak";
  const levelKey =
    level === "NONE" || level === "BRONZE" ? "bronze" : level === "SILVER" ? "silver" : "gold";
  return `/achievements/${key}_${levelKey}.png`;
}
