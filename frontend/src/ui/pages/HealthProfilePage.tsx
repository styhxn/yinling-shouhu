import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import { useToast } from "../state/toast.js";
import "./care.css";

const CONDITIONS = ["高血压", "2型糖尿病", "高血脂", "痛风", "慢性肾病", "冠心病", "骨质疏松"];

function splitTags(text: string) {
  return text
    .split(/[、,，;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function HealthProfilePage() {
  const toast = useToast();
  const nav = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [conditions, setConditions] = React.useState<string[]>([]);
  const [customCondition, setCustomCondition] = React.useState("");
  const [allergies, setAllergies] = React.useState("");
  const [dietNotes, setDietNotes] = React.useState("");
  const [homeAddress, setHomeAddress] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    api.healthProfile
      .get()
      .then((res) => {
        if (!alive) return;
        const profile = res.profile;
        const known = profile.conditions.filter((item) => CONDITIONS.includes(item));
        const custom = profile.conditions.filter((item) => !CONDITIONS.includes(item));
        setConditions(known);
        setCustomCondition(custom.join("、"));
        setAllergies(profile.allergies.join("、"));
        setDietNotes(profile.dietNotes ?? "");
        setHomeAddress(profile.homeAddress ?? "");
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "健康档案读取失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function toggleCondition(item: string) {
    setConditions((prev) =>
      prev.includes(item) ? prev.filter((value) => value !== item) : [...prev, item]
    );
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const merged = Array.from(new Set([...conditions, ...splitTags(customCondition)]));
      await api.healthProfile.update({
        conditions: merged,
        allergies: splitTags(allergies),
        dietNotes: dietNotes.trim() || null,
        homeAddress: homeAddress.trim() || null
      });
      toast.push({
        kind: "ok",
        title: "健康档案已保存",
        detail: "饮食建议和用药提醒会按新档案调整。"
      });
      nav("/family");
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败，请稍后再试";
      setError(message);
      toast.push({ kind: "danger", title: "保存失败", detail: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="yl-page ys-healthProfile">
      <section className="ys-pageHeader">
        <div>
          <p className="ys-kicker">家人照护 · 健康档案</p>
          <h1>先把身体情况记清楚</h1>
          <p>AI 的饮食建议和用药提醒会参考这里。信息只用于照护，不对外公开。</p>
        </div>
        <Link to="/family" className="btn">返回概览</Link>
      </section>

      {loading ? (
        <p className="ys-mutedText">正在读取健康档案…</p>
      ) : (
        <section className="ys-healthCard">
          <div className="ys-healthField">
            <span className="ys-kicker">慢病情况</span>
            <div className="ys-healthChips">
              {CONDITIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={conditions.includes(item) ? "ys-healthChip is-on" : "ys-healthChip"}
                  aria-pressed={conditions.includes(item)}
                  onClick={() => toggleCondition(item)}
                >
                  {conditions.includes(item) && <Icon name="check" size="sm" />}
                  {item}
                </button>
              ))}
            </div>
            <input
              className="input"
              value={customCondition}
              onChange={(event) => setCustomCondition(event.target.value)}
              placeholder="其他情况，用顿号分隔，例如：青光眼、帕金森"
            />
          </div>

          <div className="ys-healthField">
            <label className="ys-kicker" htmlFor="allergies">食物或药物过敏</label>
            <input
              id="allergies"
              className="input"
              value={allergies}
              onChange={(event) => setAllergies(event.target.value)}
              placeholder="例如：海鲜、青霉素；没有就留空"
            />
          </div>

          <div className="ys-healthField">
            <label className="ys-kicker" htmlFor="dietNotes">医生交代的饮食要求</label>
            <textarea
              id="dietNotes"
              className="ys-healthTextarea"
              value={dietNotes}
              onChange={(event) => setDietNotes(event.target.value)}
              placeholder="例如：少盐少油、主食适量、晚饭七分饱"
              rows={3}
            />
          </div>

          <div className="ys-healthField">
            <label className="ys-kicker" htmlFor="homeAddress">家庭地址（走失求助时使用）</label>
            <input
              id="homeAddress"
              className="input"
              value={homeAddress}
              onChange={(event) => setHomeAddress(event.target.value)}
              placeholder="例如：南京市鼓楼区湖南路街道 3 号院 2 栋"
            />
          </div>

          {error && (
            <div className="yl-errorBar">
              <Icon name="alertCircle" size="sm" />
              <span>{error}</span>
            </div>
          )}

          <div className="ys-healthActions">
            <button type="button" className="btn btnPrimary" disabled={saving} onClick={() => void save()}>
              {saving ? "保存中…" : "保存健康档案"}
            </button>
            <span className="ys-finePrint">
              修改后，长辈端的饮食建议会在下次打开时重新生成。
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
