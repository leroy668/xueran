import { getRole } from "./data";
import { RoleIcon } from "./RoleIcon";

export function DemonBluffMessage({ roleIds }: { roleIds: string[] }) {
  return (
    <div className="demon-bluff-message">
      <strong>恶魔伪装身份</strong>
      <div className="demon-bluff-message-roles">
        {roleIds.map((roleId) => {
          const role = getRole(roleId);
          return (
            <div className="demon-bluff-message-role" key={roleId}>
              <span>
                <RoleIcon roleId={roleId} size={20} />
              </span>
              <div>
                <b>{role.name}</b>
                <small>{role.team}</small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
