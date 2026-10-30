import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.js";
import { api } from "../../lib/api.js";
import type { DietCheckResult, DietPlan, HealthProfile } from "../../lib/types.js";
import { asrErrorZh, startRecognizeZhBuffered } from "../voice/asr.js";
import { speakNow, stopSpeaking } from "../voice/tts.js";
import { useToast } from "../state/toast.js";
import "./care.css";

const QUICK_FOODS = ["红烧肉", "咸菜", "葡萄柚", "青菜", "甜饮料", "酒"];

const VERDICT_LABEL: Record<string, string> = {
  avoid: "先别吃",
  limit: "少量吃",
  ok: "可以吃",
  unknown: "少量、清淡"
};

export function DietPage() {
  const toast = useToast();
  const [plan, setPlan] = React.useState<DietPlan | null>(null);
  const [profile, setProfile] = React.useState<HealthProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [food, setFood] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<DietCheckResult | null>(null);
  const [listening, setListening] = React.useState(false);
  const stopAsrRef = React.useRef<null | (() => void)>(null);
  const resultRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [planRes, profileRes] = await Promise.all([
        api.diet.plan(undefined, refresh),
        api.healthProfile.get()
      ]);
      setPlan(planRes.plan);
      setProfile(profileRes.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "饮食建议暂时没准备好");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    return () => stopSpeaking();
  }, [load]);

  async function checkFood(value = food) {
    const text = value.trim();
    if (!text || checking) return;
    setFood(text);
    setChecking(true);
    setResult(null);
    try {
      const res = await api.diet.check(text);
      setResult(res.result);
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    } catch (err) {
      toast.push({
        kind: "danger",
        title: "没查出来",
        detail: err instanceof Error ? err.message : "请稍后再试"
      });
    } finally {
      setChecking(false);
    }
  }

  function startVoice() {
    if (listening) {
      stopAsrRef.current?.();
      stopAsrRef.current = null;
      setListening(false);
      return;
    }
    try {
      const session = startRecognizeZhBuffered({
        timeoutMs: 15_000,
        silenceMs: 1_500,
        onPartial: setFood,
        onStatus: (status) => setListening(status === "listening" || status === "starting")
      });
      stopAsrRef.current = session.stop;
      session.result
        .then((text) => {
          setListening(false);
          if (text.trim()) void checkFood(text.trim());
        })
        .catch((err) => {
          setListening(false);
          toast.push({ kind: "normal", title: "语音输入未完成", detail: asrErrorZh(err) });
        })
        .finally(() => {
          stopAsrRef.current = null;
        });
    } catch (err) {
      toast.push({ kind: "danger", title: "语音输入不可用", detail: asrErrorZh(err) });
    }
  }

  function readPlan() {
    if (!plan) return;
    stopSpeaking();
    speakNow(
      `${plan.headline}。${plan.meals
        .map((meal) => `${meal.meal}吃${meal.dishes.join("、")}`)
        .join("。")}。${plan.encouragement}`
    );
  }

  return (
    <div className="yl-page ys-dietPage">
      <section className="ys-pageHeader">
        <div>
          <p className="ys-kicker">饮食照护 · AI 营养搭配</p>
          <h1>今天吃什么</h1>
          <p>按您的血压、血糖和正在吃的药来安排。想吃什么，也可以先问一句。</p>
        </div>
        <Link to="/elder" className="btn">回到陪伴屏</Link>
      </section>

      {profile && profile.conditions.length > 0 && (
        <div className="ys-dietProfileBar">
          <span className="ys-kicker">照着这些安排</span>
          {profile.conditions.map((condition) => (
            <span key={condition} className="ys-dietCondition">{condition}</span>
          ))}
          {profile.allergies.length > 0 && (
            <span className="ys-dietCondition ys-dietCondition--danger">
              过敏：{profile.allergies.join("、")}
            </span>
          )}
          <span className="ys-dietProfileLink">家人可在“健康档案”中修改</span>
        </div>
      )}

      {loading ? (
        <div className="ys-dietLoading">
          <Icon name="spinner" size="lg" className="yl-spin" />
          <strong>小助手正在按您的身体情况配餐</strong>
          <p>看看血压、血糖和今天的药，马上就好。</p>
        </div>
      ) : error ? (
        <div className="ys-dietError">
          <Icon name="alertCircle" size="lg" />
          <strong>饮食建议暂时没准备好</strong>
          <p>{error}</p>
          <button type="button" className="btn btnPrimary" onClick={() => void load()}>再试一次</button>
        </div>
      ) : plan ? (
        <>
          <section className="ys-dietHero">
            <div className="ys-dietHeroMain">
              <span className="ys-aiBadge">
                <Icon name="sparkles" size="sm" />
                {plan.engine === "rules+llm" ? "AI 配餐 · 已按慢病和用药校验" : "配餐 · 规则校验"}
              </span>
              <h2>{plan.headline}</h2>
              <p>{plan.encouragement}</p>
              {plan.personalNote && (
                <p className="ys-dietPersonal">
                  <Icon name="heart" size="sm" />
                  {plan.personalNote}
                </p>
              )}
              <div className="ys-dietActions">
                <button type="button" className="btn" onClick={readPlan}>
                  <Icon name="volume" size="sm" />
                  念给我听
                </button>
                <button type="button" className="btn" onClick={() => void load(true)}>
                  <Icon name="refresh" size="sm" />
                  换一换
                </button>
              </div>
            </div>
            <div className="ys-dietHydration">
              <Icon name="glass" size="lg" />
              <strong>喝水</strong>
              <p>{plan.hydration}</p>
            </div>
          </section>

          <section className="ys-dietMeals">
            {plan.meals.map((meal) => (
              <article key={meal.meal} className="ys-dietMeal">
                <div className="ys-dietMealHead">
                  <span>{meal.meal}</span>
                  <small>{meal.dishes.length} 样</small>
                </div>
                <div className="ys-dietDishes">
                  {meal.dishes.map((dish) => (
                    <span key={dish} className="ys-dietDish">{dish}</span>
                  ))}
                </div>
                <p>{meal.reason}</p>
              </article>
            ))}
          </section>

          <section className="ys-dietColumns">
            <article className="ys-dietCard ys-dietCard--warn">
              <span className="ys-kicker">这几样要少碰</span>
              <ul>
                {plan.avoid.map((item) => (
                  <li key={item.food}>
                    <strong>{item.food}</strong>
                    <span>{item.reason}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article className="ys-dietCard ys-dietCard--med">
              <span className="ys-kicker">和药有关的忌口</span>
              {plan.medicationCautions.length === 0 ? (
                <p className="ys-mutedText">今天没有发现明确的药物与食物冲突，仍要按医嘱服药。</p>
              ) : (
                <ul>
                  {plan.medicationCautions.map((item) => (
                    <li key={`${item.medication}_${item.food}`}>
                      <strong>{item.medication} × {item.food}</strong>
                      <span>{item.advice}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="ys-dietAsk">
            <div className="ys-dietAskHead">
              <div>
                <span className="ys-kicker">拿不准就问我</span>
                <h2>这个我能吃吗？</h2>
                <p>说一个菜名或食物，我按您的身体情况和药帮您看看。</p>
              </div>
              <Icon name="bot" size="xl" />
            </div>
            <div className="ys-dietAskBar">
              <input
                className="input"
                value={food}
                onChange={(event) => setFood(event.target.value)}
                placeholder="比如：红烧肉、咸菜、葡萄柚"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void checkFood();
                }}
              />
              <button
                type="button"
                className={listening ? "btn btnDanger" : "btn"}
                onClick={startVoice}
                aria-label={listening ? "结束语音" : "语音输入食物"}
              >
                <Icon name="mic" size="sm" />
                {listening ? "在听…" : "说出来"}
              </button>
              <button
                type="button"
                className="btn btnPrimary"
                disabled={!food.trim() || checking}
                onClick={() => void checkFood()}
              >
                {checking ? "看看…" : "帮我看看"}
              </button>
            </div>
            <div className="ys-dietQuick">
              {QUICK_FOODS.map((item) => (
                <button key={item} type="button" className="ys-dietQuickBtn" onClick={() => void checkFood(item)}>
                  {item}
                </button>
              ))}
            </div>

            {result && (
              <div ref={resultRef} className={`ys-dietResult ys-dietResult--${result.verdict}`} role="status">
                <div className="ys-dietResultHead">
                  <span className="ys-dietVerdict">{VERDICT_LABEL[result.verdict]}</span>
                  <h3>{result.headline}</h3>
                  <span className="ys-dietEngine">
                    {result.engine === "rules+llm" ? "AI + 规则校验" : "规则校验"}
                  </span>
                </div>
                <p>{result.advice}</p>
                {result.alternatives.length > 0 && (
                  <div className="ys-dietAlternatives">
                    <span>可以这样换：</span>
                    {result.alternatives.map((item) => (
                      <span key={item} className="ys-dietAlternative">{item}</span>
                    ))}
                  </div>
                )}
                {result.hits.length > 0 && (
                  <details className="ys-dietReasons">
                    <summary>为什么这样判断？</summary>
                    <ul>
                      {result.hits.map((hit) => (
                        <li key={`${hit.id}_${hit.food}`}>
                          <strong>{hit.food}</strong>
                          <span>{hit.reason}</span>
                          <small>依据：{hit.source.title}</small>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="ys-finePrint">
                  以上是饮食建议，不能替代医生和营养师的个体化方案；肾功能、痛风等情况请按医生要求调整。
                </p>
              </div>
            )}
          </section>

          <p className="ys-finePrint ys-dietSources">
            参考：{plan.sources.map((source) => source.title).join("；")}。内容仅供健康管理参考，不构成诊断或处方。
          </p>
        </>
      ) : null}
    </div>
  );
}
