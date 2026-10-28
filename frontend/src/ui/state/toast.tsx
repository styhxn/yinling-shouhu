import React from "react";

type ToastKind = "normal" | "danger" | "ok";
type ToastItem = { id: string; title: string; detail?: string; kind: ToastKind };

type ToastApi = {
  push(input: Omit<ToastItem, "id">): void;
};

const Ctx = React.createContext<ToastApi | null>(null);

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const api = React.useMemo<ToastApi>(() => {
    return {
      push(input) {
        const item: ToastItem = { id: uid(), ...input };
        setItems((prev) => [item, ...prev].slice(0, 5));
        window.setTimeout(() => {
          setItems((prev) => prev.filter((x) => x.id !== item.id));
        }, 6000);
      }
    };
  }, []);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toastWrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "danger" ? "alert" : "status"}
            className={[
              "toast",
              t.kind === "danger" ? "toastDanger" : "",
              t.kind === "ok" ? "toastOk" : ""
            ].join(" ")}
          >
            <div className="toastTitle">{t.title}</div>
            {t.detail ? <div className="muted">{t.detail}</div> : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}

