import type { Player, RoleDefinition, Team } from "./types";

type RoleLookup = (roleId: string) => RoleDefinition;

const goodTeams = new Set<Team>(["镇民", "外来者"]);
const evilTeams = new Set<Team>(["爪牙", "恶魔"]);

export const isGoodTeam = (team: Team) => goodTeams.has(team);

export const canRegisterAsGood = (roleId: string, team: Team) =>
  isGoodTeam(team) || roleId === "spy";

export const canRegisterAsEvil = (roleId: string, team: Team) =>
  evilTeams.has(team) || roleId === "recluse";

export const canRegisterAsRole = (
  actualRoleId: string,
  shownRoleId: string,
  getRole: RoleLookup,
) => {
  if (actualRoleId === shownRoleId) return true;
  const shownTeam = getRole(shownRoleId).team;
  if (actualRoleId === "spy") return goodTeams.has(shownTeam);
  if (actualRoleId === "recluse") return evilTeams.has(shownTeam);
  return false;
};

export const getRegisteredEvilOptions = (
  roleId: string,
  team: Team,
): boolean[] => {
  if (roleId === "spy" || roleId === "recluse") return [false, true];
  return [evilTeams.has(team)];
};

export const getPossibleEvilCounts = <T>(
  players: T[],
  getRoleInfo: (player: T) => { roleId: string; team: Team },
) => {
  let counts = new Set([0]);
  players.forEach((player) => {
    const { roleId, team } = getRoleInfo(player);
    const options = getRegisteredEvilOptions(roleId, team);
    counts = new Set(
      [...counts].flatMap((count) =>
        options.map((isEvil) => count + (isEvil ? 1 : 0)),
      ),
    );
  });
  return [...counts].sort((left, right) => left - right);
};

export const getChefResultOptions = (
  players: Player[],
  getRole: RoleLookup,
) => {
  const ordered = [...players].sort((left, right) => left.seat - right.seat);
  if (ordered.length < 2) return [0];
  const options = ordered.map((player) =>
    getRegisteredEvilOptions(player.roleId, getRole(player.roleId).team),
  );
  const results = new Set<number>();

  options[0].forEach((firstIsEvil) => {
    let states = new Map<string, number[]>([
      [`${firstIsEvil}:${firstIsEvil}`, [0]],
    ]);
    for (let index = 1; index < options.length; index += 1) {
      const nextStates = new Map<string, number[]>();
      states.forEach((counts, key) => {
        const [firstState, previousState] = key
          .split(":")
          .map((value) => value === "true");
        options[index].forEach((currentState) => {
          const nextKey = `${firstState}:${currentState}`;
          const nextCounts = nextStates.get(nextKey) ?? [];
          counts.forEach((count) =>
            nextCounts.push(count + (previousState && currentState ? 1 : 0)),
          );
          nextStates.set(nextKey, nextCounts);
        });
      });
      states = nextStates;
    }
    states.forEach((counts, key) => {
      const [firstState, lastState] = key
        .split(":")
        .map((value) => value === "true");
      counts.forEach((count) =>
        results.add(count + (firstState && lastState ? 1 : 0)),
      );
    });
  });

  const normalized = ordered.length === 2
    ? [...results].map((count) => Math.min(count, 1))
    : [...results];
  return [...new Set(normalized)].sort((left, right) => left - right);
};

export const getNearestPlayersByTeam = (
  players: Player[],
  sourcePlayerId: string,
  team: Team,
  getRole: RoleLookup,
  includeRegistration = false,
) => {
  const ordered = [...players].sort((left, right) => left.seat - right.seat);
  const sourceIndex = ordered.findIndex((player) => player.id === sourcePlayerId);
  if (sourceIndex < 0 || ordered.length < 2) return [];
  const found: Player[] = [];
  [-1, 1].forEach((direction) => {
    for (let distance = 1; distance < ordered.length; distance += 1) {
      const index =
        (sourceIndex + direction * distance + ordered.length) % ordered.length;
      const candidate = ordered[index];
      const candidateTeam = getRole(candidate.roleId).team;
      const matchesTeam =
        candidateTeam === team ||
        (includeRegistration &&
          ((team === "镇民" && candidate.roleId === "spy") ||
            ((team === "爪牙" || team === "恶魔") &&
              candidate.roleId === "recluse")));
      if (!matchesTeam) continue;
      if (!found.some((player) => player.id === candidate.id)) found.push(candidate);
      break;
    }
  });
  return found;
};
