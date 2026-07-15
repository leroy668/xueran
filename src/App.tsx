import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Dices,
  MoonStar,
  MessageSquareText,
  NotebookPen,
  Plus,
  RotateCcw,
  ScrollText,
  Send,
  Share2,
  Skull,
  Sparkles,
  Sun,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { getNightRoles, getRole, roles, scripts } from "./data";
import { HostRoomPanel } from "./HostRoomPanel";
import { PlayerRoom } from "./PlayerRoom";
import { RoleIcon } from "./RoleIcon";
import { distributeRoles } from "./roleDistribution";
import {
  activeRoomStorageKey,
  buildRoomUrl,
  closeRoom,
  createRoom,
  findRoomByCode,
  getRoomNightMessages,
  getRoomPlayerMessages,
  getRoomPlayers,
  loadHostRoom,
  resetRoom,
  revokeClaim,
  sendNightMessage,
  syncRoom,
  type NightMessage,
  type PlayerMessage,
  type PublicRoomPlayer,
  type SharedRoom,
} from "./room";
import {
  buildShareUrl,
  getSharedState,
  loadState,
} from "./storage";
import { ensureAnonymousSession, supabase } from "./supabase";
import type { GameState, Phase, Player, TabId, Team } from "./types";

const tabs: { id: TabId; label: string; icon: typeof BookOpen }[] = [
  { id: "grimoire", label: "魔典", icon: BookOpen },
  { id: "night", label: "夜晚顺序", icon: MoonStar },
  { id: "messages", label: "玩家消息", icon: MessageSquareText },
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
  const roomCode = new URLSearchParams(window.location.search).get("room");
  return roomCode ? (
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
  const [nightMessages, setNightMessages] = useState<NightMessage[]>([]);
  const [playerMessages, setPlayerMessages] = useState<PlayerMessage[]>([]);
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
    const [players, messages, incomingMessages] = await Promise.all([
      getRoomPlayers(targetRoom.id),
      getRoomNightMessages(targetRoom.id),
      getRoomPlayerMessages(targetRoom.id),
    ]);
    setRoomPlayers(players);
    setNightMessages(messages);
    setPlayerMessages(incomingMessages);
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
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "xueran_night_messages",
          filter: `room_id=eq.${room.id}`,
        },
        () => void refreshRoomAdmin(room),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "xueran_player_messages",
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
    if (state.players.length >= 20) {
      setToast("魔典最多支持 20 个座位");
      return;
    }
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

  const assignRoles = () => {
    const playerCount = state.players.length;
    if (playerCount < 5 || playerCount > 15) {
      setToast("标准角色分配需要 5 至 15 名玩家");
      return;
    }

    const currentRoleIds = state.players.map((player) => player.roleId);
    const rolesAlreadyAssigned = new Set(currentRoleIds).size === playerCount;
    if (
      rolesAlreadyAssigned &&
      !window.confirm("重新随机分配全部角色？现有角色、存活状态和角色备注将被替换。")
    ) {
      return;
    }

    try {
      const distribution = distributeRoles(playerCount);
      setState((current) => ({
        ...current,
        phase: "准备",
        round: 1,
        nightIndex: 0,
        players: current.players.map((player, index) => ({
          ...player,
          roleId: distribution.roleIds[index],
          alive: true,
          identityMessage: "",
          notes: "",
        })),
        updatedAt: new Date().toISOString(),
      }));
      const { counts } = distribution;
      setToast(
        `已分配：${counts.镇民}镇民 · ${counts.外来者}外来者 · ${counts.爪牙}爪牙 · ${counts.恶魔}恶魔${distribution.hasBaron ? "（男爵修正）" : ""}`,
      );
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "角色分配失败");
    }
  };

  const resetGame = async () => {
    if (
      !window.confirm(
        room
          ? "重新开始一局？将保留房间、座位、已入座玩家和当前角色，清空全部聊天记录、备注与存活状态。"
          : "重新开始一局？将保留当前座位和角色，清空备注并恢复全员存活。",
      )
    ) {
      return;
    }

    const nextState: GameState = {
      ...state,
      phase: "准备",
      round: 1,
      nightIndex: 0,
      storytellerNotes: "",
      players: state.players.map((player) => ({
        ...player,
        alive: true,
        identityMessage: "",
        notes: "",
      })),
      updatedAt: new Date().toISOString(),
    };

    if (!room) {
      setState(nextState);
      setNightMessages([]);
      setPlayerMessages([]);
      setActiveTab("grimoire");
      setToast("已重开一局，当前玩家和角色已保留");
      return;
    }

    setRoomBusy(true);
    setRoomReady(false);
    setSyncStatus("syncing");
    try {
      await resetRoom(room.id);
      await syncRoom(room.id, nextState);
      setState(nextState);
      setNightMessages([]);
      setPlayerMessages([]);
      setRoom((current) =>
        current
          ? {
              ...current,
              phase: "准备",
              round: 1,
              updated_at: new Date().toISOString(),
            }
          : current,
      );
      await refreshRoomAdmin(room);
      setActiveTab("grimoire");
      setSyncStatus("synced");
      setToast("已重开一局，已入座玩家全部保留");
    } catch {
      setSyncStatus("error");
      setToast("重开失败，请检查 Supabase 数据库配置");
    } finally {
      setRoomReady(true);
      setRoomBusy(false);
    }
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
          title: `儿戏的血染钟楼房间 ${room.code}`,
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
      setNightMessages([]);
      setPlayerMessages([]);
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

  const handleSendNightMessage = async ({
    playerId,
    roleId,
    body,
  }: {
    playerId: string;
    roleId: string;
    body: string;
  }) => {
    if (!room) throw new Error("请先创建共享房间");
    const message = await sendNightMessage({
      roomId: room.id,
      playerId,
      roleId,
      round: state.round,
      body,
    });
    setNightMessages((current) => [
      message,
      ...current.filter((item) => item.id !== message.id),
    ]);
    const target = roomPlayers.find((player) => player.id === playerId);
    setToast(`夜间信息已发送给座位 ${target?.seat ?? "?"}`);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-seal" aria-hidden="true">
            <RoleIcon roleId="imp" size={24} className="brand-game-icon" />
          </div>
          <h1>儿戏的血染钟楼</h1>
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
          <button
            className="icon-button danger-button"
            onClick={() => void resetGame()}
            title="保留玩家并重开"
            disabled={roomBusy}
          >
            <RotateCcw size={16} />
            <span className="desktop-only">重置</span>
          </button>
        </div>
      </header>

      <main className="workspace">
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
                ) : tab.id === "messages" && playerMessages.length > 0 ? (
                  <span className="tab-count">{playerMessages.length}</span>
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
            onAssignRoles={assignRoles}
            onQuickStart={quickStart}
            roomPlayers={roomPlayers}
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
            room={room}
            roomPlayers={roomPlayers}
            nightMessages={nightMessages}
            onChangeNight={changeNight}
            onSelectNight={(index) => update({ nightIndex: index })}
            onSendMessage={handleSendNightMessage}
          />
        ) : null}

        {activeTab === "messages" ? (
          <HostMessagesPanel
            state={state}
            room={room}
            roomPlayers={roomPlayers}
            nightMessages={nightMessages}
            playerMessages={playerMessages}
            onSendMessage={handleSendNightMessage}
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
              {tab.id === "messages" && playerMessages.length > 0 ? (
                <strong className="mobile-nav-badge">
                  {Math.min(playerMessages.length, 99)}
                </strong>
              ) : null}
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
  onAssignRoles,
  onQuickStart,
  roomPlayers,
  roomPanel,
}: {
  state: GameState;
  aliveCount: number;
  onUpdate: (patch: Partial<GameState>) => void;
  onUpdatePlayer: (id: string, patch: Partial<Player>) => void;
  onRemovePlayer: (id: string) => void;
  onAddPlayer: () => void;
  onAssignRoles: () => void;
  onQuickStart: () => void;
  roomPlayers: PublicRoomPlayer[];
  roomPanel: ReactNode;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    state.players[0]?.id ?? null,
  );

  useEffect(() => {
    if (!state.players.length) {
      setSelectedPlayerId(null);
      return;
    }
    if (!state.players.some((player) => player.id === selectedPlayerId)) {
      setSelectedPlayerId(state.players[0].id);
    }
  }, [selectedPlayerId, state.players]);

  const roomPlayersBySeat = useMemo(
    () => new Map(roomPlayers.map((player) => [player.seat, player])),
    [roomPlayers],
  );
  const selectedPlayer =
    state.players.find((player) => player.id === selectedPlayerId) ??
    state.players[0];

  const getDisplayName = (player: Player) => {
    const roomPlayer = roomPlayersBySeat.get(player.seat);
    return (
      roomPlayer?.name.trim() ||
      player.name.trim() ||
      "等待玩家入座"
    );
  };
  const getTableName = (player: Player) => {
    const roomPlayer = roomPlayersBySeat.get(player.seat);
    return roomPlayer?.name.trim() || player.name.trim() || "待入座";
  };

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
          <div className="heading-actions">
            {state.players.length === 0 ? (
              <button className="secondary-button" onClick={onQuickStart}>
                <Sparkles size={15} />
                载入示例局
              </button>
            ) : null}
            {state.players.length > 0 ? (
              <button
                className="secondary-button assign-roles-button"
                onClick={onAssignRoles}
                title="按当前人数随机分配不重复角色"
              >
                <Dices size={16} />
                一键分配
              </button>
            ) : null}
            {state.players.length > 0 ? (
              <button
                className="secondary-button"
                onClick={() => {
                  const lastPlayer = state.players[state.players.length - 1];
                  if (
                    window.confirm(
                      `移除最后一个座位（座位 ${lastPlayer.seat}）？`,
                    )
                  ) {
                    onRemovePlayer(lastPlayer.id);
                  }
                }}
              >
                <UserMinus size={16} />
                减少玩家
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
          <div
            className={[
              "grimoire-workbench",
              state.players.length >= 9 ? "mobile-grid" : "",
              state.players.length > 10 ? "large" : "",
              state.players.length > 15 ? "crowded" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="table-stage">
              <div className="grimoire-table">
                <div className="table-center" aria-hidden="true">
                  <span>{state.phase}</span>
                  <strong>
                    {aliveCount}
                    <small> / {state.players.length}</small>
                  </strong>
                  <p>第 {state.round} 回合</p>
                </div>
                {state.players.map((player, index) => {
                  const role = getRole(player.roleId);
                  const roomPlayer = roomPlayersBySeat.get(player.seat);
                  const angle =
                    (index / state.players.length) * Math.PI * 2 - Math.PI / 2;
                  const radius = state.players.length > 15 ? 42 : 40;
                  const left = 50 + Math.cos(angle) * radius;
                  const top = 50 + Math.sin(angle) * radius;
                  const isSelected = selectedPlayer?.id === player.id;

                  return (
                    <button
                      className={[
                        "table-seat",
                        teamLabels[role.team],
                        player.alive ? "" : "dead",
                        isSelected ? "selected" : "",
                        state.players.length > 10 ? "dense" : "",
                        state.players.length > 15 ? "very-dense" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ left: `${left}%`, top: `${top}%` }}
                      key={player.id}
                      onClick={() => setSelectedPlayerId(player.id)}
                      aria-label={`座位 ${player.seat}，${getDisplayName(player)}，${role.name}，${player.alive ? "存活" : "死亡"}`}
                      aria-pressed={isSelected}
                    >
                      <span className="table-seat-number">
                        {String(player.seat).padStart(2, "0")}
                      </span>
                      <span className="table-role-icon">
                        <RoleIcon
                          roleId={role.id}
                          size={state.players.length > 10 ? 18 : 22}
                        />
                      </span>
                      <span className="table-player-name">{getTableName(player)}</span>
                      <span className="table-role-name">{role.name}</span>
                      {roomPlayer?.is_claimed ? (
                        <span className="table-claimed-dot" title="玩家已入座" />
                      ) : null}
                      {!player.alive ? (
                        <span className="table-dead-mark" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPlayer ? (
              <PlayerEditor
                player={selectedPlayer}
                displayName={getDisplayName(selectedPlayer)}
                onUpdate={onUpdatePlayer}
                onRemove={onRemovePlayer}
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function PlayerEditor({
  player,
  displayName,
  onUpdate,
  onRemove,
}: {
  player: Player;
  displayName: string;
  onUpdate: (id: string, patch: Partial<Player>) => void;
  onRemove: (id: string) => void;
}) {
  const role = getRole(player.roleId);
  return (
    <aside className={player.alive ? "player-editor" : "player-editor dead"}>
      <div className="player-editor-topline">
        <div>
          <p className="eyebrow">
            SEAT {String(player.seat).padStart(2, "0")}
          </p>
          <h3>{displayName}</h3>
        </div>
        <button
          className={player.alive ? "life-toggle alive" : "life-toggle"}
          onClick={() => onUpdate(player.id, { alive: !player.alive })}
          title={player.alive ? "标记为死亡" : "标记为存活"}
        >
          {player.alive ? <Check size={13} /> : <Skull size={13} />}
          {player.alive ? "存活" : "死亡"}
        </button>
      </div>

      <label className="role-select-field">
        <span>角色身份</span>
        <select
          value={player.roleId}
          onChange={(event) => onUpdate(player.id, { roleId: event.target.value })}
          aria-label={`座位 ${player.seat} 角色`}
        >
          {roles.map((option) => (
            <option value={option.id} key={option.id}>
              {option.name} · {option.team}
            </option>
          ))}
        </select>
      </label>

      <div className={`selected-role-summary ${teamLabels[role.team]}`}>
        <span className="selected-role-icon">
          <RoleIcon roleId={role.id} size={20} />
        </span>
        <div>
          <strong>{role.name}</strong>
          <small>{role.team}</small>
          <p>{role.short}</p>
        </div>
      </div>

      <label className="player-editor-field">
        <span>主持人私密备注</span>
        <textarea
          className="player-notes"
          value={player.notes}
          onChange={(event) => onUpdate(player.id, { notes: event.target.value })}
          placeholder="记录中毒、保护、红鲱鱼等状态…"
          rows={3}
        />
      </label>

      <div className="player-editor-actions">
        <button
          className="remove-player-button"
          onClick={() => {
            if (window.confirm(`移除座位 ${player.seat}？`)) {
              onRemove(player.id);
            }
          }}
          title="移除玩家"
          aria-label={`移除座位 ${player.seat}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </aside>
  );
}

function NightPanel({
  state,
  nightRoles,
  currentRole,
  room,
  roomPlayers,
  nightMessages,
  onChangeNight,
  onSelectNight,
  onSendMessage,
}: {
  state: GameState;
  nightRoles: ReturnType<typeof getNightRoles>;
  currentRole: ReturnType<typeof getRole> | null;
  room: SharedRoom | null;
  roomPlayers: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  onChangeNight: (offset: number) => void;
  onSelectNight: (index: number) => void;
  onSendMessage: (message: {
    playerId: string;
    roleId: string;
    body: string;
  }) => Promise<void>;
}) {
  const [targetPlayerId, setTargetPlayerId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const rolePlayers = useMemo(
    () =>
      currentRole
        ? state.players.filter((player) => player.roleId === currentRole.id)
        : [],
    [currentRole, state.players],
  );
  const roomPlayersById = useMemo(
    () => new Map(roomPlayers.map((player) => [player.id, player])),
    [roomPlayers],
  );

  useEffect(() => {
    if (!rolePlayers.some((player) => player.id === targetPlayerId)) {
      setTargetPlayerId(rolePlayers[0]?.id ?? "");
    }
    setSendError("");
  }, [rolePlayers, targetPlayerId]);

  const selectedPlayer = rolePlayers.find(
    (player) => player.id === targetPlayerId,
  );
  const selectedRoomPlayer = selectedPlayer
    ? roomPlayersById.get(selectedPlayer.id)
    : undefined;
  const canSend =
    Boolean(room) &&
    Boolean(currentRole) &&
    Boolean(selectedRoomPlayer?.is_claimed) &&
    Boolean(messageBody.trim()) &&
    !sending;

  const submitMessage = async () => {
    if (!currentRole || !selectedPlayer || !canSend) return;
    setSending(true);
    setSendError("");
    try {
      await onSendMessage({
        playerId: selectedPlayer.id,
        roleId: currentRole.id,
        body: messageBody.trim(),
      });
      setMessageBody("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /claimed player/i.test(message)
          ? "该玩家尚未入座，暂时无法接收信息"
          : /function|night_messages|schema cache/i.test(message)
            ? "夜间消息数据库尚未配置"
            : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };

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
          <>
            <div className={`current-action ${teamLabels[currentRole.team]}`}>
              <div className="current-role-icon">
                <RoleIcon roleId={currentRole.id} size={29} />
              </div>
              <div>
                <p className="eyebrow">CURRENT ACTION</p>
                <h3>{currentRole.name}</h3>
                <p>{currentRole.reminder}</p>
              </div>
              <div className="current-role-team">{currentRole.team}</div>
            </div>
            <section className="night-message-composer">
              <div className="night-message-heading">
                <div>
                  <p className="eyebrow">PRIVATE NIGHT MESSAGE</p>
                  <h3>发送夜间信息</h3>
                </div>
                <MessageSquareText size={20} />
              </div>
              <div className="night-message-controls">
                <label>
                  <span>接收玩家</span>
                  <select
                    value={targetPlayerId}
                    onChange={(event) => setTargetPlayerId(event.target.value)}
                    disabled={!rolePlayers.length || sending}
                  >
                    {rolePlayers.map((player) => {
                      const roomPlayer = roomPlayersById.get(player.id);
                      return (
                        <option key={player.id} value={player.id}>
                          座位 {String(player.seat).padStart(2, "0")}
                          {roomPlayer?.name ? ` · ${roomPlayer.name}` : ""}
                          {roomPlayer?.is_claimed ? "" : " · 未入座"}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label>
                  <span>告知内容</span>
                  <textarea
                    value={messageBody}
                    onChange={(event) => setMessageBody(event.target.value)}
                    placeholder={`输入需要告知${currentRole.name}的信息`}
                    maxLength={500}
                    rows={3}
                    disabled={sending}
                  />
                </label>
              </div>
              <div className="night-message-footer">
                <span>
                  {!room
                    ? "请先在魔典页创建共享房间"
                    : !selectedRoomPlayer?.is_claimed
                      ? "该座位入座后才可接收"
                      : `${messageBody.length}/500`}
                </span>
                <button
                  className="primary-button night-send-button"
                  disabled={!canSend}
                  onClick={() => void submitMessage()}
                >
                  <Send size={15} />
                  {sending ? "发送中" : "发送"}
                </button>
              </div>
              {sendError ? <div className="inline-error">{sendError}</div> : null}
              {nightMessages.length ? (
                <div className="night-sent-history">
                  <div className="night-sent-history-heading">
                    <span>全部发送记录</span>
                    <strong>{nightMessages.length} 条</strong>
                  </div>
                  {nightMessages.map((message) => {
                    const recipient = roomPlayersById.get(message.player_id);
                    const messageRole = getRole(message.role_id);
                    return (
                      <div className="night-sent-row" key={message.id}>
                        <div className="night-sent-meta">
                          <strong>
                            座位 {String(recipient?.seat ?? "?").padStart(2, "0")}
                          </strong>
                          <span>第 {message.round} 回合 · {messageRole.name}</span>
                        </div>
                        <p>{message.body}</p>
                        <time>
                          {new Date(message.created_at).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          </>
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
              <span className={`mini-role-icon ${teamLabels[role.team]}`}>
                <RoleIcon roleId={role.id} size={16} />
              </span>
              <span className="night-role-name">{role.name}</span>
              <span className="night-role-team">{role.team}</span>
              {currentRole?.id === role.id ? <span className="on-air">进行中</span> : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function HostMessagesPanel({
  state,
  room,
  roomPlayers,
  nightMessages,
  playerMessages,
  onSendMessage,
}: {
  state: GameState;
  room: SharedRoom | null;
  roomPlayers: PublicRoomPlayer[];
  nightMessages: NightMessage[];
  playerMessages: PlayerMessage[];
  onSendMessage: (message: {
    playerId: string;
    roleId: string;
    body: string;
  }) => Promise<void>;
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const roomPlayersById = useMemo(
    () => new Map(roomPlayers.map((player) => [player.id, player])),
    [roomPlayers],
  );
  const availablePlayers = useMemo(
    () =>
      [...state.players]
        .sort((left, right) => left.seat - right.seat)
        .map((player) => ({
          player,
          roomPlayer: roomPlayersById.get(player.id),
        })),
    [roomPlayersById, state.players],
  );

  useEffect(() => {
    if (availablePlayers.some(({ player }) => player.id === selectedPlayerId)) {
      return;
    }
    const latestMessage = [...nightMessages, ...playerMessages].sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )[0];
    const firstClaimed = availablePlayers.find(
      ({ roomPlayer }) => roomPlayer?.is_claimed,
    );
    const latestAvailablePlayer = latestMessage
      ? availablePlayers.find(
          ({ player }) => player.id === latestMessage.player_id,
        )
      : undefined;
    setSelectedPlayerId(
      latestAvailablePlayer?.player.id ??
        firstClaimed?.player.id ??
        availablePlayers[0]?.player.id ??
        "",
    );
  }, [availablePlayers, nightMessages, playerMessages, selectedPlayerId]);

  const latestByPlayer = useMemo(() => {
    const latest = new Map<
      string,
      { body: string; createdAt: string; direction: "incoming" | "outgoing" }
    >();
    [...nightMessages.map((message) => ({ ...message, direction: "outgoing" as const })),
      ...playerMessages.map((message) => ({ ...message, direction: "incoming" as const }))]
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      )
      .forEach((message) => {
        if (!latest.has(message.player_id)) {
          latest.set(message.player_id, {
            body: message.body,
            createdAt: message.created_at,
            direction: message.direction,
          });
        }
      });
    return latest;
  }, [nightMessages, playerMessages]);

  const incomingCountByPlayer = useMemo(() => {
    const counts = new Map<string, number>();
    playerMessages.forEach((message) => {
      counts.set(message.player_id, (counts.get(message.player_id) ?? 0) + 1);
    });
    return counts;
  }, [playerMessages]);

  const conversationPlayers = useMemo(
    () =>
      [...availablePlayers].sort((left, right) => {
        const leftLatest = latestByPlayer.get(left.player.id);
        const rightLatest = latestByPlayer.get(right.player.id);
        if (leftLatest && rightLatest) {
          return (
            new Date(rightLatest.createdAt).getTime() -
            new Date(leftLatest.createdAt).getTime()
          );
        }
        if (leftLatest) return -1;
        if (rightLatest) return 1;
        if (
          Boolean(left.roomPlayer?.is_claimed) !==
          Boolean(right.roomPlayer?.is_claimed)
        ) {
          return left.roomPlayer?.is_claimed ? -1 : 1;
        }
        return left.player.seat - right.player.seat;
      }),
    [availablePlayers, latestByPlayer],
  );

  const selectedEntry = availablePlayers.find(
    ({ player }) => player.id === selectedPlayerId,
  );
  const selectedPlayer = selectedEntry?.player;
  const selectedRoomPlayer = selectedEntry?.roomPlayer;
  const selectedRole = selectedPlayer ? getRole(selectedPlayer.roleId) : null;
  const selectedSenderName =
    selectedRoomPlayer?.name ||
    (selectedPlayer
      ? `座位 ${String(selectedPlayer.seat).padStart(2, "0")}`
      : "玩家");
  const timeline = [
    ...nightMessages
      .filter((message) => message.player_id === selectedPlayerId)
      .map((message) => ({
        ...message,
        direction: "outgoing" as const,
        label: `上帝 · 第 ${message.round} 回合 · ${getRole(message.role_id).name}`,
      })),
    ...playerMessages
      .filter((message) => message.player_id === selectedPlayerId)
      .map((message) => ({
        ...message,
        direction: "incoming" as const,
        label: `${selectedSenderName} · 第 ${message.round} 回合`,
      })),
  ].sort(
    (left, right) =>
      new Date(left.created_at).getTime() -
      new Date(right.created_at).getTime(),
  );
  const latestMessageKey = timeline.length
    ? `${selectedPlayerId}-${timeline[timeline.length - 1].direction}-${timeline[timeline.length - 1].id}`
    : selectedPlayerId;

  useEffect(() => {
    const timelineElement = timelineRef.current;
    if (!timelineElement) return;
    const frame = requestAnimationFrame(() => {
      timelineElement.scrollTop = timelineElement.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [latestMessageKey]);

  const canSend =
    Boolean(room) &&
    Boolean(selectedPlayer) &&
    Boolean(selectedRoomPlayer?.is_claimed) &&
    Boolean(messageBody.trim()) &&
    !sending;

  const submitMessage = async () => {
    if (!selectedPlayer || !canSend) return;
    setSending(true);
    setSendError("");
    try {
      await onSendMessage({
        playerId: selectedPlayer.id,
        roleId: selectedPlayer.roleId,
        body: messageBody.trim(),
      });
      setMessageBody("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setSendError(
        /claimed player/i.test(message)
          ? "该玩家尚未入座，暂时无法接收信息"
          : /function|night_messages|schema cache/i.test(message)
            ? "消息数据库尚未配置"
            : "发送失败，请稍后重试",
      );
    } finally {
      setSending(false);
    }
  };

  if (!room) {
    return (
      <section className="host-messages-empty">
        <div className="empty-glyph">
          <MessageSquareText size={26} />
        </div>
        <h2>请先创建共享房间</h2>
        <p>创建房间并让玩家入座后，可以在这里集中查看和回复所有私密消息。</p>
      </section>
    );
  }

  return (
    <section className="host-messages-page">
      <aside className="host-conversation-list">
        <div className="host-conversation-heading">
          <div>
            <p className="eyebrow">PLAYER CHAT</p>
            <h2>玩家消息</h2>
          </div>
          <strong>{playerMessages.length}</strong>
        </div>
        <div className="host-player-tabs">
          {conversationPlayers.map(({ player, roomPlayer }) => {
            const latest = latestByPlayer.get(player.id);
            const incomingCount = incomingCountByPlayer.get(player.id) ?? 0;
            const playerLabel =
              roomPlayer?.name ||
              (latest
                ? `座位 ${String(player.seat).padStart(2, "0")}`
                : "等待玩家入座");
            return (
              <button
                className={player.id === selectedPlayerId ? "active" : ""}
                key={player.id}
                onClick={() => {
                  setSelectedPlayerId(player.id);
                  setMessageBody("");
                  setSendError("");
                }}
              >
                <span className="host-player-seat">
                  {String(player.seat).padStart(2, "0")}
                </span>
                <span className="host-player-summary">
                  <strong>{playerLabel}</strong>
                  <small>
                    {latest
                      ? `${latest.direction === "outgoing" ? "我：" : ""}${latest.body}`
                      : `${getRole(player.roleId).name} · 暂无消息`}
                  </small>
                </span>
                {incomingCount ? (
                  <span className="host-player-count">{incomingCount}</span>
                ) : (
                  <span
                    className={
                      roomPlayer?.is_claimed
                        ? "host-player-status online"
                        : "host-player-status"
                    }
                    title={roomPlayer?.is_claimed ? "已入座" : "未入座"}
                  />
                )}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="host-chat-panel">
        {selectedPlayer && selectedRole ? (
          <>
            <header className="host-chat-header">
              <div className={`host-chat-role ${teamLabels[selectedRole.team]}`}>
                <RoleIcon roleId={selectedRole.id} size={24} />
              </div>
              <div>
                <h3>{selectedRoomPlayer?.name || `座位 ${selectedPlayer.seat}`}</h3>
                <p>
                  座位 {String(selectedPlayer.seat).padStart(2, "0")} ·{" "}
                  {selectedRole.name} ·{" "}
                  {selectedRoomPlayer?.is_claimed ? "已入座" : "未入座"}
                </p>
              </div>
            </header>

            {timeline.length ? (
              <div className="host-chat-timeline" ref={timelineRef}>
                {timeline.map((message) => (
                  <article
                    className={`host-chat-message ${message.direction}`}
                    key={`${message.direction}-${message.id}`}
                  >
                    <span className="host-chat-avatar" aria-hidden="true">
                      {message.direction === "incoming"
                        ? String(selectedPlayer.seat).padStart(2, "0")
                        : "上"}
                    </span>
                    <div className="host-chat-message-content">
                      <div className="host-chat-message-meta">
                        <span>{message.label}</span>
                        <time>
                          {new Date(message.created_at).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <div className="host-chat-bubble">
                        <p>{message.body}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="host-chat-no-messages">
                <MessageSquareText size={24} />
                <h3>暂无聊天记录</h3>
                <p>玩家来信和你发送的信息会按时间显示在这里。</p>
              </div>
            )}

            <div className="host-chat-composer">
              <textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitMessage();
                  }
                }}
                placeholder={
                  selectedRoomPlayer?.is_claimed
                    ? "回复该玩家"
                    : "该玩家入座后即可发送"
                }
                maxLength={500}
                rows={2}
                disabled={!selectedRoomPlayer?.is_claimed || sending}
              />
              <div className="host-chat-composer-footer">
                <span>{messageBody.length}/500</span>
                <button
                  className="primary-button"
                  disabled={!canSend}
                  onClick={() => void submitMessage()}
                >
                  <Send size={14} />
                  {sending ? "发送中" : "发送"}
                </button>
              </div>
              {sendError ? <div className="inline-error">{sendError}</div> : null}
            </div>
          </>
        ) : (
          <div className="host-chat-no-messages">
            <Users size={25} />
            <h3>暂无座位</h3>
            <p>先在魔典中添加玩家座位。</p>
          </div>
        )}
      </div>
    </section>
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
              <span className={`mini-role-icon ${teamLabels[role.team]}`}>
                <RoleIcon roleId={role.id} size={16} />
              </span>
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
