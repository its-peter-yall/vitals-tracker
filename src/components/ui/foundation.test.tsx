// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ThemeProvider, ThemeSelect } from "@/components/theme-provider";
import { Button } from "./button";
import { Card } from "./card";
import { themeInitScript, THEME_STORAGE_KEY } from "./theme-init";
import { UndoToast } from "./undo-toast";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("style");
});

it("uses the saved theme, persists explicit choices, and follows system changes", () => {
  const listeners = new Set<() => void>();
  const system = {
    matches: true,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => system));
  localStorage.setItem(THEME_STORAGE_KEY, "light");
  Function(themeInitScript)();
  expect(document.documentElement).not.toHaveClass("dark");
  render(<ThemeProvider><ThemeSelect /></ThemeProvider>);
  const select = screen.getByRole("combobox", { name: "Appearance" });
  expect(select).toHaveValue("light");
  fireEvent.change(select, { target: { value: "dark" } });
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(document.documentElement).toHaveClass("dark");
  fireEvent.change(select, { target: { value: "system" } });
  expect(document.documentElement).toHaveClass("dark");
  act(() => {
    system.matches = false;
    for (const listener of listeners) listener();
  });
  expect(document.documentElement).not.toHaveClass("dark");
});

it("renders a named native button with a large target and no accidental form submit", () => {
  const action = vi.fn();
  render(<Card><Button onClick={action}>Save</Button><Button disabled>Unavailable</Button></Card>);
  const button = screen.getByRole("button", { name: "Save" });
  expect(button).toHaveAttribute("type", "button");
  expect(button).toHaveClass("min-h-12", "min-w-12");
  fireEvent.click(button);
  expect(action).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Unavailable" })).toBeDisabled();
});

it("announces an undoable action, settles once, and expires after eight seconds", () => {
  vi.useFakeTimers();
  const onUndo = vi.fn();
  const onExpire = vi.fn();
  const done = render(<UndoToast message="Food logged" onUndo={onUndo} onExpire={onExpire} />);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  act(() => vi.advanceTimersByTime(100));
  expect(screen.getByRole("status")).toHaveTextContent("Food logged");
  act(() => vi.advanceTimersByTime(7_899));
  const button = screen.getByRole("button", { name: "Undo" });
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  fireEvent.click(button);
  act(() => vi.advanceTimersByTime(1));
  expect(onUndo).toHaveBeenCalledOnce();
  expect(onExpire).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  done.unmount();
  const firstExpire = vi.fn();
  const next = render(<UndoToast message="Medicine logged" onUndo={onUndo} onExpire={firstExpire} />);
  act(() => vi.advanceTimersByTime(7_999));
  next.rerender(<UndoToast message="Medicine logged" onUndo={onUndo} onExpire={onExpire} />);
  act(() => vi.advanceTimersByTime(1));
  expect(onExpire).toHaveBeenCalledOnce();
  expect(firstExpire).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
});

it("registers the root-scope service worker from the client", () => {
  const register = vi.fn().mockResolvedValue(undefined);
  const prior = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
  try {
    render(<ThemeProvider><div>Shell</div></ThemeProvider>);
    expect(register).toHaveBeenCalledExactlyOnceWith("/sw.js", { scope: "/" });
  } finally {
    if (prior) Object.defineProperty(navigator, "serviceWorker", prior);
    else Reflect.deleteProperty(navigator, "serviceWorker");
  }
});
