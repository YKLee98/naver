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
  Error,
  Warning,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { toggleNotificationDrawer } from '@/store/slices/notificationSlice';
import NotificationDrawer from '@/components/NotificationDrawer';
import WebSocketStatus from '@/components/WebSocketStatus';

const drawerWidth = 240;

const menuItems = [
  { path: '/dashboard', label: '대시보드', icon: <Dashboard /> },
  { path: '/products', label: '상품 매핑', icon: <LinkIcon /> },
  { path: '/inventory', label: '재고 관리', icon: <Inventory2 /> },
  { path: '/pricing', label: '가격 관리', icon: <AttachMoney /> },
  { path: '/reports', label: '리포트', icon: <Assessment /> },
  { path: '/settings', label: '설정', icon: <Settings /> },
];

const MainLayout: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  
  const { unreadCount } = useAppSelector((state) => state.notifications);
  const { isConnected } = useAppSelector((state) => state.websocket);
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
    // Logout logic
    navigate('/login');
  };

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          Hallyu Sync
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
            >
              <ListItemIcon
                sx={{
                  color: location.pathname === item.path ? 'primary.main' : 'inherit',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={() => setSyncMenuOpen(!syncMenuOpen)}>
            <ListItemIcon>
              <Sync color={syncStatus.isRunning ? 'primary' : 'inherit'} />
            </ListItemIcon>
            <ListItemText primary="동기화 상태" />
            {syncMenuOpen ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
        </ListItem>
        <Collapse in={syncMenuOpen} timeout="auto" unmountOnExit>
          <Box sx={{ pl: 4, pr: 2, pb: 2 }}>
            <Typography variant="caption" color="textSecondary">
              {syncStatus.isRunning ? '동기화 진행 중...' : '대기 중'}
            </Typography>
            {syncStatus.lastSync && (
              <Typography variant="caption" display="block">
                마지막 동기화: {new Date(syncStatus.lastSync).toLocaleTimeString()}
              </Typography>
            )}
          </Box>
        </Collapse>
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {menuItems.find(item => item.path === location.pathname)?.label || ''}
          </Typography>

          <WebSocketStatus />

          <IconButton
            color="inherit"
            onClick={() => dispatch(toggleNotificationDrawer())}
          >
            <Badge badgeContent={unreadCount} color="error">
              <Notifications />
            </Badge>
          </IconButton>

          <IconButton
            onClick={handleProfileMenuOpen}
            color="inherit"
          >
            {user?.avatar ? (
              <Avatar src={user.avatar} sx={{ width: 32, height: 32 }} />
            ) : (
              <AccountCircle />
            )}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        
        {/* Global Alerts */}
        {!isConnected && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            WebSocket 연결이 끊어졌습니다. 실시간 업데이트가 작동하지 않을 수 있습니다.
          </Alert>
        )}
        
        {syncError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => {}}>
            동기화 오류: {syncError}
          </Alert>
        )}

        <Outlet />
      </Box>

      {/* Profile Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
      >
        <MenuItem onClick={handleProfileMenuClose}>
          <ListItemIcon>
            <AccountCircle fontSize="small" />
          </ListItemIcon>
          프로필
        </MenuItem>
        <MenuItem onClick={handleProfileMenuClose}>
          <ListItemIcon>
            <Settings fontSize="small" />
          </ListItemIcon>
          계정 설정
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          로그아웃
        </MenuItem>
      </Menu>

      {/* Notification Drawer */}
      <NotificationDrawer />
    </Box>
  );
};

export default MainLayout;