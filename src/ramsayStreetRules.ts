import type { NightMessage, Nomination } from "./room";
import type { Team } from "./types";

export type RulesPlayer = {
  id: string;
  seat: number;
  roleId: string;
  alive: boolean;
};

export type ExecutionLeader = {
  nomineePlayerId: string;
  voteCount: number;
  requiredVotes: number;
};

const extractFirstSeat = (body: string) => {
  const seat = Number(body.match(/(\d+)\s*号/)?.[1]);
  return Number.isFinite(seat) && seat > 0 ? seat : null;
};

export const getExecutionLeader = (
  nominations: Nomination[],
): ExecutionLeader | null => {
  const closed = nominations.filter(
    (nomination) => nomination.status !== "open",
  );
  if (!closed.length) return null;
  const topVoteCount = Math.max(...closed.map((nomination) => nomination.vote_count));
  const leaders = closed.filter(
    (nomination) => nomination.vote_count === topVoteCount,
  );
  if (leaders.length !== 1) return null;
  const winner = leaders[0];
  const requiredVotes = winner.required_votes ?? Number.POSITIVE_INFINITY;
  if (winner.vote_count < requiredVotes) return null;
  return {
    nomineePlayerId: winner.nominee_player_id,
    voteCount: winner.vote_count,
    requiredVotes,
  };
};

export const getLivingNeighbors = <T extends RulesPlayer>(
  players: T[],
  playerId: string,
) => {
  const orderedPlayers = [...players].sort((left, right) => left.seat - right.seat);
  const sourceIndex = orderedPlayers.findIndex((player) => player.id === playerId);
  if (sourceIndex < 0) return [];
  const neighbors: T[] = [];
  for (const direction of [-1, 1]) {
    for (let distance = 1; distance < orderedPlayers.length; distance += 1) {
      const index =
        (sourceIndex + direction * distance + orderedPlayers.length) %
        orderedPlayers.length;
      const candidate = orderedPlayers[index];
      if (!candidate.alive) continue;
      if (!neighbors.some((player) => player.id === candidate.id)) {
        neighbors.push(candidate);
      }
      break;
    }
  }
  return neighbors;
};

export const getTeaLadyProtectionSources = <T extends RulesPlayer>(
  players: T[],
  abilityDisabledPlayerIds: ReadonlySet<string>,
  getTeam: (roleId: string) => Team,
) => {
  const protectedByPlayerId = new Map<string, string[]>();
  for (const teaLady of players) {
    if (
      !teaLady.alive ||
      teaLady.roleId !== "tea-lady" ||
      abilityDisabledPlayerIds.has(teaLady.id)
    ) continue;
    const neighbors = getLivingNeighbors(players, teaLady.id);
    if (
      neighbors.length !== 2 ||
      !neighbors.every((player) =>
        ["镇民", "外来者"].includes(getTeam(player.roleId)),
      )
    ) continue;
    for (const neighbor of neighbors) {
      protectedByPlayerId.set(neighbor.id, [
        ...(protectedByPlayerId.get(neighbor.id) ?? []),
        teaLady.id,
      ]);
    }
  }
  return protectedByPlayerId;
};

export const getDevilsAdvocateProtectedPlayerIds = <T extends RulesPlayer>(
  players: T[],
  messages: NightMessage[],
  round: number,
  abilityDisabledPlayerIds: ReadonlySet<string>,
  retainedAbilityPlayerIds: ReadonlySet<string> = new Set(),
) => {
  const playersBySeat = new Map(players.map((player) => [player.seat, player]));
  const protectedPlayerIds = new Set<string>();
  for (const advocate of players) {
    if (
      (!advocate.alive && !retainedAbilityPlayerIds.has(advocate.id)) ||
      advocate.roleId !== "devils-advocate" ||
      abilityDisabledPlayerIds.has(advocate.id)
    ) continue;
    const latestMessage = messages
      .filter(
        (message) =>
          message.player_id === advocate.id &&
          message.role_id === "devils-advocate" &&
          message.round === round,
      )
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      )
      .find((message) => message.body.includes("本晚免死目标"));
    const targetSeat = latestMessage ? extractFirstSeat(latestMessage.body) : null;
    const target = targetSeat === null ? null : playersBySeat.get(targetSeat);
    if (target) protectedPlayerIds.add(target.id);
  }
  return protectedPlayerIds;
};

export const getPreviousRoleTargetPlayerId = <T extends RulesPlayer>(
  players: T[],
  messages: NightMessage[],
  playerId: string,
  roleId: string,
  beforeRound: number,
) => {
  const playersBySeat = new Map(players.map((player) => [player.seat, player]));
  const message = messages
    .filter(
      (item) =>
        item.player_id === playerId &&
        item.role_id === roleId &&
        item.round < beforeRound,
    )
    .sort((left, right) => {
      if (left.round !== right.round) return right.round - left.round;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })
    .find((item) => item.body.includes("目标"));
  const seat = message ? extractFirstSeat(message.body) : null;
  return seat === null ? null : playersBySeat.get(seat)?.id ?? null;
};

export const isVortoxActive = <T extends RulesPlayer>(
  players: T[],
  abilityDisabledPlayerIds: ReadonlySet<string>,
) =>
  players.some(
    (player) =>
      player.alive &&
      player.roleId === "vortox" &&
      !abilityDisabledPlayerIds.has(player.id),
  );

export const getInformationResultCompliance = ({
  vortoxActive,
  registrationCompatible,
  matchesStrictTruth,
}: {
  vortoxActive: boolean;
  registrationCompatible: boolean;
  matchesStrictTruth: boolean | null;
}) => {
  if (!vortoxActive) return registrationCompatible;
  if (matchesStrictTruth === null) return null;
  return !matchesStrictTruth;
};
