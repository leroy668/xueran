import type { Team } from "./types";

export type OraclePlayerSnapshot = {
  alive: boolean;
  roleId: string;
  roleName: string;
  seat: number;
  team: Team;
};

export type OracleRegistrationException = {
  roleId: "recluse" | "spy";
  roleName: string;
  seat: number;
  effect: string;
};

export type OracleAssessment = {
  deadCount: number;
  trueEvilCount: number;
  minimumRegisteredEvil: number;
  maximumRegisteredEvil: number;
  registrationExceptions: OracleRegistrationException[];
};

export const assessOracleResult = (
  players: OraclePlayerSnapshot[],
): OracleAssessment => {
  const deadPlayers = players.filter((player) => !player.alive);
  const deadSpies = deadPlayers.filter((player) => player.roleId === "spy");
  const deadRecluses = deadPlayers.filter(
    (player) => player.roleId === "recluse",
  );
  const fixedEvilCount = deadPlayers.filter(
    (player) =>
      (player.team === "爪牙" || player.team === "恶魔") &&
      player.roleId !== "spy",
  ).length;
  const trueEvilCount = fixedEvilCount + deadSpies.length;

  return {
    deadCount: deadPlayers.length,
    trueEvilCount,
    minimumRegisteredEvil: fixedEvilCount,
    maximumRegisteredEvil:
      fixedEvilCount + deadSpies.length + deadRecluses.length,
    registrationExceptions: [
      ...deadRecluses.map((player) => ({
        roleId: "recluse" as const,
        roleName: player.roleName,
        seat: player.seat,
        effect: "可登记为邪恶，因此结果可以增加 1",
      })),
      ...deadSpies.map((player) => ({
        roleId: "spy" as const,
        roleName: player.roleName,
        seat: player.seat,
        effect: "可登记为善良，因此结果可以减少 1",
      })),
    ],
  };
};

export const isOracleResultCompatible = (
  count: number,
  assessment: OracleAssessment,
) =>
  Number.isInteger(count) &&
  count >= assessment.minimumRegisteredEvil &&
  count <= assessment.maximumRegisteredEvil;
