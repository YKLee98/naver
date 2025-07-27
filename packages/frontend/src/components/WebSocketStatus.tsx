// packages/frontend/src/components/WebSocketStatus.tsx
import React from 'react';
import { Chip } from '@mui/material';
import { FiberManualRecord } from '@mui/icons-material';
import { useAppSelector } from '@/hooks';

const WebSocketStatus: React.FC = () => {
  const { connected, reconnecting } = useAppSelector((state) => state.websocket);

  if (reconnecting) {
    return (
      <Chip
        icon={<FiberManualRecord />}
        label="재연결 중..."
        size="small"
        color="warning"
        sx={{ mr: 2 }}
      />
    );
  }

  return (
    <Chip
      icon={<FiberManualRecord />}
      label={connected ? '연결됨' : '연결 끊김'}
      size="small"
      color={connected ? 'success' : 'error'}
      sx={{ mr: 2 }}
    />
  );
};

export default WebSocketStatus;