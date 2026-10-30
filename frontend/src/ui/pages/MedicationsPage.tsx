import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { Medication, MedicationLog, MedicationSafety, MedicationScanResult } from "../../lib/types.js";
import { useToast } from "../state/toast.js";
import "./care.css";

type Dose = {
  medication: Medication;
  time: string;
  logged?: MedicationLog;
};

export function MedicationsPage() {
  const toast = useToast();
  const [items, setItems] = React.useState<Medication[]>([]);
  const [logs, setLogs] = React.useState<MedicationLog[]>([]);
  const [due, setDue] = React.useState(0);
  const [taken, setTaken] = React.useState(0);
  const [adherence, setAdherence] = React.useState<number | null>(null);
  const [safety, setSafety] = React.useState<MedicationSafety | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [scan, setScan] = React.useState<MedicationScanResult | null>(null);
  const [scanBusy, setScanBusy] = React.useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.medications.list();
      setItems(res.items);
      setLogs(res.logs);
      setDue(res.dueToday);
      setTaken(res.takenToday);
      setAdherence(res.adherencePct);
      setSafety(res.safety ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function logDose(medication: Medication, time: string, status: "taken" | "skipped" | "late") {
    setBusyId(`${medication.id}_${time}`);
    try {
      await api.medications.log(medication.id, status, time);
      toast.push({
        kind: status === "taken" ? "ok" : "normal",
        title: status === "taken" ? "已记录服药" : status === "skipped" ? "已记录跳过" : "已记录稍后",
        detail: medication.name
      });
      await load();
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "记录失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setBusyId(null);
    }
  }

  async function scanImage() {
    if (!file) {
      toast.push({ kind: "danger", title: "请先选择一张药盒照片" });
      return;
    }
    setScanBusy(true);
    setScan(null);
    try {
      const upload = await api.uploads.image(file, "medication");
      const result = await api.medications.scan(upload.upload.id);
      setScan(result.result);
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "识别失败",
        detail: err instanceof Error ? err.message : "请重拍药盒正面"
      });
    } finally {
      setScanBusy(false);
    }
  }

  async function addToPlan() {
    if (!scan || scan.name === "未识别") return;
    setScanBusy(true);
    try {
      await api.medications.create({
        name: scan.name,
        ...(scan.genericName ? { genericName: scan.genericName } : {}),
        ...(scan.spec ? { spec: scan.spec } : {}),
        ...(scan.dosage ? { dosage: scan.dosage } : {}),
        schedule: [{ time: "08:00" }],
        notes: "由拍照识药加入，请核对后使用"
      });
      toast.push({ kind: "ok", title: "已加入用药计划", detail: "请核对药名和用法。" });
      setScan(null);
      setFile(null);
      await load();
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "加入失败",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setScanBusy(false);
    }
  }

  const todayLogs = new Map<string, MedicationLog>();
  for (const logEntry of logs) {
    const key = `${logEntry.medicationId}_${logEntry.scheduledTime ?? ""}`;
    if (!todayLogs.has(key)) todayLogs.set(key, logEntry);
  }

  const doses: Dose[] = items
    .flatMap((medication) =>
      medication.schedule.map((slot) => {
        const exact = todayLogs.get(`${medication.id}_${slot.time}`);
        const legacy = todayLogs.get(`${medication.id}_`);
        const logged = exact ?? legacy;
        return {
          medication,
          time: slot.time,
          ...(logged ? { logged } : {})
        };
      })
    )
    .sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="yl-page ys-medsPage">
      <section className="ys-pageHeader">
        <div>
          <p className="ys-kicker">健康照护</p>
          <h1>今天的药</h1>
          <p>按计划记录服药。拿不准的药，先问医生或药师，再拍照留档。</p>
        </div>
        <Link to="/elder" className="btn">返回陪伴屏</Link>
      </section>

      <section className="ys-medLayout">
        <div className="ys-medMain">
          <div className="ys-medSummary">
            <div>
              <span className="ys-kicker">今日计划</span>
              <strong>{due} 次</strong>
              <small>已记录 {taken} 次</small>
            </div>
            <div>
              <span className="ys-kicker">依从率</span>
              <strong>{adherence === null ? "暂无" : `${adherence}%`}</strong>
              <small>{adherence === null ? "从今天开始记录" : "按今日记录计算"}</small>
            </div>
          </div>

          {safety && safety.warnings.length > 0 && (
            <section className="ys-medSafety">
              <div className="ys-medSafetyHead">
                <span className="ys-kicker">用药提醒</span>
                <h2>吃药时注意这些</h2>
              </div>
              <div className="ys-medSafetyList">
                {safety.warnings.slice(0, 4).map((warning) => (
                  <article
                    key={`${warning.id}_${warning.drugs.join("_")}`}
                    className={`ys-medSafetyItem ys-medSafetyItem--${warning.level}`}
                  >
                    <strong>{warning.title}</strong>
                    <p>{warning.detail}</p>
                    <small>依据：{warning.source.title}</small>
                  </article>
                ))}
              </div>
              {safety.missedDose.length > 0 && (
                <details className="ys-medMissed">
                  <summary>漏服了怎么办？点开看</summary>
                  <ul>
                    {safety.missedDose.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </details>
              )}
              <p className="ys-finePrint">{safety.disclaimer}</p>
            </section>
          )}

          {loading ? (
            <p className="ys-mutedText">正在读取用药计划…</p>
          ) : error ? (
            <div className="yl-errorBar"><Icon name="alertCircle" size="sm" /><span>{error}</span></div>
          ) : doses.length === 0 ? (
            <div className="ys-emptyBlock">
              <Icon name="pill" size="xl" />
              <strong>还没有用药计划</strong>
              <p>拍一张药盒照片，确认后加入今天的计划。</p>
            </div>
          ) : (
            <div className="ys-medList">
              {doses.map((dose, index) => (
                <article key={`${dose.medication.id}_${dose.time}_${index}`} className="ys-medItem">
                  <div className="ys-medTime">{dose.time}</div>
                  <div className="ys-medInfo">
                    <strong>
                      {dose.medication.name}
                      {dose.medication.spec ? ` · ${dose.medication.spec}` : ""}
                    </strong>
                    <small>{dose.medication.dosage ?? "按医嘱服用"}</small>
                  </div>
                  {dose.logged ? (
                    <span className={`ys-medState ys-medState--${dose.logged.status}`}>
                      {dose.logged.status === "taken" ? "已吃" : dose.logged.status === "skipped" ? "已跳过" : "稍后"}
                    </span>
                  ) : (
                    <div className="ys-medActions">
                      <button
                        type="button"
                        className="btn btnPrimary"
                        disabled={busyId === `${dose.medication.id}_${dose.time}`}
                        onClick={() => void logDose(dose.medication, dose.time, "taken")}
                      >
                        已吃
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busyId === `${dose.medication.id}_${dose.time}`}
                        onClick={() => void logDose(dose.medication, dose.time, "late")}
                      >
                        稍后
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busyId === `${dose.medication.id}_${dose.time}`}
                        onClick={() => void logDose(dose.medication, dose.time, "skipped")}
                      >
                        跳过
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="ys-scanPanel">
          <span className="ys-kicker">拍照识药</span>
          <h2>看不清说明书？</h2>
          <p>拍药盒正面，我帮您读出药名、规格和注意事项。</p>
          <label className="ys-uploadBox">
            <Icon name="camera" size="xl" />
            <strong>{file ? file.name : "选择药盒照片"}</strong>
            <span>JPG/PNG/WebP，不超过 10MB</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" className="btn btnPrimary" disabled={scanBusy} onClick={() => void scanImage()}>
            <Icon name="shieldCheck" size="sm" />
            {scanBusy ? "识别中…" : "开始识别"}
          </button>
          <p className="ys-finePrint">识别结果仅供参考，请以药品说明书和医嘱为准。</p>
        </aside>
      </section>

      {scan && (
        <section className="ys-scanResult">
          <div className="ys-scanHead">
            <div>
              <span className="ys-kicker">识别结果</span>
              <h2>{scan.name}</h2>
              <p>
                {[scan.genericName, scan.spec, scan.dosage].filter(Boolean).join(" · ") || "请核对药盒信息"}
              </p>
            </div>
            <span className="ys-confidence">置信度 {Math.round(scan.confidence * 100)}%</span>
          </div>
          {scan.warnings.length > 0 && (
            <div className="ys-scanWarnings">
              <strong>注意事项</strong>
              <ul>
                {scan.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
          {scan.contraindications.length > 0 && (
            <div className="ys-scanWarnings">
              <strong>禁忌</strong>
              <ul>
                {scan.contraindications.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          <div className="ys-inlineActions">
            <button
              type="button"
              className="btn btnPrimary"
              disabled={scanBusy || scan.name === "未识别" || scan.confidence < 0.5}
              onClick={() => void addToPlan()}
            >
              加入用药计划
            </button>
            <span className="ys-finePrint">{scan.disclaimer}</span>
          </div>
        </section>
      )}
    </div>
  );
}
