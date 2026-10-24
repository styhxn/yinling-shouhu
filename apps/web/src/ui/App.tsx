import React from "react";
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Mode, Profile } from "@eha/shared";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { HomePage } from "./pages/HomePage.js";
import { HomeEntryPage } from "./pages/HomeEntryPage.js";
import { MonitorPage } from "./pages/MonitorPage.js";
import { AdvicePage } from "./pages/AdvicePage.js";
import { RemindersPage } from "./pages/RemindersPage.js";
import { EmergencyPage } from "./pages/EmergencyPage.js";
import { RecordsPage } from "./pages/RecordsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { AlipayBindPage } from "./pages/AlipayBindPage.js";
import { QaPage } from "./pages/QaPage.js";
import { AddressesPage } from "./pages/AddressesPage.js";
import { CompanionPage } from "./pages/CompanionPage.js";
import { SmartCompanionPage } from "./pages/SmartCompanionPage.js";
import { DevicesPage } from "./pages/DevicesPage.js";
import { ApiProvider } from "./state/api.js";
import { ModeProvider, useMode } from "./state/mode.js";
import { ToastProvider, useToast } from "./state/toast.js";
import { WsProvider, useWs } from "./state/ws.js";
import { useApi } from "./state/api.js";
import { PrivacyProvider } from "./state/privacy.js";
import { unlockTtsInGesture } from "./voice/tts.js";
import { Icon } from "./components/Icon.js";

