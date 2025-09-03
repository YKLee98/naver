// packages/frontend/src/components/WebSocketStatus/index.tsx
import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { FiberManualRecord } from '@mui/icons-material';
import { useAppSelector } from '@/hooks';

const WebSocketStatus: React.FC = () => {
  const { connected, reconnectAttempts } = useAppSelector((state) => state.websocket);

  const getStatusColor = () => {
    if (connected) return 'success';
    if (reconnectAttempts > 0) return 'warning';
    return 'error';
  };

  const getStatusLabel = () => {
    if (connected) return '연결됨';
    if (reconnectAttempts > 0) return `재연결 중... (${reconnectAttempts})`;
    return '연결 끊김';
  };

  return (
    <Tooltip title="서버 연결 상태">
      <Chip
        icon={<FiberManualRecord />}
        label={getStatusLabel()}
        color={getStatusColor()}
        size="small"
        sx={{ mr: 2 }}
      />
    </Tooltip>
  );
};

export default WebSocketStatus;

