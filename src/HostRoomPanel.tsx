import {
  Check,
  Cloud,
  Copy,
  Link2,
  LoaderCircle,
  Radio,
  Share2,
  Unlink,
  UserCheck,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type {
  ClaimRequest,
  PublicRoomPlayer,
  SharedRoom,
} from "./room";

type Props = {
  room: SharedRoom | null;
  roomUrl: string;
  claims: ClaimRequest[];
  players: PublicRoomPlayer[];
  busy: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  onCreate: () => void;
  onCopy: () => void;
  onApprove: (claimId: string) => void;
  onReject: (claimId: string) => void;
  onRevoke: (playerId: string) => void;
  onClose: () => void;
};

export function HostRoomPanel({
  room,
  roomUrl,
  claims,
  players,
  busy,
  syncStatus,
  onCreate,
  onCopy,
  onApprove,
  onReject,
  onRevoke,
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
          <p>生成一个二维码，所有玩家扫码后认领自己的座位。</p>
        </div>
        <button className="primary-button room-create-button" onClick={onCreate} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={15} /> : <Link2 size={15} />}
          创建共享房间
        </button>
      </section>
    );
  }

  const pendingClaims = claims.filter((claim) => claim.status === "pending");
  const approvedClaims = claims.filter((claim) => claim.status === "approved");
  const playerMap = new Map(players.map((player) => [player.id, player]));

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
        <div className="claim-section-heading">
          <span>待确认申请</span>
          <strong>{pendingClaims.length}</strong>
        </div>
        {pendingClaims.length ? (
          <div className="claim-list">
            {pendingClaims.map((claim) => {
              const player = playerMap.get(claim.player_id);
              return (
                <div className="claim-row" key={claim.id}>
                  <div>
                    <strong>
                      {player?.name || claim.applicant_name || `座位 ${player?.seat ?? "?"}`}
                    </strong>
                    <span>申请座位 {player?.seat ?? "?"}</span>
                  </div>
                  <div className="claim-actions">
                    <button
                      className="claim-approve"
                      onClick={() => onApprove(claim.id)}
                      title="确认认领"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      className="claim-reject"
                      onClick={() => onReject(claim.id)}
                      title="拒绝申请"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="claim-empty">玩家提交认领后会出现在这里。</p>
        )}
      </div>

      {approvedClaims.length ? (
        <div className="claimed-list">
          <span className="claimed-list-title">
            <UserCheck size={14} />
            已确认身份
          </span>
          {approvedClaims.map((claim) => {
            const player = playerMap.get(claim.player_id);
            return (
              <div className="claimed-row" key={claim.id}>
                <span>{player?.name || claim.applicant_name}</span>
                <button onClick={() => onRevoke(claim.player_id)}>撤销</button>
              </div>
            );
          })}
        </div>
      ) : null}

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
