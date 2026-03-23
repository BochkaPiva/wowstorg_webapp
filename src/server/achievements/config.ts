import type { AchievementCode, AchievementLevel } from "@prisma/client";

export type AchievementThresholds = {
  bronze: number;
  silver: number;
  gold: number;
};

export type AchievementConfig = {
  code: AchievementCode;
  title: string;
  description: string;
  thresholds: AchievementThresholds;
};

export const ACHIEVEMENTS: AchievementConfig[] = [
  {
    code: "PERFECT_ORDERS",
    title: "Идеальные заявки",
    description: "Закрытые заявки без просрочки и инцидентов.",
    thresholds: { bronze: 10, silver: 50, gold: 100 },
  },
  {
    code: "TOWER_SCORE",
    title: "Мастер башни",
    description: "Лучший результат в игре «Башня».",
    thresholds: { bronze: 15, silver: 20, gold: 25 },
  },
  {
    code: "ORDER_VOLUME",
    title: "Объем заявки",
    description: "Максимальное количество позиций реквизита в закрытой заявке.",
    thresholds: { bronze: 5, silver: 10, gold: 20 },
  },
  {
    code: "BIGGEST_CHECK",
    title: "Крупный чек",
    description: "Самый большой чек по закрытой заявке.",
    thresholds: { bronze: 10_000, silver: 25_000, gold: 50_000 },
  },
  {
    code: "CLOSED_ORDERS",
    title: "Закрытые заявки",
    description: "Общее количество закрытых заявок.",
    thresholds: { bronze: 20, silver: 75, gold: 150 },
  },
  {
    code: "NO_CANCEL_STREAK",
    title: "Серия без отмен",
    description: "Подряд идущие заявки без отмен.",
    thresholds: { bronze: 10, silver: 25, gold: 50 },
  },
];

export const ACHIEVEMENT_LEVELS: AchievementLevel[] = ["NONE", "BRONZE", "SILVER", "GOLD"];

export function levelRank(level: AchievementLevel): number {
  return ACHIEVEMENT_LEVELS.indexOf(level);
}

export function levelForValue(
  value: number,
  thresholds: AchievementThresholds,
): AchievementLevel {
  if (value >= thresholds.gold) return "GOLD";
  if (value >= thresholds.silver) return "SILVER";
  if (value >= thresholds.bronze) return "BRONZE";
  return "NONE";
}
