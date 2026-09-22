import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { PlaywrightRemoteBrowserRuntime, type RemoteBrowserFrame } from '../src/browser/remote-browser-runtime.js';
import { SecureHttpClient, type SecureHttpRequest } from '../src/proxy/secure-http-client.js';
import { publicPolicy } from './helpers.js';

class FakeCDP extends EventEmitter {
  send = vi.fn(async (_method: string, _parameters?: object) => ({}));
  detach = vi.fn(async () => undefined);
}

async function fixtureRuntime() {
  const policy = publicPolicy();
  const page = Object.assign(new EventEmitter(), {
    goto: vi.fn(async () => null),
    mouse: { click: vi.fn(), move: vi.fn(), wheel: vi.fn() },
    keyboard: { insertText: vi.fn(), press: vi.fn() },
  });
  const sessions: FakeCDP[] = [];
  const context = {
    newPage: vi.fn(async () => page),
    route: vi.fn(),
    close: vi.fn(async () => { page.emit('close'); }),
    newCDPSession: vi.fn(async () => {
      const cdp = new FakeCDP();
      sessions.push(cdp);
      return cdp;
    }),
  };
  const browser = Object.assign(new EventEmitter(), {
    newContext: vi.fn(async () => context), close: vi.fn(async () => undefined),
  });
  const launcher = { launch: vi.fn(async () => browser) };
  const runtime = new PlaywrightRemoteBrowserRuntime(
    policy, new SecureHttpClient(policy, 1000, 1_000_000), true, undefined, 10, 180_000,
    launcher as unknown as Pick<typeof chromium, 'launch'>,
  );
  const handle = await runtime.startAuthentication({
    showcaseId: 'fixture', targetUrl: 'https://example.com',
    viewport: { width: 1440, height: 900 },
  });
  return { runtime, handle, context, sessions, launcher };
}

describe('Chrome screencast lifecycle', () => {
  it('acknowledges every CDP frame and retains the latest throttled frame', async () => {
    const fixture = await fixtureRuntime();
    const { runtime, handle, sessions, launcher } = fixture;
    vi.useFakeTimers();
    try {
      const frames: RemoteBrowserFrame[] = [];
      const closed = vi.fn();
      const stream = await runtime.screencast(handle.id, handle.token, (frame) => frames.push(frame), closed);
      const cdp = sessions[0]!;
      expect(launcher.launch).toHaveBeenCalledWith({ headless: true });
      expect(cdp.send).toHaveBeenCalledWith('Page.startScreencast', {
        format: 'jpeg', quality: 80, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1,
      });
      for (let index = 1; index <= 3; index += 1) {
        cdp.emit('Page.screencastFrame', { data: Buffer.from(`frame-${index}`).toString('base64'), sessionId: index });
      }
      expect(frames.map((frame) => frame.body.toString())).toEqual(['frame-1']);
      await vi.advanceTimersByTimeAsync(33);
      expect(frames.map((frame) => frame.body.toString())).toEqual(['frame-1', 'frame-3']);
      for (let index = 1; index <= 3; index += 1) {
        expect(cdp.send).toHaveBeenCalledWith('Page.screencastFrameAck', { sessionId: index });
      }
      await Promise.all([stream.close(), stream.close()]);
      expect(cdp.send.mock.calls.filter(([method]) => method === 'Page.stopScreencast')).toHaveLength(1);
      expect(cdp.detach).toHaveBeenCalledOnce();
      expect(closed).toHaveBeenCalledOnce();
      expect(fixture.context.close).not.toHaveBeenCalled();
    } finally {
      try { await runtime.close(); } finally { vi.useRealTimers(); }
    }
  });

  it('waits for the previous stop operation before starting a replacement stream', async () => {
    const { runtime, handle, sessions, context } = await fixtureRuntime();
    try {
      const first = await runtime.screencast(handle.id, handle.token, () => undefined, () => undefined);
      let finishStop!: () => void;
      const stopGate = new Promise<void>((resolve) => { finishStop = resolve; });
      sessions[0]!.send.mockImplementation(async (method) => {
        if (method === 'Page.stopScreencast') await stopGate;
        return {};
      });
      const stopping = first.close();
      const replacing = runtime.screencast(handle.id, handle.token, () => undefined, () => undefined);
      await new Promise((resolve) => setImmediate(resolve));
      expect(context.newCDPSession).toHaveBeenCalledTimes(1);
      finishStop();
      await stopping;
      const second = await replacing;
      expect(context.newCDPSession).toHaveBeenCalledTimes(2);
      await second.close();
    } finally { await runtime.close(); }
  });

  it('does not attach CDP for a wrong capability, and cleans up failed stream setup without losing the context', async () => {
    const { runtime, handle, sessions, context } = await fixtureRuntime();
    try {
      await expect(runtime.screencast(handle.id, 'wrong-token', () => undefined, () => undefined))
        .rejects.toMatchObject({ statusCode: 404 });
      expect(context.newCDPSession).not.toHaveBeenCalled();
      context.newCDPSession.mockImplementationOnce(async () => {
        const failed = new FakeCDP();
        failed.send.mockImplementation(async (method) => {
          if (method === 'Page.startScreencast') throw new Error('CDP failed');
          return {};
        });
        sessions.push(failed);
        return failed;
      });
      const closed = vi.fn();
      await expect(runtime.screencast(handle.id, handle.token, () => undefined, closed))
        .rejects.toMatchObject({ statusCode: 503 });
      expect(closed).not.toHaveBeenCalled();
      expect(sessions[0]!.detach).toHaveBeenCalledOnce();
      const recovered = await runtime.screencast(handle.id, handle.token, () => undefined, closed);
      await recovered.close();
    } finally { await runtime.close(); }
  });
});
