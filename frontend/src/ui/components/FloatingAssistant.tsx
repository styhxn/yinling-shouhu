import React from "react";
import { ChatPanel } from "./ChatPanel.js";
import { stopSpeaking, isTtsSupported, unlockTtsInGesture, announce, setTtsEnabled } from "../voice/tts.js";
import "./assistant.css";

/* 打开时的语音问候（每次随机、尽量不重复，并区分白天/夜晚） */
const GREETINGS_DAY = [
  "您好呀，我是茉莉，今天天气不错，出门走走记得多穿一件衣服哦。",
  "您来啦，今天阳光挺好，记得多喝水，照顾好自己。",
  "早上好，我是您的茉莉小助手，今天也要开开心心的。",
  "中午好呀，您吃饭了吗？天气凉了，注意别着凉。",
  "您好，今天的风有点大，出门记得戴好帽子和围巾。",
  "我是茉莉，今天天气干爽，适合晒晒太阳、散散步。",
  "您来啦，今天心情怎么样？有什么想聊的，尽管跟我说。"
];
const GREETINGS_NIGHT = [
  "晚上好，我是茉莉，今天辛苦啦，早点休息别熬夜哦。",
  "夜深了，您还没睡呀？记得喝杯温水，注意保暖。",
  "您好，晚上外面凉，记得关好门窗，照顾好自己。",
  "我是您的茉莉小助手，今天过得还好吗？早点休息吧。",
  "晚上好，今天也辛苦了，明天天气不错，咱们明天见。"
];

function pickGreeting(lastRef: React.MutableRefObject<number | null>): string {
  const h = new Date().getHours();
  const pool = h >= 5 && h < 18 ? GREETINGS_DAY : GREETINGS_NIGHT;
  let idx = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && idx === lastRef.current) {
    idx = (idx + 1) % pool.length;
  }
  lastRef.current = idx;
  return pool[idx] ?? "您好呀，我是茉莉，有什么可以帮您？";
}

const STORAGE_KEY = "yl-jasmine-pos";
const MUTE_KEY = "yl-jasmine-muted";
const BADGE = 76;

/* 水韵江苏 · 拟人态茉莉花形象（动漫风）
 * 白色花瓣组成的小花脸 + 大眼睛腮红微笑 + 水波涟漪 + 露珠 + 星光 */
function JasmineMascot() {
  const petals = [0, 72, 144, 216, 288];
  return (
    <svg
      className="yl-jasmineSvg"
      viewBox="0 0 120 120"
      role="img"
      aria-label="茉莉小助手"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="jPetal" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#fff6fa" />
          <stop offset="100%" stopColor="#fbe3ee" />
        </radialGradient>
        <radialGradient id="jCenter" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#fff0b8" />
          <stop offset="100%" stopColor="#ffcf5c" />
        </radialGradient>
        <linearGradient id="jLeaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#86d9ad" />
          <stop offset="100%" stopColor="#2faf7e" />
        </linearGradient>
        <radialGradient id="jHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#bfe9f5" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#bfe9f5" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 柔光底 */}
      <circle className="yl-jasmineHalo" cx="60" cy="58" r="54" fill="url(#jHalo)" />

      {/* 水波涟漪（水韵江苏） */}
      <g className="yl-jasmineRipples" fill="none" stroke="#7fc9e3" strokeWidth="2">
        <ellipse className="yl-jasmineRipple yl-jasmineRipple--1" cx="60" cy="104" rx="30" ry="7" />
        <ellipse className="yl-jasmineRipple yl-jasmineRipple--2" cx="60" cy="104" rx="30" ry="7" />
      </g>

      {/* 叶片 */}
      <path
        className="yl-jasmineLeaf"
        d="M58 92 C 44 96, 34 104, 30 112 C 42 110, 54 104, 60 94 Z"
        fill="url(#jLeaf)"
      />
      <path
        className="yl-jasmineLeaf"
        d="M62 92 C 76 96, 86 104, 90 112 C 78 110, 66 104, 60 94 Z"
        fill="url(#jLeaf)"
      />

      {/* 花瓣 */}
      <g className="yl-jasminePetals">
        {petals.map((deg) => (
          <ellipse
            key={deg}
            cx="60"
            cy="36"
            rx="15"
            ry="27"
            fill="url(#jPetal)"
            stroke="#f4d8e4"
            strokeWidth="1.2"
            transform={`rotate(${deg} 60 60)`}
          />
        ))}
      </g>

      {/* 花心 */}
      <circle cx="60" cy="60" r="14" fill="url(#jCenter)" />
      <g fill="#e8a33d" opacity="0.85">
        <circle cx="60" cy="52" r="1.6" />
        <circle cx="67" cy="56" r="1.6" />
        <circle cx="65" cy="65" r="1.6" />
        <circle cx="55" cy="65" r="1.6" />
        <circle cx="53" cy="56" r="1.6" />
      </g>

      {/* 脸：大眼睛 + 腮红 + 微笑 */}
      <g className="yl-jasmineFace">
        <g className="yl-jasmineEyes">
          <ellipse cx="52" cy="59" rx="3.6" ry="4.6" fill="#4a3b52" />
          <ellipse cx="68" cy="59" rx="3.6" ry="4.6" fill="#4a3b52" />
          <circle cx="53.2" cy="57.4" r="1.3" fill="#ffffff" />
          <circle cx="69.2" cy="57.4" r="1.3" fill="#ffffff" />
        </g>
        <ellipse cx="46.5" cy="66" rx="4" ry="2.4" fill="#ffb3c4" opacity="0.85" />
        <ellipse cx="73.5" cy="66" rx="4" ry="2.4" fill="#ffb3c4" opacity="0.85" />
        <path
          d="M54 67 Q60 73 66 67"
          fill="none"
          stroke="#4a3b52"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </g>

      {/* 露珠（水韵） */}
      <g className="yl-jasmineDrop">
        <path d="M86 30 C 90 38, 90 44, 86 46 C 82 44, 82 38, 86 30 Z" fill="#bfe9f5" opacity="0.9" />
        <circle cx="84.6" cy="40" r="1.1" fill="#ffffff" opacity="0.9" />
      </g>

      {/* 星光 */}
      <path className="yl-jasmineSparkle yl-jasmineSparkle--a" d="M28 26 L30 32 L36 34 L30 36 L28 42 L26 36 L20 34 L26 32 Z" fill="#fff3b0" />
      <path className="yl-jasmineSparkle yl-jasmineSparkle--b" d="M94 58 L95.6 63 L100.6 64.6 L95.6 66.2 L94 71.2 L92.4 66.2 L87.4 64.6 L92.4 63 Z" fill="#ffe27a" />
    </svg>
  );
}

