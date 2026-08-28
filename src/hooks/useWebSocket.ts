import { useContext } from 'react';
import { WebSocketContext, fallbackWS, WebSocketContextType } from '../context/WebSocketContext';

export function useWebSocket(): WebSocketContextType {
  const ctx = useContext(WebSocketContext);
  return ctx || fallbackWS;
}

export default useWebSocket;
