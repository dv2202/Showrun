import type { FastifyInstance } from 'fastify';
import { RTCPeerConnection } from 'werift';
import { z } from 'zod';
import type { RemoteBrowserFrame, RemoteBrowserRuntime, RemoteBrowserStream } from '../browser/remote-browser-runtime.js';
import { AppError, asAppError } from '../errors.js';
import { remoteBrowserInputSchema, remoteBrowserSessionParamsSchema } from './schemas.js';

const offerSchema = z.object({ type: z.literal('offer'), sdp: z.string().min(1).max(1_000_000) });
const inputMessageSchema = z.object({ type: z.literal('input'), input: remoteBrowserInputSchema });
const FRAME_BUFFER_LIMIT = 1_048_576;

function packFrame(frame: RemoteBrowserFrame): Buffer {
  const metadata = Buffer.from(JSON.stringify({
    currentPath: frame.currentPath,
    blockedRequests: frame.blockedRequests,
  }));
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(metadata.length);
  return Buffer.concat([header, metadata, frame.body]);
}

export function registerRemoteBrowserStream(
  app: FastifyInstance, runtime: RemoteBrowserRuntime, frontendOrigin: string,
): void {
  app.post('/api/remote-browser/:sessionId/webrtc', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    preValidation: async (request) => {
      if (request.headers.origin !== frontendOrigin) {
        throw new AppError('UNAUTHORIZED', 'Browser connection origin is not allowed', 403);
      }
      remoteBrowserSessionParamsSchema.parse(request.params);
    },
  }, async (request, reply) => {
    const { sessionId } = remoteBrowserSessionParamsSchema.parse(request.params);
    const token = request.headers['x-showrun-runtime-token'];
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
      throw new AppError('NOT_FOUND', 'Remote browser session not found', 404);
    }
    const offer = offerSchema.parse(request.body);
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      maxMessageSize: 16 * 1024 * 1024,
    });
    let inputChannel: ReturnType<RTCPeerConnection['createDataChannel']> | undefined;
    let frameChannel: ReturnType<RTCPeerConnection['createDataChannel']> | undefined;
    let stream: RemoteBrowserStream | undefined;
    let stopped = false;
    let latestFrame: RemoteBrowserFrame | undefined;
    let drainTimer: NodeJS.Timeout | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let inputOperations = Promise.resolve();
    let inputCount = 0;
    let inputWindowStarted = Date.now();

    let connectTimeout: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      if (connectTimeout) clearTimeout(connectTimeout);
      if (drainTimer) clearTimeout(drainTimer);
      if (heartbeat) clearInterval(heartbeat);
      latestFrame = undefined;
      void stream?.close();
      void peer.close();
    };
    const flushFrame = () => {
      if (stopped || !latestFrame || frameChannel?.readyState !== 'open') return;
      if (frameChannel.bufferedAmount > FRAME_BUFFER_LIMIT) {
        drainTimer ??= setTimeout(() => { drainTimer = undefined; flushFrame(); }, 15);
        drainTimer.unref();
        return;
      }
      const frame = latestFrame;
      latestFrame = undefined;
      try {
        frameChannel.send(packFrame(frame));
      } catch {
        cleanup();
      }
    };
    const acceptChannel = (dataChannel: NonNullable<typeof inputChannel>) => {
      if (dataChannel.label === 'showrun-input' && !inputChannel) {
        inputChannel = dataChannel;
        inputChannel.onmessage = ({ data }) => {
          if (stopped || !stream) return;
          if (Date.now() - inputWindowStarted >= 1_000) {
            inputWindowStarted = Date.now();
            inputCount = 0;
          }
          if (++inputCount > 120 || Buffer.byteLength(String(data)) > 8_192) {
            cleanup();
            return;
          }
          let message: z.infer<typeof inputMessageSchema>;
          try {
            message = inputMessageSchema.parse(JSON.parse(String(data)));
            stream.status();
          } catch {
            cleanup();
            return;
          }
          inputOperations = inputOperations.then(async () => {
            if (!stopped) await runtime.input(sessionId, token, message.input);
          }).catch(() => cleanup());
        };
        inputChannel.onerror = cleanup;
        inputChannel.onclose = cleanup;
      } else if (dataChannel.label === 'showrun-frames' && !frameChannel) {
        frameChannel = dataChannel;
        frameChannel.onerror = cleanup;
        frameChannel.onclose = cleanup;
        frameChannel.onopen = () => flushFrame();
      } else {
        dataChannel.close();
      }
    };
    peer.ondatachannel = ({ channel: incoming }) => acceptChannel(incoming);
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected' && connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = undefined;
      }
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed') cleanup();
    };

    try {
      await peer.setRemoteDescription(offer);
      stream = await runtime.screencast(sessionId, token, (frame) => {
        // Replace stale frames while SCTP is congested; always send the newest screen.
        latestFrame = frame;
        flushFrame();
      }, cleanup);
      heartbeat = setInterval(() => {
        try {
          stream?.status();
        } catch {
          cleanup();
        }
      }, 15_000);
      heartbeat.unref();
      // The same-origin POST carries SDP; media and input travel directly over WebRTC.
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      if (!peer.localDescription) throw new Error('WebRTC answer was not created');
      connectTimeout = setTimeout(cleanup, 30_000);
      connectTimeout.unref();
      reply.headers({ 'cache-control': 'private, no-store' });
      return reply.send({ type: peer.localDescription.type, sdp: peer.localDescription.sdp });
    } catch (error) {
      cleanup();
      const failure = asAppError(error);
      request.log.warn({ code: failure.code }, failure.publicMessage);
      throw error;
    }
  });
}
