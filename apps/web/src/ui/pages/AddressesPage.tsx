import React from "react";
import type { Profile, UserAddress } from "@eha/shared";
import { useApi } from "../state/api.js";

function normalizePart(input: string, maxLen: number) {
  const cleaned = input.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

function buildFullText(a: Pick<UserAddress, "province" | "city" | "district" | "detail">) {
  const province = normalizePart(a.province ?? "", 32);
  const city = normalizePart(a.city ?? "", 32);
  const district = normalizePart(a.district ?? "", 32);
  const detail = normalizePart(a.detail ?? "", 80);
  const parts = [province, city, district, detail].filter((x) => x);
  return parts.join("");
}

function isAddressComplete(a: UserAddress) {
  return Boolean(normalizePart(a.province ?? "", 32) && normalizePart(a.city ?? "", 32) && normalizePart(a.district ?? "", 32));
}

function genId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `addr_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function AddressesPage() {
  const api = useApi();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const baseProfile: Profile = { displayName: "用户", gender: "other", age: 30 };

  const saveTimerRef = React.useRef<number | null>(null);
  const skipFirstSaveRef = React.useRef(true);

  React.useEffect(() => {
    api
      .getProfile()
      .then((p) => setProfile(p ?? baseProfile))
      .catch(() => setError("读取用户信息失败"));
  }, [api]);

  const addresses = profile?.addresses ?? [];
  const defaultAddressId = profile?.defaultAddressId ?? "";
  const hasIncomplete = addresses.some((a) => !isAddressComplete(a));

  function patchProfile(patch: (p: Profile) => Profile) {
    setProfile((prev) => {
      const base = prev ?? baseProfile;
      return patch(base);
    });
  }

  function scheduleSave(next: Profile) {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      if (skipFirstSaveRef.current) {
        skipFirstSaveRef.current = false;
        return;
      }
      const list = next.addresses ?? [];
      if (list.some((a) => !isAddressComplete(a))) return;
      setBusy(true);
      setError(null);
      try {
        const saved = await api.setProfile(next);
        setProfile(saved);
      } catch {
        setError("保存失败（请检查后端连接）");
      } finally {
        setBusy(false);
      }
    }, 400);
  }

  async function saveNow(next: Profile) {
    const list = next.addresses ?? [];
    if (list.some((a) => !isAddressComplete(a))) {
      setError("地址信息未填写完整（省/市/区），暂无法保存。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await api.setProfile(next);
      setProfile(saved);
    } catch {
      setError("保存失败（请检查后端连接）");
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    if (!profile) return;
    scheduleSave(profile);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [profile?.addresses, profile?.defaultAddressId]);

  function addAddress() {
    const addr: UserAddress = {
      id: genId(),
      label: "家",
      province: "",
      city: "",
      district: "",
      detail: ""
    };

    patchProfile((p) => {
      const next = { ...p, addresses: [...(p.addresses ?? []), addr] };
      return next;
    });
  }

  function removeAddress(id: string) {
    patchProfile((p) => {
      const nextAddresses = (p.addresses ?? []).filter((a) => a.id !== id);
      const next: Profile = { ...p, addresses: nextAddresses };
      if (p.defaultAddressId === id) next.defaultAddressId = nextAddresses[0]?.id;
      return next;
    });
  }

  function updateAddress(id: string, patch: Partial<UserAddress>) {
    patchProfile((p) => ({
      ...p,
      addresses: (p.addresses ?? []).map((a) => {
        if (a.id !== id) return a;
        const next = { ...a, ...patch };
        next.province = normalizePart(next.province ?? "", 32);
        next.city = normalizePart(next.city ?? "", 32);
        next.district = normalizePart(next.district ?? "", 32);
        next.detail = normalizePart(next.detail ?? "", 80);
        next.fullText = buildFullText(next);
        return next;
      })
    }));
  }

  return (
    <div className="stack">
      <div className="panel">
        <h1 className="h1">地址管理</h1>
        <div className="muted">已加密本地保存。默认地址会用于天气查询。</div>
      </div>

      {error ? (
        <div className="panel">
          <div className="muted">{error}</div>
        </div>
      ) : null}
      {hasIncomplete ? (
        <div className="panel">
          <div className="muted">存在未填写完整的地址（省/市/区），补全后会自动保存。</div>
        </div>
      ) : null}

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="pill">
            <div className="pillLabel">默认地址</div>
            <div className="pillValue">
              {addresses.find((a) => a.id === defaultAddressId)?.label ?? "未设置"}
            </div>
          </div>
          <button className="btn btnPrimary" disabled={busy} onClick={addAddress}>
            添加地址
          </button>
        </div>
      </div>

      {addresses.length === 0 ? (
        <div className="panel">
          <div className="muted">尚未添加地址。</div>
        </div>
      ) : (
        <div className="stack">
          {addresses.map((a) => {
            const complete = isAddressComplete(a);
            const preview = buildFullText(a);

            return (
              <div key={a.id} className="panel">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <label className="row" style={{ gap: 10 }}>
                    <input
                      type="radio"
                      checked={defaultAddressId === a.id}
                      disabled={!complete || busy}
                      onChange={() =>
                        patchProfile((p) => ({
                          ...p,
                          defaultAddressId: complete ? a.id : p.defaultAddressId
                        }))
                      }
                    />
                    <div className="pillValue">设为默认</div>
                  </label>
                  <button className="btn" disabled={busy} onClick={() => removeAddress(a.id)}>
                    删除
                  </button>
                </div>

                <div className="stack" style={{ gap: 10, marginTop: 10 }}>
                  <div className="pill" style={{ justifyContent: "space-between", width: "100%" }}>
                    <div className="pillLabel">完整地址</div>
                    <div className="pillValue">{preview || "—"}</div>
                  </div>

                  <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div className="pill" style={{ flex: 1, minWidth: 180 }}>
                      <div className="pillLabel">标签</div>
                      <input
                        className="input"
                        value={a.label ?? ""}
                        onChange={(e) => updateAddress(a.id, { label: e.target.value })}
                        placeholder="例如：家/公司"
                      />
                    </div>
                    <div className="pill" style={{ flex: 2, minWidth: 260 }}>
                      <div className="pillLabel">详细地址</div>
                      <input
                        className="input"
                        value={a.detail ?? ""}
                        onChange={(e) => updateAddress(a.id, { detail: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          if (!profile) return;
                          void saveNow(profile);
                        }}
                        placeholder="例如：XX路XX号"
                      />
                    </div>
                  </div>

                  <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div className="pill" style={{ flex: 1, minWidth: 180 }}>
                      <div className="pillLabel">省</div>
                      <input
                        className="input"
                        value={a.province}
                        onChange={(e) => updateAddress(a.id, { province: e.target.value })}
                        placeholder="例如：广东省"
                      />
                    </div>
                    <div className="pill" style={{ flex: 1, minWidth: 180 }}>
                      <div className="pillLabel">市</div>
                      <input
                        className="input"
                        value={a.city}
                        onChange={(e) => updateAddress(a.id, { city: e.target.value })}
                        placeholder="例如：深圳市"
                      />
                    </div>
                    <div className="pill" style={{ flex: 1, minWidth: 180 }}>
                      <div className="pillLabel">区</div>
                      <input
                        className="input"
                        value={a.district}
                        onChange={(e) => updateAddress(a.id, { district: e.target.value })}
                        placeholder="例如：南山区"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
