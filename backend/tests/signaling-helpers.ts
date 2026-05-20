import http from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type Database from 'better-sqlite3';
import { createApp } from '../src/server.js';
import { attachSignaling } from '../src/modules/signaling/index.js';

export type WsMessage = Record<string, unknown>;

export async function startWsServer(database: Database.Database): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(createApp(database));
  attachSignaling(server, database);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return { server, url: `ws://127.0.0.1:${address.port}/ws` };
}

export async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
}

export async function connectWs(url: string, cookie?: string, headers: Record<string, string> = {}): Promise<WebSocket> {
  const finalHeaders = { ...headers, ...(cookie ? { Cookie: cookie } : {}) };
  const ws = new WebSocket(url, Object.keys(finalHeaders).length > 0 ? { headers: finalHeaders } : undefined);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return ws;
}

export function nextMessage(ws: WebSocket, predicate: (msg: WsMessage) => boolean = () => true): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for ws message'));
    }, 1000);
    const onMessage = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(String(raw)) as WsMessage;
      if (!predicate(msg)) return;
      cleanup();
      resolve(msg);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };
    ws.on('message', onMessage);
    ws.once('error', onError);
  });
}

export function closeWs(ws: WebSocket): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' }));
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
}

export function dropWs(ws: WebSocket): void {
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
}
