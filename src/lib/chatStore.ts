import { useState, useEffect } from 'react';
import type { ChatMsg } from '../components/RightPanel';

let _messages: ChatMsg[] = [];
const _listeners = new Set<(m: ChatMsg[]) => void>();

function notify() {
  _listeners.forEach(l => l(_messages));
}

export const chatStore = {
  add(msg: ChatMsg) {
    if (_messages.some(m => m.id === msg.id)) return;
    _messages = [..._messages.slice(-499), msg];
    notify();
  },
  setHistory(msgs: ChatMsg[]) {
    _messages = msgs;
    notify();
  },
  get() { return _messages; },
  subscribe(fn: (m: ChatMsg[]) => void) {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

export function useChatMessages() {
  const [msgs, setMsgs] = useState(() => chatStore.get());
  useEffect(() => { return chatStore.subscribe(setMsgs); }, []);
  return msgs;
}
