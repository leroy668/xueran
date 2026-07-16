import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Eye,
  LoaderCircle,
  MessageSquareText,
  MoonStar,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  Skull,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { getRole, getScriptRoles, scripts } from "./data";
import { DemonBluffMessage } from "./DemonBluffMessage";
import { parseDemonBluffMessage } from "./demonBluffs";
import {
  claimSeat,
  findRoomByCode,
  getMyEvilMessages,
  getMyIdentity,
  getMyNightMessages,
  getMyPlayerMessages,
  getRoomPlayers,
  sendEvilMessage,
  sendPlayerMessage,
  type EvilMessage,
  type NightMessage,
  type PlayerMessage,
  type PrivateIdentity,
  type PublicRoomPlayer,
  type SharedRoom,
} from "./room";
import { RoleIcon } from "./RoleIcon";
import { ensureAnonymousSession, supabase } from "./supabase";
import type { IdentityPayload, Phase, Team } from "./types";

type PlayerView = "identity" | "script" | "messages" | "evil";

const scriptTeams: Team[] = ["镇民", "外来者", "爪牙", "恶魔"];

export function PlayerRoom({ roomCode }: { roomCode: string }) {
  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [players, setPlayers] = useState<PublicRoomPlayer[]>([]);
  const [identity, setIdentity] = useState<PrivateIdentity | null>(null);
  const [nightMessages, setNightMessages] = useState<NightMessage[]>([]);
  const [playerMessages, setPlayerMessages] = useState<PlayerMessage[]>([]);
  const [evilMessages, setEvilMessages] = useState<EvilMessage[]>([]);
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
      nextEvilMessages,
    ] = await Promise.all([
      findRoomByCode(targetRoom.code),
      getRoomPlayers(targetRoom.id),
      getMyIdentity(targetRoom.id),
      getMyNightMessages(targetRoom.id),
      getMyPlayerMessages(targetRoom.id),
      getMyEvilMessages(targetRoom.id),
    ]);

    if (!latestRoom) throw new Error("房间已不存在");
    if (latestRoom.status === "closed") {
      setRoom(latestRoom);
      setPlayers([]);
      setIdentity(null);
      setNightMessages([]);
      setPlayerMessages([]);
      setEvilMessages([]);
      return;
    }

    setRoom(latestRoom);
    setPlayers(nextPlayers);
    setIdentity(nextIdentity);
    setNightMessages(nextNightMessages);
    setPlayerMessages(nextPlayerMessages);
    setEvilMessages(nextEvilMessages);
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
        { event: "INSERT", schema: "public", table: "xueran_evil_messages", filter: `room_id=eq.${room.id}` },
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

  const sendMessageToEvilTeam = async (body: string) => {
    if (!room) throw new Error("房间尚未加载");
    const message = await sendEvilMessage({ roomId: room.id, body });
    setEvilMessages((current) => [
      message,
      ...current.filter((item) => item.id !== message.id),
    ]);
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
    const displayedRoleId =
      identity.role_id === "drunk" || identity.role_id === "marionette"
        ? identity.drunk_role_id || "washerwoman"
        : identity.role_id;
    const payload: IdentityPayload = {
      version: 1,
      playerName: player?.name.trim() || `座位 ${player?.seat ?? "?"}`,
      seat: player?.seat ?? 0,
      roleId: displayedRoleId,
      message: identity.identity_message,
    };
    return (
      <ClaimedIdentity
        key={`${payload.seat}-${payload.roleId}`}
        identity={payload}
        roomCode={room.code}
        scriptId={room.script_id}
        roomPhase={room.phase}
        playerId={identity.player_id}
        players={players}
        nightMessages={nightMessages}
        playerMessages={playerMessages}
        evilMessages={evilMessages}
        onSendPlayerMessage={sendMessageToHost}
        onSendEvilMessage={sendMessageToEvilTeam}
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
                {String(player.seat).padStart(2, "0")}
              </span>
              <span className="seat-choice-name">座位 {player.seat}</span>
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
  roomCode,
  scriptId,
  roomPhase,
  playerId,
  players,
  nightMessages,
  playerMessages,
  evilMessages,
  onSendPlayerMessage,
  onSendEvilMessage,
}: {
  identity: IdentityPayload;
  roomCode: string;
  scriptId: string;
  roomPhase: Phase;
  playerId: string;
  players: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  evilMessages: EvilMessage[];
  onSendPlayerMessage: (body: string) => Promise<void>;
  onSendEvilMessage: (body: string) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(false);
  const identitySeenKey = `xueran-identity-seen-${roomCode}-${identity.seat}-${identity.roleId}`;
  const messageReadKey = `xueran-message-read-${roomCode}-${identity.seat}`;
  const evilMessageReadKey = `xueran-evil-message-read-${roomCode}-${identity.seat}`;
  const [identitySeen, setIdentitySeen] = useState(
    () => localStorage.getItem(identitySeenKey) === "true",
  );
  const [activeView, setActiveView] = useState<PlayerView>("identity");
  const [lastReadAt, setLastReadAt] = useState(
    () => localStorage.getItem(messageReadKey) ?? "",
  );
  const [lastEvilReadAt, setLastEvilReadAt] = useState(
    () => localStorage.getItem(evilMessageReadKey) ?? "",
  );
  const role = getRole(identity.roleId);
  const script = scripts.find((item) => item.id === scriptId) ?? scripts[0];
  const scriptRoles = getScriptRoles(scriptId);
  const evilChatAvailable =
    roomPhase !== "准备" && (role.team === "爪牙" || role.team === "恶魔");
  const lastReadTime = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  const unreadCount = nightMessages.filter(
    (message) => new Date(message.created_at).getTime() > lastReadTime,
  ).length;
  const lastEvilReadTime = lastEvilReadAt
    ? new Date(lastEvilReadAt).getTime()
    : 0;
  const unreadEvilCount = evilMessages.filter(
    (message) =>
      message.sender_player_id !== playerId &&
      new Date(message.created_at).getTime() > lastEvilReadTime,
  ).length;

  useEffect(() => {
    if (activeView !== "messages" || !nightMessages[0]) return;
    const latestMessageAt = nightMessages[0].created_at;
    localStorage.setItem(messageReadKey, latestMessageAt);
    setLastReadAt(latestMessageAt);
  }, [activeView, messageReadKey, nightMessages]);

  useEffect(() => {
    if (activeView !== "evil" || !evilMessages[0]) return;
    const latestMessageAt = evilMessages[0].created_at;
    localStorage.setItem(evilMessageReadKey, latestMessageAt);
    setLastEvilReadAt(latestMessageAt);
  }, [activeView, evilMessageReadKey, evilMessages]);

  useEffect(() => {
    if (!evilChatAvailable && activeView === "evil") {
      setActiveView("identity");
    }
  }, [activeView, evilChatAvailable]);

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
          <span>座位 {String(identity.seat).padStart(2, "0")}</span>
        </header>
      ) : null}

      {identitySeen ? (
        <nav
          className={
            evilChatAvailable
              ? "player-hub-nav with-evil-chat"
              : "player-hub-nav"
          }
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
          {evilChatAvailable ? (
            <button
              className={activeView === "evil" ? "active" : ""}
              onClick={() => setActiveView("evil")}
            >
              <Skull size={18} />
              <span>邪恶群聊</span>
              {unreadEvilCount ? (
                <strong>{Math.min(unreadEvilCount, 99)}</strong>
              ) : null}
            </button>
          ) : null}
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
                      <article className="player-script-role" key={item.id}>
                        <span className="player-script-role-icon">
                          <RoleIcon roleId={item.id} size={22} />
                        </span>
                        <div>
                          <strong>{item.name}</strong>
                          <p>{item.short}</p>
                        </div>
                      </article>
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
          hostMessages={nightMessages}
          playerMessages={playerMessages}
          onSend={onSendPlayerMessage}
        />
      ) : null}

      {activeView === "evil" && evilChatAvailable ? (
        <EvilTeamMessages
          currentPlayerId={playerId}
          players={players}
          messages={evilMessages}
          onSend={onSendEvilMessage}
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
          PRIVATE IDENTITY · 座位 {String(identity.seat).padStart(2, "0")}
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
  hostMessages,
  playerMessages,
  onSend,
}: {
  hostMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  onSend: (body: string) => Promise<void>;
}) {
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const timeline = [
    ...hostMessages.map((message) => ({
      ...message,
      direction: "incoming" as const,
      label: `上帝 · 第 ${message.round} 回合`,
    })),
    ...playerMessages.map((message) => ({
      ...message,
      direction: "outgoing" as const,
      label: `我 · 第 ${message.round} 回合`,
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
                  <p>{message.body}</p>
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

function EvilTeamMessages({
  currentPlayerId,
  players,
  messages,
  onSend,
}: {
  currentPlayerId: string;
  players: PublicRoomPlayer[];
  messages: EvilMessage[];
  onSend: (body: string) => Promise<void>;
}) {
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const playersById = new Map(players.map((player) => [player.id, player]));
  const timeline = messages
    .map((message) => {
      const sender = message.sender_player_id
        ? playersById.get(message.sender_player_id)
        : null;
      const isMine = message.sender_player_id === currentPlayerId;
      return {
        ...message,
        direction: isMine ? ("outgoing" as const) : ("incoming" as const),
        label:
          message.sender_kind === "host"
            ? `上帝 · 第 ${message.round} 回合`
            : `${isMine ? "我" : sender?.name || `座位 ${sender?.seat ?? "?"}`} · 第 ${message.round} 回合`,
        avatar:
          message.sender_kind === "host"
            ? "上"
            : isMine
              ? "我"
              : String(sender?.seat ?? "?").padStart(2, "0"),
        demonBluffRoleIds:
          message.sender_kind === "host"
            ? parseDemonBluffMessage(message.body)
            : null,
      };
    })
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() -
        new Date(right.created_at).getTime(),
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
        /game has not started/i.test(message)
          ? "游戏尚未正式开始"
          : /evil player access/i.test(message)
            ? "当前身份无权发送群聊消息"
            : /function|evil_messages|schema cache/i.test(message)
              ? "邪恶群聊数据库尚未配置"
              : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="player-view-panel player-message-view evil-team-view">
      <div className="player-view-heading">
        <div>
          <p className="eyebrow">EVIL TEAM CHAT</p>
          <h2>邪恶阵营群聊</h2>
        </div>
        <Skull size={22} />
      </div>

      {timeline.length ? (
        <div className="player-message-timeline" ref={timelineRef}>
          {timeline.map((message) => (
            <article
              className={`player-message-item ${message.direction}`}
              key={message.id}
            >
              <span className="player-message-avatar" aria-hidden="true">
                {message.avatar}
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
          <Skull size={25} />
          <h3>群聊已开启</h3>
          <p>爪牙、恶魔和上帝可以在这里商量战术。</p>
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
            placeholder="发送到邪恶阵营群聊"
            aria-label="发送到邪恶阵营群聊"
            maxLength={500}
            rows={1}
            disabled={sending}
          />
          <button
            className="primary-button"
            aria-label="发送群聊消息"
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

const teamClass = (team: Team) =>
  team === "镇民"
    ? "townsfolk"
    : team === "外来者"
      ? "outsider"
      : team === "爪牙"
        ? "minion"
        : "demon";
