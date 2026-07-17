import { useCallback, useEffect, useState } from "react";
import {
  Clock3,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { scripts } from "./data";
import {
  adminCloseRoom,
  getAdminRooms,
  type AdminRoom,
} from "./room";

const adminTokenStorageKey = "xueran-room-admin-token";

const getStageLabel = (room: AdminRoom) => {
  if (room.phase === "夜晚" && room.round <= 1) return "首夜";
  return room.phase === "白天"
    ? `第${room.round}天`
    : `第${Math.max(1, room.round - 1)}晚`;
};

const getScriptName = (scriptId: string) =>
  scripts.find((script) => script.id === scriptId)?.name ?? "自定义剧本";

const formatTime = (value: string) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const leaveAdmin = () => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  window.location.href = url.toString();
};

export function AdminRooms() {
  const [tokenDraft, setTokenDraft] = useState(
    () => sessionStorage.getItem(adminTokenStorageKey) ?? "",
  );
  const [activeToken, setActiveToken] = useState(
    () => sessionStorage.getItem(adminTokenStorageKey) ?? "",
  );
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [loading, setLoading] = useState(Boolean(activeToken));
  const [closingRoomId, setClosingRoomId] = useState("");
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);

  const loadRooms = useCallback(async (token: string, quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const nextRooms = await getAdminRooms(token);
      setRooms(nextRooms);
      setAuthorized(true);
      sessionStorage.setItem(adminTokenStorageKey, token);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setAuthorized(false);
      setRooms([]);
      setError(
        /invalid admin token/i.test(message)
          ? "管理密钥不正确"
          : /xueran_admin_list_rooms|schema cache|function/i.test(message)
            ? "管理后台数据库尚未配置"
            : "对局列表加载失败，请稍后重试",
      );
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeToken) return;
    void loadRooms(activeToken);
  }, [activeToken, loadRooms]);

  useEffect(() => {
    if (!authorized || !activeToken) return;
    const interval = window.setInterval(() => {
      void loadRooms(activeToken, true);
    }, 10000);
    return () => window.clearInterval(interval);
  }, [activeToken, authorized, loadRooms]);

  const unlock = () => {
    const token = tokenDraft.trim();
    if (!token) return;
    if (token === activeToken) {
      void loadRooms(token);
      return;
    }
    setActiveToken(token);
  };

  const closeManagedRoom = async (room: AdminRoom) => {
    if (
      !activeToken ||
      !window.confirm(
        `关闭房间 ${room.code}？\n\n主持人和玩家将在几秒内看到房间已结束。`,
      )
    ) {
      return;
    }
    setClosingRoomId(room.room_id);
    setError("");
    try {
      await adminCloseRoom(activeToken, room.room_id);
      await loadRooms(activeToken, true);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(
        /invalid admin token/i.test(message)
          ? "管理密钥已失效"
          : "关闭对局失败，请稍后重试",
      );
    } finally {
      setClosingRoomId("");
    }
  };

  const lockAdmin = () => {
    sessionStorage.removeItem(adminTokenStorageKey);
    setActiveToken("");
    setTokenDraft("");
    setRooms([]);
    setAuthorized(false);
    setError("");
  };

  if (!authorized) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-panel">
          <span className="admin-login-icon"><KeyRound size={24} /></span>
          <p className="eyebrow">ROOM ADMIN</p>
          <h1>对局管理</h1>
          <label>
            <span>管理密钥</span>
            <input
              type="password"
              value={tokenDraft}
              autoComplete="off"
              disabled={loading}
              onChange={(event) => setTokenDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") unlock();
              }}
              aria-label="管理密钥"
            />
          </label>
          <button className="primary-button" disabled={!tokenDraft.trim() || loading} onClick={unlock}>
            {loading ? <RefreshCw className="spin" size={16} /> : <ShieldCheck size={16} />}
            {loading ? "验证中" : "进入后台"}
          </button>
          {error ? <div className="inline-error">{error}</div> : null}
          <button className="admin-back-button" onClick={leaveAdmin}>返回魔典</button>
        </section>
      </main>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">ROOM ADMIN</p>
          <h1>运行中的对局</h1>
        </div>
        <div className="admin-toolbar">
          <button className="icon-button" title="刷新" aria-label="刷新对局" disabled={loading} onClick={() => void loadRooms(activeToken)}>
            <RefreshCw className={loading ? "spin" : ""} size={16} />
          </button>
          <button className="icon-button" title="锁定后台" aria-label="锁定后台" onClick={lockAdmin}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="admin-content">
        <div className="admin-summary">
          <span><ShieldCheck size={16} />进行中</span>
          <strong>{rooms.length}</strong>
        </div>
        {error ? <div className="inline-error admin-error">{error}</div> : null}
        {rooms.length ? (
          <div className="admin-room-list">
            {rooms.map((room) => (
              <article className="admin-room-card" key={room.room_id}>
                <div className="admin-room-code">
                  <span>房间</span>
                  <strong>{room.code}</strong>
                </div>
                <div className="admin-room-main">
                  <div>
                    <strong>{getScriptName(room.script_id)}</strong>
                    <span>{getStageLabel(room)}</span>
                    {room.simulation_enabled ? <b>模拟</b> : null}
                  </div>
                  <div className="admin-room-meta">
                    <span><Users size={13} />{room.claimed_count}/{room.player_count} 入座</span>
                    <span><Clock3 size={13} />{formatTime(room.updated_at)}</span>
                  </div>
                </div>
                <button
                  className="admin-close-room"
                  disabled={closingRoomId === room.room_id}
                  onClick={() => void closeManagedRoom(room)}
                >
                  {closingRoomId === room.room_id ? <RefreshCw className="spin" size={15} /> : <XCircle size={15} />}
                  {closingRoomId === room.room_id ? "关闭中" : "关闭对局"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <ShieldCheck size={26} />
            <h2>暂无运行中的对局</h2>
          </div>
        )}
      </main>
    </div>
  );
}
