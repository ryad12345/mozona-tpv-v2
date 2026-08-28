import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface WebSocketContextType {
  isConnected: boolean;
  status: string;
  sendMessage: (msg: any) => void;
  send: (msg: any) => void;
  lastMessage: any;
  [key: string]: any;
}

const DEFAULT_WS_VALUE: WebSocketContextType = {
  isConnected: true,
  status: 'online',
  sendMessage: (msg: any) => console.log('[WS Msg]:', msg),
  send: (msg: any) => console.log('[WS Send]:', msg),
  lastMessage: null,
};

export const WebSocketContext = createContext<WebSocketContextType>(DEFAULT_WS_VALUE);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected] = useState(true);
  const [status] = useState('online');
  const [lastMessage] = useState<any>(null);

  const sendMessage = (msg: any) => {
    try {
      console.log('[WS Dispatch]:', msg);
    } catch (e) {}
  };

  const send = (msg: any) => sendMessage(msg);

  return (
    <WebSocketContext.Provider
      value={{
        isConnected,
        status,
        sendMessage,
        send,
        lastMessage,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

// Hook ultra-defensivo: NUNCA lanza throw new Error
export function useWebSocket(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (!context) {
    return DEFAULT_WS_VALUE;
  }
  return context;
}

export default WebSocketContext;
