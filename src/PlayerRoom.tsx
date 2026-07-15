import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { getRole } from "./data";
import {
  findRoomByCode,
  getMyClaims,
  getMyIdentity,
  getRoomPlayers,
  requestPlayerClaim,
  type ClaimRequest,
  type PrivateIdentity,
  type PublicRoomPlayer,
  type SharedRoom,
} from "./room";
import { ensureAnonymousSession, supabase } from "./supabase";
import type { IdentityPayload } from "./types";

export function PlayerRoom({ roomCode }: { roomCode: string }) {
  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [players, setPlayers] = useState<PublicRoomPlayer[]>([]);
  const [claims, setClaims] = useState<ClaimRequest[]>([]);
  const [identity, setIdentity] = useState<PrivateIdentity | null>(null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (targetRoom: SharedRoom) => {
    if (targetRoom.status === "closed") return;
    const [latestRoom, nextPlayers, nextClaims, nextIdentity] = await Promise.all([
      findRoomByCode(targetRoom.code),
      getRoomPlayers(targetRoom.id),
      getMyClaims(targetRoom.id),
      getMyIdentity(targetRoom.id),
    ]);

    if (!latestRoom) throw new Error("房间已不存在");
    if (latestRoom.status === "closed") {
      setRoom(latestRoom);
      setPlayers([]);
      setClaims([]);
      setIdentity(null);
      return;
    }

    setPlayers(nextPlayers);
    setClaims(nextClaims);
    setIdentity(nextIdentity);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setLoading(true);
      setError("");
      try {
        const session = await ensureAnonymousSession();
        const foundRoom = await findRoomByCode(roomCode);
        if (!foundRoom) throw new Error("没有找到这个房间，请检查链接是否完整");
        if (cancelled) return;
        setUserId(session.user.id);
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
        { event: "*", schema: "public", table: "xueran_claim_requests", filter: `room_id=eq.${room.id}` },
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
      .subscribe();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh, room]);

  const currentClaim = useMemo(
    () =>
      claims.find((claim) => claim.status === "approved") ??
      claims.find((claim) => claim.status === "pending") ??
      claims[0],
    [claims],
  );

  const claimPlayer = async (player: PublicRoomPlayer) => {
    if (!room || !userId) return;
    setSubmittingId(player.id);
    setError("");
    try {
      await requestPlayerClaim(room.id, player, userId);
      await refresh(room);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "申请提交失败");
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
    return <ClaimedIdentity identity={payload} roomCode={room.code} />;
  }

  const pending = currentClaim?.status === "pending";
  const rejected = currentClaim?.status === "rejected" || currentClaim?.status === "revoked";
  const pendingPlayer = players.find((player) => player.id === currentClaim?.player_id);

  return (
    <main className="player-room-page">
      <header className="player-room-header">
        <div className="player-room-seal">血</div>
        <div>
          <p className="eyebrow">PLAYER ROOM · {room.code}</p>
          <h1>{room.title}</h1>
        </div>
      </header>

      {pending ? (
        <section className="claim-waiting">
          <Clock3 size={27} />
          <h2>等待主持人确认</h2>
          <p>
            你申请了
            <strong>
              {pendingPlayer?.name || `座位 ${pendingPlayer?.seat ?? "?"}`}
            </strong>
            。确认后，这台设备会自动收到身份。
          </p>
          <span>页面会自动刷新，请留在这里。</span>
        </section>
      ) : (
        <section className="seat-claim-panel">
          <div className="seat-claim-heading">
            <div>
              <p className="eyebrow">CLAIM YOUR SEAT</p>
              <h2>{rejected ? "请重新选择座位" : "你是哪位玩家？"}</h2>
            </div>
            <Users size={21} />
          </div>
          <p className="seat-claim-help">选择自己的姓名或座位，提交后由主持人确认。</p>
          <div className="seat-choice-list">
            {players.map((player) => (
              <button
                className="seat-choice"
                key={player.id}
                disabled={player.is_claimed || Boolean(submittingId)}
                onClick={() => void claimPlayer(player)}
              >
                <span className="seat-choice-number">
                  {String(player.seat).padStart(2, "0")}
                </span>
                <span className="seat-choice-name">
                  {player.name.trim() || `座位 ${player.seat}`}
                </span>
                <span className={player.is_claimed ? "seat-claimed" : "seat-available"}>
                  {player.is_claimed ? (
                    <>
                      <UserRoundCheck size={14} />
                      已认领
                    </>
                  ) : submittingId === player.id ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    "选择"
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {error ? <div className="inline-error">{error}</div> : null}
      <p className="player-room-privacy">
        <ShieldCheck size={14} />
        主持人确认后，本设备只能读取你自己的身份。
      </p>
    </main>
  );
}

function ClaimedIdentity({
  identity,
  roomCode,
}: {
  identity: IdentityPayload;
  roomCode: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const role = getRole(identity.roleId);

  return (
    <main className="identity-page">
      <section className={revealed ? "identity-envelope revealed" : "identity-envelope"}>
        <div className="identity-room-code">
          <CheckCircle2 size={14} />
          房间 {roomCode} · 已确认
        </div>
        <div className="identity-seal" aria-hidden="true">
          {revealed ? role.icon : "血"}
        </div>
        <p className="eyebrow">
          PRIVATE IDENTITY · 座位 {String(identity.seat).padStart(2, "0")}
        </p>
        <h1>{identity.playerName}的身份密函</h1>

        {revealed ? (
          <>
            <div className={`identity-role-card ${teamClass(role.team)}`}>
              <span className="identity-role-icon">{role.icon}</span>
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
              onClick={() => setRevealed(false)}
            >
              隐藏身份
            </button>
          </>
        ) : (
          <>
            <ShieldCheck size={27} className="identity-shield" />
            <p className="identity-intro">请确认周围没有其他玩家，然后独自揭示你的身份。</p>
            <button className="identity-reveal-button" onClick={() => setRevealed(true)}>
              查看我的身份
            </button>
          </>
        )}
      </section>
    </main>
  );
}

const teamClass = (team: string) =>
  team === "镇民"
    ? "townsfolk"
    : team === "外来者"
      ? "outsider"
      : team === "爪牙"
        ? "minion"
        : "demon";
