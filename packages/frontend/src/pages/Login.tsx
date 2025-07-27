// packages/frontend/src/pages/Login.tsx
import React from 'react';
import { Container, Paper, Box, Typography } from '@mui/material';
import LoginForm from '@components/auth/LoginForm';

const Login: React.FC = () => {
  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h5" align="center" sx={{ mb: 3 }}>
            Naver to Shopify ERP
          </Typography>
          <Typography variant="h6" align="center" gutterBottom>
            로그인
          </Typography>
          <LoginForm />
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;