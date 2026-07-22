import { parsePlayerNotes, serializePlayerNotes } from "./playerNotes";
import { getRoleSkillMessage } from "./roleSkillMessages";
import type { Player } from "./types";

const philosopherAbilityNotePrefix = "system:philosopher-ability:";
const philosopherDrunkNotePrefix = "system:philosopher-drunk:";

export const getPhilosopherAbilityState = (
  player: Pick<Player, "roleId" | "notes">,
) => {
  if (player.roleId !== "philosopher") return null;
  const note = parsePlayerNotes(player.notes).find((entry) =>
    entry.id.startsWith(philosopherAbilityNotePrefix),
  );
  if (!note) return null;
  const roleId = note.id.slice(philosopherAbilityNotePrefix.length);
  return roleId ? { roleId, note } : null;
};

export const getPhilosopherAbilityRoleId = (
  player: Pick<Player, "roleId" | "notes">,
) => getPhilosopherAbilityState(player)?.roleId ?? "";

export const getPhilosopherDrunkNotes = (player: Pick<Player, "notes">) =>
  parsePlayerNotes(player.notes).filter(
    (entry) =>
      entry.id.startsWith(philosopherDrunkNotePrefix) && !entry.resolved,
  );

export const setPhilosopherAbility = ({
  players,
  philosopherPlayerId,
  roleId,
  roleName,
  stage,
}: {
  players: Player[];
  philosopherPlayerId: string;
  roleId: string;
  roleName: string;
  stage: string;
}) => {
  const now = new Date().toISOString();
  const drunkNoteId = `${philosopherDrunkNotePrefix}${philosopherPlayerId}`;
  return players.map((player) => {
    const notes = parsePlayerNotes(player.notes);
    const existingAbility = notes.find((entry) =>
      entry.id.startsWith(philosopherAbilityNotePrefix),
    );
    const remainingNotes = notes.filter(
      (entry) =>
        !entry.id.startsWith(philosopherAbilityNotePrefix) &&
        entry.id !== drunkNoteId,
    );

    if (player.id === philosopherPlayerId) {
      return {
        ...player,
        notes: serializePlayerNotes([
          {
            id: `${philosopherAbilityNotePrefix}${roleId}`,
            body: `哲学家已获得${roleName}的能力`,
            createdAt: existingAbility?.createdAt ?? now,
            stage,
          },
          ...remainingNotes,
        ]),
      };
    }

    if (player.roleId === roleId) {
      return {
        ...player,
        notes: serializePlayerNotes([
          {
            id: drunkNoteId,
            body: `因哲学家获得${roleName}能力而醉酒`,
            createdAt: now,
            stage,
          },
          ...remainingNotes,
        ]),
      };
    }

    return {
      ...player,
      notes: serializePlayerNotes(remainingNotes),
    };
  });
};

export const reconcilePhilosopherDrunkenness = (
  players: Player[],
  getRoleName: (roleId: string) => string,
) => {
  const sources = players
    .map((player) => ({
      player,
      ability: getPhilosopherAbilityState(player),
    }))
    .filter(
      (entry): entry is {
        player: Player;
        ability: NonNullable<ReturnType<typeof getPhilosopherAbilityState>>;
      } => Boolean(entry.ability),
    );

  return players.map((player) => {
    const notes = parsePlayerNotes(player.notes);
    const existingNotes = new Map(notes.map((entry) => [entry.id, entry]));
    const remainingNotes = notes.filter(
      (entry) => !entry.id.startsWith(philosopherDrunkNotePrefix),
    );
    const drunkNotes = sources
      .filter(
        ({ player: philosopher, ability }) =>
          philosopher.id !== player.id && player.roleId === ability.roleId,
      )
      .map(({ player: philosopher, ability }) => {
        const id = `${philosopherDrunkNotePrefix}${philosopher.id}`;
        return {
          id,
          body: `因哲学家获得${getRoleName(ability.roleId)}能力而醉酒`,
          createdAt:
            existingNotes.get(id)?.createdAt ?? new Date().toISOString(),
          stage: ability.note.stage,
        };
      });
    return {
      ...player,
      notes: serializePlayerNotes([...drunkNotes, ...remainingNotes]),
    };
  });
};

export const clearPhilosopherAbility = (
  players: Player[],
  philosopherPlayerId: string,
) => {
  const drunkNoteId = `${philosopherDrunkNotePrefix}${philosopherPlayerId}`;
  return players.map((player) => ({
    ...player,
    notes: serializePlayerNotes(
      parsePlayerNotes(player.notes).filter(
        (entry) =>
          (player.id !== philosopherPlayerId ||
            !entry.id.startsWith(philosopherAbilityNotePrefix)) &&
          entry.id !== drunkNoteId,
      ),
    ),
  }));
};

export const buildPhilosopherAbilityMessage = (roleName: string) =>
  `你获得了${roleName}的能力；若该角色在场，其进入醉酒状态`;

export const parsePhilosopherAbilityMessage = (
  body: string,
  roles: { id: string; name: string }[],
) => {
  const skillBody = getRoleSkillMessage(body) ?? body;
  return (
    roles.find((role) =>
      skillBody.includes(`你获得了${role.name}的能力`),
    )?.id ?? ""
  );
};
