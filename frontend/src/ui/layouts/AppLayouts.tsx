import React from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { useAuth } from "../state/auth.js";
import { RealtimeBadge } from "../state/realtime.js";

function Brand({ home }: { home: string }) {
  return (
    <Link to={home} className="yl-brand">
      <span className="yl-brandMark" />
      <span className="yl-brandText">
        <strong>银龄守护</strong>
        <small>水韵江苏</small>
      </span>
    </Link>
  );
}

function Identity({ label }: { label: string }) {
  const { me, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="yl-identity">
      <span className="yl-rolePill">{label}</span>
      <span className="yl-userName">{me?.user.displayName ?? "用户"}</span>
      <button
        type="button"
        className="yl-switchBtn"
        onClick={async () => {
          await logout();
          nav("/");
        }}
      >
        <Icon name="logOut" size="sm" />
        切换身份
      </button>
    </div>
  );
}

const RELATION_LABELS: Record<string, string> = {
  daughter: "女儿",
  son: "儿子",
  spouse: "配偶",
  grandchild: "孙辈",
  relative: "亲属",
  caregiver: "照护者",
  other: "家人"
};

function ElderSwitcher() {
  const { me, switchElder } = useAuth();
  const nav = useNavigate();
  if (me?.user.role !== "family") return null;
  const links = me.familyLinks ?? [];
  if (links.length === 0) {
    return (
      <Link to="/family/elders/new" className="yl-elderSwitch yl-elderSwitch--empty">
        <Icon name="plus" size="sm" />
        添加长辈
      </Link>
    );
  }
  const active = me.user.elderId ?? links[0]?.elderId ?? "";
  return (
    <div className="yl-elderSwitch">
      <span className="yl-elderSwitchLabel">当前长辈</span>
      <select
        aria-label="切换当前长辈"
        value={active}
        onChange={async (event) => {
          try {
            await switchElder(event.target.value);
            nav("/family", { replace: true });
            window.location.reload();
          } catch {
            window.location.reload();
          }
        }}
      >
        {links.map((link) => (
          <option key={link.elderId} value={link.elderId}>
            {link.elderName}
            {link.relation ? ` · ${RELATION_LABELS[link.relation] ?? link.relation}` : ""}
          </option>
        ))}
      </select>
      <Link to="/family/invite" className="yl-elderSwitchAdd">
        绑定码
      </Link>
      <Link to="/family/elders/new" className="yl-elderSwitchAdd">
        <Icon name="plus" size="sm" />
        添加
      </Link>
    </div>
  );
}

function NavItem({ to, icon, children }: { to: string; icon: React.ComponentProps<typeof Icon>["name"]; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/elder" || to === "/family"}
      className={({ isActive }) => (isActive ? "yl-navLink yl-navLink--active" : "yl-navLink")}
    >
      <Icon name={icon} size="sm" />
      {children}
    </NavLink>
  );
}

export function ElderLayout() {
  const { pathname } = useLocation();
  const bare = pathname === "/elder";

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add("mode-elder");
    root.style.setProperty("--fontScale", "1.18");
    return () => {
      root.classList.remove("mode-elder");
      root.style.removeProperty("--fontScale");
    };
  }, []);

  if (bare) {
    return (
      <div className="ys-kioskShell">
        <a className="yl-skipLink" href="#main">
          跳到主要内容
        </a>
        <Outlet />
      </div>
    );
  }

  return (
    <div className="yl-shell">
      <a className="yl-skipLink" href="#main">
        跳到主要内容
      </a>
      <header className="yl-topbar">
        <Brand home="/elder" />
        <nav className="yl-nav">
          <NavItem to="/elder" icon="home">今日</NavItem>
          <NavItem to="/elder/story" icon="bookOpen">故事</NavItem>
          <NavItem to="/elder/meds" icon="pill">健康</NavItem>
          <NavItem to="/elder/safety" icon="shieldCheck">守护</NavItem>
          <NavItem to="/elder/chat" icon="message">问助手</NavItem>
        </nav>
        <RealtimeBadge />
        <Identity label="长辈端" />
      </header>
      <main className="yl-main" id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

export function FamilyLayout() {
  return (
    <div className="yl-shell">
      <a className="yl-skipLink" href="#main">
        跳到主要内容
      </a>
      <header className="yl-topbar">
        <Brand home="/family" />
        <nav className="yl-nav">
          <NavItem to="/family" icon="users">家人概览</NavItem>
        </nav>
        <ElderSwitcher />
        <RealtimeBadge />
        <Identity label="家人端" />
      </header>
      <main className="yl-main" id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
