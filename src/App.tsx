import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MoonStar,
  NotebookPen,
  Plus,
  RotateCcw,
  ScrollText,
  Send,
  Share2,
  ShieldCheck,
  Skull,
  Sparkles,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { getNightRoles, getRole, roles, scripts } from "./data";
import { HostRoomPanel } from "./HostRoomPanel";
import { PlayerRoom } from "./PlayerRoom";
import {
  activeRoomStorageKey,
  buildRoomUrl,
  closeRoom,
  createRoom,
  findRoomByCode,
  getRoomPlayers,
  loadHostRoom,
  revokeClaim,
  syncRoom,
  type PublicRoomPlayer,
  type SharedRoom,
} from "./room";
import {
  buildIdentityUrl,
  buildShareUrl,
  defaultState,
  getSharedIdentity,
  getSharedState,
  loadState,
} from "./storage";
import { ensureAnonymousSession, supabase } from "./supabase";
import type { GameState, IdentityPayload, Phase, Player, TabId, Team } from "./types";

const tabs: { id: TabId; label: string; icon: typeof BookOpen }[] = [
  { id: "grimoire", label: "魔典", icon: BookOpen },
  { id: "night", label: "夜晚顺序", icon: MoonStar },
  { id: "script", label: "剧本角色", icon: ScrollText },
];

const teamLabels: Record<Team, string> = {
  镇民: "townsfolk",
  外来者: "outsider",
  爪牙: "minion",
  恶魔: "demon",
};

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const sampleRoles = [
  "washerwoman",
  "empath",
  "fortune-teller",
  "monk",
  "ravenkeeper",
  "butler",
  "imp",
];

const newPlayer = (seat: number, name = ""): Player => ({
  id: makeId(),
  seat,
  name,
  roleId: "washerwoman",
  alive: true,
  identityMessage: "",
  notes: "",
});

function App() {
  const [identity] = useState(() => getSharedIdentity());
  const roomCode = new URLSearchParams(window.location.search).get("room");
  return identity ? (
    <IdentityReveal identity={identity} />
  ) : roomCode ? (
    <PlayerRoom roomCode={roomCode} />
  ) : (
    <GrimoireApp />
  );
}

