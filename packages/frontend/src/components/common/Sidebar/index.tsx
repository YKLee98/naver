// packages/frontend/src/components/common/Sidebar/index.tsx
import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Box,
  Typography,
  Divider,
  Avatar,
  Chip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Link as LinkIcon,
  Inventory2 as InventoryIcon,
  AttachMoney as MoneyIcon,
  Assessment as ReportsIcon,
  Settings as SettingsIcon,
  FiberManualRecord as StatusIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { styled } from '@mui/material/styles';

const drawerWidth = 280;

const StyledDrawer = styled(Drawer)(({ theme }) => ({
  width: drawerWidth,
  flexShrink: 0,
  '& .MuiDrawer-paper': {
    width: drawerWidth,
    boxSizing: 'border-box',
    background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f23 100%)',
    color: 'white',
    borderRight: 'none',
  },
}));

const menuItems = [
  { 
    path: '/dashboard', 
    label: '대시보드', 
    icon: <DashboardIcon />,
    description: '전체 현황 확인'
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
    icon: <InventoryIcon />,
    description: '재고 동기화'
  },
  { 
    path: '/pricing', 
    label: '가격 관리', 
    icon: <MoneyIcon />,
    description: '가격 설정 및 환율'
  },
  { 
    path: '/reports', 
    label: '리포트', 
    icon: <ReportsIcon />,
    description: '분석 보고서'
  },
  { 
    path: '/settings', 
    label: '설정', 
    icon: <SettingsIcon />,
    description: 'API 및 시스템 설정'
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <StyledDrawer
      variant="persistent"
      anchor="left"
      open={open}
    >
      <Toolbar sx={{ 
        minHeight: '80px !important',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar
            sx={{
              width: 45,
              height: 45,
              background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
              fontSize: '1.2rem',
              fontWeight: 'bold',
            }}
          >
            NS
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: '-0.5px' }}>
              Naver-Shopify
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              ERP System v1.0
            </Typography>
          </Box>
        </Box>
      </Toolbar>
      
      <Box sx={{ overflow: 'auto', px: 2, py: 3 }}>
        <List>
          {menuItems.map((item) => (
            <ListItem key={item.path} disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                onClick={() => handleNavigation(item.path)}
                selected={location.pathname === item.path}
                sx={{
                  borderRadius: 2,
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    background: 'rgba(255, 255, 255, 0.1)',
                    transform: 'translateX(5px)',
                  },
                  '&.Mui-selected': {
                    background: 'linear-gradient(90deg, rgba(33, 150, 243, 0.3) 0%, rgba(33, 150, 243, 0.1) 100%)',
                    borderLeft: '4px solid #2196F3',
                    '&:hover': {
                      background: 'linear-gradient(90deg, rgba(33, 150, 243, 0.4) 0%, rgba(33, 150, 243, 0.2) 100%)',
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: location.pathname === item.path ? '#2196F3' : 'rgba(255, 255, 255, 0.7)',
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
                    <Typography variant="caption" sx={{ opacity: 0.6, color: 'white' }}>
                      {item.description}
                    </Typography>
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
      
      <Box sx={{ 
        mt: 'auto', 
        p: 2, 
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(255, 255, 255, 0.02)',
      }}>
        <Box sx={{ 
          p: 2, 
          borderRadius: 2,
          background: 'rgba(33, 150, 243, 0.1)',
          border: '1px solid rgba(33, 150, 243, 0.3)',
        }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            실시간 동기화 상태
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <StatusIcon sx={{
              fontSize: 10,
              color: '#4caf50',
              animation: 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.5 },
                '100%': { opacity: 1 },
              },
            }} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              연결됨
            </Typography>
          </Box>
        </Box>
      </Box>
    </StyledDrawer>
  );
};

export default Sidebar;