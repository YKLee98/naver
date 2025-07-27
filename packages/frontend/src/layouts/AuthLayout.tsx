// packages/frontend/src/layouts/AuthLayout.tsx
import React from 'react';
import { Box, Container } from '@mui/material';
import { Outlet } from 'react-router-dom';

const AuthLayout: React.FC = () => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: 'linear-gradient(45deg, #1976d2 30%, #42a5f5 90%)',
      }}
    >
      <Container>
        <Outlet />
      </Container>
    </Box>
  );
};

export default AuthLayout;