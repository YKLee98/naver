import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Typography,
  Box,
  Button,
  Divider,
} from '@mui/material';
import {
  Warning as WarningIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import { formatNumber } from '@/utils/formatters';
import { STOCK_THRESHOLDS } from '@/utils/constants';

interface LowStockItem {
  sku: string;
  productName: string;
  quantity: number;
  lastUpdated: string;
}

interface LowStockAlertProps {
  items: LowStockItem[];
  threshold?: number;
  onViewAll?: () => void;
}

const LowStockAlert: React.FC<LowStockAlertProps> = ({
  items,
  threshold = STOCK_THRESHOLDS.LOW,
  onViewAll,
}) => {
  const criticalItems = items.filter(item => item.quantity <= STOCK_THRESHOLDS.CRITICAL);
  const warningItems = items.filter(
    item => item.quantity > STOCK_THRESHOLDS.CRITICAL && item.quantity <= threshold
  );

  const getStockChip = (quantity: number) => {
    if (quantity === 0) {
      return <Chip label="품절" color="error" size="small" />;
    } else if (quantity <= STOCK_THRESHOLDS.CRITICAL) {
      return <Chip label="긴급" color="error" size="small" variant="outlined" />;
    } else {
      return <Chip label="부족" color="warning" size="small" variant="outlined" />;
    }
  };

  return (
    <Card>
      <CardHeader
        avatar={<WarningIcon color="warning" />}
        title="재고 부족 알림"
        subheader={`${items.length}개 상품이 재고 부족 상태입니다`}
        action={
          onViewAll && (
            <Button size="small" onClick={onViewAll}>
              전체 보기
            </Button>
          )
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {items.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <TrendingDownIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography color="text.secondary">
              재고 부족 상품이 없습니다
            </Typography>
          </Box>
        ) : (
          <>
            {criticalItems.length > 0 && (
              <>
                <Typography variant="subtitle2" color="error" gutterBottom>
                  긴급 처리 필요 ({criticalItems.length}개)
                </Typography>
                <List dense>
                  {criticalItems.slice(0, 5).map((item, index) => (
                    <React.Fragment key={item.sku}>
                      <ListItem>
                        <ListItemText
                          primary={item.sku}
                          secondary={item.productName}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ 
                            variant: 'caption',
                            noWrap: true,
                          }}
                        />
                        <ListItemSecondaryAction>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" color="error">
                              {formatNumber(item.quantity)}개
                            </Typography>
                            {getStockChip(item.quantity)}
                          </Stack>
                        </ListItemSecondaryAction>
                      </ListItem>
                      {index < criticalItems.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              </>
            )}

            {warningItems.length > 0 && criticalItems.length > 0 && (
              <Box sx={{ my: 2 }}>
                <Divider />
              </Box>
            )}

            {warningItems.length > 0 && (
              <>
                <Typography variant="subtitle2" color="warning.main" gutterBottom>
                  재고 부족 ({warningItems.length}개)
                </Typography>
                <List dense>
                  {warningItems.slice(0, 5).map((item, index) => (
                    <React.Fragment key={item.sku}>
                      <ListItem>
                        <ListItemText
                          primary={item.sku}
                          secondary={item.productName}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ 
                            variant: 'caption',
                            noWrap: true,
                          }}
                        />
                        <ListItemSecondaryAction>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2">
                              {formatNumber(item.quantity)}개
                            </Typography>
                            {getStockChip(item.quantity)}
                          </Stack>
                        </ListItemSecondaryAction>
                      </ListItem>
                      {index < warningItems.length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default LowStockAlert;

