import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { PosTerminalPro } from './pages/PosTerminalPro';
import { SettingsPage } from './pages/SettingsPage';
import { AuthPage } from './pages/AuthPage';

function DeviceRouter() {
  const navigate = useNavigate();

  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
    const isWaiter = localStorage.getItem('pos_active_waiter');

    if (isMobile) {
      if (isWaiter) {
        navigate('/waiter');
      } else {
        navigate('/auth');
      }
    } else {
      navigate('/app');
    }
  }, [navigate]);

  return (
    <div className="h-dvh w-full flex items-center justify-center bg-slate-900 text-white font-mono text-xs">
      Cargando MOZONA TPV...
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DeviceRouter />} />
        <Route path="/app" element={<PosTerminalPro />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
