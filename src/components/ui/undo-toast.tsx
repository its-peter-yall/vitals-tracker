"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "./button";

export const UNDO_WINDOW_MS = 8_000;

type UndoToastProps = {
  message: string;
  onUndo: () => void;
  onExpire?: () => void;
};

export function UndoToast({ message, onUndo, onExpire }: UndoToastProps) {
  const [visible, setVisible] = useState(true);
  const [live, setLive] = useState(false);
  const settled = useRef(false);
  const expire = useEffectEvent(() => onExpire?.());
  useEffect(() => {
    const announcement = window.setTimeout(() => setLive(true), 100);
    return () => window.clearTimeout(announcement);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      setVisible(false);
      expire();
    }, UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={visible
      ? "fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg"
      : "sr-only"}>
      <span role="status" className="sr-only">{visible && live ? message : ""}</span>
      {visible && <span>{message}</span>}
      {visible && <Button variant="outline" onClick={() => {
        if (settled.current) return;
        settled.current = true;
        setVisible(false);
        onUndo();
      }}>Undo</Button>}
    </div>
  );
}
