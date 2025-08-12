// packages/frontend/src/utils/iconLoader.tsx
import React from 'react';

// Custom icon props type without MUI dependencies
interface IconProps {
  className?: string;
  style?: React.CSSProperties;
  color?: string;
  fontSize?: 'small' | 'medium' | 'large' | 'inherit';
  sx?: any;
  onClick?: (event: React.MouseEvent<SVGSVGElement>) => void;
}

// Helper function to get size from fontSize prop
const getFontSize = (fontSize?: 'small' | 'medium' | 'large' | 'inherit') => {
  switch (fontSize) {
    case 'small': return 20;
    case 'large': return 35;
    case 'inherit': return 'inherit';
    default: return 24;
  }
};

// Custom SVG Icons - completely independent
const CustomIcons = {
  Dashboard: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
      </svg>
    );
  },
  Menu: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
      </svg>
    );
  },
  ChevronLeft: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
      </svg>
    );
  },
  ChevronRight: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
      </svg>
    );
  },
  Home: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
      </svg>
    );
  },
  Inventory: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4l16-.02V7z"/>
      </svg>
    );
  },
  ShoppingCart: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
      </svg>
    );
  },
  Sync: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
      </svg>
    );
  },
  Settings: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
      </svg>
    );
  },
  Person: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    );
  },
  Logout: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
      </svg>
    );
  },
  Notifications: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
      </svg>
    );
  },
  Search: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      </svg>
    );
  },
  Add: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
    );
  },
  Edit: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
    );
  },
  Delete: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
      </svg>
    );
  },
  Close: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    );
  },
  Check: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    );
  },
  CheckCircle: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    );
  },
  Error: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
    );
  },
  Warning: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
      </svg>
    );
  },
  Info: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
      </svg>
    );
  },
  Refresh: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
      </svg>
    );
  },
  ExpandMore: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
      </svg>
    );
  },
  ExpandLess: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
      </svg>
    );
  },
  MoreVert: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
      </svg>
    );
  },
  FilterList: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
      </svg>
    );
  },
  AttachMoney: (props: IconProps) => {
    const size = getFontSize(props.fontSize);
    return (
      <svg 
        className={props.className}
        style={{ width: size, height: size, ...props.style }}
        fill={props.color || 'currentColor'}
        viewBox="0 0 24 24"
        onClick={props.onClick}
      >
        <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
      </svg>
    );
  },
};

// Icon mapping
const iconMap = {
  Dashboard: CustomIcons.Dashboard,
  Menu: CustomIcons.Menu,
  ChevronLeft: CustomIcons.ChevronLeft,
  ChevronRight: CustomIcons.ChevronRight,
  Home: CustomIcons.Home,
  Inventory: CustomIcons.Inventory,
  Inventory2: CustomIcons.Inventory,
  ShoppingCart: CustomIcons.ShoppingCart,
  ShoppingCartCheckout: CustomIcons.ShoppingCart,
  AttachMoney: CustomIcons.AttachMoney,
  PriceCheck: CustomIcons.AttachMoney,
  MonetizationOn: CustomIcons.AttachMoney,
  Sync: CustomIcons.Sync,
  SyncAlt: CustomIcons.Sync,
  SyncDisabled: CustomIcons.Sync,
  SyncProblem: CustomIcons.Sync,
  Settings: CustomIcons.Settings,
  SettingsApplications: CustomIcons.Settings,
  Person: CustomIcons.Person,
  Logout: CustomIcons.Logout,
  Login: CustomIcons.Logout,
  Notifications: CustomIcons.Notifications,
  NotificationsActive: CustomIcons.Notifications,
  Search: CustomIcons.Search,
  Add: CustomIcons.Add,
  AddCircle: CustomIcons.Add,
  Edit: CustomIcons.Edit,
  Delete: CustomIcons.Delete,
  Remove: CustomIcons.Delete,
  RemoveCircle: CustomIcons.Delete,
  Close: CustomIcons.Close,
  Cancel: CustomIcons.Close,
  Check: CustomIcons.Check,
  CheckCircle: CustomIcons.CheckCircle,
  CheckCircleOutline: CustomIcons.CheckCircle,
  Error: CustomIcons.Error,
  ErrorOutline: CustomIcons.Error,
  Warning: CustomIcons.Warning,
  WarningAmber: CustomIcons.Warning,
  ReportProblem: CustomIcons.Warning,
  Info: CustomIcons.Info,
  InfoOutlined: CustomIcons.Info,
  Refresh: CustomIcons.Refresh,
  ExpandMore: CustomIcons.ExpandMore,
  ExpandLess: CustomIcons.ExpandLess,
  MoreVert: CustomIcons.MoreVert,
  FilterList: CustomIcons.FilterList,
  KeyboardArrowDown: CustomIcons.ExpandMore,
  KeyboardArrowUp: CustomIcons.ExpandLess,
} as const;

export type IconName = keyof typeof iconMap;

interface DynamicIconProps extends IconProps {
  name: IconName;
  fallback?: React.ReactNode;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ 
  name, 
  fallback,
  ...props 
}) => {
  const IconComponent = iconMap[name];
  
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in iconMap`);
    return fallback ? <>{fallback}</> : null;
  }
  
  return <IconComponent {...props} />;
};

export const preloadIcons = (icons: IconName[]) => {
  // No-op since icons are already defined
};

export const useDynamicIcon = (iconName: IconName) => {
  const IconComponent = iconMap[iconName];
  return { 
    IconComponent, 
    isLoaded: !!IconComponent 
  };
};

export default DynamicIcon;