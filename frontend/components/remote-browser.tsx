"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import type { RemoteBrowserInput, RemoteBrowserSession } from "@/lib/types";
import { ApiError } from "@/services/api";
import {
  closeRemoteBrowser,
  getRemoteBrowserFrame,
  sendRemoteBrowserInput,
} from "@/services/showcases";

const pendingSessionCloses = new Map<string, number>();
const SESSION_CLOSE_GRACE_MS = 1_000;

const forwardedKeys = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Delete",
  "End",
  "Enter",
  "Escape",
  "Home",
  "PageDown",
  "PageUp",
  "Tab",
]);

export function RemoteBrowser({
  session,
  interactive = true,
  closeOnUnmount = true,
  onError,
  onPathChange,
  onSessionLost,
}: {
  session: RemoteBrowserSession;
  interactive?: boolean;
  closeOnUnmount?: boolean;
  onError?: (message: string) => void;
  onPathChange?: (path: string) => void;
  onSessionLost?: () => void;
}) {
  const [frameUrl, setFrameUrl] = useState<string>();
  const [blockedRequests, setBlockedRequests] = useState(0);
  const [connected, setConnected] = useState(true);
  const frameUrlRef = useRef<string | undefined>(undefined);
  const moveAtRef = useRef(0);
  const onErrorRef = useRef(onError);
  const onPathChangeRef = useRef(onPathChange);
  const onSessionLostRef = useRef(onSessionLost);
  const sessionLostRef = useRef(false);

  useEffect(() => {
    onErrorRef.current = onError;
    onPathChangeRef.current = onPathChange;
    onSessionLostRef.current = onSessionLost;
  }, [onError, onPathChange, onSessionLost]);

  const reportRemoteError = useCallback((error: unknown) => {
    setConnected(false);
    if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
      if (!sessionLostRef.current) {
        sessionLostRef.current = true;
        onSessionLostRef.current?.();
      }
      return;
    }
    onErrorRef.current?.(error instanceof Error ? error.message : "Remote browser disconnected.");
  }, []);

  useEffect(() => {
    const pendingClose = pendingSessionCloses.get(session.id);
    if (pendingClose !== undefined) {
      window.clearTimeout(pendingClose);
      pendingSessionCloses.delete(session.id);
    }
    sessionLostRef.current = false;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const frame = await getRemoteBrowserFrame(session);
        if (!active) {
          URL.revokeObjectURL(frame.url);
          return;
        }
        const previous = frameUrlRef.current;
        frameUrlRef.current = frame.url;
        setFrameUrl(frame.url);
        setBlockedRequests(frame.blockedRequests);
        onPathChangeRef.current?.(frame.currentPath);
        setConnected(true);
        if (previous) URL.revokeObjectURL(previous);
      } catch (error) {
        if (!active) return;
        reportRemoteError(error);
        return;
      }
      timer = window.setTimeout(poll, 250);
    };
    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
      frameUrlRef.current = undefined;
      if (closeOnUnmount) {
        const closeTimer = window.setTimeout(() => {
          pendingSessionCloses.delete(session.id);
          void closeRemoteBrowser(session).catch(() => undefined);
        }, SESSION_CLOSE_GRACE_MS);
        pendingSessionCloses.set(session.id, closeTimer);
      }
    };
  }, [closeOnUnmount, reportRemoteError, session]);

  const dispatch = useCallback(
    (input: RemoteBrowserInput) => {
      if (!interactive) return;
      void sendRemoteBrowserInput(session, input).catch((error) => {
        reportRemoteError(error);
      });
    },
    [interactive, reportRemoteError, session],
  );

  const coordinates = (element: HTMLElement, clientX: number, clientY: number) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          session.viewport.width,
          ((clientX - bounds.left) / bounds.width) * session.viewport.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          session.viewport.height,
          ((clientY - bounds.top) / bounds.height) * session.viewport.height,
        ),
      ),
    };
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#151715]">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/10 bg-[#1d1f1d] px-3 font-mono text-[9px] text-zinc-500">
        <span className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
          />
          {connected ? "Controlled browser connected" : "Controlled browser disconnected"}
        </span>
        <span>
          {blockedRequests > 0
            ? `${blockedRequests} unsafe request${blockedRequests === 1 ? "" : "s"} blocked`
            : "Read-only network guard active"}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-[#272a27] p-2 sm:p-3">
        <div
          aria-label="Remote application browser"
          className="relative w-full max-w-[1440px] cursor-default overflow-hidden bg-white shadow-2xl outline-none ring-signal focus:ring-2"
          onClick={(event) => {
            event.currentTarget.focus();
            const point = coordinates(event.currentTarget, event.clientX, event.clientY);
            dispatch({
              type: "click",
              ...point,
              button: "left",
              clickCount: Math.max(1, Math.min(3, event.detail || 1)),
            });
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            const point = coordinates(event.currentTarget, event.clientX, event.clientY);
            dispatch({ type: "click", ...point, button: "right", clickCount: 1 });
          }}
          onKeyDown={(event) => {
            if (!interactive || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key.length === 1) {
              event.preventDefault();
              dispatch({ type: "text", text: event.key });
            } else if (forwardedKeys.has(event.key)) {
              event.preventDefault();
              dispatch({ type: "key", key: event.key });
            } else if (event.key === " ") {
              event.preventDefault();
              dispatch({ type: "key", key: "Space" });
            }
          }}
          onMouseMove={(event) => {
            const now = Date.now();
            if (now - moveAtRef.current < 80) return;
            moveAtRef.current = now;
            dispatch({
              type: "move",
              ...coordinates(event.currentTarget, event.clientX, event.clientY),
            });
          }}
          onPaste={(event) => {
            if (!interactive) return;
            const text = event.clipboardData.getData("text").slice(0, 2000);
            if (!text) return;
            event.preventDefault();
            dispatch({ type: "text", text });
          }}
          onWheel={(event) => {
            event.preventDefault();
            dispatch({
              type: "wheel",
              deltaX: Math.max(-5000, Math.min(5000, event.deltaX)),
              deltaY: Math.max(-5000, Math.min(5000, event.deltaY)),
            });
          }}
          role="application"
          style={{ aspectRatio: `${session.viewport.width} / ${session.viewport.height}` }}
          tabIndex={interactive ? 0 : -1}
        >
          {frameUrl ? (
            // This is a server-rendered browser frame, not a public target URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Remote application viewport"
              className="h-full w-full select-none object-contain"
              draggable={false}
              src={frameUrl}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-white text-zinc-500">
              <span className="flex items-center gap-2 text-xs">
                <Icon className="h-4 w-4 animate-pulse" name="globe" /> Loading browser frame…
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
