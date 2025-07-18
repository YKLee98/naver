import React, { useState } from 'react';
import { Box, CssBaseline, Toolbar } from '@mui/material';
import { styled } from '@mui/material/styles';
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

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
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
        {children}
      </Main>
    </Box>
  );
};

export default Layout;
