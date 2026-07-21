import { supabase } from "../supabase";
import type {
  DayPrivateMessage,
  DayVote,
  Nomination,
  PlayerMessage,
} from "../room";

export async function setRoomSimulation(roomId: string, enabled: boolean) {
  const { error } = await supabase.rpc("xueran_set_simulated_players", {
    p_room_id: roomId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

export async function simulatePlayerMessage({
  roomId,
  playerId,
  body,
}: {
  roomId: string;
  playerId: string;
  body: string;
}) {
  const send = () =>
    supabase.rpc("xueran_simulate_player_message", {
      p_room_id: roomId,
      p_player_id: playerId,
      p_body: body,
    });
  let { data, error } = await send();
  if (
    error &&
    /fetch|network|timeout|load failed|simulated player access required/i.test(
      error.message,
    )
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    ({ data, error } = await send());
  }
  if (error) throw error;
  return data as PlayerMessage;
}

export async function simulateDayPrivateMessage({
  roomId,
  senderPlayerId,
  recipientPlayerId,
  body,
}: {
  roomId: string;
  senderPlayerId: string;
  recipientPlayerId: string;
  body: string;
}) {
  const { data, error } = await supabase.rpc(
    "xueran_simulate_day_private_message",
    {
      p_room_id: roomId,
      p_sender_player_id: senderPlayerId,
      p_recipient_player_id: recipientPlayerId,
      p_body: body,
    },
  );
  if (error) throw error;
  return data as DayPrivateMessage;
}

export async function simulateNomination({
  roomId,
  nominatorPlayerId,
  nomineePlayerId,
}: {
  roomId: string;
  nominatorPlayerId: string;
  nomineePlayerId: string;
}) {
  const { data, error } = await supabase.rpc("xueran_simulate_nominate", {
    p_room_id: roomId,
    p_nominator_player_id: nominatorPlayerId,
    p_nominee_player_id: nomineePlayerId,
  });
  if (error) throw error;
  return data as Nomination;
}

export async function simulateVote({
  nominationId,
  voterPlayerId,
}: {
  nominationId: string;
  voterPlayerId: string;
}) {
  const { data, error } = await supabase.rpc("xueran_simulate_cast_vote", {
    p_nomination_id: nominationId,
    p_voter_player_id: voterPlayerId,
  });
  if (error) throw error;
  return data as DayVote;
}
