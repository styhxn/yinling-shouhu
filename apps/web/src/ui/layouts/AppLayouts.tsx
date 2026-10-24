import React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { useAuth } from "../state/auth.js";

function Brand({ home }: { home: string }) {
  return (
    <Link to={home} className="yl-brand">
      <span className="yl-brandMark" />
      <span className="yl-brandText">
        <strong>银龄守护</strong>
        <small>会倾听，也会守护</small>
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
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.add("mode-elder");
    root.style.setProperty("--fontScale", "1.18");
    return () => {
      root.classList.remove("mode-elder");
      root.style.removeProperty("--fontScale");
    };
  }, []);

  return (
    <div className="yl-shell">
      <header className="yl-topbar">
        <Brand home="/elder" />
        <nav className="yl-nav">
          <NavItem to="/elder" icon="home">首页</NavItem>
          <NavItem to="/elder/chat" icon="message">说说话</NavItem>
          <NavItem to="/elder/story" icon="bookOpen">我的故事</NavItem>
          <NavItem to="/elder/safety/scam" icon="shieldCheck">反诈</NavItem>
        </nav>
        <Identity label="长者端" />
      </header>
      <main className="yl-main">
        <Outlet />
      </main>
    </div>
  );
}

export function FamilyLayout() {
  return (
    <div className="yl-shell">
      <header className="yl-topbar">
        <Brand home="/family" />
        <nav className="yl-nav">
          <NavItem to="/family" icon="users">家属概览</NavItem>
        </nav>
        <Identity label="家属端" />
      </header>
      <main className="yl-main">
        <Outlet />
      </main>
    </div>
  );
}
