import type { User } from "@supabase/supabase-js";
import { normalizeRoleId } from "./data";
import { ensureAnonymousSession, supabase } from "./supabase";
import { normalizePhase, type GameState, type Player } from "./types";

export type SharedRoom = {
  id: string;
  code: string;
  host_user_id: string;
  title: string;
  script_id: string;
  phase: GameState["phase"];
  round: number;
  status: "open" | "closed";
  simulation_enabled: boolean;
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
  is_simulated: boolean;
  updated_at: string;
};

export type PrivateIdentity = {
  player_id: string;
  room_id: string;
  role_id: string;
  drunk_role_id: string;
  identity_message: string;
  host_notes?: string;
  claimed_by?: string | null;
};

export type PlayerIdentity = {
  player_id: string;
  room_id: string;
  role_id: string;
  identity_message: string;
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

export type PlayerMessage = {
  id: string;
  room_id: string;
  player_id: string;
  round: number;
  body: string;
  created_at: string;
};

export type DayPrivateThread = {
  id: string;
  room_id: string;
  round: number;
  player_a_id: string;
  player_b_id: string;
  created_at: string;
  updated_at: string;
};

export type DayPrivateMessage = {
  id: string;
  thread_id: string;
  room_id: string;
  round: number;
  sender_player_id: string;
  recipient_player_id: string;
  body: string;
  estimated_seconds: number;
  created_at: string;
};

export type DayPrivateChatPairStat = {
  thread_id: string;
  room_id: string;
  round: number;
  player_a_id: string;
  player_b_id: string;
  message_count: number;
  estimated_seconds: number;
  last_activity_at: string | null;
};

export type DayPrivateChatDirectionStat = {
  thread_id: string;
  room_id: string;
  round: number;
  sender_player_id: string;
  recipient_player_id: string;
  message_count: number;
  estimated_seconds: number;
  last_activity_at: string | null;
};

export type Nomination = {
  id: string;
  room_id: string;
  round: number;
  nominator_player_id: string;
  nominee_player_id: string;
  status: "open" | "closed" | "executed";
  vote_count: number;
  required_votes: number | null;
  created_at: string;
  closed_at: string | null;
};

export type DayVote = {
  id: string;
  nomination_id: string;
  voter_player_id: string;
  voter_was_alive: boolean;
  created_at: string;
};

export type DayResolution = {
  room_id: string;
  round: number;
  executed_player_id: string | null;
  executed_player_was_alive?: boolean | null;
  resolved_at: string;
};

export type ExecutionResult = {
  room_id: string;
  round: number;
  executed_player_id: string | null;
  executed_player_was_alive?: boolean | null;
  vote_count?: number | null;
  required_votes?: number | null;
  already_resolved: boolean;
};

export type AdminRoom = {
  room_id: string;
  code: string;
  title: string;
  script_id: string;
  phase: GameState["phase"];
  round: number;
  status: "open" | "closed";
  simulation_enabled: boolean;
  player_count: number;
  claimed_count: number;
  created_at: string;
  updated_at: string;
};

export const activeRoomStorageKey = "xueran-active-host-room";

export const getAdminRooms = async (token: string) => {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc("xueran_admin_list_rooms", {
    p_token: token,
  });
  if (error) throw error;
  return (data ?? []) as AdminRoom[];
};

export const adminCloseRoom = async (token: string, roomId: string) => {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc("xueran_admin_close_room", {
    p_token: token,
    p_room_id: roomId,
  });
  if (error) throw error;
  return Boolean(data);
};

export const adminDeleteRoom = async (token: string, roomId: string) => {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc("xueran_admin_delete_room", {
    p_token: token,
    p_room_id: roomId,
  });
  if (error) throw error;
  return Boolean(data);
};

export const adminCloseAllRooms = async (token: string) => {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc(
    "xueran_admin_close_all_rooms",
    { p_token: token },
  );
  if (error) throw error;
  return Number(data ?? 0);
};

export const adminDeleteAllRooms = async (token: string) => {
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc(
    "xueran_admin_delete_all_rooms",
    { p_token: token },
  );
  if (error) throw error;
  return Number(data ?? 0);
};

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
        roleId: normalizeRoleId(identity?.role_id ?? "washerwoman"),
        drunkRoleId: identity?.drunk_role_id ?? "",
        identityMessage: identity?.identity_message ?? "",
        notes: identity?.host_notes ?? "",
      };
    },
  );

  return {
    scriptId: room.script_id,
    phase: normalizePhase(room.phase),
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
  const { data, error } = await supabase.rpc("xueran_get_my_identity", {
    p_room_id: roomId,
  });
  if (error) throw error;
  return ((data as PlayerIdentity[] | null)?.[0] ??
    null) as PlayerIdentity | null;
};

const isMissingNightMessagesTable = (error: { code?: string; message?: string }) =>
  error.code === "42P01" ||
  error.code === "PGRST205" ||
  /xueran_night_messages/i.test(error.message ?? "");

