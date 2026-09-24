"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import type { RemoteBrowserInput, RemoteBrowserSession } from "@/lib/types";
import { ApiError } from "@/services/api";
import {
  closeRemoteBrowser,
  getRemoteBrowserFrame,
  negotiateRemoteBrowser,
  sendRemoteBrowserInput,
} from "@/services/showcases";

const pendingSessionCloses = new Map<string, number>();
const SESSION_CLOSE_GRACE_MS = 1_000;

type FrameMetadata = { currentPath: string; blockedRequests: number };

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
  mode = "viewer",
  closeOnUnmount = true,
  onError,
  onPathChange,
  onSessionLost,
}: {
  session: RemoteBrowserSession;
  interactive?: boolean;
  mode?: "viewer" | "authentication";
  closeOnUnmount?: boolean;
  onError?: (message: string) => void;
  onPathChange?: (path: string) => void;
  onSessionLost?: () => void;
}) {
  const [frameReady, setFrameReady] = useState(false);
  const [transport, setTransport] = useState("Connecting live stream…");
  const [currentPath, setCurrentPath] = useState(session.currentPath);
  const [fps, setFps] = useState(0);
  const [blockedRequests, setBlockedRequests] = useState(0);
  const [connected, setConnected] = useState(true);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputChannelRef = useRef<RTCDataChannel | undefined>(undefined);
  const frameChannelRef = useRef<RTCDataChannel | undefined>(undefined);
  const inputQueueRef = useRef(Promise.resolve());
  const moveAtRef = useRef(0);
  const onErrorRef = useRef(onError);
  const onPathChangeRef = useRef(onPathChange);
  const onSessionLostRef = useRef(onSessionLost);
  const sessionLostRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    onErrorRef.current = onError;
    onPathChangeRef.current = onPathChange;
    onSessionLostRef.current = onSessionLost;
  }, [onError, onPathChange, onSessionLost]);

  const reportRemoteError = useCallback((error: unknown) => {
    if (!mountedRef.current) return;
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
    mountedRef.current = true;
    let active = true;
    let fallbackStarted = false;
    let sessionFailed = false;
    let frames = 0;
    let timer: number | undefined;
    let retryTimer: number | undefined;
    let disconnectTimer: number | undefined;
    let latestLiveFrame: { blob: Blob; metadata: FrameMetadata } | undefined;
    let decodingLiveFrame = false;
    let ready = false;
    let lastStatus: { currentPath: string; blockedRequests: number } | undefined;
    const statsStartedAt = performance.now();
    let lastStatsAt = statsStartedAt;
    const stats = window.setInterval(() => {
      const now = performance.now();
      if (active) setFps(Math.round((frames * 1_000) / (now - lastStatsAt)));
      lastStatsAt = now;
      frames = 0;
    }, 1_000);
    const updateStatus = (status: { currentPath: string; blockedRequests: number }) => {
      if (lastStatus?.currentPath !== status.currentPath) {
        setCurrentPath(status.currentPath);
        onPathChangeRef.current?.(status.currentPath);
      }
      if (lastStatus?.blockedRequests !== status.blockedRequests) {
        setBlockedRequests(status.blockedRequests);
      }
      lastStatus = { currentPath: status.currentPath, blockedRequests: status.blockedRequests };
    };
    const drawFrame = async (blob: Blob, live = false) => {
      const bitmap = await createImageBitmap(blob);
      try {
        if (!active || (live && fallbackStarted)) return;
        const context = canvasRef.current?.getContext("2d", { alpha: false });
        if (!context) throw new Error("Browser frame rendering is unavailable.");
        context.drawImage(bitmap, 0, 0, session.viewport.width, session.viewport.height);
        frames += 1;
        if (!ready) {
          ready = true;
          setFrameReady(true);
          setConnected(true);
        }
      } finally {
        bitmap.close();
      }
    };
    const poll = async () => {
      try {
        const frame = await getRemoteBrowserFrame(session);
        if (!active) return;
        await drawFrame(frame.blob);
        if (!active) return;
        updateStatus(frame);
      } catch (error) {
        if (!active) return;
        reportRemoteError(error);
        return;
      }
      timer = window.setTimeout(poll, 250);
    };
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const inputChannel = peer.createDataChannel("showrun-input", { ordered: true });
    const frameChannel = peer.createDataChannel("showrun-frames", {
      ordered: false,
      maxRetransmits: 0,
    });
    frameChannel.binaryType = "arraybuffer";
    inputChannelRef.current = inputChannel;
    frameChannelRef.current = frameChannel;
    const fallback = () => {
      if (!active || fallbackStarted || sessionFailed) return;
      fallbackStarted = true;
      if (connectionTimer) window.clearTimeout(connectionTimer);
      if (disconnectTimer) window.clearTimeout(disconnectTimer);
      if (inputChannelRef.current === inputChannel) inputChannelRef.current = undefined;
      if (frameChannelRef.current === frameChannel) frameChannelRef.current = undefined;
      inputChannel.close();
      frameChannel.close();
      peer.close();
      latestLiveFrame = undefined;
      setTransport("HTTP fallback · reduced frame rate");
      void poll();
      retryTimer = window.setTimeout(() => {
        if (active) setConnectionAttempt((attempt) => attempt + 1);
      }, 10_000);
    };
    const connectionTimer = window.setTimeout(fallback, 7_000);
    const renderLiveFrames = async () => {
      if (decodingLiveFrame) return;
      decodingLiveFrame = true;
      try {
        // One decode plus one latest frame: never build a stale render backlog.
        while (active && !fallbackStarted && !sessionFailed && latestLiveFrame) {
          const frame = latestLiveFrame;
          latestLiveFrame = undefined;
          await drawFrame(frame.blob, true);
          if (!active || fallbackStarted || sessionFailed) return;
          updateStatus(frame.metadata);
        }
      } catch {
        fallback();
      } finally {
        decodingLiveFrame = false;
      }
    };
    frameChannel.onopen = () => {
      if (!active || fallbackStarted) return;
      if (connectionTimer) window.clearTimeout(connectionTimer);
      setTransport("WebRTC · live browser");
      setConnected(true);
    };
    frameChannel.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (!active || fallbackStarted || sessionFailed || !(event.data instanceof ArrayBuffer)) return;
      if (event.data.byteLength < 4) return;
      const packet = new DataView(event.data);
      const metadataLength = packet.getUint32(0);
      if (metadataLength > 8_192 || 4 + metadataLength > event.data.byteLength) return;
      let frameMetadata: FrameMetadata;
      try {
        frameMetadata = JSON.parse(
          new TextDecoder().decode(new Uint8Array(event.data, 4, metadataLength)),
        ) as FrameMetadata;
      } catch {
        fallback();
        return;
      }
      const jpeg = new Blob([event.data.slice(4 + metadataLength)], { type: "image/jpeg" });
      latestLiveFrame = { blob: jpeg, metadata: frameMetadata };
      void renderLiveFrames();
    };
    frameChannel.onerror = fallback;
    frameChannel.onclose = () => {
      if (active && !fallbackStarted && !sessionFailed) fallback();
    };
    inputChannel.onerror = fallback;
    inputChannel.onclose = () => {
      if (active && !fallbackStarted && !sessionFailed) fallback();
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        if (disconnectTimer) window.clearTimeout(disconnectTimer);
        disconnectTimer = undefined;
        setTransport("WebRTC · live browser");
      } else if (peer.connectionState === "disconnected") {
        // Brief network handoffs should not tear down a recovering peer.
        disconnectTimer ??= window.setTimeout(fallback, 2_500);
      } else if (peer.connectionState === "failed") {
        fallback();
      }
    };
    void (async () => {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            peer.removeEventListener("icegatheringstatechange", gathered);
            reject(new Error("Peer candidates could not be gathered."));
          }, 5_000);
          const gathered = () => {
            if (peer.iceGatheringState !== "complete") return;
            window.clearTimeout(timeout);
            peer.removeEventListener("icegatheringstatechange", gathered);
            resolve();
          };
          peer.addEventListener("icegatheringstatechange", gathered);
          gathered();
        });
        if (!active || fallbackStarted || !peer.localDescription) return;
        const answer = await negotiateRemoteBrowser(session, peer.localDescription);
        if (!active || fallbackStarted) return;
        await peer.setRemoteDescription(answer);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
          sessionFailed = true;
          reportRemoteError(error);
        } else {
          fallback();
        }
      }
    })();
    return () => {
      active = false;
      latestLiveFrame = undefined;
      mountedRef.current = false;
      if (timer) window.clearTimeout(timer);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (disconnectTimer) window.clearTimeout(disconnectTimer);
      if (connectionTimer) window.clearTimeout(connectionTimer);
      window.clearInterval(stats);
      if (inputChannelRef.current === inputChannel) inputChannelRef.current = undefined;
      if (frameChannelRef.current === frameChannel) frameChannelRef.current = undefined;
      inputChannel.close();
      frameChannel.close();
      peer.close();
      if (closeOnUnmount) {
        const closeTimer = window.setTimeout(() => {
          pendingSessionCloses.delete(session.id);
          void closeRemoteBrowser(session).catch(() => undefined);
        }, SESSION_CLOSE_GRACE_MS);
        pendingSessionCloses.set(session.id, closeTimer);
      }
    };
  }, [closeOnUnmount, connectionAttempt, reportRemoteError, session]);

  const dispatch = useCallback(
    (input: RemoteBrowserInput) => {
      if (!interactive || !connected) return;
      // Preserve click and typing order while switching between WebRTC and HTTP.
      inputQueueRef.current = inputQueueRef.current
        .then(async () => {
          if (!mountedRef.current || sessionLostRef.current) return;
          const channel = inputChannelRef.current;
          if (channel?.readyState === "open") {
            if (channel.bufferedAmount > 65_536) {
              onErrorRef.current?.("The browser connection is busy. Please wait a moment.");
              return;
            }
            channel.send(JSON.stringify({ type: "input", input }));
          } else {
            await sendRemoteBrowserInput(session, input);
          }
        })
        .catch(reportRemoteError);
    },
    [connected, interactive, reportRemoteError, session],
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
          {connected ? transport : "Controlled browser disconnected"}
        </span>
        <span className="truncate px-3 text-zinc-400">{currentPath}</span>
        <span className="shrink-0">
          {frameReady && (
            <span
              className="mr-3"
              title="Frames rendered per second. Unchanged pages send fewer frames."
            >
              {fps > 0 ? `${fps} FPS` : "Idle · no screen changes"}
            </span>
          )}
          {blockedRequests > 0
            ? `${blockedRequests} unsafe request${blockedRequests === 1 ? "" : "s"} blocked`
            : mode === "authentication"
              ? "Login browser · authentication requests allowed"
              : "Read-only network guard active"}
        </span>
        <button
          className="ml-3 shrink-0 rounded border border-white/15 px-2 py-0.5 text-zinc-300 hover:bg-white/10"
          onClick={() => {
            setConnected(true);
            setTransport("Reconnecting live stream…");
            setConnectionAttempt((attempt) => attempt + 1);
          }}
          type="button"
        >
          Reconnect
        </button>
      </div>
      <div className="shrink-0 border-b border-white/10 px-3 py-1.5 text-[10px] text-zinc-400">
        Live remote browser — click to focus, then type, paste or scroll normally.
        {mode === "authentication" && " When login is complete, save the session above."}
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
          <canvas
            aria-label="Remote application viewport"
            className="h-full w-full select-none object-contain"
            height={session.viewport.height}
            ref={canvasRef}
            width={session.viewport.width}
          />
          {!frameReady && (
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