function Topbar() {
  const { mode } = useMode();
  const nav = useNavigate();
  const api = useApi();
  const toast = useToast();
  const { lastEvent } = useWs();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const userWrapRef = React.useRef<HTMLDivElement>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const [avatarEditing, setAvatarEditing] = React.useState(false);
  const [avatarSrc, setAvatarSrc] = React.useState<string | null>(null);
  const [avatarCrop, setAvatarCrop] = React.useState<Point>({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = React.useState(1);
  const [avatarCroppedAreaPixels, setAvatarCroppedAreaPixels] = React.useState<Area | null>(null);
  const [avatarUploading, setAvatarUploading] = React.useState(false);

  React.useEffect(() => {
    api
      .getProfile()
      .then((p) => setProfile(p))
      .catch(() => setProfile(null));
  }, [api]);

  React.useEffect(() => {
    if (lastEvent?.type === "profile.updated") {
      setProfile(lastEvent.payload.profile);
    }
  }, [lastEvent]);

  // 菜单打开时，点击菜单外任意处自动关闭
  React.useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && userWrapRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const displayName = profile?.displayName ?? "用户";
  const avatarUrl = profile?.avatarUrl ? `${api.baseUrl}${profile.avatarUrl}` : null;

  const onAvatarCropComplete = React.useCallback((_a: Area, b: Area) => {
    setAvatarCroppedAreaPixels(b);
  }, []);

  async function getCroppedAvatarBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
    const img = new Image();
    img.src = imageSrc;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("读取图片失败"));
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("绘制失败");

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    ctx.drawImage(
      img,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) throw new Error("生成图片失败");
    return blob;
  }

  function openAvatarPicker(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    avatarInputRef.current?.click();
  }

  async function onAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.push({ kind: "danger", title: "文件过大", detail: "图片大小不能超过 5MB" });
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.push({ kind: "danger", title: "格式错误", detail: "支持 JPG/PNG/GIF/WebP" });
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const src = String(reader.result || "");
      if (!src) return;
      setAvatarSrc(src);
      setAvatarCrop({ x: 0, y: 0 });
      setAvatarZoom(1);
      setAvatarEditing(true);
    });
    reader.readAsDataURL(file);
  }

  async function uploadCroppedAvatar() {
    if (!avatarSrc || !avatarCroppedAreaPixels) return;
    setAvatarUploading(true);
    try {
      const blob = await getCroppedAvatarBlob(avatarSrc, avatarCroppedAreaPixels);
      const file = new File([blob], "avatar.webp", { type: "image/webp" });
      const res = await api.uploadAvatar(file);
      const nextProfile = { ...(profile ?? { displayName: "用户", gender: "other", age: 30 }), avatarUrl: res.avatarUrl };
      setProfile(nextProfile);
      toast.push({ kind: "ok", title: "头像已更新" });
      setAvatarEditing(false);
      setAvatarSrc(null);
      setMenuOpen(false);
    } catch (err) {
      toast.push({ kind: "danger", title: "上传失败", detail: err instanceof Error ? err.message : "未知错误" });
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <div className="topbar">
      <div className="brand">
        <div className="userWrap" ref={userWrapRef}>
          <button
            type="button"
            className="userBadge"
            aria-label="用户中心"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span onClick={openAvatarPicker} style={{ display: "inline-flex" }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="头像" className="userAvatar" style={{ objectFit: "cover" }} />
              ) : (
                <div className="userAvatar" />
              )}
            </span>
            <div className="userName">{displayName}</div>
            <Icon name="chevronDown" className="userBadge__arrow" />
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: "none" }}
            onChange={onAvatarFileSelected}
          />
          {menuOpen ? (
            <div className="userMenu" role="menu" aria-label="用户菜单">
              <div className="userMenuHeader">
                <div className="userMenuName">{displayName}</div>
                <button
                  className="btn btn--sm"
                  onClick={async () => {
                    const next = window.prompt("设置昵称", displayName);
                    if (!next || !next.trim()) return;
                    const saved = await api.setProfile({
                      ...(profile ?? { displayName: "用户", gender: "other", age: 30 }),
                      displayName: next.trim()
                    });
                    setProfile(saved);
                    setMenuOpen(false);
                  }}
                >
                  <Icon name="pencil" className="btnIcon" />
                  改昵称
                </button>
              </div>
              <div className="userMenuBody">
                <Link to="/records" className="userMenuItem" onClick={() => setMenuOpen(false)}>
                  <div className="userMenuItem__left">
                    <Icon name="fileText" className="userMenuItem__icon" />
                    活力记录簿
                  </div>
                    <Icon name="chevronRight" className="userMenuItem__arrow" />
                </Link>
                <Link to="/addresses" className="userMenuItem" onClick={() => setMenuOpen(false)}>
                  <div className="userMenuItem__left">
                    <Icon name="mapPin" className="userMenuItem__icon" />
                    地址管理
                  </div>
                    <Icon name="chevronRight" className="userMenuItem__arrow" />
                </Link>
                <Link to="/settings" className="userMenuItem" onClick={() => setMenuOpen(false)}>
                  <div className="userMenuItem__left">
                    <Icon name="settings" className="userMenuItem__icon" />
                    隐私设置
                  </div>
                    <Icon name="chevronRight" className="userMenuItem__arrow" />
                </Link>
              </div>
            </div>
          ) : null}
        </div>
        <div className="brandMark" />
        <div className="brandTitle">
          <strong>智伴银龄</strong>
          <span>具身智能生活陪伴系统</span>
        </div>
      </div>
      {avatarEditing && avatarSrc ? (
        <div
          className="avatarModal"
          onClick={() => {
            if (avatarUploading) return;
            setAvatarEditing(false);
            setAvatarSrc(null);
          }}
        >
          <div
            className="panel avatarModal__content"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="avatarModal__header">
              <div className="avatarModal__title">更换头像</div>
              <button
                className="btn"
                disabled={avatarUploading}
                onClick={() => {
                  setAvatarEditing(false);
                  setAvatarSrc(null);
                }}
              >
                关闭
              </button>
            </div>
            <div className="avatarModal__crop">
              <Cropper
                image={avatarSrc}
                crop={avatarCrop}
                zoom={avatarZoom}
                aspect={1}
                onCropChange={setAvatarCrop}
                onCropComplete={onAvatarCropComplete}
                onZoomChange={setAvatarZoom}
              />
            </div>
            <div className="stack avatarModal__actions">
              <input
                type="range"
                value={avatarZoom}
                min={1}
                max={3}
                step={0.1}
                onChange={(e) => setAvatarZoom(Number(e.target.value))}
              />
              <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
                <button
                  className="btn"
                  disabled={avatarUploading}
                  onClick={() => {
                    setAvatarEditing(false);
                    setAvatarSrc(null);
                  }}
                >
                  取消
                </button>
                <button className="btn btnPrimary" disabled={avatarUploading} onClick={uploadCroppedAvatar}>
                  {avatarUploading ? "正在上传…" : "确认上传"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="topbarActions">
        <button
          className="btn btn--ghost"
          onClick={() => {
            setMenuOpen(false);
            nav("/");
          }}
        >
          <Icon name="home" className="btnIcon" />
          返回首页
        </button>
        <div className="quickLinks">
          <Link to={mode === "child" ? "/home/child" : mode === "adult" ? "/home/adult" : "/home/senior"} className="quickLink">
            <Icon name="home" />
          </Link>
          <Link to="/emergency" className="quickLink quickLink--danger">
            <Icon name="alertTriangle" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ModeGate({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  const m = useMode();
  React.useEffect(() => {
    m.setMode(mode);
  }, [m, mode]);
  return <>{children}</>;
}

function ModeCss() {
  const { mode } = useMode();
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("mode-elder", "mode-adult", "mode-child");

    if (mode === "elder") {
      root.style.setProperty("--fontScale", "1.22");
      root.classList.add("mode-elder");
    }
    if (mode === "adult") {
      root.style.setProperty("--fontScale", "1");
      root.classList.add("mode-adult");
    }
    if (mode === "child") {
      root.style.setProperty("--fontScale", "1.08");
      root.classList.add("mode-child");
    }
  }, [mode]);
  return null;
}

function TtsGestureUnlock() {
  const unlockedRef = React.useRef(false);
  React.useEffect(() => {
    const tryUnlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      unlockTtsInGesture();
      window.removeEventListener("pointerdown", tryUnlock, true);
      window.removeEventListener("keydown", tryUnlock, true);
    };
    window.addEventListener("pointerdown", tryUnlock, true);
    window.addEventListener("keydown", tryUnlock, true);
    return () => {
      window.removeEventListener("pointerdown", tryUnlock, true);
      window.removeEventListener("keydown", tryUnlock, true);
    };
  }, []);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ModeProvider>
        <ModeCss />
        <TtsGestureUnlock />
        <ApiProvider baseUrl="http://127.0.0.1:3100">
          <ToastProvider>
            <PrivacyProvider>
              <WsProvider wsUrl="ws://127.0.0.1:3100/ws">
                <AppShell />
              </WsProvider>
            </PrivacyProvider>
          </ToastProvider>
        </ApiProvider>
      </ModeProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const loc = useLocation();
  const isEntry = loc.pathname === "/";
  return (
    <div className="appShell">
      {isEntry ? <div /> : <Topbar />}
      <div className="main">
        <Routes>
          <Route path="/" element={<HomeEntryPage />} />
          <Route
            path="/home/child"
            element={
              <ModeGate mode="child">
                <HomePage audience="child" />
              </ModeGate>
            }
          />
          <Route
            path="/home/adult"
            element={
              <ModeGate mode="adult">
                <HomePage audience="adult" />
              </ModeGate>
            }
          />
          <Route
            path="/home/senior"
            element={
              <ModeGate mode="elder">
                <HomePage audience="elder" />
              </ModeGate>
            }
          />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/advice" element={<AdvicePage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/qa" element={<QaPage />} />
          <Route path="/emergency" element={<EmergencyPage />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/companion" element={<CompanionPage />} />
          <Route path="/smart-companion" element={<SmartCompanionPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/addresses" element={<AddressesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/alipay-bind" element={<AlipayBindPage />} />
        </Routes>
      </div>
      {isEntry ? null : <FloatingEmergencyButton />}
    </div>
  );
}

function FloatingEmergencyButton() {
  const api = useApi();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [countdown, setCountdown] = React.useState(3);
  const timerRef = React.useRef<number>(0);
  
  const [pos, setPos] = React.useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem("fab.emergency.pos");
      if (!raw) return { x: 18, y: 18 };
      const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
      if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return { x: 18, y: 18 };
      return { x: parsed.x, y: parsed.y };
    } catch {
      return { x: 18, y: 18 };
    }
  });

  const { mode } = useMode();
  const isElder = mode === "elder";
  const btnSize = isElder ? 80 : 68;
  const fontSize = isElder ? 18 : 14;

  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const cancelConfirm = React.useCallback(() => {
    setConfirming(false);
    setCountdown(3);
    window.clearInterval(timerRef.current);
  }, []);

  const trigger = React.useCallback(async () => {
    setBusy(true);
    toast.push({ kind: "danger", title: "正在发送呼救…", detail: "请保持电话畅通" });
    try {
      const res = await api.triggerEmergency("用户点击全局一键呼救按钮");
      try {
        if ("vibrate" in navigator) (navigator as any).vibrate?.([120, 60, 120]);
      } catch {
        undefined;
      }
      toast.push({
        kind: "ok",
        title: "呼救已发送",
        detail: res.profilePresent ? "已通知系统并记录事件" : "未完善个人信息，建议先填写个人信息与紧急联系人"
      });
    } catch (err) {
      toast.push({ kind: "danger", title: "呼救发送失败", detail: err instanceof Error ? err.message : "请求失败" });
    } finally {
      setBusy(false);
    }
  }, [api, toast]);

  React.useEffect(() => {
    if (confirming) {
      setCountdown(3);
      timerRef.current = window.setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            window.clearInterval(timerRef.current);
            setConfirming(false);
            trigger();
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => window.clearInterval(timerRef.current);
  }, [confirming, trigger]);

  return (
    <>
      {confirming && (
        <div className="emergencyOverlay">
          <div className="emergencyDialog">
            <div className="emergencyIcon">
              <Icon name="alertTriangle" />
            </div>
            <div className="emergencyTitle">紧急呼救</div>
            <div className="emergencyCount">{countdown}</div>
            <div className="emergencyDesc">秒后自动发送呼救</div>
            <div className="emergencyActions">
              <button className="btn btnPrimary btn--full" onClick={cancelConfirm}>
                取消
              </button>
              <button className="btn btnDanger btn--full" onClick={() => {
                cancelConfirm();
                trigger();
              }}>
                立即发送
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        className={["fabEmergency", confirming ? "fabEmergencyPulse" : ""].join(" ")}
        disabled={busy}
        style={{ 
            right: pos.x, 
            bottom: pos.y,
            width: btnSize,
            height: btnSize,
            fontSize: fontSize
        }}
        onPointerDown={(e) => {
          if (busy) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originX: pos.x,
            originY: pos.y,
            moved: false
          };
        }}
        onPointerMove={(e) => {
          const st = dragRef.current;
          if (!st || st.pointerId !== e.pointerId) return;
          const dx = e.clientX - st.startX;
          const dy = e.clientY - st.startY;
          if (!st.moved && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) st.moved = true;

          const size = btnSize;
          const margin = 12;
          const maxRight = Math.max(margin, window.innerWidth - size - margin);
          const maxBottom = Math.max(margin, window.innerHeight - size - margin);

          // 定位语义：x=距右缘，y=距底缘（style 用 right/bottom）。
          // 向左拖(dx<0) → 距右缘增大；向下拖(dy>0) → 距底缘减小。
          const next = {
            x: clamp(st.originX - dx, margin, maxRight),
            y: clamp(st.originY - dy, margin, maxBottom)
          };
          setPos(next);
        }}
        onPointerUp={async (e) => {
          const st = dragRef.current;
          if (!st || st.pointerId !== e.pointerId) return;
          dragRef.current = null;

          try {
            localStorage.setItem("fab.emergency.pos", JSON.stringify(pos));
          } catch {
            undefined;
          }

          if (st.moved) return;

          setConfirming(true);
        }}
        aria-label="一键呼救"
      >
        <Icon name="alertTriangle" className="fabIcon" />
        <span>呼救</span>
      </button>
    </>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
