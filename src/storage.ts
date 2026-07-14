import type { GameState, IdentityPayload, Player, SharedState } from "./types";

const storageKey = "xueran-grimoire-v1";

export const defaultState = (): GameState => ({
  scriptId: "trouble-brewing",
  phase: "准备",
  round: 1,
  nightIndex: 0,
  players: [],
  storytellerNotes: "",
  updatedAt: new Date().toISOString(),
});

export const loadState = (): GameState => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultState();
    const saved = JSON.parse(raw) as Partial<GameState>;
    return {
      ...defaultState(),
      ...saved,
      players: (saved.players ?? []).map((player) => ({
        ...player,
        identityMessage: player.identityMessage ?? "",
      })),
    };
  } catch {
    return defaultState();
  }
};

export const saveState = (state: GameState) => {
  localStorage.setItem(storageKey, JSON.stringify(state));
};

const encode = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const decode = (value: string) => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

export const getSharedState = (): SharedState | null => {
  const encoded = new URLSearchParams(window.location.search).get("share");
  if (!encoded) return null;
  try {
    const shared = JSON.parse(decode(encoded)) as SharedState;
    return {
      ...shared,
      players: shared.players.map((player) => ({
        ...player,
        identityMessage: "",
        notes: "",
      })),
    };
  } catch {
    return null;
  }
};

export const buildShareUrl = (state: GameState) => {
  const shareState: SharedState = {
    scriptId: state.scriptId,
    phase: state.phase,
    round: state.round,
    players: state.players.map((player) => ({
      ...player,
      identityMessage: "",
      notes: "",
    })),
  };
  const url = new URL(window.location.href);
  url.search = `share=${encode(JSON.stringify(shareState))}`;
  url.hash = "";
  return url.toString();
};

export const getSharedIdentity = (): IdentityPayload | null => {
  const encoded = new URLSearchParams(window.location.hash.slice(1)).get("identity");
  if (!encoded) return null;
  try {
    const payload = JSON.parse(decode(encoded)) as IdentityPayload;
    if (
      payload.version !== 1 ||
      typeof payload.playerName !== "string" ||
      typeof payload.seat !== "number" ||
      typeof payload.roleId !== "string" ||
      typeof payload.message !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

export const buildIdentityUrl = (player: Player) => {
  const payload: IdentityPayload = {
    version: 1,
    playerName: player.name.trim() || `座位 ${player.seat}`,
    seat: player.seat,
    roleId: player.roleId,
    message: player.identityMessage.trim(),
  };
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `identity=${encode(JSON.stringify(payload))}`;
  return url.toString();
};
