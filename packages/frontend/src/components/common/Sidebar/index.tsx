import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box,
  Typography,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Inventory as InventoryIcon,
  AttachMoney as PricingIcon,
  Link as MappingIcon,
  Assessment as ReportsIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

const DrawerContainer = styled(Drawer)(({ theme }) => ({
  width: 240,
  flexShrink: 0,
  '& .MuiDrawer-paper': {
    width: 240,
    boxSizing: 'border-box',
  },
}));

const menuItems = [
  { path: '/dashboard', label: '대시보드', icon: <DashboardIcon /> },
  { path: '/inventory', label: '재고 관리', icon: <InventoryIcon /> },
  { path: '/pricing', label: '가격 관리', icon: <PricingIcon /> },
  { path: '/mapping', label: 'SKU 매핑', icon: <MappingIcon /> },
  { path: '/reports', label: '리포트', icon: <ReportsIcon /> },
  { path: '/settings', label: '설정', icon: <SettingsIcon /> },
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
    <DrawerContainer
      variant="persistent"
      anchor="left"
      open={open}
      onClose={onClose}
    >
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <img src="/logo.png" alt="Logo" style={{ height: 40 }} />
          <Typography variant="h6" noWrap>
            ERP System
          </Typography>
        </Box>
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
              <ListItemText 
                primary={item.label}
                primaryTypographyProps={{
                  fontWeight: location.pathname === item.path ? 600 : 400,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </DrawerContainer>
  );
};

export default Sidebar;

