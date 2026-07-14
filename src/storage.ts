import type { GameState, SharedState } from "./types";

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
    return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
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
    return JSON.parse(decode(encoded)) as SharedState;
  } catch {
    return null;
  }
};

export const buildShareUrl = (state: GameState) => {
  const shareState: SharedState = {
    scriptId: state.scriptId,
    phase: state.phase,
    round: state.round,
    players: state.players.map((player) => ({ ...player, notes: "" })),
  };
  const url = new URL(window.location.href);
  url.search = `share=${encode(JSON.stringify(shareState))}`;
  return url.toString();
};
