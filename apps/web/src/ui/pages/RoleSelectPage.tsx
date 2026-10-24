import React from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { homeForRole, useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";
import type { Role } from "../../lib/types.js";

const ROLES: Array<{
  role: Role;
  title: string;
  desc: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  tone: string;
  disabled?: boolean;
}> = [
  {
    role: "elder",
    title: "长者模式",
    desc: "大字号 · 语音优先 · 一键求助",
    icon: "user",
    tone: "elder"
  },
  {
    role: "family",
    title: "家属模式",
    desc: "告警 · 确认 · 记忆共写",
    icon: "users",
    tone: "family"
  },
  {
    role: "institution",
    title: "机构模式",
    desc: "知识库 · 评测 · 脱敏统计（即将开放）",
    icon: "shield",
    tone: "institution",
    disabled: true
  }
];

export function RoleSelectPage() {
  const { me, login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = React.useState<Role | null>(null);

  async function enter(role: Role) {
    if (busy) return;
    setBusy(role);
    try {
      await login(role);
      nav(homeForRole(role), { replace: true });
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "进入失败",
        detail: err instanceof Error ? err.message : "请确认后端已启动"
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="yl-rolePage">
      <div className="yl-roleHero">
        <div className="yl-heroMark" />
        <h1>银龄守护</h1>
        <p>会倾听，也会守护的江苏长者 AI 陪伴系统</p>
        <span className="yl-demoTag">演示环境 · 数据均为虚构</span>
      </div>

      <div className="yl-roleGrid">
        {ROLES.map((item) => (
          <button
            key={item.role}
            type="button"
            className={`yl-roleCard yl-roleCard--${item.tone}`}
            disabled={item.disabled || busy !== null}
            onClick={() => void enter(item.role)}
          >
            <span className="yl-roleIcon">
              <Icon name={item.icon} size="xl" />
            </span>
            <span className="yl-roleTitle">{item.title}</span>
            <span className="yl-roleDesc">{item.desc}</span>
            <span className="yl-roleAction">
              {item.disabled ? "即将开放" : busy === item.role ? "正在进入…" : "进入"}
              {!item.disabled && <Icon name="arrowRight" size="sm" />}
            </span>
          </button>
        ))}
      </div>

      {me && (
        <div className="yl-currentIdentity">
          当前身份：{me.user.displayName}（{me.user.role}）
          <button type="button" className="yl-linkBtn" onClick={() => nav(homeForRole(me.user.role))}>
            继续
          </button>
        </div>
      )}

      <div className="yl-roleFooter">
        <span>比赛演示版本</span>
        <span>·</span>
        <span>本地优先</span>
        <span>·</span>
        <span>数据可导出/删除</span>
      </div>
    </div>
  );
}
