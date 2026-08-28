import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface WebSocketContextType {
  isConnected: boolean;
  status: string;
  sendMessage: (msg: any) => void;
  send: (msg: any) => void;
  lastMessage: any;
  [key: string]: any;
}

const DEFAULT_WS: WebSocketContextType = {
  isConnected: true,
  status: 'online',
  sendMessage: () => {},
  send: () => {},
  lastMessage: null,
};

export const WebSocketContext = createContext<WebSocketContextType>(DEFAULT_WS);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected] = useState(true);
  const [status] = useState('online');
  const [lastMessage] = useState<any>(null);

  return (
    <WebSocketContext.Provider
      value={{
        isConnected,
        status,
        sendMessage: () => {},
        send: () => {},
        lastMessage,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextType {
  const ctx = useContext(WebSocketContext);
  return ctx || DEFAULT_WS;
}

export default WebSocketProvider;
