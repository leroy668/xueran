import { getScriptRoles } from "./data";
import type { Team } from "./types";

export type RoleDistribution = {
  roleIds: string[];
  drunkRoleId: string;
  marionetteRoleId: string;
  counts: Record<Team, number>;
  setupNotes: string[];
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

const pickRoleIds = (
  rolePool: ReturnType<typeof getScriptRoles>,
  team: Team,
  count: number,
  random: () => number,
) => {
  const teamPool = rolePool.filter((role) => role.team === team);
  if (teamPool.length < count) {
    throw new Error(`${team}角色数量不足，无法完成分配`);
  }
  return shuffle(teamPool, random)
    .slice(0, count)
    .map((role) => role.id);
};

export const distributeRoles = (
  playerCount: number,
  scriptId: string,
  random: () => number = Math.random,
): RoleDistribution => {
  const baseCounts = standardCounts[playerCount];
  if (!baseCounts) {
    throw new Error("标准角色分配仅支持 5 至 15 名玩家");
  }

  const rolePool = getScriptRoles(scriptId);
  const minionIds = pickRoleIds(rolePool, "爪牙", baseCounts.爪牙, random);
  const demonIds = pickRoleIds(rolePool, "恶魔", baseCounts.恶魔, random);
  const setupNotes: string[] = [];
  let outsiderAdjustment = 0;

  const hasBaron = minionIds.includes("baron");
  if (hasBaron) {
    outsiderAdjustment += 2;
    setupNotes.push("男爵+2外来者");
  }

  if (demonIds.includes("vigormortis")) {
    outsiderAdjustment -= 1;
    setupNotes.push("亡骨魔-1外来者");
  }

  if (minionIds.includes("godfather")) {
    const currentOutsiders = baseCounts.外来者 + outsiderAdjustment;
    const godfatherAdjustment =
      currentOutsiders <= 0
        ? 1
        : currentOutsiders >= 2
          ? -1
          : random() < 0.5
            ? -1
            : 1;
    outsiderAdjustment += godfatherAdjustment;
    setupNotes.push(
      `教父${godfatherAdjustment > 0 ? "+1" : "-1"}外来者`,
    );
  }

  const outsiderPoolSize = rolePool.filter(
    (role) => role.team === "外来者",
  ).length;
  const outsiderCount = Math.min(
    outsiderPoolSize,
    Math.max(0, baseCounts.外来者 + outsiderAdjustment),
  );
  const counts = {
    ...baseCounts,
    镇民: playerCount - outsiderCount - baseCounts.爪牙 - baseCounts.恶魔,
    外来者: outsiderCount,
  };

  const roleIds = shuffle(
    [
      ...pickRoleIds(rolePool, "镇民", counts.镇民, random),
      ...pickRoleIds(rolePool, "外来者", counts.外来者, random),
      ...minionIds,
      ...demonIds,
    ],
    random,
  );

  const marionetteIndex = roleIds.indexOf("marionette");
  const demonIndex = roleIds.findIndex((roleId) =>
    demonIds.includes(roleId),
  );
  if (marionetteIndex >= 0 && demonIndex >= 0) {
    const isNeighbor =
      Math.abs(marionetteIndex - demonIndex) === 1 ||
      Math.abs(marionetteIndex - demonIndex) === roleIds.length - 1;
    if (!isNeighbor) {
      const neighborIndex = (demonIndex + 1) % roleIds.length;
      [roleIds[marionetteIndex], roleIds[neighborIndex]] = [
        roleIds[neighborIndex],
        roleIds[marionetteIndex],
      ];
    }
    setupNotes.push("提线木偶已安排在恶魔邻座");
  }

  const assignedRoleIds = new Set(roleIds);
  const disguiseCandidates = shuffle(
    rolePool.filter(
      (role) => role.team === "镇民" && !assignedRoleIds.has(role.id),
    ),
    random,
  );
  const drunkRoleId = roleIds.includes("drunk")
    ? disguiseCandidates[0]?.id ?? ""
    : "";
  const marionetteRoleId = roleIds.includes("marionette")
    ? disguiseCandidates.find((role) => role.id !== drunkRoleId)?.id ??
      disguiseCandidates[0]?.id ??
      ""
    : "";

  return {
    roleIds,
    drunkRoleId,
    marionetteRoleId,
    counts,
    setupNotes,
  };
};