function GrimoireApp() {
  const shared = getSharedState();
  const [state, setState] = useState<GameState>(() => {
    const saved = loadState();
    return shared
      ? { ...saved, ...shared, updatedAt: new Date().toISOString() }
      : saved;
  });
  const [activeTab, setActiveTab] = useState<TabId>("grimoire");
  const [toast, setToast] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<PublicRoomPlayer[]>([]);
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "error"
  >("idle");

  useEffect(() => {
    localStorage.setItem("xueran-grimoire-v1", JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refreshRoomAdmin = useCallback(async (targetRoom: SharedRoom) => {
    const players = await getRoomPlayers(targetRoom.id);
    setRoomPlayers(players);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restoreRoom = async () => {
      const code = localStorage.getItem(activeRoomStorageKey);
      if (!code) return;
      try {
        const session = await ensureAnonymousSession();
        const savedRoom = await findRoomByCode(code);
        if (!savedRoom || savedRoom.status !== "open") {
          localStorage.removeItem(activeRoomStorageKey);
          return;
        }
        const cloudState = await loadHostRoom(savedRoom, session.user);
        if (cancelled) return;
        setState(cloudState);
        setRoom(savedRoom);
        setRoomReady(true);
        setSyncStatus("synced");
        await refreshRoomAdmin(savedRoom);
      } catch {
        localStorage.removeItem(activeRoomStorageKey);
      }
    };
    void restoreRoom();
    return () => {
      cancelled = true;
    };
  }, [refreshRoomAdmin]);

  useEffect(() => {
    if (!room || !roomReady) return;
    setSyncStatus("syncing");
    const timer = window.setTimeout(() => {
      void syncRoom(room.id, state)
        .then(() => {
          setSyncStatus("synced");
          return refreshRoomAdmin(room);
        })
        .catch(() => setSyncStatus("error"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [refreshRoomAdmin, room, roomReady, state]);

  useEffect(() => {
    if (!room) return;
    const interval = window.setInterval(() => {
      void refreshRoomAdmin(room).catch(() => undefined);
    }, 3500);
    const channel = supabase
      .channel(`xueran-host-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xueran_claim_requests",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xueran_players",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refreshRoomAdmin, room]);

  const nightRoles = useMemo(() => getNightRoles(state.players), [state.players]);
  const currentNightRole = nightRoles[state.nightIndex] ?? nightRoles[0];
  const aliveCount = state.players.filter((player) => player.alive).length;
  const selectedRole = currentNightRole ? getRole(currentNightRole.id) : null;
  const script = scripts.find((item) => item.id === state.scriptId) ?? scripts[0];

  const update = (patch: Partial<GameState>) => {
    setState((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  };

  const updatePlayer = (id: string, patch: Partial<Player>) => {
    setState((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === id ? { ...player, ...patch } : player,
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addPlayer = () => {
    setState((current) => ({
      ...current,
      players: [...current.players, newPlayer(current.players.length + 1)],
      updatedAt: new Date().toISOString(),
    }));
  };

  const removePlayer = (id: string) => {
    setState((current) => ({
      ...current,
      players: current.players
        .filter((player) => player.id !== id)
        .map((player, index) => ({ ...player, seat: index + 1 })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const quickStart = () => {
    const players = sampleRoles.map((roleId, index) => ({
      ...newPlayer(index + 1),
      roleId,
    }));
    update({ players, phase: "准备", round: 1, nightIndex: 0 });
    setToast("已载入 7 人示例局");
  };

  const resetGame = () => {
    if (!window.confirm("清空当前魔典？玩家、角色和备注都会被删除。")) return;
    setState(defaultState());
    setToast("魔典已清空");
  };

  const shareGame = async () => {
    const url = buildShareUrl(state);
    try {
      await navigator.clipboard.writeText(url);
      setToast("分享链接已复制");
    } catch {
      window.prompt("复制这个分享链接", url);
    }
  };

  const shareIdentity = async (player: Player) => {
    const url = buildIdentityUrl(player);
    const playerLabel = player.name.trim() || `座位 ${player.seat}`;
    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(url);
        setToast(`${playerLabel}的身份链接已复制`);
      } catch {
        window.prompt(`复制${playerLabel}的身份链接`, url);
      }
    };

    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title: `${playerLabel}的身份密函`,
        text: `请查收你在《血染钟楼》中的身份：`,
        url,
      });
      setToast(`${playerLabel}的身份链接已分享`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyLink();
    }
  };

  const startSharedRoom = async () => {
    setRoomBusy(true);
    try {
      await ensureAnonymousSession();
      const nextRoom = await createRoom(state);
      localStorage.setItem(activeRoomStorageKey, nextRoom.code);
      setRoom(nextRoom);
      setRoomReady(true);
      setSyncStatus("synced");
      await refreshRoomAdmin(nextRoom);
      setToast("共享房间已创建，所有玩家可扫描同一个二维码");
    } catch (reason) {
      setToast(
        reason instanceof Error && /anonymous/i.test(reason.message)
          ? "请先在 Supabase 中启用匿名登录"
          : "房间创建失败，请检查 Supabase 配置",
      );
    } finally {
      setRoomBusy(false);
    }
  };

  const shareRoom = async () => {
    if (!room) return;
    const url = buildRoomUrl(room.code);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `血染钟楼房间 ${room.code}`,
          text: "打开链接，填写你的名字并选择现场座位号。",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast("统一房间链接已复制");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setToast("统一房间链接已复制");
      } catch {
        window.prompt("复制统一房间链接", url);
      }
    }
  };

  const handleRevokeClaim = async (playerId: string) => {
    if (!room) return;
    try {
      await revokeClaim(playerId);
      await refreshRoomAdmin(room);
      setToast("已撤销该设备的身份访问");
    } catch {
      setToast("撤销失败，请稍后重试");
    }
  };

  const endSharedRoom = async () => {
    if (!room || !window.confirm("结束共享房间？所有玩家将无法继续查看身份。")) return;
    try {
      await closeRoom(room.id);
      localStorage.removeItem(activeRoomStorageKey);
      setRoom(null);
      setRoomReady(false);
      setRoomPlayers([]);
      setSyncStatus("idle");
      setToast("共享房间已结束，本地魔典仍然保留");
    } catch {
      setToast("结束房间失败，请稍后重试");
    }
  };

  const changeNight = (offset: number) => {
    if (!nightRoles.length) return;
    update({
      nightIndex:
        (state.nightIndex + offset + nightRoles.length) % nightRoles.length,
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-seal" aria-hidden="true">
            <span>血</span>
          </div>
          <div>
            <p className="eyebrow">STORYTELLER'S TOOL</p>
            <h1>血染钟楼 · 上帝魔典</h1>
          </div>
        </div>
        <div className="top-actions">
          <span className={room ? "local-badge cloud-badge" : "local-badge"}>
            <span className="status-dot" />
            {room ? `房间 ${room.code}` : "本地模式"}
          </span>
          <button className="icon-button with-label" onClick={shareGame} aria-label="分享剧本" title="分享剧本">
            <Share2 size={16} />
            <span className="share-label">分享剧本</span>
          </button>
          <button className="icon-button danger-button" onClick={resetGame} title="清空当前魔典">
            <RotateCcw size={16} />
            <span className="desktop-only">重置</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="hero-strip">
          <div>
            <p className="eyebrow">今晚的剧本</p>
            <h2>{script.name}</h2>
            <p>
              {script.description}{" "}
              {room ? "身份已安全同步到共享房间。" : "所有信息只保存在这台设备的浏览器里。"}
            </p>
          </div>
          <div className="hero-marks" aria-hidden="true">
            <span>✦</span>
            <span>☾</span>
            <span>✦</span>
          </div>
        </section>

        <nav className="tab-bar" aria-label="魔典导航">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                className={activeTab === tab.id ? "tab active" : "tab"}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={17} />
                {tab.label}
                {tab.id === "night" && nightRoles.length > 0 ? (
                  <span className="tab-count">{nightRoles.length}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {activeTab === "grimoire" ? (
          <GrimoirePanel
            state={state}
            aliveCount={aliveCount}
            onUpdate={update}
            onUpdatePlayer={updatePlayer}
            onRemovePlayer={removePlayer}
            onAddPlayer={addPlayer}
            onQuickStart={quickStart}
            onShareIdentity={shareIdentity}
            roomPanel={
              <HostRoomPanel
                room={room}
                roomUrl={room ? buildRoomUrl(room.code) : ""}
                players={roomPlayers}
                busy={roomBusy}
                syncStatus={syncStatus}
                onCreate={() => void startSharedRoom()}
                onCopy={() => void shareRoom()}
                onRevoke={(playerId) => void handleRevokeClaim(playerId)}
                onClose={() => void endSharedRoom()}
              />
            }
          />
        ) : null}

        {activeTab === "night" ? (
          <NightPanel
            state={state}
            nightRoles={nightRoles}
            currentRole={selectedRole}
            onChangeNight={changeNight}
            onSelectNight={(index) => update({ nightIndex: index })}
          />
        ) : null}

        {activeTab === "script" ? (
          <ScriptPanel
            scriptId={state.scriptId}
            roleFilter={roleFilter}
            onSelectScript={(scriptId) => update({ scriptId })}
            onFilter={setRoleFilter}
          />
        ) : null}
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              className={activeTab === tab.id ? "mobile-nav-item active" : "mobile-nav-item"}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={19} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function GrimoirePanel({
  state,
  aliveCount,
  onUpdate,
  onUpdatePlayer,
  onRemovePlayer,
  onAddPlayer,
  onQuickStart,
  onShareIdentity,
  roomPanel,
}: {
  state: GameState;
  aliveCount: number;
  onUpdate: (patch: Partial<GameState>) => void;
  onUpdatePlayer: (id: string, patch: Partial<Player>) => void;
  onRemovePlayer: (id: string) => void;
  onAddPlayer: () => void;
  onQuickStart: () => void;
  onShareIdentity: (player: Player) => void;
  roomPanel: ReactNode;
}) {
  return (
    <div className="dashboard-grid">
      <aside className="side-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">SESSION</p>
            <h2>局面总览</h2>
          </div>
          <Sparkles size={19} className="muted-icon" />
        </div>
        <div className="stat-grid">
          <div className="stat-cell">
            <span>玩家</span>
            <strong>{state.players.length}</strong>
          </div>
          <div className="stat-cell">
            <span>存活</span>
            <strong>{aliveCount}</strong>
          </div>
          <div className="stat-cell">
            <span>回合</span>
            <strong>{state.round}</strong>
          </div>
        </div>
        <div className="phase-control">
          <div className="section-label">当前阶段</div>
          <div className="segmented-control">
            {(["准备", "白天", "夜晚"] as Phase[]).map((phase) => (
              <button
                className={state.phase === phase ? "selected" : ""}
                key={phase}
                onClick={() => onUpdate({ phase })}
              >
                {phase === "白天" ? <Sun size={14} /> : phase === "夜晚" ? <MoonStar size={14} /> : <Sparkles size={14} />}
                {phase}
              </button>
            ))}
          </div>
          <div className="round-stepper">
            <span>第 {state.round} 回合</span>
            <div>
              <button aria-label="减少回合" onClick={() => onUpdate({ round: Math.max(1, state.round - 1) })}>−</button>
              <button aria-label="增加回合" onClick={() => onUpdate({ round: state.round + 1 })}>＋</button>
            </div>
          </div>
        </div>
        {roomPanel}
        <label className="notes-field">
          <span><NotebookPen size={15} /> 主持人备注</span>
          <textarea
            value={state.storytellerNotes}
            onChange={(event) => onUpdate({ storytellerNotes: event.target.value })}
            placeholder="记下公开信息、玩家发言或下一步计划…"
            rows={7}
          />
        </label>
        <div className="privacy-note">
          <span className="status-dot" />
          自动保存在本机浏览器
        </div>
      </aside>

      <section className="main-panel">
        <div className="panel-heading players-heading">
          <div>
            <p className="eyebrow">GRIMOIRE</p>
            <h2>玩家座位</h2>
          </div>
          <div className="heading-actions">
            {state.players.length === 0 ? (
              <button className="secondary-button" onClick={onQuickStart}>
                <Sparkles size={15} />
                载入示例局
              </button>
            ) : null}
            <button className="primary-button" onClick={onAddPlayer}>
              <Plus size={16} />
              添加玩家
            </button>
          </div>
        </div>
        {state.players.length === 0 ? (
          <div className="empty-state">
            <div className="empty-glyph"><Users size={30} /></div>
            <h3>魔典还没有玩家</h3>
            <p>先添加今晚的座位，或载入一局 7 人示例开始熟悉操作。</p>
            <div className="empty-actions">
              <button className="primary-button" onClick={onAddPlayer}><Plus size={16} />添加第一个玩家</button>
              <button className="secondary-button" onClick={onQuickStart}><Sparkles size={15} />载入示例局</button>
            </div>
          </div>
        ) : (
          <div className="player-grid">
            {state.players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                onUpdate={onUpdatePlayer}
                onRemove={onRemovePlayer}
                onShare={onShareIdentity}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PlayerCard({
  player,
  onUpdate,
  onRemove,
  onShare,
}: {
  player: Player;
  onUpdate: (id: string, patch: Partial<Player>) => void;
  onRemove: (id: string) => void;
  onShare: (player: Player) => void;
}) {
  const role = getRole(player.roleId);
  const roleOptions = roles.filter((item) => item.name.toLowerCase().includes(""));
  return (
    <article className={player.alive ? "player-card" : "player-card dead"}>
      <div className="card-topline">
        <span className="seat-number">{String(player.seat).padStart(2, "0")}</span>
        <button
          className={player.alive ? "life-toggle alive" : "life-toggle"}
          onClick={() => onUpdate(player.id, { alive: !player.alive })}
          title={player.alive ? "标记为死亡" : "标记为存活"}
        >
          {player.alive ? <Check size={13} /> : <Skull size={13} />}
          {player.alive ? "存活" : "死亡"}
        </button>
        <button className="card-delete" onClick={() => onRemove(player.id)} title="移除玩家">
          <Trash2 size={15} />
        </button>
      </div>
      <div className="player-seat-label">座位 {String(player.seat).padStart(2, "0")}</div>
      <div className={`role-chip ${teamLabels[role.team]}`}>
        <span>{role.icon}</span>
        <select
          value={player.roleId}
          onChange={(event) => onUpdate(player.id, { roleId: event.target.value })}
          aria-label={`座位 ${player.seat} 角色`}
        >
          {roleOptions.map((option) => (
            <option value={option.id} key={option.id}>
              {option.name} · {option.team}
            </option>
          ))}
        </select>
      </div>
      <p className="role-summary">{role.short}</p>
      <textarea
        className="identity-message"
        value={player.identityMessage}
        onChange={(event) => onUpdate(player.id, { identityMessage: event.target.value })}
        placeholder="发给这位玩家的身份信息（可选）…"
        rows={2}
      />
      <textarea
        className="player-notes"
        value={player.notes}
        onChange={(event) => onUpdate(player.id, { notes: event.target.value })}
        placeholder="仅主持人可见的私密备注…"
        rows={2}
      />
      <button className="identity-share-button" onClick={() => onShare(player)}>
        <Send size={14} />
        分享身份
      </button>
    </article>
  );
}

function IdentityReveal({ identity }: { identity: IdentityPayload }) {
  const [revealed, setRevealed] = useState(false);
  const role = getRole(identity.roleId);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${identity.playerName}的身份密函`;
    return () => {
      document.title = previousTitle;
    };
  }, [identity.playerName]);

  return (
    <main className="identity-page">
      <section className={revealed ? "identity-envelope revealed" : "identity-envelope"}>
        <div className="identity-seal" aria-hidden="true">
          {revealed ? role.icon : "血"}
        </div>
        <p className="eyebrow">PRIVATE IDENTITY · 座位 {String(identity.seat).padStart(2, "0")}</p>
        <h1>{identity.playerName}的身份密函</h1>

        {revealed ? (
          <>
            <div className={`identity-role-card ${teamLabels[role.team]}`}>
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
            <button className="identity-reveal-button secondary" onClick={() => setRevealed(false)}>
              <EyeOff size={17} />
              隐藏身份
            </button>
          </>
        ) : (
          <>
            <ShieldCheck size={27} className="identity-shield" />
            <p className="identity-intro">请确认周围没有其他玩家，然后独自揭示你的身份。</p>
            <button className="identity-reveal-button" onClick={() => setRevealed(true)}>
              <Eye size={18} />
              查看我的身份
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function NightPanel({
  state,
  nightRoles,
  currentRole,
  onChangeNight,
  onSelectNight,
}: {
  state: GameState;
  nightRoles: ReturnType<typeof getNightRoles>;
  currentRole: ReturnType<typeof getRole> | null;
  onChangeNight: (offset: number) => void;
  onSelectNight: (index: number) => void;
}) {
  return (
    <div className="night-layout">
      <section className="night-main">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">NIGHT ORDER · 第 {state.round} 回合</p>
            <h2>夜晚行动台</h2>
          </div>
          <div className="night-nav">
            <button className="icon-button" onClick={() => onChangeNight(-1)} disabled={!nightRoles.length} title="上一个行动"><ChevronLeft size={17} /></button>
            <button className="icon-button" onClick={() => onChangeNight(1)} disabled={!nightRoles.length} title="下一个行动"><ChevronRight size={17} /></button>
          </div>
        </div>
        {currentRole ? (
          <div className={`current-action ${teamLabels[currentRole.team]}`}>
            <div className="current-role-icon">{currentRole.icon}</div>
            <div>
              <p className="eyebrow">CURRENT ACTION</p>
              <h3>{currentRole.name}</h3>
              <p>{currentRole.reminder}</p>
            </div>
            <div className="current-role-team">{currentRole.team}</div>
          </div>
        ) : (
          <div className="empty-state compact">
            <div className="empty-glyph"><MoonStar size={26} /></div>
            <h3>还没有可执行的夜晚行动</h3>
            <p>在魔典里添加玩家并分配角色，夜晚顺序会自动生成。</p>
          </div>
        )}
        <div className="night-list">
          {nightRoles.map((role, index) => (
            <button
              className={currentRole?.id === role.id ? "night-row active" : "night-row"}
              key={role.id}
              onClick={() => onSelectNight(index)}
            >
              <span className="night-index">{String(index + 1).padStart(2, "0")}</span>
              <span className={`mini-role-icon ${teamLabels[role.team]}`}>{role.icon}</span>
              <span className="night-role-name">{role.name}</span>
              <span className="night-role-team">{role.team}</span>
              {currentRole?.id === role.id ? <span className="on-air">进行中</span> : null}
            </button>
          ))}
        </div>
      </section>
      <aside className="night-help">
        <p className="eyebrow">HOST NOTES</p>
        <h3>主持人节奏</h3>
        <ol>
          <li>先按顺序唤醒夜晚角色。</li>
          <li>每完成一个行动，点击下一项。</li>
          <li>白天开始前，把公共信息写进局面备注。</li>
        </ol>
        <div className="night-tip"><MoonStar size={17} /><span>死亡角色不会出现在夜晚行动列表里。</span></div>
      </aside>
    </div>
  );
}

function ScriptPanel({
  scriptId,
  roleFilter,
  onSelectScript,
  onFilter,
}: {
  scriptId: string;
  roleFilter: string;
  onSelectScript: (id: string) => void;
  onFilter: (value: string) => void;
}) {
  const filteredRoles = roles.filter((role) => {
    const query = roleFilter.trim().toLowerCase();
    return !query || `${role.name}${role.team}${role.short}`.toLowerCase().includes(query);
  });
  return (
    <div className="script-layout">
      <section className="script-main">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">SCRIPT LIBRARY</p>
            <h2>选择今晚的剧本</h2>
          </div>
        </div>
        <div className="script-cards">
          {scripts.map((script) => (
            <button
              className={script.id === scriptId ? "script-card selected" : "script-card"}
              key={script.id}
              onClick={() => onSelectScript(script.id)}
            >
              <div className="script-card-top">
                <span className="script-icon"><ScrollText size={21} /></span>
                {script.id === scriptId ? <span className="selected-mark"><Check size={13} /></span> : null}
              </div>
              <strong>{script.name}</strong>
              <span>{script.subtitle}</span>
              <small>{script.description}</small>
            </button>
          ))}
        </div>
        <div className="role-library-heading">
          <div>
            <p className="eyebrow">ROLE LIBRARY</p>
            <h3>角色速查</h3>
          </div>
          <input value={roleFilter} onChange={(event) => onFilter(event.target.value)} placeholder="搜索角色…" aria-label="搜索角色" />
        </div>
        <div className="role-table">
          {filteredRoles.map((role) => (
            <div className="role-row" key={role.id}>
              <span className={`mini-role-icon ${teamLabels[role.team]}`}>{role.icon}</span>
              <strong>{role.name}</strong>
              <span className={`team-label ${teamLabels[role.team]}`}>{role.team}</span>
              <p>{role.short}</p>
            </div>
          ))}
        </div>
      </section>
      <aside className="script-aside">
        <div className="script-aside-seal">钟</div>
        <p className="eyebrow">ABOUT THIS GRIMOIRE</p>
        <h3>一张桌子，一本魔典。</h3>
        <p>这是主持人自己的操作台。本机自动保存，也可以创建共享房间向玩家安全发送身份。</p>
        <div className="script-aside-points">
          <span><Check size={14} />角色与座位</span>
          <span><Check size={14} />夜晚行动顺序</span>
          <span><Check size={14} />私密主持备注</span>
        </div>
      </aside>
    </div>
  );
}

export default App;
