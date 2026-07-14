export type Phase = "准备" | "白天" | "夜晚";
export type Team = "镇民" | "外来者" | "爪牙" | "恶魔";
export type TabId = "grimoire" | "night" | "script";

export type RoleDefinition = {
  id: string;
  name: string;
  team: Team;
  icon: string;
  short: string;
  nightOrder: number;
  reminder: string;
};

export type Player = {
  id: string;
  seat: number;
  name: string;
  roleId: string;
  alive: boolean;
  identityMessage: string;
  notes: string;
};

export type GameState = {
  scriptId: string;
  phase: Phase;
  round: number;
  nightIndex: number;
  players: Player[];
  storytellerNotes: string;
  updatedAt: string;
};

export type SharedState = Pick<GameState, "scriptId" | "phase" | "round" | "players">;

export type IdentityPayload = {
  version: 1;
  playerName: string;
  seat: number;
  roleId: string;
  message: string;
};
