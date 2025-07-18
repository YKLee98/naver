import React from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Badge,
  Box,
  Avatar,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Notifications as NotificationsIcon,
  AccountCircle,
  Sync as SyncIcon,
  Language as LanguageIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { toggleDrawer } from '@/store/slices/notificationSlice';
import { usePerformFullSyncMutation } from '@/store/api/apiSlice';
import NotificationDrawer from '../NotificationDrawer';

const StyledAppBar = styled(AppBar, {
  shouldForwardProp: (prop) => prop !== 'open',
})<{ open?: boolean }>(({ theme, open }) => ({
  zIndex: theme.zIndex.drawer + 1,
  transition: theme.transitions.create(['width', 'margin'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...(open && {
    marginLeft: 240,
    width: 'calc(100% - 240px)',
    transition: theme.transitions.create(['width', 'margin'], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
}));

interface HeaderProps {
  open: boolean;
  onDrawerToggle: () => void;
}

const Header: React.FC<HeaderProps> = ({ open, onDrawerToggle }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { unreadCount } = useSelector((state: RootState) => state.notification);
  const [performFullSync, { isLoading: isSyncing }] = usePerformFullSyncMutation();
  
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [langAnchorEl, setLangAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setLangAnchorEl(event.currentTarget);
  };

  const handleLanguageMenuClose = () => {
    setLangAnchorEl(null);
  };

  const handleSync = async () => {
    try {
      await performFullSync().unwrap();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const handleNotificationClick = () => {
    dispatch(toggleDrawer());
  };

  return (
    <>
      <StyledAppBar position="fixed" open={open}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={onDrawerToggle}
            edge="start"
            sx={{ marginRight: 2 }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            한류슈퍼스토어 - 포마홀릭 연동 ERP
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* 동기화 버튼 */}
            <IconButton
              color="inherit"
              onClick={handleSync}
              disabled={isSyncing}
              sx={{
                animation: isSyncing ? 'spin 1s linear infinite' : 'none',
              }}
            >
              <SyncIcon />
            </IconButton>

            {/* 언어 선택 */}
            <IconButton color="inherit" onClick={handleLanguageMenuOpen}>
              <LanguageIcon />
            </IconButton>

            {/* 알림 */}
            <IconButton color="inherit" onClick={handleNotificationClick}>
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>

            {/* 프로필 */}
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              onClick={handleProfileMenuOpen}
              color="inherit"
            >
              <Avatar sx={{ width: 32, height: 32 }}>
                <AccountCircle />
              </Avatar>
            </IconButton>
          </Box>

          {/* 프로필 메뉴 */}
          <Menu
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={handleMenuClose}>프로필</MenuItem>
            <MenuItem onClick={handleMenuClose}>내 계정</MenuItem>
            <Divider />
            <MenuItem onClick={handleMenuClose}>로그아웃</MenuItem>
          </Menu>

          {/* 언어 메뉴 */}
          <Menu
            anchorEl={langAnchorEl}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(langAnchorEl)}
            onClose={handleLanguageMenuClose}
          >
            <MenuItem onClick={handleLanguageMenuClose}>한국어</MenuItem>
            <MenuItem onClick={handleLanguageMenuClose}>English</MenuItem>
          </Menu>
        </Toolbar>
      </StyledAppBar>
      
      <NotificationDrawer />
    </>
  );
};

export default Header;

