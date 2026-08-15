import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Eye,
  ExternalLink,
  Gavel,
  LoaderCircle,
  MessageSquareText,
  MessagesSquare,
  MoonStar,
  Plus,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import {
  getRole,
  getScriptRoles,
  scripts,
} from "./data";
import { CompactSelect } from "./CompactSelect";
import { DemonBluffMessage } from "./DemonBluffMessage";
import { parseDemonBluffMessage } from "./demonBluffs";
import { parsePhilosopherAbilityMessage } from "./philosopher";
import {
  claimSeat,
  findRoomByCode,
  getDayPrivateChatDirectionStats,
  getDayPrivateChatPairStats,
  getMyDayPrivateMessages,
  getMyDayPrivateThreads,
  getMyIdentity,
  getMyNightMessages,
  getMyPlayerMessages,
  getRoomDayResolutions,
  getRoomNominations,
  getRoomPlayers,
  getRoomVotes,
  sendDayPrivateMessage,
  sendPlayerMessage,
  type DayPrivateChatDirectionStat,
  type DayPrivateChatPairStat,
  type DayPrivateMessage,
  type DayPrivateThread,
  type DayResolution,
  type DayVote,
  type NightMessage,
  type Nomination,
  type PlayerIdentity,
  type PlayerMessage,
  type PublicRoomPlayer,
  type SharedRoom,
} from "./room";
import { RoleIcon } from "./RoleIcon";
import { getRoleDetailsUrl } from "./roleDetails";
import { PlayerPrivateChats } from "./PlayerPrivateChats";
import {
  buildPlayerSkillChoiceMessage,
  getPlayerMessageDisplayBody,
  parsePlayerSkillChoiceMessage,
  type PlayerSkillGuess,
} from "./playerSkillChoices";
import {
  getPlayerNightMessageDisplayBody,
  getRoleSkillMessage,
} from "./roleSkillMessages";
import { formatSeat } from "./seat";
import {
  getTroubleBrewingSkill,
  triggeredAbilityNotices,
  type PlayerChoiceSpec,
} from "./troubleBrewingSkills";
import { ensureAnonymousSession, supabase } from "./supabase";
import type { IdentityPayload, Team } from "./types";
import { PlayerVotingPanel } from "./VotingPanels";

type PlayerView = "identity" | "script" | "messages" | "private-chat" | "voting";

const scriptTeams: Team[] = ["镇民", "外来者", "爪牙", "恶魔"];

