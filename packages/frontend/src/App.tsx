import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import Layout from '@components/common/Layout';
import Dashboard from '@pages/Dashboard';
import Inventory from '@pages/Inventory';
import Pricing from '@pages/Pricing';
import Mapping from '@pages/Mapping';
import Reports from '@pages/Reports';
import Settings from '@pages/Settings';
import { initializeWebSocket } from '@services/websocket';
import { AppDispatch } from '@store';

function App() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    // WebSocket 연결 초기화
    const cleanup = initializeWebSocket(dispatch);
    
    return cleanup;
  }, [dispatch]);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/mapping" element={<Mapping />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
