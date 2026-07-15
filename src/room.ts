import type { User } from "@supabase/supabase-js";
import { ensureAnonymousSession, supabase } from "./supabase";
import type { GameState, Player } from "./types";

export type SharedRoom = {
  id: string;
  code: string;
  host_user_id: string;
  title: string;
  script_id: string;
  phase: GameState["phase"];
  round: number;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

export type PublicRoomPlayer = {
  id: string;
  room_id: string;
  seat: number;
  name: string;
  alive: boolean;
  is_claimed: boolean;
  updated_at: string;
};

export type PrivateIdentity = {
  player_id: string;
  room_id: string;
  role_id: string;
  identity_message: string;
  host_notes?: string;
  claimed_by?: string | null;
};

export type NightMessage = {
  id: string;
  room_id: string;
  player_id: string;
  role_id: string;
  round: number;
  body: string;
  created_at: string;
};

export const activeRoomStorageKey = "xueran-active-host-room";

export const buildRoomUrl = (code: string) => {
  const url = new URL(window.location.href);
  url.search = `room=${encodeURIComponent(code)}`;
  url.hash = "";
  return url.toString();
};

export const findRoomByCode = async (code: string) => {
  const { data, error } = await supabase
    .from("xueran_rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data as SharedRoom | null;
};

const makeRoomCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

export const createRoom = async (state: GameState) => {
  const session = await ensureAnonymousSession();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("xueran_rooms")
      .insert({
        code: makeRoomCode(),
        host_user_id: session.user.id,
        title: "今晚的钟楼",
        script_id: state.scriptId,
        phase: state.phase,
        round: state.round,
      })
      .select("*")
      .single();

    if (error?.code === "23505") continue;
    if (error) throw error;

    const room = data as SharedRoom;
    try {
      await syncRoom(room.id, state);
      return room;
    } catch (reason) {
      await supabase.from("xueran_rooms").delete().eq("id", room.id);
      throw reason;
    }
  }

  throw new Error("无法生成可用的房间码，请重试");
};

export const syncRoom = async (roomId: string, state: GameState) => {
  const { error } = await supabase.rpc("xueran_sync_room", {
    p_room_id: roomId,
    p_state: state,
  });
  if (error) throw error;
};

export const loadHostRoom = async (room: SharedRoom, user: User) => {
  if (room.host_user_id !== user.id) {
    throw new Error("这台设备不是该房间的主持人设备");
  }

  const [hostStateResult, playersResult, identitiesResult] = await Promise.all([
    supabase
      .from("xueran_host_state")
      .select("*")
      .eq("room_id", room.id)
      .maybeSingle(),
    supabase
      .from("xueran_players")
      .select("*")
      .eq("room_id", room.id)
      .order("seat"),
    supabase
      .from("xueran_identities")
      .select("*")
      .eq("room_id", room.id),
  ]);

  if (hostStateResult.error) throw hostStateResult.error;
  if (playersResult.error) throw playersResult.error;
  if (identitiesResult.error) throw identitiesResult.error;

  const identities = new Map(
    (identitiesResult.data as PrivateIdentity[]).map((identity) => [
      identity.player_id,
      identity,
    ]),
  );

  const players: Player[] = (playersResult.data as PublicRoomPlayer[]).map(
    (player) => {
      const identity = identities.get(player.id);
      return {
        id: player.id,
        seat: player.seat,
        name: "",
        alive: player.alive,
        roleId: identity?.role_id ?? "washerwoman",
        identityMessage: identity?.identity_message ?? "",
        notes: identity?.host_notes ?? "",
      };
    },
  );

  return {
    scriptId: room.script_id,
    phase: room.phase,
    round: room.round,
    nightIndex: hostStateResult.data?.night_index ?? 0,
    players,
    storytellerNotes: hostStateResult.data?.storyteller_notes ?? "",
    updatedAt: new Date().toISOString(),
  } satisfies GameState;
};

export const getRoomPlayers = async (roomId: string) => {
  const { data, error } = await supabase
    .from("xueran_players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat");
  if (error) throw error;
  return data as PublicRoomPlayer[];
};

export const getMyIdentity = async (roomId: string) => {
  const { data, error } = await supabase
    .from("xueran_identities")
    .select("player_id, room_id, role_id, identity_message")
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) throw error;
  return data as PrivateIdentity | null;
};

const isMissingNightMessagesTable = (error: { code?: string; message?: string }) =>
  error.code === "42P01" ||
  error.code === "PGRST205" ||
  /xueran_night_messages/i.test(error.message ?? "");

export const getRoomNightMessages = async (roomId: string) => {
  const { data, error } = await supabase
    .from("xueran_night_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error && isMissingNightMessagesTable(error)) return [];
  if (error) throw error;
  return data as NightMessage[];
};

export const getMyNightMessages = async (roomId: string) => {
  const { data, error } = await supabase
    .from("xueran_night_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error && isMissingNightMessagesTable(error)) return [];
  if (error) throw error;
  return data as NightMessage[];
};

export const sendNightMessage = async ({
  roomId,
  playerId,
  roleId,
  round,
  body,
}: {
  roomId: string;
  playerId: string;
  roleId: string;
  round: number;
  body: string;
}) => {
  const { data, error } = await supabase.rpc("xueran_send_night_message", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_role_id: roleId,
    p_round: round,
    p_body: body,
  });
  if (error) throw error;
  return data as NightMessage;
};

export const claimSeat = async (
  roomId: string,
  playerId: string,
  playerName: string,
) => {
  const { error } = await supabase.rpc("xueran_claim_seat", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_player_name: playerName.trim(),
  });
  if (error) throw error;
};

export const revokeClaim = async (playerId: string) => {
  const { error } = await supabase.rpc("xueran_revoke_claim", {
    p_player_id: playerId,
  });
  if (error) throw error;
};

export const closeRoom = async (roomId: string) => {
  const { error } = await supabase
    .from("xueran_rooms")
    .update({ status: "closed" })
    .eq("id", roomId);
  if (error) throw error;
};
