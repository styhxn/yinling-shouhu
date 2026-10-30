import React from "react";
import { useNavigate } from "react-router-dom";
import heroUrl from "../assets/jiangsu-hero.webp";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import { homeForRole, useAuth } from "../state/auth.js";
import { useToast } from "../state/toast.js";
import type { Role } from "../../lib/types.js";

const ENTRIES: Array<{
  key: "family" | "elder";
  title: string;
  desc: string;
  to: string;
  icon: React.ComponentProps<typeof Icon>["name"];
}> = [
  {
    key: "family",
    title: "家人",
    desc: "手机号登录，绑定长辈、看照护简报与确认",
    to: "/login/family",
    icon: "users"
  },
  {
    key: "elder",
    title: "长辈",
    desc: "用家人给的 6 位绑定码进入，不用记账号",
    to: "/login/elder",
    icon: "heart"
  }
];

export function RoleSelectPage() {
  const { me, login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = React.useState<Role | null>(null);
  const [demoMode, setDemoMode] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    api.auth
      .meta()
      .then((meta) => {
        if (alive) setDemoMode(meta.demoMode);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function enterDemo(role: Role) {
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
          <p className="ys-roleLine">给长辈的日常照护，也给家人的一份安心。</p>

          <div className="ys-roleList">
            {ENTRIES.map((item) => (
              <button
                key={item.key}
                type="button"
                className="ys-roleRow"
                onClick={() => nav(item.to)}
              >
                <span className="ys-roleRowIcon">
                  <Icon name={item.icon} size="sm" />
                </span>
                <span className="ys-roleRowBody">
                  <span className="ys-roleRowTitle">{item.title}</span>
                  <span className="ys-roleRowDesc">{item.desc}</span>
                </span>
                <span className="ys-roleArrow">
                  <Icon name="arrowRight" size="sm" />
                </span>
              </button>
            ))}
            <button type="button" className="ys-roleRow" disabled>
              <span className="ys-roleRowIcon">
                <Icon name="shield" size="sm" />
              </span>
              <span className="ys-roleRowBody">
                <span className="ys-roleRowTitle">机构</span>
                <span className="ys-roleRowDesc">知识与运营后台（即将开放）</span>
              </span>
            </button>
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

          {demoMode && (
            <div className="ys-demoEntry">
              <span>演示入口</span>
              <button type="button" disabled={busy !== null} onClick={() => void enterDemo("elder")}>
                长辈演示
              </button>
              <button type="button" disabled={busy !== null} onClick={() => void enterDemo("family")}>
                家人演示
              </button>
            </div>
          )}
        </section>

        <figure className="ys-roleMedia">
          <img src={heroUrl} alt="江南水乡清晨，石桥与河道" className="ys-roleImage" />
          <figcaption className="ys-roleCaption">水韵江苏 · 苏州水巷</figcaption>
        </figure>
      </div>
    </div>
  );
}