export function PlayerRoom({ roomCode }: { roomCode: string }) {
  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [players, setPlayers] = useState<PublicRoomPlayer[]>([]);
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [nightMessages, setNightMessages] = useState<NightMessage[]>([]);
  const [playerMessages, setPlayerMessages] = useState<PlayerMessage[]>([]);
  const [privateThreads, setPrivateThreads] = useState<DayPrivateThread[]>([]);
  const [privateMessages, setPrivateMessages] = useState<DayPrivateMessage[]>([]);
  const [privateChatPairStats, setPrivateChatPairStats] = useState<DayPrivateChatPairStat[]>([]);
  const [privateChatDirectionStats, setPrivateChatDirectionStats] = useState<DayPrivateChatDirectionStat[]>([]);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [votes, setVotes] = useState<DayVote[]>([]);
  const [dayResolutions, setDayResolutions] = useState<DayResolution[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (targetRoom: SharedRoom) => {
    if (targetRoom.status === "closed") return;
    const [
      latestRoom,
      nextPlayers,
      nextIdentity,
      nextNightMessages,
      nextPlayerMessages,
      nextPrivateThreads,
      nextPrivateMessages,
      nextPrivateChatPairStats,
      nextPrivateChatDirectionStats,
      nextNominations,
      nextVotes,
      nextDayResolutions,
    ] = await Promise.all([
      findRoomByCode(targetRoom.code),
      getRoomPlayers(targetRoom.id),
      getMyIdentity(targetRoom.id),
      getMyNightMessages(targetRoom.id),
      getMyPlayerMessages(targetRoom.id),
      getMyDayPrivateThreads(targetRoom.id),
      getMyDayPrivateMessages(targetRoom.id),
      getDayPrivateChatPairStats(targetRoom.id),
      getDayPrivateChatDirectionStats(targetRoom.id),
      getRoomNominations(targetRoom.id),
      getRoomVotes(targetRoom.id),
      getRoomDayResolutions(targetRoom.id),
    ]);

    if (!latestRoom) throw new Error("房间已不存在");
    if (latestRoom.status === "closed") {
      setRoom(latestRoom);
      setPlayers([]);
      setIdentity(null);
      setNightMessages([]);
      setPlayerMessages([]);
      setPrivateThreads([]);
      setPrivateMessages([]);
      setPrivateChatPairStats([]);
      setPrivateChatDirectionStats([]);
      setNominations([]);
      setVotes([]);
      setDayResolutions([]);
      return;
    }

    setRoom(latestRoom);
    setPlayers(nextPlayers);
    setIdentity(nextIdentity);
    setNightMessages(nextNightMessages);
    setPlayerMessages(nextPlayerMessages);
    setPrivateThreads(nextPrivateThreads);
    setPrivateMessages(nextPrivateMessages);
    setPrivateChatPairStats(nextPrivateChatPairStats);
    setPrivateChatDirectionStats(nextPrivateChatDirectionStats);
    setNominations(nextNominations);
    setVotes(nextVotes);
    setDayResolutions(nextDayResolutions);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setLoading(true);
      setError("");
      try {
        await ensureAnonymousSession();
        const foundRoom = await findRoomByCode(roomCode);
        if (!foundRoom) throw new Error("没有找到这个房间，请检查链接是否完整");
        if (cancelled) return;
        setRoom(foundRoom);
        if (foundRoom.status === "open") await refresh(foundRoom);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "房间加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [refresh, roomCode]);

  useEffect(() => {
    if (!room || room.status === "closed") return;

    const interval = window.setInterval(() => {
      void refresh(room).catch(() => undefined);
    }, 3500);

    const channel = supabase
      .channel(`xueran-player-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "xueran_players", filter: `room_id=eq.${room.id}` },
        () => void refresh(room),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "xueran_identities", filter: `room_id=eq.${room.id}` },
        () => void refresh(room),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "xueran_rooms", filter: `id=eq.${room.id}` },
        () => void refresh(room),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "xueran_night_messages", filter: `room_id=eq.${room.id}` },
        () => void refresh(room),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "xueran_player_messages", filter: `room_id=eq.${room.id}` },
        () => void refresh(room),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "xueran_day_private_threads", filter: `room_id=eq.${room.id}` },
        () => void refresh(room),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "xueran_day_private_messages", filter: `room_id=eq.${room.id}` },
        () => void refresh(room),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "xueran_nominations", filter: `room_id=eq.${room.id}` },
        () => void refresh(room),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "xueran_day_resolutions", filter: `room_id=eq.${room.id}` },
        () => void refresh(room),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "xueran_votes" },
        () => void refresh(room),
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh, room]);

  const claimPlayer = async (player: PublicRoomPlayer) => {
    if (!room || !playerName.trim()) return;
    setSubmittingId(player.id);
    setError("");
    try {
      await claimSeat(room.id, player.id, playerName);
      await refresh(room);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(
        /already claimed/i.test(message)
          ? "这个座位刚刚被其他玩家认领，请选择其他座位"
          : /device already/i.test(message)
            ? "这台设备已经认领了本房间的座位"
            : /name required/i.test(message)
              ? "请输入名字或昵称"
              : "入座失败，请稍后重试",
      );
    } finally {
      setSubmittingId("");
    }
  };

  const sendMessageToHost = async (body: string) => {
    if (!room) throw new Error("房间尚未加载");
    const message = await sendPlayerMessage({ roomId: room.id, body });
    setPlayerMessages((current) => [
      message,
      ...current.filter((item) => item.id !== message.id),
    ]);
  };

  const sendPrivateMessage = async (recipientPlayerId: string, body: string) => {
    if (!room) throw new Error("房间尚未加载");
    const message = await sendDayPrivateMessage({
      roomId: room.id,
      recipientPlayerId,
      body,
    });
    setPrivateMessages((current) => [
      ...current.filter((item) => item.id !== message.id),
      message,
    ]);
    await refresh(room);
  };

  if (loading) {
    return (
      <main className="player-room-page centered-page">
        <LoaderCircle className="spin" size={28} />
        <p>正在进入房间…</p>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="player-room-page centered-page">
        <div className="player-room-seal">血</div>
        <h1>无法进入房间</h1>
        <p>{error}</p>
        <button className="secondary-button" onClick={() => window.location.reload()}>
          <RefreshCw size={15} />
          重新加载
        </button>
      </main>
    );
  }

  if (!room) return null;

  if (room.status === "closed") {
    return (
      <main className="player-room-page centered-page">
        <div className="player-room-seal">终</div>
        <h1>房间已结束</h1>
        <p>主持人已经关闭本局共享身份。</p>
      </main>
    );
  }

  if (identity) {
    const player = players.find((item) => item.id === identity.player_id);
    const philosopherAbilityRoleId = identity.role_id === "philosopher"
      ? [...nightMessages]
          .sort(
            (left, right) =>
              new Date(right.created_at).getTime() -
              new Date(left.created_at).getTime(),
          )
          .map((message) =>
            parsePhilosopherAbilityMessage(
              message.body,
              getScriptRoles(room.script_id),
            ),
          )
          .find(Boolean) ?? ""
      : "";
    const effectiveRoleId = philosopherAbilityRoleId || identity.role_id;
    const payload: IdentityPayload = {
      version: 1,
      playerName: player?.name.trim() || formatSeat(player?.seat),
      seat: player?.seat ?? 0,
      roleId: effectiveRoleId,
      message: identity.identity_message,
    };
    return (
      <ClaimedIdentity
        key={`${payload.seat}-${payload.roleId}`}
        identity={payload}
        roomId={room.id}
        roomCode={room.code}
        scriptId={room.script_id}
        playerId={identity.player_id}
        round={room.round}
        phase={room.phase}
        players={players}
        nightMessages={nightMessages}
        playerMessages={playerMessages}
        privateThreads={privateThreads}
        privateMessages={privateMessages}
        privateChatPairStats={privateChatPairStats}
        privateChatDirectionStats={privateChatDirectionStats}
        nominations={nominations}
        votes={votes}
        dayResolutions={dayResolutions}
        onSendPlayerMessage={sendMessageToHost}
        onSendPrivateMessage={sendPrivateMessage}
        onRefresh={() => refresh(room)}
      />
    );
  }

  return (
    <main className="player-room-page">
      <header className="player-room-header">
        <div className="player-room-seal">血</div>
        <div>
          <p className="eyebrow">PLAYER ROOM · {room.code}</p>
          <h1>{room.title}</h1>
        </div>
      </header>

      <section className="seat-claim-panel">
        <div className="seat-claim-heading">
          <div>
            <p className="eyebrow">CLAIM YOUR SEAT</p>
            <h2>填写名字并选择座位</h2>
          </div>
          <Users size={21} />
        </div>
        <p className="seat-claim-help">输入你的名字或昵称，然后选择现场对应的座位号。</p>
        <label className="player-name-field">
          <span>你的名字或昵称</span>
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            placeholder="例如：小明"
            maxLength={24}
            autoComplete="name"
          />
        </label>
        <div className="seat-choice-list">
          {players.map((player) => (
            <button
              className="seat-choice"
              key={player.id}
              disabled={
                player.is_claimed ||
                Boolean(submittingId) ||
                !playerName.trim()
              }
              onClick={() => void claimPlayer(player)}
            >
              <span className="seat-choice-number">
                {formatSeat(player.seat)}
              </span>
              <span className="seat-choice-name">选择此座位</span>
              <span className={player.is_claimed ? "seat-claimed" : "seat-available"}>
                {player.is_claimed ? (
                  <>
                    <UserRoundCheck size={14} />
                    已入座
                  </>
                ) : submittingId === player.id ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  "入座"
                )}
              </span>
            </button>
          ))}
        </div>
      </section>
      {error ? <div className="inline-error">{error}</div> : null}
      <p className="player-room-privacy">
        <ShieldCheck size={14} />
        入座成功后，本设备只能读取该座位的身份。
      </p>
    </main>
  );
}

function ClaimedIdentity({
  identity,
  roomId,
  roomCode,
  scriptId,
  playerId,
  round,
  phase,
  players,
  nightMessages,
  playerMessages,
  privateThreads,
  privateMessages,
  privateChatPairStats,
  privateChatDirectionStats,
  nominations,
  votes,
  dayResolutions,
  onSendPlayerMessage,
  onSendPrivateMessage,
  onRefresh,
}: {
  identity: IdentityPayload;
  roomId: string;
  roomCode: string;
  scriptId: string;
  playerId: string;
  round: number;
  phase: "白天" | "夜晚";
  players: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  privateThreads: DayPrivateThread[];
  privateMessages: DayPrivateMessage[];
  privateChatPairStats: DayPrivateChatPairStat[];
  privateChatDirectionStats: DayPrivateChatDirectionStat[];
  nominations: Nomination[];
  votes: DayVote[];
  dayResolutions: DayResolution[];
  onSendPlayerMessage: (body: string) => Promise<void>;
  onSendPrivateMessage: (recipientPlayerId: string, body: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);
  const identitySeenKey = `xueran-identity-seen-${roomCode}-${identity.seat}-${identity.roleId}`;
  const messageReadKey = `xueran-message-read-${roomCode}-${identity.seat}`;
  const privateReadKey = `xueran-private-chat-read-${roomCode}-${identity.seat}`;
  const [identitySeen, setIdentitySeen] = useState(
    () => localStorage.getItem(identitySeenKey) === "true",
  );
  const [activeView, setActiveView] = useState<PlayerView>("identity");
  const [lastReadAt, setLastReadAt] = useState(
    () => localStorage.getItem(messageReadKey) ?? "",
  );
  const [privateLastReadAt, setPrivateLastReadAt] = useState(
    () => localStorage.getItem(privateReadKey) ?? "",
  );
  const role = getRole(identity.roleId);
  const script = scripts.find((item) => item.id === scriptId) ?? scripts[0];
  const scriptRoles = getScriptRoles(scriptId);
  const lastReadTime = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  const unreadCount = nightMessages.filter(
    (message) => new Date(message.created_at).getTime() > lastReadTime,
  ).length;
  const privateLastReadTime = privateLastReadAt
    ? new Date(privateLastReadAt).getTime()
    : 0;
  const privateUnreadCount = privateMessages.filter(
    (message) =>
      message.recipient_player_id === playerId &&
      new Date(message.created_at).getTime() > privateLastReadTime,
  ).length;
  useEffect(() => {
    if (activeView !== "messages" || !nightMessages[0]) return;
    const latestMessageAt = nightMessages[0].created_at;
    localStorage.setItem(messageReadKey, latestMessageAt);
    setLastReadAt(latestMessageAt);
  }, [activeView, messageReadKey, nightMessages]);
  useEffect(() => {
    const latestMessage = privateMessages.at(-1);
    if (activeView !== "private-chat" || !latestMessage) return;
    localStorage.setItem(privateReadKey, latestMessage.created_at);
    setPrivateLastReadAt(latestMessage.created_at);
  }, [activeView, privateMessages, privateReadKey]);

  const revealIdentity = () => {
    setRevealed(true);
    setIdentitySeen(true);
    localStorage.setItem(identitySeenKey, "true");
  };

  return (
    <main className={identitySeen ? "player-hub-page" : "identity-page"}>
      {identitySeen ? (
        <header className="player-hub-header">
          <div>
            <p className="eyebrow">PLAYER ROOM · {roomCode}</p>
            <h1>{identity.playerName}</h1>
          </div>
          <span>{formatSeat(identity.seat)}</span>
        </header>
      ) : null}

      {identitySeen ? (
        <nav
          className="player-hub-nav with-private-chat"
          aria-label="玩家页面导航"
        >
          <button
            className={activeView === "identity" ? "active" : ""}
            onClick={() => setActiveView("identity")}
          >
            <Eye size={18} />
            <span>我的身份</span>
          </button>
          <button
            className={activeView === "script" ? "active" : ""}
            onClick={() => setActiveView("script")}
          >
            <ScrollText size={18} />
            <span>剧本角色</span>
          </button>
          <button
            className={activeView === "messages" ? "active" : ""}
            onClick={() => setActiveView("messages")}
          >
            <MessageSquareText size={18} />
            <span>上帝消息</span>
            {unreadCount ? <strong>{Math.min(unreadCount, 99)}</strong> : null}
          </button>
          <button
            className={activeView === "private-chat" ? "active" : ""}
            onClick={() => setActiveView("private-chat")}
          >
            <MessagesSquare size={18} />
            <span>白天私聊</span>
            {privateUnreadCount ? (
              <strong>{Math.min(privateUnreadCount, 99)}</strong>
            ) : null}
          </button>
          <button
            className={activeView === "voting" ? "active" : ""}
            onClick={() => setActiveView("voting")}
          >
            <Gavel size={18} />
            <span>提名投票</span>
          </button>
        </nav>
      ) : null}

      {activeView === "identity" ? (
        <IdentityView
          identity={identity}
          role={role}
          roomCode={roomCode}
          revealed={revealed}
          unreadCount={unreadCount}
          onReveal={revealIdentity}
          onHide={() => setRevealed(false)}
        />
      ) : null}

      {activeView === "script" ? (
        <section className="player-view-panel">
          <div className="player-view-heading">
            <div>
              <p className="eyebrow">SCRIPT REFERENCE</p>
              <h2>{script.name}</h2>
            </div>
            <ScrollText size={22} />
          </div>
          <div className="player-script-groups">
            {scriptTeams.map((team) => {
              const teamRoles = scriptRoles.filter(
                (item) => item.team === team,
              );
              return (
                <section className={`player-script-group ${teamClass(team)}`} key={team}>
                  <div className="player-script-team-heading">
                    <h3>{team}</h3>
                    <span>{teamRoles.length}</span>
                  </div>
                  <div className="player-script-role-list">
                    {teamRoles.map((item) => (
                      <a
                        className="player-script-role"
                        href={getRoleDetailsUrl(item)}
                        key={item.id}
                        target="_blank"
                        rel="noreferrer"
                        title={`在中文钟楼百科中查看${item.name}`}
                        aria-label={`在中文钟楼百科中查看${item.name}`}
                      >
                        <span className="player-script-role-icon">
                          <RoleIcon roleId={item.id} size={22} />
                        </span>
                        <div>
                          <strong>{item.name}</strong>
                          <p>{item.short}</p>
                        </div>
                        <ExternalLink className="role-details-icon" size={13} aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : null}

      {activeView === "messages" ? (
        <PlayerMessages
          roleId={identity.roleId}
          roleOptions={scriptRoles}
          currentPlayerId={playerId}
          round={round}
          phase={phase}
          players={players}
          hostMessages={nightMessages}
          playerMessages={playerMessages}
          onSend={onSendPlayerMessage}
        />
      ) : null}

      {activeView === "voting" ? (
        <PlayerVotingPanel
          roomId={roomId}
          phase={phase}
          round={round}
          currentPlayerId={playerId}
          players={players}
          nominations={nominations}
          votes={votes}
          resolutions={dayResolutions}
          roleId={identity.roleId}
          playerMessages={playerMessages}
          onRefresh={onRefresh}
        />
      ) : null}

      {activeView === "private-chat" ? (
        <PlayerPrivateChats
          currentPlayerId={playerId}
          phase={phase}
          players={players}
          threads={privateThreads}
          messages={privateMessages}
          pairStats={privateChatPairStats}
          directionStats={privateChatDirectionStats}
          onSend={onSendPrivateMessage}
        />
      ) : null}

    </main>
  );
}

function IdentityView({
  identity,
  role,
  roomCode,
  revealed,
  unreadCount,
  onReveal,
  onHide,
}: {
  identity: IdentityPayload;
  role: ReturnType<typeof getRole>;
  roomCode: string;
  revealed: boolean;
  unreadCount: number;
  onReveal: () => void;
  onHide: () => void;
}) {
  return (
    <section className={revealed ? "identity-envelope revealed" : "identity-envelope"}>
        <div className="identity-room-code">
          <CheckCircle2 size={14} />
          房间 {roomCode} · 已入座
        </div>
        <div className="identity-seal" aria-hidden="true">
          {revealed ? <RoleIcon roleId={role.id} size={29} /> : "血"}
        </div>
        <p className="eyebrow">
          PRIVATE IDENTITY · {formatSeat(identity.seat)}
        </p>
        <h1>{identity.playerName}的身份密函</h1>

        {revealed ? (
          <>
            <div className={`identity-role-card ${teamClass(role.team)}`}>
              <span className="identity-role-icon">
                <RoleIcon roleId={role.id} size={30} />
              </span>
              <div>
                <span className="identity-team">{role.team}</span>
                <h2>{role.name}</h2>
              </div>
            </div>
            <div className="identity-ability">
              <span>角色能力</span>
              <p>{role.short}</p>
            </div>
            <button
              className="identity-reveal-button secondary"
              onClick={onHide}
            >
              隐藏身份
            </button>
          </>
        ) : (
          <>
            <ShieldCheck size={27} className="identity-shield" />
            <p className="identity-intro">请确认周围没有其他玩家，然后独自揭示你的身份。</p>
            {unreadCount ? (
              <div className="night-message-alert">
                <MoonStar size={16} />
                有 {unreadCount} 条未读上帝消息
              </div>
            ) : null}
            <button className="identity-reveal-button" onClick={onReveal}>
              查看我的身份
            </button>
          </>
        )}
      </section>
  );
}

function PlayerMessages({
  roleId,
  roleOptions,
  currentPlayerId,
  round,
  phase,
  players,
  hostMessages,
  playerMessages,
  onSend,
}: {
  roleId: string;
  roleOptions: ReturnType<typeof getScriptRoles>;
  currentPlayerId: string;
  round: number;
  phase: "白天" | "夜晚";
  players: PublicRoomPlayer[];
  hostMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  onSend: (body: string) => Promise<void>;
}) {
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const philosopherAbilityRoleId =
    roleId === "philosopher"
      ? [...hostMessages]
          .sort(
            (left, right) =>
              new Date(right.created_at).getTime() -
              new Date(left.created_at).getTime(),
          )
          .map((message) =>
            parsePhilosopherAbilityMessage(message.body, roleOptions),
          )
          .find(Boolean) ?? ""
      : "";
  const skillRoleId = philosopherAbilityRoleId || roleId;
  const timeline = [
    ...hostMessages.map((message) => {
      const skillBody = getRoleSkillMessage(message.body);
      const demonBluffRoleIds = parseDemonBluffMessage(message.body);
      return {
        ...message,
        body: getPlayerNightMessageDisplayBody(
          message.body,
          message.role_id,
        ),
        direction: "incoming" as const,
        label: `上帝 · 第 ${message.round} 回合${demonBluffRoleIds ? " · 不在场身份" : skillBody ? " · 技能" : ""}`,
        demonBluffRoleIds,
      };
    }),
    ...playerMessages.map((message) => ({
      ...message,
      body: getPlayerMessageDisplayBody(message.body),
      direction: "outgoing" as const,
      label: `我 · 第 ${message.round} 回合${
        parsePlayerSkillChoiceMessage(message.body) ? " · 技能选择" : ""
      }`,
      demonBluffRoleIds: null,
    })),
  ].sort(
    (left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );
  const latestMessageKey = timeline.length
    ? `${timeline[timeline.length - 1].direction}-${timeline[timeline.length - 1].id}`
    : "";

  useEffect(() => {
    const timelineElement = timelineRef.current;
    if (!timelineElement) return;
    const frame = requestAnimationFrame(() => {
      timelineElement.scrollTop = timelineElement.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [latestMessageKey]);

  const submitMessage = async () => {
    const body = messageBody.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError("");
    try {
      await onSend(body);
      setMessageBody("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /function|player_messages|schema cache/i.test(message)
          ? "玩家消息数据库尚未配置"
          : /claimed player|room is not open/i.test(message)
            ? "当前座位或房间状态不可发送"
            : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="player-view-panel player-message-view">
      <div className="player-view-heading">
        <div>
          <p className="eyebrow">PRIVATE CHAT</p>
          <h2>与上帝聊天</h2>
        </div>
        <MessageSquareText size={22} />
      </div>

      {philosopherAbilityRoleId ? (
        <div className="night-player-choice">
          <ShieldCheck size={14} />
          <span>
            已获得{getRole(philosopherAbilityRoleId).name}能力，后续操作按该角色执行
          </span>
        </div>
      ) : null}

      <PlayerRoleSkillPanel
        roleId={skillRoleId}
        roleOptions={roleOptions}
        currentPlayerId={currentPlayerId}
        round={round}
        phase={phase}
        players={players}
        messages={playerMessages}
        hostMessages={hostMessages}
        onSend={onSend}
      />

      {timeline.length ? (
        <div className="player-message-timeline" ref={timelineRef}>
          {timeline.map((message) => (
            <article
              className={`player-message-item ${message.direction}`}
              key={`${message.direction}-${message.id}`}
            >
              <span className="player-message-avatar" aria-hidden="true">
                {message.direction === "incoming" ? "上" : "我"}
              </span>
              <div className="player-message-content">
                <div className="player-message-meta">
                  <span>{message.label}</span>
                  <time>
                    {new Date(message.created_at).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <div className="player-message-bubble">
                  {message.demonBluffRoleIds ? (
                    <DemonBluffMessage roleIds={message.demonBluffRoleIds} />
                  ) : (
                    <p>{message.body}</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="player-message-empty">
          <MessageSquareText size={25} />
          <h3>暂无聊天记录</h3>
          <p>你和上帝发送的新信息会自动出现在这里。</p>
        </div>
      )}

      <div className="player-chat-composer">
        <div className="player-chat-composer-row">
          <textarea
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitMessage();
              }
            }}
            placeholder="发送消息"
            aria-label="发送给上帝的消息"
            maxLength={500}
            rows={1}
            disabled={sending}
          />
          <button
            className="primary-button"
            aria-label="发送消息"
            disabled={!messageBody.trim() || sending}
            onClick={() => void submitMessage()}
          >
            <Send size={18} />
            <span>{sending ? "发送中" : "发送"}</span>
          </button>
        </div>
        <span className="player-message-count">{messageBody.length}/500</span>
        {sendError ? <div className="inline-error">{sendError}</div> : null}
      </div>
    </section>
  );
}

function PlayerRoleSkillPanel({
  roleId,
  roleOptions,
  currentPlayerId,
  round,
  phase,
  players,
  messages,
  hostMessages,
  onSend,
}: {
  roleId: string;
  roleOptions: ReturnType<typeof getScriptRoles>;
  currentPlayerId: string;
  round: number;
  phase: "白天" | "夜晚";
  players: PublicRoomPlayer[];
  messages: PlayerMessage[];
  hostMessages: NightMessage[];
  onSend: (body: string) => Promise<void>;
}) {
  const skill = getTroubleBrewingSkill(roleId);
  if (!skill?.playerChoice) return null;
  if (skill.playerChoice.kind === "juggler") {
    return (
      <PlayerJugglerSkillPanel
        roleId={roleId}
        roleOptions={roleOptions}
        round={round}
        phase={phase}
        players={players}
        messages={messages}
        spec={skill.playerChoice}
        onSend={onSend}
      />
    );
  }
  return (
    <PlayerSkillChoicePanel
      roleId={roleId}
      roleOptions={roleOptions}
      currentPlayerId={currentPlayerId}
      round={round}
      phase={phase}
      players={players}
      messages={messages}
      hostMessages={hostMessages}
      spec={skill.playerChoice}
      onSend={onSend}
    />
  );
}

type JugglerDraftGuess = PlayerSkillGuess & { key: number };

function PlayerJugglerSkillPanel({
  roleId,
  roleOptions,
  round,
  phase,
  players,
  messages,
  spec,
  onSend,
}: {
  roleId: string;
  roleOptions: ReturnType<typeof getScriptRoles>;
  round: number;
  phase: "白天" | "夜晚";
  players: PublicRoomPlayer[];
  messages: PlayerMessage[];
  spec: PlayerChoiceSpec;
  onSend: (body: string) => Promise<void>;
}) {
  const nextGuessKey = useRef(1);
  const roleChoices = messages
    .map((message) => ({
      message,
      choice: parsePlayerSkillChoiceMessage(message.body),
    }))
    .filter(
      (entry): entry is {
        message: PlayerMessage;
        choice: NonNullable<ReturnType<typeof parsePlayerSkillChoiceMessage>>;
      } => entry.choice?.roleId === roleId,
    )
    .sort(
      (left, right) =>
        new Date(right.message.created_at).getTime() -
        new Date(left.message.created_at).getTime(),
    );
  const latestChoice = roleChoices.find(
    (entry) => entry.message.round === round,
  )?.choice;
  const submittedChoice = latestChoice ?? roleChoices[0]?.choice;
  const [guesses, setGuesses] = useState<JugglerDraftGuess[]>(() => {
    const saved = latestChoice?.guesses ?? [];
    if (saved.length) {
      return saved.map((guess) => ({
        ...guess,
        key: nextGuessKey.current++,
      }));
    }
    return players[0] && roleOptions[0]
      ? [{
          key: nextGuessKey.current++,
          playerId: players[0].id,
          roleId: roleOptions[0].id,
        }]
      : [];
  });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const savedGuessSignature =
    latestChoice?.guesses === undefined
      ? ""
      : JSON.stringify(latestChoice.guesses);

  useEffect(() => {
    if (!savedGuessSignature) return;
    const saved = JSON.parse(savedGuessSignature) as PlayerSkillGuess[];
    setGuesses(
      saved.map((guess) => ({
        ...guess,
        key: nextGuessKey.current++,
      })),
    );
  }, [savedGuessSignature]);

  const firstDayLocked = Boolean(spec.firstDayOnly && round !== 1);
  const phaseAllowed = phase === "白天";
  const oneUseLocked = Boolean(
    spec.oneUse && roleChoices.some((entry) => entry.message.round !== round),
  );
  const available = phaseAllowed && !firstDayLocked && !oneUseLocked;
  const addGuess = () => {
    if (
      guesses.length >= 5 ||
      !players.length ||
      !roleOptions.length
    ) return;
    setGuesses((current) => [
      ...current,
      {
        key: nextGuessKey.current++,
        playerId: players[0].id,
        roleId: roleOptions[0].id,
      },
    ]);
  };
  const updateGuess = (key: number, patch: Partial<PlayerSkillGuess>) => {
    setGuesses((current) =>
      current.map((guess) =>
        guess.key === key ? { ...guess, ...patch } : guess,
      ),
    );
  };
  const getPlayerLabel = (playerId: string) => {
    const player = players.find((item) => item.id === playerId);
    return player
      ? `${formatSeat(player.seat)} ${player.name || "玩家"}`
      : "未知座位";
  };
  const submitGuesses = async () => {
    if (!available || sending) return;
    const validGuesses = guesses
      .filter(
        (guess) =>
          players.some((player) => player.id === guess.playerId) &&
          roleOptions.some((role) => role.id === guess.roleId),
      )
      .slice(0, 5)
      .map(({ playerId, roleId: guessedRoleId }) => ({
        playerId,
        roleId: guessedRoleId,
      }));
    const detail = validGuesses.map(
      (guess, index) =>
        `${index + 1}. ${getPlayerLabel(guess.playerId)}是${getRole(guess.roleId).name}`,
    );
    const summary = detail.length
      ? `杂耍猜测（${detail.length}项）：${detail.join("；")}`
      : "杂耍猜测：本日不做猜测";
    if (
      !window.confirm(
        `确认你已在公开讨论中逐项说出以下猜测？\n\n${
          detail.join("\n") || "本日不做猜测"
        }`,
      )
    ) {
      return;
    }
    setSending(true);
    setSendError("");
    try {
      await onSend(
        buildPlayerSkillChoiceMessage({
          roleId,
          playerIds: validGuesses.map((guess) => guess.playerId),
          guesses: validGuesses,
          summary,
        }),
      );
    } catch {
      setSendError("杂耍猜测发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };
  const unavailableText = !phaseAllowed
    ? "请在白天阶段提交首日公开猜测"
    : firstDayLocked
      ? "杂耍猜测仅可在首日提交"
      : oneUseLocked
        ? "首日猜测已经结束"
        : "";

  return (
    <section
      className={(
        "player-skill-action player-juggler-skill " +
        (available ? "" : "is-locked")
      ).trim()}
    >
      <div className="player-skill-action-heading">
        <span className="player-skill-action-icon">
          <RoleIcon roleId={roleId} size={21} />
        </span>
        <div>
          <strong>{spec.title}</strong>
          <small>{spec.help}</small>
        </div>
        {submittedChoice ? (
          <span className="player-skill-submitted">已提交</span>
        ) : null}
      </div>
      {available ? (
        <>
          <div className="player-juggler-toolbar">
            <span>
              已填写 <strong>{guesses.length}</strong> / 5 项
            </span>
            <button
              className="secondary-button"
              type="button"
              disabled={sending || guesses.length >= 5}
              onClick={addGuess}
            >
              <Plus size={14} />
              添加猜测
            </button>
          </div>
          {guesses.length ? (
            <div className="player-juggler-list">
              {guesses.map((guess, index) => (
                <div className="player-juggler-row" key={guess.key}>
                  <span>{index + 1}</span>
                  <CompactSelect
                    value={guess.playerId}
                    disabled={sending}
                    ariaLabel={`第${index + 1}项猜测玩家`}
                    onValueChange={(playerId) =>
                      updateGuess(guess.key, { playerId })
                    }
                  >
                    {players.map((player) => (
                      <option
                        value={player.id}
                        key={player.id}
                      >
                        {formatSeat(player.seat)} · {player.name || "玩家"}
                      </option>
                    ))}
                  </CompactSelect>
                  <em>是</em>
                  <CompactSelect
                    value={guess.roleId}
                    disabled={sending}
                    ariaLabel={`第${index + 1}项猜测角色`}
                    onValueChange={(nextRoleId) =>
                      updateGuess(guess.key, { roleId: nextRoleId })
                    }
                  >
                    {roleOptions.map((role) => (
                      <option value={role.id} key={role.id}>
                        {role.name} · {role.team}
                      </option>
                    ))}
                  </CompactSelect>
                  <button
                    className="player-juggler-remove"
                    type="button"
                    aria-label={`删除第${index + 1}项猜测`}
                    disabled={sending}
                    onClick={() =>
                      setGuesses((current) =>
                        current.filter((item) => item.key !== guess.key),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="player-juggler-empty">
              当前没有猜测；可以直接提交“本日不做猜测”，或添加一项。
            </p>
          )}
          <button
            className="primary-button player-juggler-submit"
            type="button"
            disabled={sending}
            onClick={() => void submitGuesses()}
          >
            <Send size={15} />
            {sending
              ? "提交中"
              : latestChoice
                ? "更新全部猜测"
                : spec.submitLabel}
          </button>
        </>
      ) : (
        <p className="player-skill-locked-note">{unavailableText}</p>
      )}
      {submittedChoice ? (
        <p className="player-skill-latest">{submittedChoice.summary}</p>
      ) : null}
      {sendError ? <div className="inline-error">{sendError}</div> : null}
    </section>
  );
}
function PlayerSkillChoicePanel({
  roleId,
  roleOptions,
  currentPlayerId,
  round,
  phase,
  players,
  messages,
  hostMessages,
  spec,
  onSend,
}: {
  roleId: string;
  roleOptions: ReturnType<typeof getScriptRoles>;
  currentPlayerId: string;
  round: number;
  phase: "白天" | "夜晚";
  players: PublicRoomPlayer[];
  messages: PlayerMessage[];
  hostMessages: NightMessage[];
  spec: PlayerChoiceSpec;
  onSend: (body: string) => Promise<void>;
}) {
  const roleChoices = messages
    .map((message) => ({
      message,
      choice: parsePlayerSkillChoiceMessage(message.body),
    }))
    .filter(
      (entry): entry is {
        message: PlayerMessage;
        choice: NonNullable<ReturnType<typeof parsePlayerSkillChoiceMessage>>;
      } => entry.choice?.roleId === roleId,
    )
    .sort(
      (left, right) =>
        new Date(right.message.created_at).getTime() -
        new Date(left.message.created_at).getTime(),
    );
  const latestChoiceEntry = roleChoices.find(
    (entry) => entry.message.round === round,
  );
  const latestChoice = latestChoiceEntry?.choice;
  const latestChoiceMessageId = latestChoiceEntry?.message.id ?? "";
  const latestChoiceFirstPlayerId = latestChoice?.playerIds[0] ?? "";
  const latestChoiceSecondPlayerId = latestChoice?.playerIds[1] ?? "";
  const latestChoiceRoleId = latestChoice?.roleIdChoice ?? "";
  const latestChoiceStatement = latestChoice?.statement ?? "";
  const oneUseResolved = hostMessages.some(
    (message) =>
      message.player_id === currentPlayerId &&
      message.role_id === roleId &&
      Boolean(getRoleSkillMessage(message.body)),
  );
  const oneUseLocked =
    Boolean(spec.oneUse) &&
    (oneUseResolved ||
      roleChoices.some((entry) => entry.message.round < round));
  const previousDevilsAdvocateTargetId =
    roleId === "devils-advocate"
      ? roleChoices
          .filter((entry) => entry.message.round < round)
          .sort((left, right) => {
            if (left.message.round !== right.message.round) {
              return right.message.round - left.message.round;
            }
            return (
              new Date(right.message.created_at).getTime() -
              new Date(left.message.created_at).getTime()
            );
          })[0]?.choice.playerIds[0] ?? ""
      : "";
  const selfPlayer = players.find((player) => player.id === currentPlayerId);
  const candidates = players.filter((player) => {
    if (spec.excludeSelf && player.id === currentPlayerId) return false;
    if (spec.aliveOnly && !player.alive) return false;
    if (player.id === previousDevilsAdvocateTargetId) return false;
    return true;
  });
  const [firstPlayerId, setFirstPlayerId] = useState(
    latestChoice?.playerIds[0] ?? candidates[0]?.id ?? "",
  );
  const [secondPlayerId, setSecondPlayerId] = useState(
    latestChoice?.playerIds[1] ??
      candidates.find((player) => player.id !== candidates[0]?.id)?.id ??
      "",
  );
  const selectableRoles = roleOptions.filter(
    (role) => !spec.roleTeams?.length || spec.roleTeams.includes(role.team),
  );
  const [roleChoiceId, setRoleChoiceId] = useState(
    latestChoice?.roleIdChoice ?? selectableRoles[0]?.id ?? "",
  );
  const [statement, setStatement] = useState(latestChoice?.statement ?? "");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const phaseAllowed = spec.phase === "night" ? phase === "夜晚" : phase === "白天";
  const firstNightLocked = phase === "夜晚" && round <= 1 && !spec.allowFirstNight;
  const triggerNotice =
    triggeredAbilityNotices[
      roleId as keyof typeof triggeredAbilityNotices
    ];
  const triggerNoticeReceived = Boolean(
    triggerNotice &&
      hostMessages.some(
        (message) =>
          message.player_id === currentPlayerId &&
          message.round === round &&
          message.body === triggerNotice,
      ),
  );
  const deathLocked = Boolean(
    spec.onlyWhenDead && selfPlayer?.alive !== false && !triggerNoticeReceived,
  );
  const hostTriggerLocked = Boolean(triggerNotice && !triggerNoticeReceived);
  const available =
    phaseAllowed &&
    !firstNightLocked &&
    !deathLocked &&
    !hostTriggerLocked &&
    !oneUseLocked;
  const needsSecondPlayer = spec.kind === "pair";

  useEffect(() => {
    if (!latestChoiceMessageId) return;
    setFirstPlayerId(latestChoiceFirstPlayerId);
    setSecondPlayerId(latestChoiceSecondPlayerId);
    setRoleChoiceId(latestChoiceRoleId);
    setStatement(latestChoiceStatement);
  }, [
    latestChoiceFirstPlayerId,
    latestChoiceMessageId,
    latestChoiceRoleId,
    latestChoiceSecondPlayerId,
    latestChoiceStatement,
  ]);

  useEffect(() => {
    const candidateIds = new Set(candidates.map((player) => player.id));
    const nextFirst =
      candidateIds.has(firstPlayerId)
        ? firstPlayerId
        : candidates[0]?.id ?? "";
    const nextSecond =
      spec.kind === "pair"
        ? candidateIds.has(secondPlayerId) && secondPlayerId !== nextFirst
            ? secondPlayerId
            : candidates.find(
                (player) => player.id !== nextFirst,
              )?.id ?? ""
        : "";
    if (nextFirst !== firstPlayerId) setFirstPlayerId(nextFirst);
    if (nextSecond !== secondPlayerId) setSecondPlayerId(nextSecond);
  }, [
    candidates,
    firstPlayerId,
    roleId,
    secondPlayerId,
    spec.kind,
  ]);
  useEffect(() => {
    if (!selectableRoles.some((role) => role.id === roleChoiceId)) {
      setRoleChoiceId(selectableRoles[0]?.id ?? "");
    }
  }, [roleChoiceId, selectableRoles]);

  const getPlayerLabel = (playerId: string) => {
    const player = players.find((item) => item.id === playerId);
    return player ? formatSeat(player.seat) : "未知座位";
  };

  const submitChoice = async () => {
    const needsTarget = spec.kind !== "role" && spec.kind !== "text";
    const needsRole = spec.kind === "role" || spec.kind === "single-role";
    const playerIds = needsSecondPlayer
      ? [firstPlayerId, secondPlayerId]
      : needsTarget
        ? [firstPlayerId]
        : [];
    if (
      !available ||
      (needsTarget && !firstPlayerId) ||
      (spec.kind === "text" && !statement.trim()) ||
      (needsRole && !roleChoiceId) ||
      (needsSecondPlayer &&
        (!secondPlayerId || firstPlayerId === secondPlayerId)) ||
      sending
    ) return;
    const roleLabel = selectableRoles.find((role) => role.id === roleChoiceId)?.name ?? "未知角色";
    const summaryParts = spec.kind === "text" ? [statement.trim()] : [
      ...playerIds.map((playerId) =>
        roleId === "imp" && playerId === currentPlayerId
          ? `${getPlayerLabel(playerId)}（自杀）`
          : getPlayerLabel(playerId),
      ),
      ...(needsRole ? [roleLabel] : []),
    ];
    const summary = spec.summaryPrefix + "：" + summaryParts.join(" · ");
    const confirmation = spec.publicDeclaration
      ? `确认你已在公开讨论中宣布以下选择？\n\n${summary}`
      : `确认${summary}？`;
    if (!window.confirm(confirmation)) return;
    setSending(true);
    setSendError("");
    try {
      await onSend(buildPlayerSkillChoiceMessage({
        roleId,
        playerIds,
        roleIdChoice: needsRole ? roleChoiceId : undefined,
        statement: spec.kind === "text" ? statement.trim() : undefined,
        summary,
      }));
    } catch {
      setSendError("技能选择发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const unavailableText = !phaseAllowed
    ? spec.phase === "night" ? "请在夜晚阶段使用" : "请在白天阶段使用"
    : firstNightLocked
      ? "首夜不能使用这项能力"
      : deathLocked
        ? "仅在你得知自己死亡后使用"
        : hostTriggerLocked
          ? roleId === "godfather"
            ? "等待上帝确认今天有外来者死亡"
            : "等待上帝发送死亡通知"
          : oneUseLocked
            ? "本局能力已经使用"
            : "";

  return (
    <section className={("player-skill-action " + (available ? "" : "is-locked")).trim()}>
      <div className="player-skill-action-heading">
        <span className="player-skill-action-icon"><RoleIcon roleId={roleId} size={21} /></span>
        <div><strong>{spec.title}</strong><small>{spec.help}</small></div>
        {latestChoice ? <span className="player-skill-submitted">已提交</span> : null}
      </div>
      {available ? (
        <div className={("player-skill-targets " + (["role", "single", "text"].includes(spec.kind) ? "single" : "")).trim()}>
          {spec.kind === "text" ? (
            <textarea
              className="player-skill-statement"
              value={statement}
              maxLength={300}
              disabled={sending}
              placeholder="输入已公开发表的声明"
              aria-label="造谣者公开声明"
              onChange={(event) => setStatement(event.target.value)}
            />
          ) : spec.kind !== "role" ? <CompactSelect value={firstPlayerId} disabled={sending} ariaLabel={spec.title + "目标"} onValueChange={setFirstPlayerId}>
            {candidates.map((player) => (
              <option
                value={player.id}
                key={player.id}
                disabled={
                  needsSecondPlayer && player.id === secondPlayerId
                }
              >
                {formatSeat(player.seat)} · {player.name || "玩家"}
              </option>
            ))}
          </CompactSelect> : null}
          {needsSecondPlayer ? (
            <CompactSelect
              value={secondPlayerId}
              disabled={sending}
              ariaLabel={spec.title + "第二目标"}
              onValueChange={setSecondPlayerId}
            >
              {candidates.map((player) => (
                <option
                  value={player.id}
                  key={player.id}
                  disabled={
                    player.id === firstPlayerId
                  }
                >
                  {formatSeat(player.seat)} · {player.name || "玩家"}
                </option>
              ))}
            </CompactSelect>
          ) : null}
          {spec.kind === "role" || spec.kind === "single-role" ? (
            <CompactSelect value={roleChoiceId} disabled={sending} ariaLabel={spec.roleLabel ?? "选择角色"} onValueChange={setRoleChoiceId}>
              {selectableRoles.map((role) => <option value={role.id} key={role.id}>{role.name} · {role.team}</option>)}
            </CompactSelect>
          ) : null}
          <button className="primary-button" disabled={sending || (spec.kind !== "role" && spec.kind !== "text" && !firstPlayerId) || (spec.kind === "text" && !statement.trim()) || ((spec.kind === "role" || spec.kind === "single-role") && !roleChoiceId) || (needsSecondPlayer && (!secondPlayerId || firstPlayerId === secondPlayerId))} onClick={() => void submitChoice()}>
            <Send size={15} />{sending ? "提交中" : latestChoice ? "更新选择" : spec.submitLabel}
          </button>
        </div>
      ) : <p className="player-skill-locked-note">{unavailableText}</p>}
      {latestChoice ? <p className="player-skill-latest">{latestChoice.summary}</p> : null}
      {sendError ? <div className="inline-error">{sendError}</div> : null}
    </section>
  );
}

const teamClass = (team: Team) =>
  team === "镇民"
    ? "townsfolk"
    : team === "外来者"
      ? "outsider"
      : team === "爪牙"
        ? "minion"
        : "demon";
