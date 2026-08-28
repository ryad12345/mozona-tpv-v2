import { useContext } from 'react';
import { WebSocketContext, WebSocketContextType } from '../context/WebSocketContext';

const FALLBACK_WS: WebSocketContextType = {
  isConnected: true,
  status: 'online',
  sendMessage: () => {},
  send: () => {},
  lastMessage: null,
};

export function useWebSocket(): WebSocketContextType {
  const ctx = useContext(WebSocketContext);
  return ctx || FALLBACK_WS;
}

export default useWebSocket;
