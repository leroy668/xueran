import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  LoaderCircle,
  MessageSquareText,
  MoonStar,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { getRole, roles, scripts } from "./data";
import {
  claimSeat,
  findRoomByCode,
  getMyIdentity,
  getMyNightMessages,
  getRoomPlayers,
  type NightMessage,
  type PrivateIdentity,
  type PublicRoomPlayer,
  type SharedRoom,
} from "./room";
import { RoleIcon } from "./RoleIcon";
import { ensureAnonymousSession, supabase } from "./supabase";
import type { IdentityPayload, Team } from "./types";

type PlayerView = "identity" | "script" | "messages";

const scriptTeams: Team[] = ["镇民", "外来者", "爪牙", "恶魔"];

export function PlayerRoom({ roomCode }: { roomCode: string }) {
  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [players, setPlayers] = useState<PublicRoomPlayer[]>([]);
  const [identity, setIdentity] = useState<PrivateIdentity | null>(null);
  const [nightMessages, setNightMessages] = useState<NightMessage[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (targetRoom: SharedRoom) => {
    if (targetRoom.status === "closed") return;
    const [latestRoom, nextPlayers, nextIdentity, nextNightMessages] = await Promise.all([
      findRoomByCode(targetRoom.code),
      getRoomPlayers(targetRoom.id),
      getMyIdentity(targetRoom.id),
      getMyNightMessages(targetRoom.id),
    ]);

    if (!latestRoom) throw new Error("房间已不存在");
    if (latestRoom.status === "closed") {
      setRoom(latestRoom);
      setPlayers([]);
      setIdentity(null);
      setNightMessages([]);
      return;
    }

    setPlayers(nextPlayers);
    setIdentity(nextIdentity);
    setNightMessages(nextNightMessages);
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
    const payload: IdentityPayload = {
      version: 1,
      playerName: player?.name.trim() || `座位 ${player?.seat ?? "?"}`,
      seat: player?.seat ?? 0,
      roleId: identity.role_id,
      message: identity.identity_message,
    };
    return (
      <ClaimedIdentity
        key={`${payload.seat}-${payload.roleId}`}
        identity={payload}
        roomCode={room.code}
        scriptId={room.script_id}
        nightMessages={nightMessages}
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
  nightMessages,
}: {
  identity: IdentityPayload;
  roomCode: string;
  scriptId: string;
  nightMessages: NightMessage[];
}) {
  const [revealed, setRevealed] = useState(false);
  const identitySeenKey = `xueran-identity-seen-${roomCode}-${identity.seat}-${identity.roleId}`;
  const messageReadKey = `xueran-message-read-${roomCode}-${identity.seat}`;
  const [identitySeen, setIdentitySeen] = useState(
    () => localStorage.getItem(identitySeenKey) === "true",
  );
  const [activeView, setActiveView] = useState<PlayerView>("identity");
  const [lastReadAt, setLastReadAt] = useState(
    () => localStorage.getItem(messageReadKey) ?? "",
  );
  const role = getRole(identity.roleId);
  const script = scripts.find((item) => item.id === scriptId) ?? scripts[0];
  const lastReadTime = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  const unreadCount = nightMessages.filter(
    (message) => new Date(message.created_at).getTime() > lastReadTime,
  ).length;

  useEffect(() => {
    if (activeView !== "messages" || !nightMessages[0]) return;
    const latestMessageAt = nightMessages[0].created_at;
    localStorage.setItem(messageReadKey, latestMessageAt);
    setLastReadAt(latestMessageAt);
  }, [activeView, messageReadKey, nightMessages]);

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
        <nav className="player-hub-nav" aria-label="玩家页面导航">
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
              const teamRoles = roles.filter((item) => item.team === team);
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
        <PlayerMessages identityMessage={identity.message} messages={nightMessages} />
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
            {identity.message ? (
              <div className="identity-message-panel">
                <span>主持人私信</span>
                <p>{identity.message}</p>
              </div>
            ) : null}
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
  identityMessage,
  messages,
}: {
  identityMessage: string;
  messages: NightMessage[];
}) {
  return (
    <section className="player-view-panel player-message-view">
      <div className="player-view-heading">
        <div>
          <p className="eyebrow">STORYTELLER MESSAGES</p>
          <h2>上帝消息</h2>
        </div>
        <MessageSquareText size={22} />
      </div>

      {identityMessage ? (
        <div className="player-pinned-message">
          <span>身份附言</span>
          <p>{identityMessage}</p>
        </div>
      ) : null}

      {messages.length ? (
        <div className="player-message-timeline">
          {messages.map((message, index) => {
            const messageRole = getRole(message.role_id);
            return (
              <article
                className={index === 0 ? "player-message-item latest" : "player-message-item"}
                key={message.id}
              >
                <div className="player-message-meta">
                  <span>第 {message.round} 回合 · {messageRole.name}</span>
                  <time>
                    {new Date(message.created_at).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p>{message.body}</p>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="player-message-empty">
          <MessageSquareText size={25} />
          <h3>暂无上帝消息</h3>
          <p>主持人发送的新信息会自动出现在这里。</p>
        </div>
      )}
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
