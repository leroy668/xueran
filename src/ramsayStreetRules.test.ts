import { describe, expect, it } from "vitest";
import {
  getNightActions,
  hasActiveVigormortisRetainedAbility,
  vigormortisRetainedAbilityNoteId,
} from "./data";
import { serializePlayerNotes } from "./playerNotes";
import {
  getDevilsAdvocateProtectedPlayerIds,
  getExecutionLeader,
  getInformationResultCompliance,
  getLivingNeighbors,
  getPreviousRoleTargetPlayerId,
  getTeaLadyProtectionSources,
  isVortoxActive,
  type RulesPlayer,
} from "./ramsayStreetRules";

const players: RulesPlayer[] = [
  { id: "tea", seat: 1, roleId: "tea-lady", alive: true },
  { id: "good-a", seat: 2, roleId: "gossip", alive: true },
  { id: "dead", seat: 3, roleId: "town-crier", alive: false },
  { id: "good-b", seat: 4, roleId: "lunatic", alive: true },
  { id: "advocate", seat: 5, roleId: "devils-advocate", alive: true },
  { id: "vortox", seat: 6, roleId: "vortox", alive: true },
];

const getTeam = (roleId: string) =>
  roleId === "devils-advocate"
    ? "爪牙" as const
    : roleId === "vortox"
      ? "恶魔" as const
      : roleId === "lunatic"
        ? "外来者" as const
        : "镇民" as const;

describe("Ramsay Street rules", () => {
  it("finds the nearest living player in both directions", () => {
    expect(getLivingNeighbors(players, "tea").map((player) => player.id)).toEqual([
      "vortox",
      "good-a",
    ]);
    expect(getLivingNeighbors(players, "good-b").map((player) => player.id)).toEqual([
      "good-a",
      "advocate",
    ]);
  });

  it("protects both Tea Lady neighbors only when both are good", () => {
    const safePlayers = players.map((player) =>
      player.id === "vortox" ? { ...player, roleId: "town-crier" } : player,
    );
    const protection = getTeaLadyProtectionSources(safePlayers, new Set(), getTeam);
    expect(protection.has("good-a")).toBe(true);
    expect(protection.has("vortox")).toBe(true);
    expect(getTeaLadyProtectionSources(players, new Set(), getTeam).size).toBe(0);
    expect(
      getTeaLadyProtectionSources(safePlayers, new Set(["tea"]), getTeam).size,
    ).toBe(0);
    expect(
      getTeaLadyProtectionSources(
        safePlayers.map((player) =>
          player.id === "tea" ? { ...player, alive: false } : player,
        ),
        new Set(),
        getTeam,
      ).size,
    ).toBe(0);
  });

  it("resolves a unique execution leader above the stored threshold", () => {
    const nomination = (id: string, votes: number) => ({
      id,
      room_id: "room",
      round: 1,
      nominator_player_id: "good-a",
      nominee_player_id: id,
      status: "closed" as const,
      vote_count: votes,
      required_votes: 3,
      created_at: "2026-01-01T00:00:00.000Z",
      closed_at: "2026-01-01T00:00:00.000Z",
    });
    expect(getExecutionLeader([nomination("a", 4), nomination("b", 3)])?.nomineePlayerId).toBe("a");
    expect(getExecutionLeader([nomination("a", 4), nomination("b", 4)])).toBeNull();
    expect(getExecutionLeader([nomination("a", 2), nomination("b", 1)])).toBeNull();
  });

  it("reads Devil's Advocate targets and enforces the previous-night lookup", () => {
    const messages = [
      {
        id: "m1",
        room_id: "room",
        player_id: "advocate",
        role_id: "devils-advocate",
        round: 1,
        body: "【角色技能】本晚免死目标：2号",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(getDevilsAdvocateProtectedPlayerIds(players, messages, 1, new Set())).toEqual(new Set(["good-a"]));
    expect(
      getDevilsAdvocateProtectedPlayerIds(
        players,
        messages,
        1,
        new Set(["advocate"]),
      ).size,
    ).toBe(0);
    expect(
      getDevilsAdvocateProtectedPlayerIds(
        players.map((player) =>
          player.id === "advocate" ? { ...player, alive: false } : player,
        ),
        messages,
        1,
        new Set(),
        new Set(["advocate"]),
      ),
    ).toEqual(new Set(["good-a"]));
    expect(
      getDevilsAdvocateProtectedPlayerIds(
        players.map((player) =>
          player.id === "advocate" ? { ...player, alive: false } : player,
        ),
        messages,
        1,
        new Set(),
      ).size,
    ).toBe(0);
    expect(getPreviousRoleTargetPlayerId(players, messages, "advocate", "devils-advocate", 2)).toBe("good-a");
  });

  it("requires a living, enabled Vortox", () => {
    expect(isVortoxActive(players, new Set())).toBe(true);
    expect(isVortoxActive(players, new Set(["vortox"]))).toBe(false);
    expect(
      isVortoxActive(
        players.map((player) =>
          player.id === "vortox" ? { ...player, alive: false } : player,
        ),
        new Set(),
      ),
    ).toBe(false);
  });

  it("uses strict truth rather than registration compatibility for Vortox", () => {
    expect(
      getInformationResultCompliance({
        vortoxActive: false,
        registrationCompatible: true,
        matchesStrictTruth: false,
      }),
    ).toBe(true);
    expect(
      getInformationResultCompliance({
        vortoxActive: true,
        registrationCompatible: true,
        matchesStrictTruth: false,
      }),
    ).toBe(true);
    expect(
      getInformationResultCompliance({
        vortoxActive: true,
        registrationCompatible: true,
        matchesStrictTruth: true,
      }),
    ).toBe(false);
    expect(
      getInformationResultCompliance({
        vortoxActive: true,
        registrationCompatible: true,
        matchesStrictTruth: null,
      }),
    ).toBeNull();
  });

  it("keeps a dead minion ability active only while its Vigormortis lives", () => {
    const retainedNotes = serializePlayerNotes([
      {
        id: `${vigormortisRetainedAbilityNoteId}:vigor`,
        body: "被亡骨魔杀死：死亡后保留爪牙能力",
      },
    ]);
    const gamePlayers = [
      {
        id: "poisoner",
        seat: 1,
        roleId: "poisoner",
        alive: false,
        notes: retainedNotes,
      },
      { id: "vigor", seat: 2, roleId: "vigormortis", alive: true },
    ];
    expect(
      hasActiveVigormortisRetainedAbility(gamePlayers[0], gamePlayers),
    ).toBe(true);
    expect(
      getNightActions(gamePlayers, false, "ramsay-street", 2).some(
        (action) => action.playerId === "poisoner" && action.canAct,
      ),
    ).toBe(true);
    expect(
      hasActiveVigormortisRetainedAbility(gamePlayers[0], [
        gamePlayers[0],
        { ...gamePlayers[1], alive: false },
      ]),
    ).toBe(false);
  });
});
