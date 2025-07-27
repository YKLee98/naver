// packages/frontend/src/components/inventory/LowStockAlert.tsx
import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Box,
  Button,
  Divider,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { Product } from '@/types/models';
import { formatNumber } from '@/utils/formatters';

interface LowStockAlertProps {
  items: Product[];
  loading?: boolean;
  onRefresh?: () => void;
  onEdit?: (product: Product) => void;
  thresholds?: {
    low: number;
    critical: number;
  };
}

const LowStockAlert: React.FC<LowStockAlertProps> = ({
  items,
  loading = false,
  onRefresh,
  onEdit,
  thresholds = { low: 10, critical: 5 },
}) => {
  const getStockLevel = (quantity: number) => {
    if (quantity === 0) {
      return { label: '품절', color: 'error' as const, priority: 3 };
    } else if (quantity <= thresholds.critical) {
      return { label: '매우 부족', color: 'error' as const, priority: 2 };
    } else if (quantity <= thresholds.low) {
      return { label: '부족', color: 'warning' as const, priority: 1 };
    }
    return { label: '정상', color: 'success' as const, priority: 0 };
  };

  const sortedItems = [...items].sort((a, b) => {
    const minQuantityA = Math.min(a.naverQuantity, a.shopifyQuantity);
    const minQuantityB = Math.min(b.naverQuantity, b.shopifyQuantity);
    const levelA = getStockLevel(minQuantityA);
    const levelB = getStockLevel(minQuantityB);
    
    // 우선순위가 높은 것부터 정렬
    if (levelA.priority !== levelB.priority) {
      return levelB.priority - levelA.priority;
    }
    
    // 같은 우선순위면 재고가 적은 것부터
    return minQuantityA - minQuantityB;
  });

  if (items.length === 0 && !loading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography variant="h6" color="text.secondary">
              재고 부족 상품이 없습니다
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              모든 상품의 재고가 충분합니다
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningIcon color="warning" />
            <Typography variant="h6">
              재고 부족 알림
            </Typography>
            <Chip
              label={`${items.length}개`}
              size="small"
              color="warning"
            />
          </Box>
          {onRefresh && (
            <Tooltip title="새로고침">
              <IconButton onClick={onRefresh} disabled={loading} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Alert severity="warning" sx={{ mb: 2 }}>
          재고가 {thresholds.low}개 이하인 상품들입니다. 신속한 재고 보충이 필요합니다.
        </Alert>

        <List>
          {sortedItems.map((item, index) => {
            const minQuantity = Math.min(item.naverQuantity, item.shopifyQuantity);
            const stockLevel = getStockLevel(minQuantity);
            
            return (
              <React.Fragment key={item.sku}>
                {index > 0 && <Divider />}
                <ListItem
                  sx={{
                    py: 2,
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2">
                          {item.sku}
                        </Typography>
                        <Chip
                          label={stockLevel.label}
                          size="small"
                          color={stockLevel.color}
                        />
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          {item.productName}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            네이버: {formatNumber(item.naverQuantity)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Shopify: {formatNumber(item.shopifyQuantity)}
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    {onEdit && (
                      <Tooltip title="재고 조정">
                        <IconButton edge="end" onClick={() => onEdit(item)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </ListItemSecondaryAction>
                </ListItem>
              </React.Fragment>
            );
          })}
        </List>

        {items.length > 5 && (
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button variant="text" size="small">
              모두 보기 ({items.length}개)
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default LowStockAlert;