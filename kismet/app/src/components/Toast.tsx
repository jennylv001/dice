import React from "react";
type T = { id: string; kind: "info" | "warn" | "error"; text: string };
const listeners: ((t: T) => void)[] = [];
export const Toast = {
  push(kind: T["kind"], text: string) {
    const id = Math.random().toString(36).slice(2);
    const t = { id, kind, text };
    for (const l of listeners) l(t);
    setTimeout(() => { for (const l of listeners) l({ ...t, text: "" }); }, 2200);
  },
  Container() {
    const [t, setT] = React.useState<T | null>(null);
    React.useEffect(() => {
      const l = (x: T) => setT(x.text ? x : null);
      listeners.push(l);
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    }, []);
    if (!t) return null;
    return <div className="toast">{t.text}</div>;
  }
};
