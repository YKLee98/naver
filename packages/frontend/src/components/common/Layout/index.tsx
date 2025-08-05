// packages/frontend/src/components/common/Layout/index.tsx
import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Badge,
  Menu,
  MenuItem,
  Divider,
  Avatar,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Inventory2,
  AttachMoney,
  Link as LinkIcon,
  Assessment,
  Settings,
  Sync,
  Language,
  Notifications,
  AccountCircle,
  Logout,
  Store,
  Warning,
  Error,
  CheckCircle,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/hooks';
import { logout } from '@/store/slices/authSlice';
import WebSocketStatus from '@/components/WebSocketStatus';

const drawerWidth = 240;

const menuItems = [
  { path: '/dashboard', label: '대시보드', icon: <Dashboard /> },
  { path: '/inventory', label: '재고 관리', icon: <Inventory2 /> },
  { path: '/pricing', label: '가격 관리', icon: <AttachMoney /> },
  { path: '/sku-mapping', label: 'SKU 매핑', icon: <LinkIcon /> },
  { path: '/reports', label: '리포트', icon: <Assessment /> },
  { path: '/settings', label: '설정', icon: <Settings /> },
];

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div" sx={{ display: 'flex', alignItems: 'center' }}>
          <Store sx={{ mr: 1 }} />
          한류-포마홀릭
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => navigate(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
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
            {menuItems.find((item) => item.path === location.pathname)?.label || ''}
          </Typography>

          <WebSocketStatus />

          <IconButton color="inherit">
            <Sync />
          </IconButton>

          <IconButton color="inherit">
            <Language />
          </IconButton>

          <IconButton
            color="inherit"
            onClick={(e) => setNotificationAnchor(e.currentTarget)}
          >
            <Badge badgeContent={3} color="error">
              <Notifications />
            </Badge>
          </IconButton>

          <IconButton
            color="inherit"
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <AccountCircle />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
        aria-label="mailbox folders"
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
        <Outlet />
      </Box>

      {/* 사용자 메뉴 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{user?.name || '사용자'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {user?.email || 'user@example.com'}
          </Typography>
        </Box>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          로그아웃
        </MenuItem>
      </Menu>

      {/* 알림 메뉴 */}
      <Menu
        anchorEl={notificationAnchor}
        open={Boolean(notificationAnchor)}
        onClose={() => setNotificationAnchor(null)}
        PaperProps={{
          sx: { width: 320, maxHeight: 400 },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6">알림</Typography>
        </Box>
        <Divider />
        <List>
          <ListItem>
            <ListItemIcon>
              <Warning color="warning" />
            </ListItemIcon>
            <ListItemText
              primary="재고 부족 경고"
              secondary="ALBUM-001 재고가 10개 미만입니다"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <Error color="error" />
            </ListItemIcon>
            <ListItemText
              primary="동기화 오류"
              secondary="MD-055 동기화에 실패했습니다"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <CheckCircle color="success" />
            </ListItemIcon>
            <ListItemText
              primary="가격 업데이트 완료"
              secondary="15개 상품 가격이 업데이트되었습니다"
            />
          </ListItem>
        </List>
      </Menu>
    </Box>
  );
};

export default Layout;