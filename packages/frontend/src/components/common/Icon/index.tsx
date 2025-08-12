// packages/frontend/src/components/common/Icon/index.tsx
import React from 'react';
import { CircularProgress, Box } from '@mui/material';
import { DynamicIcon, type IconName } from '@/utils/iconLoader';
import type { SvgIconProps } from '@mui/material/SvgIcon';

interface IconProps extends SvgIconProps {
  name: IconName;
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
}

/**
 * Enhanced Icon component with built-in loading states and size variants
 */
const Icon: React.FC<IconProps> = ({ 
  name, 
  size = 'medium', 
  loading = false,
  fontSize,
  ...props 
}) => {
  // Map size prop to MUI fontSize if fontSize not explicitly provided
  const iconFontSize = fontSize || size;

  const fallback = (
    <Box 
      sx={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        width: size === 'small' ? 20 : size === 'large' ? 32 : 24,
        height: size === 'small' ? 20 : size === 'large' ? 32 : 24,
      }}
    >
      <CircularProgress 
        size={size === 'small' ? 12 : size === 'large' ? 20 : 16} 
        thickness={4}
      />
    </Box>
  );

  if (loading) {
    return fallback;
  }

  return (
    <DynamicIcon 
      name={name} 
      fontSize={iconFontSize}
      fallback={fallback}
      {...props} 
    />
  );
};

export default Icon;
export type { IconName } from '@/utils/iconLoader';