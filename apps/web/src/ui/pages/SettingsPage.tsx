import React from "react";
import { Link } from "react-router-dom";
import { useApi } from "../state/api.js";
import { DefaultPrivacySettings } from "@eha/shared";
import type { PrivacySettings, Profile, UserAddress } from "@eha/shared";
import { AvatarUpload } from "../components/AvatarUpload.js";

export function SettingsPage() {
  const api = useApi();
  const [settings, setSettings] = React.useState<PrivacySettings>(DefaultPrivacySettings);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [addrInput, setAddrInput] = React.useState("");
  const [addrBusy, setAddrBusy] = React.useState(false);
  const [addrError, setAddrError] = React.useState<string | null>(null);
  const baseProfile: Profile = { displayName: "用户", gender: "other", age: 30 };

  React.useEffect(() => {
    api
      .getPrivacy()
      .then((s) => setSettings(s))
      .catch(() => setError("读取隐私设置失败"));
  }, [api]);

  React.useEffect(() => {
    api
      .getProfile()
      .then((p) => setProfile(p ?? baseProfile))
      .catch(() => setProfile(baseProfile));
  }, [api]);

  function genId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `addr_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  const addresses = profile?.addresses ?? [];
  const defaultAddressId = profile?.defaultAddressId ?? "";
  const defaultAddress = addresses.find((a) => a.id === defaultAddressId) ?? null;
  const defaultText = defaultAddress?.fullText || [defaultAddress?.province, defaultAddress?.city, defaultAddress?.district, defaultAddress?.detail].filter((x) => x).join("");

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">隐私与设置</h1>
        <div className="muted">
          默认本地存储。云端同步需要用户手动开启。摄像头/麦克风可被休眠策略自动关闭以保护隐私。
        </div>
      </div>

      <div className="panel">
        <h2 className="h1" style={{ fontSize: 18 }}>个人基本信息</h2>
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "center", padding: "10px 0" }}>
            <AvatarUpload
              currentAvatar={profile?.avatarUrl ? `${api.baseUrl}${profile.avatarUrl}` : undefined}
              onSuccess={(url) => {
                if (profile) setProfile({ ...profile, avatarUrl: url });
              }}
            />
          </div>
          <div className="row">
            <div className="pill" style={{ flex: 1 }}>
              <div className="pillLabel">昵称</div>
              <input
                className="input"
                value={profile?.displayName ?? ""}
                onChange={(e) => profile && setProfile({ ...profile, displayName: e.target.value })}
                placeholder="请输入昵称"
              />
            </div>
            <div className="pill" style={{ flex: 1 }}>
              <div className="pillLabel">性别</div>
              <select
                className="input"
                value={profile?.gender ?? "other"}
                onChange={(e) =>
                  profile && setProfile({ ...profile, gender: e.target.value as Profile["gender"] })
                }
              >
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 className="h1" style={{ fontSize: 18 }}>默认地址（用于天气查询）</h2>
        <div className="muted" style={{ marginTop: 6 }}>
          当前默认：{defaultText ? defaultText : "未设置"}
        </div>
        {addrError ? <div className="muted" style={{ marginTop: 8 }}>{addrError}</div> : null}
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 260 }}
            value={addrInput}
            onChange={(e) => setAddrInput(e.target.value)}
            placeholder="输入地址，例如：深圳市南山区科技园"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              (e.currentTarget.nextSibling as any)?.click?.();
            }}
          />
          <button
            className="btn btnPrimary"
            disabled={addrBusy}
            onClick={async () => {
              const raw = addrInput.trim();
              if (!raw) {
                setAddrError("请先输入地址");
                return;
              }
              setAddrBusy(true);
              setAddrError(null);
              try {
                const resolved = await api.resolveWeatherAddress(raw);
                const loc = resolved.location;
                const fullText = resolved.fullText || raw;
                const next: UserAddress = {
                  id: genId(),
                  label: "默认地址",
                  province: loc.province,
                  city: loc.city,
                  district: loc.district,
                  detail: loc.detail,
                  fullText
                };
                const current = profile ?? baseProfile;
                const existing = (current.addresses ?? []).find((a) => (a.fullText || "") === fullText);
                const addressesNext = existing ? current.addresses ?? [] : [...(current.addresses ?? []), next];
                const defaultId = existing ? existing.id : next.id;
                const saved = await api.setProfile({ ...current, addresses: addressesNext, defaultAddressId: defaultId });
                setProfile(saved);
              } catch (err) {
                setAddrError(err instanceof Error ? err.message : "地址解析失败");
              } finally {
                setAddrBusy(false);
              }
            }}
          >
            {addrBusy ? "保存中…" : "添加并设为默认"}
          </button>
          <Link to="/addresses" className="btn">
            地址管理
          </Link>
        </div>
      </div>

      <div className="panel">
        {error ? <div className="muted">{error}</div> : null}
        <div className="stack">
          <Toggle
            label="允许摄像头"
            checked={settings.cameraEnabled}
            onChange={(v) => setSettings((p: PrivacySettings) => ({ ...p, cameraEnabled: v }))}
          />
          <Toggle
            label="允许麦克风"
            checked={settings.microphoneEnabled}
            onChange={(v) => setSettings((p: PrivacySettings) => ({ ...p, microphoneEnabled: v }))}
          />
          <Toggle
            label="开启云端同步（可选）"
            checked={settings.cloudSyncEnabled}
            onChange={(v) => setSettings((p: PrivacySettings) => ({ ...p, cloudSyncEnabled: v }))}
          />
          <Toggle
            label="允许导出报告"
            checked={settings.allowDataExport}
            onChange={(v) => setSettings((p: PrivacySettings) => ({ ...p, allowDataExport: v }))}
          />

          <div className="row">
            <div className="pill">
              <div className="pillLabel">无操作休眠(秒)</div>
              <div className="row">
                <button
                  className="btn"
                  onClick={() =>
                    setSettings((p: PrivacySettings) => ({
                      ...p,
                      autoSleepSeconds: Math.max(10, p.autoSleepSeconds - 30)
                    }))
                  }
                >
                  -
                </button>
                <div className="pillValue">{settings.autoSleepSeconds}</div>
                <button
                  className="btn"
                  onClick={() =>
                    setSettings((p: PrivacySettings) => ({
                      ...p,
                      autoSleepSeconds: Math.min(21600, p.autoSleepSeconds + 30)
                    }))
                  }
                >
                  +
                </button>
              </div>
            </div>
            <button
              className="btn btnPrimary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const saved = await api.setPrivacy(settings);
                  setSettings(saved);
                } catch {
                  setError("保存失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              保存
            </button>
          </div>

          <div className="panel" style={{ marginTop: 20 }}>
            <h2 className="h1" style={{ fontSize: 18 }}>第三方绑定</h2>
            <div className="row">
              <Link to="/settings/alipay-bind" className="btn">
                绑定支付宝设备
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="row">
      <div className="pill" style={{ flex: 1, justifyContent: "space-between" }}>
        <div className="pillValue">{label}</div>
        <button className={["btn", checked ? "btnPrimary" : ""].join(" ")} onClick={() => onChange(!checked)}>
          {checked ? "已开启" : "已关闭"}
        </button>
      </div>
    </div>
  );
}
