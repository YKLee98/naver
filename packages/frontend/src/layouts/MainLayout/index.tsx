// packages/frontend/src/layouts/MainLayout/index.tsx
import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Badge,
  Avatar,
  Menu,
  MenuItem,
  useTheme,
  useMediaQuery,
  Collapse,
  Alert,
  Fade,
  Paper,
  Chip,
  Button,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Inventory2,
  AttachMoney,
  Link as LinkIcon,
  Assessment,
  Settings,
  Notifications,
  AccountCircle,
  ExpandLess,
  ExpandMore,
  Sync,
  Logout,
  Circle,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { toggleNotificationDrawer } from '@/store/slices/notificationSlice';
import NotificationDrawer from '@/components/NotificationDrawer';
import WebSocketStatus from '@/components/WebSocketStatus';

const drawerWidth = 280;

const menuItems = [
  { 
    path: '/dashboard', 
    label: '대시보드', 
    icon: <Dashboard />,
    description: '전체 현황을 한눈에'
  },
  { 
    path: '/products', 
    label: '상품 매핑', 
    icon: <LinkIcon />,
    description: 'SKU 연결 관리'
  },
  { 
    path: '/inventory', 
    label: '재고 관리', 
    icon: <Inventory2 />,
    description: '실시간 재고 동기화'
  },
  { 
    path: '/pricing', 
    label: '가격 관리', 
    icon: <AttachMoney />,
    description: '환율 기반 가격 설정'
  },
  { 
    path: '/reports', 
    label: '리포트', 
    icon: <Assessment />,
    description: '분석 보고서'
  },
  { 
    path: '/settings', 
    label: '설정', 
    icon: <Settings />,
    description: 'API 및 시스템 설정'
  },
];