const getAllNightMessages = async (roomId: string) => {
  const pageSize = 500;
  const messages: NightMessage[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("xueran_night_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error && isMissingNightMessagesTable(error)) return [];
    if (error) throw error;

    const page = data as NightMessage[];
    messages.push(...page);
    if (page.length < pageSize) return messages;
  }
};

export const getRoomNightMessages = getAllNightMessages;

export const getMyNightMessages = getAllNightMessages;

const isMissingPlayerMessagesTable = (error: { code?: string; message?: string }) =>
  error.code === "42P01" ||
  error.code === "PGRST205" ||
  /xueran_player_messages/i.test(error.message ?? "");

const getAllPlayerMessages = async (roomId: string) => {
  const pageSize = 500;
  const messages: PlayerMessage[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("xueran_player_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error && isMissingPlayerMessagesTable(error)) return [];
    if (error) throw error;

    const page = data as PlayerMessage[];
    messages.push(...page);
    if (page.length < pageSize) return messages;
  }
};

export const getRoomPlayerMessages = getAllPlayerMessages;

export const getMyPlayerMessages = getAllPlayerMessages;

const isMissingDayPrivateChat = (error: { code?: string; message?: string }) =>
  error.code === "42P01" ||
  error.code === "PGRST202" ||
  error.code === "PGRST205" ||
  /xueran_(day_private|send_day_private|get_day_private)|schema cache/i.test(
    error.message ?? "",
  );

export const getMyDayPrivateThreads = async (roomId: string) => {
  const { data, error } = await supabase
    .from("xueran_day_private_threads")
    .select("*")
    .eq("room_id", roomId)
    .order("updated_at", { ascending: false });
  if (error && isMissingDayPrivateChat(error)) return [];
  if (error) throw error;
  return data as DayPrivateThread[];
};

export const getMyDayPrivateMessages = async (roomId: string) => {
  const { data, error } = await supabase
    .from("xueran_day_private_messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error && isMissingDayPrivateChat(error)) return [];
  if (error) throw error;
  return data as DayPrivateMessage[];
};

export const getRoomDayPrivateThreads = getMyDayPrivateThreads;

export const getRoomDayPrivateMessages = getMyDayPrivateMessages;

export const getDayPrivateChatPairStats = async (roomId: string) => {
  const { data, error } = await supabase.rpc(
    "xueran_get_day_private_chat_pair_stats",
    { p_room_id: roomId },
  );
  if (
    error &&
    (isMissingDayPrivateChat(error) ||
      /claimed player access required/i.test(error.message))
  ) {
    return [];
  }
  if (error) throw error;
  return (data ?? []) as DayPrivateChatPairStat[];
};

export const getDayPrivateChatDirectionStats = async (roomId: string) => {
  const { data, error } = await supabase.rpc(
    "xueran_get_day_private_chat_direction_stats",
    { p_room_id: roomId },
  );
  if (
    error &&
    (isMissingDayPrivateChat(error) ||
      /claimed player access required/i.test(error.message))
  ) {
    return [];
  }
  if (error) throw error;
  return (data ?? []) as DayPrivateChatDirectionStat[];
};

const isMissingVotingTable = (error: { code?: string; message?: string }) =>
  error.code === "42P01" ||
  error.code === "PGRST205" ||
  /xueran_(nominations|votes|day_resolutions)/i.test(error.message ?? "");

export const getRoomNominations = async (roomId: string) => {
  const { data, error } = await supabase
    .from("xueran_nominations")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error && isMissingVotingTable(error)) return [];
  if (error) throw error;
  return data as Nomination[];
};

export const getRoomVotes = async (roomId: string) => {
  const { data, error } = await supabase
    .from("xueran_votes")
    .select("*, xueran_nominations!inner(room_id)")
    .eq("xueran_nominations.room_id", roomId)
    .order("created_at", { ascending: true });
  if (error && isMissingVotingTable(error)) return [];
  if (error) throw error;
  return (data ?? []).map((vote) => ({
    id: vote.id,
    nomination_id: vote.nomination_id,
    voter_player_id: vote.voter_player_id,
    voter_was_alive: vote.voter_was_alive,
    created_at: vote.created_at,
  })) as DayVote[];
};

export const getRoomDayResolutions = async (roomId: string) => {
  const { data, error } = await supabase
    .from("xueran_day_resolutions")
    .select("*")
    .eq("room_id", roomId)
    .order("round", { ascending: true });
  if (error && isMissingVotingTable(error)) return [];
  if (error) throw error;
  return data as DayResolution[];
};

export const nominatePlayer = async (roomId: string, nomineePlayerId: string) => {
  const { data, error } = await supabase.rpc("xueran_nominate", {
    p_room_id: roomId,
    p_nominee_player_id: nomineePlayerId,
  });
  if (error) throw error;
  return data as Nomination;
};

export const castNominationVote = async (nominationId: string) => {
  const { data, error } = await supabase.rpc("xueran_cast_vote", {
    p_nomination_id: nominationId,
  });
  if (error) throw error;
  return data as DayVote;
};

export const closeNomination = async (nominationId: string) => {
  const { data, error } = await supabase.rpc("xueran_close_nomination", {
    p_nomination_id: nominationId,
  });
  if (error) throw error;
  return data as Nomination;
};

export const finalizeExecution = async (roomId: string, round: number) => {
  const { data, error } = await supabase.rpc("xueran_finalize_execution", {
    p_room_id: roomId,
    p_round: round,
  });
  if (error) throw error;
  return data as ExecutionResult;
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

export const sendPlayerMessage = async ({
  roomId,
  body,
}: {
  roomId: string;
  body: string;
}) => {
  const { data, error } = await supabase.rpc("xueran_send_player_message", {
    p_room_id: roomId,
    p_body: body,
  });
  if (error) throw error;
  return data as PlayerMessage;
};

export const sendDayPrivateMessage = async ({
  roomId,
  recipientPlayerId,
  body,
}: {
  roomId: string;
  recipientPlayerId: string;
  body: string;
}) => {
  const { data, error } = await supabase.rpc(
    "xueran_send_day_private_message",
    {
      p_room_id: roomId,
      p_recipient_player_id: recipientPlayerId,
      p_body: body,
    },
  );
  if (error) throw error;
  return data as DayPrivateMessage;
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

export const resetRoom = async (roomId: string) => {
  const { error } = await supabase.rpc("xueran_reset_room", {
    p_room_id: roomId,
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
