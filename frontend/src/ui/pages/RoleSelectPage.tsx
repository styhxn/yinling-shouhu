import React from "react";
import { useNavigate } from "react-router-dom";
import heroUrl from "../assets/jiangsu-hero.webp";
import { Icon } from "../components/Icon.js";
import { homeForRole, useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";
import type { Role } from "../../lib/types.js";

const ROLES: Array<{
  role: Role;
  title: string;
  desc: string;
  disabled?: boolean;
}> = [
  { role: "elder", title: "长者", desc: "看故事、记健康、找家人" },
  { role: "family", title: "家属", desc: "看照护简报、处理确认" },
  { role: "institution", title: "机构", desc: "知识与运营后台（即将开放）", disabled: true }
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
    <div className="ys-rolePage">
      <div className="ys-rolePanel">
        <section className="ys-roleIntro">
          <span className="ys-seal">水韵江苏</span>
          <h1 className="ys-roleTitle">银龄守护</h1>
          <p className="ys-roleSubtitle">记忆、健康、安全，都在一处。</p>
          <p className="ys-roleLine">
            给长辈的日常照护，也给家人的一份安心。
          </p>

          <div className="ys-roleList">
            {ROLES.map((item) => (
              <button
                key={item.role}
                type="button"
                className="ys-roleRow"
                disabled={item.disabled || busy !== null}
                onClick={() => void enter(item.role)}
              >
                <span className="ys-roleRowTitle">{item.title}</span>
                <span className="ys-roleRowDesc">
                  {busy === item.role ? "正在进入…" : item.desc}
                </span>
                <span className="ys-roleArrow">
                  <Icon name="arrowRight" size="sm" />
                </span>
              </button>
            ))}
          </div>

          {me && (
            <div className="ys-currentIdentity">
              当前身份：{me.user.displayName}
              <button
                type="button"
                className="ys-textLink"
                onClick={() => nav(homeForRole(me.user.role))}
              >
                继续
              </button>
            </div>
          )}

          <div className="ys-roleFooter">
            <span>比赛演示版本</span>
            <span>数据均为虚构</span>
          </div>
        </section>

        <figure className="ys-roleMedia">
          <img src={heroUrl} alt="江南水乡清晨，石桥与河道" className="ys-roleImage" />
          <figcaption className="ys-roleCaption">水韵江苏 · 苏州水巷</figcaption>
        </figure>
      </div>
    </div>
  );
}
