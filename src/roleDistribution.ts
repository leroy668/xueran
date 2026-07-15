import { roles } from "./data";
import type { Team } from "./types";

export type RoleDistribution = {
  roleIds: string[];
  counts: Record<Team, number>;
  hasBaron: boolean;
};

const standardCounts: Record<number, Record<Team, number>> = {
  5: { 镇民: 3, 外来者: 0, 爪牙: 1, 恶魔: 1 },
  6: { 镇民: 3, 外来者: 1, 爪牙: 1, 恶魔: 1 },
  7: { 镇民: 5, 外来者: 0, 爪牙: 1, 恶魔: 1 },
  8: { 镇民: 5, 外来者: 1, 爪牙: 1, 恶魔: 1 },
  9: { 镇民: 5, 外来者: 2, 爪牙: 1, 恶魔: 1 },
  10: { 镇民: 7, 外来者: 0, 爪牙: 2, 恶魔: 1 },
  11: { 镇民: 7, 外来者: 1, 爪牙: 2, 恶魔: 1 },
  12: { 镇民: 7, 外来者: 2, 爪牙: 2, 恶魔: 1 },
  13: { 镇民: 9, 外来者: 0, 爪牙: 3, 恶魔: 1 },
  14: { 镇民: 9, 外来者: 1, 爪牙: 3, 恶魔: 1 },
  15: { 镇民: 9, 外来者: 2, 爪牙: 3, 恶魔: 1 },
};

const shuffle = <T>(items: T[], random: () => number) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
};

const pickRoleIds = (team: Team, count: number, random: () => number) => {
  const pool = roles.filter((role) => role.team === team);
  if (pool.length < count) {
    throw new Error(`${team}角色数量不足，无法完成分配`);
  }
  return shuffle(pool, random)
    .slice(0, count)
    .map((role) => role.id);
};

export const distributeRoles = (
  playerCount: number,
  random: () => number = Math.random,
): RoleDistribution => {
  const baseCounts = standardCounts[playerCount];
  if (!baseCounts) {
    throw new Error("标准角色分配仅支持 5 至 15 名玩家");
  }

  const minionIds = pickRoleIds("爪牙", baseCounts.爪牙, random);
  const hasBaron = minionIds.includes("baron");
  const counts = {
    ...baseCounts,
    镇民: baseCounts.镇民 - (hasBaron ? 2 : 0),
    外来者: baseCounts.外来者 + (hasBaron ? 2 : 0),
  };

  const roleIds = shuffle(
    [
      ...pickRoleIds("镇民", counts.镇民, random),
      ...pickRoleIds("外来者", counts.外来者, random),
      ...minionIds,
      ...pickRoleIds("恶魔", counts.恶魔, random),
    ],
    random,
  );

  return { roleIds, counts, hasBaron };
};
