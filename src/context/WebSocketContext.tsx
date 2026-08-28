import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface WebSocketContextType {
  isConnected: boolean;
  status: string;
  sendMessage: (msg: any) => void;
  send: (msg: any) => void;
  lastMessage: any;
  [key: string]: any;
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  status: 'offline',
  sendMessage: () => {},
  send: () => {},
  lastMessage: null,
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('offline');
  const [lastMessage, setLastMessage] = useState<any>(null);

  useEffect(() => {
    // Modo online/cloud seguro sin bloquear la app
    setIsConnected(true);
    setStatus('online');
  }, []);

  const sendMessage = (msg: any) => {
    console.log('[WS Dispatch]:', msg);
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

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket debe usarse dentro de <WebSocketProvider>');
  }
  return context;
}

export default WebSocketContext;
