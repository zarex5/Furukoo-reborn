import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (_socket?.connected) _socket.disconnect();
  // Connect to same origin — Vite proxies /socket.io to server:3001
  _socket = io({ auth: { token }, autoConnect: true });
  return _socket;
}

export function getSocket(): Socket | null {
  return _socket;
}

export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
