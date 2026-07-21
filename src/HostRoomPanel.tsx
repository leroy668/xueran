import {
  Cloud,
  Copy,
  Link2,
  LoaderCircle,
  Radio,
  Share2,
  Unlink,
  UserCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { PublicRoomPlayer, SharedRoom } from "./room";
import { formatSeat } from "./seat";

type Props = {
  room: SharedRoom | null;
  roomUrl: string;
  players: PublicRoomPlayer[];
  busy: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  onCreate: () => void;
  onCopy: () => void;
  onRevoke: (playerId: string) => void;
  onOpenSimulation: () => void;
  onClose: () => void;
};

export function HostRoomPanel({
  room,
  roomUrl,
  players,
  busy,
  syncStatus,
  onCreate,
  onCopy,
  onRevoke,
  onOpenSimulation,
  onClose,
}: Props) {
  if (!room) {
    return (
      <section className="room-launcher">
        <div className="room-launcher-icon">
          <Radio size={18} />
        </div>
        <div>
          <strong>统一身份房间</strong>
          <p>玩家扫码填写名字并选择座位，无需主持人确认。</p>
        </div>
        <button
          className="primary-button room-create-button"
          onClick={onCreate}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Link2 size={15} />
          )}
          创建共享房间
        </button>
      </section>
    );
  }

  const claimedPlayers = players.filter((player) => player.is_claimed);
  const simulationEnabled =
    room.simulation_enabled ||
    players.some((player) => player.is_simulated);

  return (
    <section className="host-room-panel">
      <div className="room-heading">
        <div>
          <span className="room-live-label">
            <span className="status-dot" />
            房间开放中
          </span>
          <strong>{room.code}</strong>
        </div>
        <span className={`cloud-status ${syncStatus}`}>
          {syncStatus === "syncing" ? (
            <LoaderCircle className="spin" size={13} />
          ) : syncStatus === "error" ? (
            <Unlink size={13} />
          ) : (
            <Cloud size={13} />
          )}
          {syncStatus === "syncing"
            ? "同步中"
            : syncStatus === "error"
              ? "同步失败"
              : "已同步"}
        </span>
      </div>

      <button className="room-qr" onClick={onCopy} title="复制统一房间链接">
        <QRCodeSVG
          value={roomUrl}
          size={152}
          bgColor="#f5f1ea"
          fgColor="#17171a"
          level="M"
        />
      </button>
      <p className="room-scan-copy">所有玩家扫描同一个二维码</p>
      <button className="secondary-button room-copy-button" onClick={onCopy}>
        <Copy size={14} />
        复制房间链接
      </button>

      <div className="claim-section">
        <button
          className="simulation-console-entry"
          type="button"
          onClick={onOpenSimulation}
        >
          <span>
            <Radio size={15} />
            <strong>玩家模拟后台</strong>
          </span>
          <small>
            {simulationEnabled
              ? "模拟模式已开启"
              : "技能、消息、私聊与投票测试"}
          </small>
        </button>
        <div className="claim-section-heading">
          <span>已入座玩家</span>
          <strong>
            {claimedPlayers.length}/{players.length}
          </strong>
        </div>
        {claimedPlayers.length ? (
          <div className="claimed-list">
            <span className="claimed-list-title">
              <UserCheck size={14} />
              身份已自动发放
            </span>
            {claimedPlayers.map((player) => (
              <div className="claimed-row" key={player.id}>
                <span>
                  <strong>{player.name || formatSeat(player.seat)}</strong>
                  <small>
                    {formatSeat(player.seat)}
                    {player.is_simulated ? " · 模拟" : ""}
                  </small>
                </span>
                <button onClick={() => onRevoke(player.id)}>撤销</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="claim-empty">玩家扫码入座后，姓名会自动显示在这里。</p>
        )}
      </div>

      <div className="room-footer-actions">
        <button onClick={onCopy}>
          <Share2 size={13} />
          分享
        </button>
        <button className="room-close" onClick={onClose}>
          结束房间
        </button>
      </div>
    </section>
  );
}
