// packages/frontend/src/components/StatCard/index.tsx
import React from 'react';
import { Card, CardContent, Typography, Box, useTheme } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  trend,
  subtitle,
  color = 'primary',
}) => {
  const theme = useTheme();

  return (
    <Card
      sx={{
        height: '100%',
        position: 'relative',
        overflow: 'visible',
        '&:hover': {
          boxShadow: theme.shadows[8],
        },
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              backgroundColor: `${color}.light`,
              color: `${color}.main`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
          {trend && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {trend.isPositive ? (
                <TrendingUp color="success" fontSize="small" />
              ) : (
                <TrendingDown color="error" fontSize="small" />
              )}
              <Typography
                variant="caption"
                color={trend.isPositive ? 'success.main' : 'error.main'}
              >
                {trend.value}%
              </Typography>
            </Box>
          )}
        </Box>
        <Typography color="textSecondary" variant="body2" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h4" component="div">
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="textSecondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default StatCard;

// packages/frontend/src/components/StockLevelIndicator/index.tsx
import React from 'react';
import { Box, Tooltip } from '@mui/material';
import { Circle } from '@mui/icons-material';

interface StockLevelIndicatorProps {
  quantity: number;
  lowThreshold?: number;
  criticalThreshold?: number;
}

const StockLevelIndicator: React.FC<StockLevelIndicatorProps> = ({
  quantity,
  lowThreshold = 10,
  criticalThreshold = 5,
}) => {
  const getColor = () => {
    if (quantity === 0) return 'error';
    if (quantity <= criticalThreshold) return 'error';
    if (quantity <= lowThreshold) return 'warning';
    return 'success';
  };

  const getLabel = () => {
    if (quantity === 0) return '품절';
    if (quantity <= criticalThreshold) return '긴급';
    if (quantity <= lowThreshold) return '부족';
    return '충분';
  };

  return (
    <Tooltip title={getLabel()}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Circle sx={{ fontSize: 12, color: `${getColor()}.main` }} />
      </Box>
    </Tooltip>
  );
};

export {StockLevelIndicator};