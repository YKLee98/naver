import React, { useState } from 'react';
import { Box, CssBaseline, Toolbar } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Outlet } from 'react-router-dom'; // 이 줄 추가
import Header from '../Header';
import Sidebar from '../Sidebar';

const Main = styled('main', {
  shouldForwardProp: (prop) => prop !== 'open',
})<{ open?: boolean }>(({ theme, open }) => ({
  flexGrow: 1,
  padding: theme.spacing(3),
  transition: theme.transitions.create('margin', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  marginLeft: 0,
  ...(open && {
    transition: theme.transitions.create('margin', {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginLeft: 240,
  }),
}));

// interface 제거 또는 수정
const Layout: React.FC = () => {  // children prop 제거
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleDrawerToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <Header open={sidebarOpen} onDrawerToggle={handleDrawerToggle} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Main open={sidebarOpen}>
        <Toolbar />
        <Outlet />  {/* children 대신 Outlet 사용 */}
      </Main>
    </Box>
  );
};

export default Layout;