export function FloatingAssistant() {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = React.useState(false);
  const [showHint, setShowHint] = React.useState(false);
  const [muted, setMuted] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const badgeRef = React.useRef<HTMLButtonElement>(null);
  const drag = React.useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const lastGreetingRef = React.useRef<number | null>(null);

  // 初始位置：右下角
  React.useEffect(() => {
    if (pos) return;
    const saved = (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const p = JSON.parse(raw) as { x: number; y: number };
          if (Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
        }
      } catch {
        /* ignore */
      }
      return null;
    })();
    const w = window.innerWidth;
    const h = window.innerHeight;
    setPos(saved ?? { x: w - BADGE - 20, y: h - BADGE - 96 });
  }, [pos]);

  // 首次进入的问候气泡
  React.useEffect(() => {
    const t1 = window.setTimeout(() => setShowHint(true), 1200);
    const t2 = window.setTimeout(() => setShowHint(false), 9000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  React.useEffect(() => {
    if (open) setShowHint(false);
  }, [open]);

  // 静音开关：同步到语音引擎总开关并持久化
  React.useEffect(() => {
    setTtsEnabled(!muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [muted]);

  // 打开时语音播报（每次随机、尽量不重复，受静音开关控制）；关闭时停止播报
  React.useEffect(() => {
    if (open) {
      if (isTtsSupported()) announce(pickGreeting(lastGreetingRef));
    } else {
      stopSpeaking();
    }
  }, [open]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!badgeRef.current) return;
    // 在用户手势内预热语音引擎，兼容 iOS / Safari 自动播放策略
    unlockTtsInGesture();
    const rect = badgeRef.current.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top, moved: false };
    badgeRef.current.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || !badgeRef.current) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    const w = badgeRef.current.offsetWidth;
    const h = badgeRef.current.offsetHeight;
    const nx = Math.max(8, Math.min(window.innerWidth - w - 8, d.ox + dx));
    const ny = Math.max(8, Math.min(window.innerHeight - h - 8, d.oy + dy));
    setPos({ x: nx, y: ny });
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setOpen((o) => !o);
    } else {
      // 拖动结束，记忆位置
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
          } catch {
            /* ignore */
          }
        }
        return p;
      });
    }
  }

  // 聊天面板以居中模态呈现，确保完整显示
  if (!pos) return null;

  return (
    <>
      {open && (
        <div
          className="yl-jasmineOverlay"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="yl-jasmineCard" role="dialog" aria-label="小助手对话" aria-modal="true">
            <ChatPanel
              variant="float"
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}

      <button
        ref={badgeRef}
        type="button"
        className={`yl-jasmineFab ${open ? "is-open" : ""}`}
        style={{ left: pos.x, top: pos.y, width: BADGE, height: BADGE }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label={open ? "收起小助手" : "打开小助手（茉莉）"}
        aria-pressed={open}
      >
        <span className="yl-jasmineFab__ring" />
        <span className="yl-jasmineFab__mascot">
          <JasmineMascot />
        </span>
        {showHint && !open && (
          <span className="yl-jasmineHint" role="status">
            您好呀～我是茉莉，有什么可以帮您？
          </span>
        )}
      </button>
    </>
  );
}
