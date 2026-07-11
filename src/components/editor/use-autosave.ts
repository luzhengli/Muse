"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { saveDraft } from "@/actions/articles";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const RETRY_MS = 8000;

/**
 * 可靠自动保存：编辑 → dirty → debounce 后写工作稿（saving）→ saved / error。
 * - 只写 article_drafts，不产生版本检查点；
 * - 中文输入法 composition 期间不落库，结束后补保存；
 * - 失败保持 dirty 并定时重试；
 * - 页面隐藏时立即抢救一次；离开页面且有未保存内容时弹原生确认。
 */
export function useAutosave(
  editor: Editor | null,
  articleId: number,
  initialHtml: string,
  debounceMs = 1500,
) {
  const [state, setState] = useState<SaveState>("idle");
  const lastSavedRef = useRef<string>(initialHtml);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const stateRef = useRef<SaveState>("idle");
  stateRef.current = state;

  const flush = useCallback(async () => {
    if (!editor || editor.isDestroyed || inFlightRef.current) return;
    if (editor.view.composing) {
      // 输入法组字中，稍后再试
      timerRef.current = setTimeout(() => void flush(), debounceMs);
      return;
    }
    const html = editor.getHTML();
    if (html === lastSavedRef.current) {
      setState((s) => (s === "dirty" || s === "error" ? "saved" : s));
      return;
    }
    inFlightRef.current = true;
    setState("saving");
    try {
      await saveDraft(articleId, html);
      lastSavedRef.current = html;
      inFlightRef.current = false;
      setState(editor.isDestroyed || editor.getHTML() === html ? "saved" : "dirty");
      if (!editor.isDestroyed && editor.getHTML() !== html) {
        timerRef.current = setTimeout(() => void flush(), debounceMs);
      }
    } catch {
      inFlightRef.current = false;
      setState("error");
      timerRef.current = setTimeout(() => void flush(), RETRY_MS);
    }
  }, [editor, articleId, debounceMs]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      setState("dirty");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), debounceMs);
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [editor, flush, debounceMs]);

  // 页面隐藏时尽快落库；关闭/刷新且有未保存内容时提示
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stateRef.current === "dirty" || stateRef.current === "saving") {
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush]);

  /** 显式保存版本后同步基线，避免误报未保存 */
  const setBaseline = useCallback((html: string) => {
    lastSavedRef.current = html;
    setState("saved");
  }, []);

  return { state, setBaseline, flush };
}