const MainLayout: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  
  const { unreadCount } = useAppSelector((state) => state.notifications);
  const { connected } = useAppSelector((state) => state.websocket);
  const { syncStatus, error: syncError } = useAppSelector((state) => state.sync);
  const user = useAppSelector((state) => state.auth.user);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    // TODO: Implement logout logic
    navigate('/login');
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Logo Section */}
      <Box
        sx={{
          p: 3,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              fontSize: '1.2rem',
              fontWeight: 'bold',
            }}
          >
            NS
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Naver to Shopify
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              ERP System v1.0
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Navigation Menu */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 2 }}>
        <List sx={{ px: 2 }}>
          {menuItems.map((item) => (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => handleNavigation(item.path)}
                sx={{
                  borderRadius: 2,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                    transform: 'translateX(4px)',
                  },
                  '&.Mui-selected': {
                    backgroundColor: 'primary.main',
                    color: 'white',
                    '&:hover': {
                      backgroundColor: 'primary.dark',
                    },
                    '& .MuiListItemIcon-root': {
                      color: 'white',
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: location.pathname === item.path ? 'white' : 'text.secondary',
                    minWidth: 45,
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={
                    <Typography variant="body1" sx={{ fontWeight: location.pathname === item.path ? 600 : 400 }}>
                      {item.label}
                    </Typography>
                  }
                  secondary={
                    !isMobile && (
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: location.pathname === item.path ? 'rgba(255,255,255,0.8)' : 'text.secondary',
                          display: 'block',
                        }}
                      >
                        {item.description}
                      </Typography>
                    )
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 2 }} />

        {/* Sync Status */}
        <List sx={{ px: 2 }}>
          <ListItem disablePadding>
            <ListItemButton onClick={() => setSyncMenuOpen(!syncMenuOpen)} sx={{ borderRadius: 2 }}>
              <ListItemIcon>
                <Box sx={{ position: 'relative' }}>
                  <Sync color={syncStatus.isRunning ? 'primary' : 'inherit'} />
                  {syncStatus.isRunning && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        animation: 'pulse 2s infinite',
                        '@keyframes pulse': {
                          '0%': { transform: 'scale(1)', opacity: 1 },
                          '50%': { transform: 'scale(1.2)', opacity: 0.7 },
                          '100%': { transform: 'scale(1)', opacity: 1 },
                        },
                      }}
                    >
                      <Circle sx={{ fontSize: 8, color: 'success.main' }} />
                    </Box>
                  )}
                </Box>
              </ListItemIcon>
              <ListItemText primary="동기화 상태" />
              {syncMenuOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>
          </ListItem>
          <Collapse in={syncMenuOpen} timeout="auto" unmountOnExit>
            <Paper sx={{ mx: 2, my: 1, p: 2, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Circle sx={{ fontSize: 10, color: syncStatus.isRunning ? 'success.main' : 'grey.400' }} />
                <Typography variant="body2" color="text.secondary">
                  {syncStatus.isRunning ? '동기화 진행 중...' : '대기 중'}
                </Typography>
              </Box>
              {syncStatus.lastSync && (
                <Typography variant="caption" color="text.secondary">
                  마지막 동기화: {new Date(syncStatus.lastSync).toLocaleString()}
                </Typography>
              )}
            </Paper>
          </Collapse>
        </List>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f5f7fa' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          bgcolor: 'white',
          color: 'text.primary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        }}
      >
        <Toolbar sx={{ px: { xs: 2, sm: 3 } }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 600 }}>
              {menuItems.find(item => item.path === location.pathname)?.label || ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {menuItems.find(item => item.path === location.pathname)?.description || ''}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={<Circle sx={{ fontSize: 10 }} />}
              label={connected ? '연결됨' : '연결 끊김'}
              size="small"
              color={connected ? 'success' : 'error'}
              variant="outlined"
            />

            <IconButton
              color="inherit"
              onClick={() => dispatch(toggleNotificationDrawer())}
              sx={{
                '&:hover': {
                  bgcolor: 'action.hover',
                },
              }}
            >
              <Badge badgeContent={unreadCount} color="error">
                <Notifications />
              </Badge>
            </IconButton>

            <IconButton
              onClick={handleProfileMenuOpen}
              sx={{
                ml: 1,
                '&:hover': {
                  bgcolor: 'action.hover',
                },
              }}
            >
              <Avatar 
                src={user?.avatar} 
                sx={{ 
                  width: 36, 
                  height: 36,
                  bgcolor: 'primary.main',
                }}
              >
                {user?.name?.[0] || 'U'}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              borderRight: 'none',
              boxShadow: '2px 0 8px rgba(0,0,0,0.1)',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              borderRight: 'none',
              boxShadow: '2px 0 8px rgba(0,0,0,0.05)',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        <Toolbar />
        
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
          {/* Global Alerts */}
          <Fade in={!connected}>
            <Alert 
              severity="warning" 
              sx={{ mb: 2 }}
              action={
                <Button color="inherit" size="small">
                  재연결
                </Button>
              }
            >
              WebSocket 연결이 끊어졌습니다. 실시간 업데이트가 작동하지 않을 수 있습니다.
            </Alert>
          </Fade>
          
          <Fade in={!!syncError}>
            <Alert 
              severity="error" 
              sx={{ mb: 2 }} 
              onClose={() => {}}
            >
              동기화 오류: {syncError}
            </Alert>
          </Fade>

          <Outlet />
        </Box>
      </Box>

      {/* Profile Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        PaperProps={{
          sx: {
            mt: 1.5,
            minWidth: 200,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2">{user?.name || 'User'}</Typography>
          <Typography variant="caption" color="text.secondary">
            {user?.email || 'user@example.com'}
          </Typography>
        </Box>
        <MenuItem onClick={handleProfileMenuClose}>
          <ListItemIcon>
            <AccountCircle fontSize="small" />
          </ListItemIcon>
          프로필 설정
        </MenuItem>
        <MenuItem onClick={handleProfileMenuClose}>
          <ListItemIcon>
            <Settings fontSize="small" />
          </ListItemIcon>
          계정 설정
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          로그아웃
        </MenuItem>
      </Menu>

      {/* Notification Drawer */}
      <NotificationDrawer />
    </Box>
  );
};

export default MainLayout;