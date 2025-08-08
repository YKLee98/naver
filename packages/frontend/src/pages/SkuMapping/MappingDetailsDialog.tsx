// ===== 1. packages/frontend/src/pages/SkuMapping/MappingDetailsDialog.tsx =====
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Grid,
  Chip,
  Divider,
  Table,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Alert,
  Stack,
  IconButton,
  Tabs,
  Tab,
  Card,
  CardContent,
} from '@mui/material';
import {
  Close,
  CheckCircle,
  Error,
  Warning,
  Sync,
  AccessTime,
  Store,
  ShoppingCart,
  AttachMoney,
  Inventory,
} from '@mui/icons-material';
import { mappingService } from '@/services/api/mapping.service';
import { formatDateTime, formatCurrency } from '@/utils/formatters';

interface MappingDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  mapping: any;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`mapping-tabpanel-${index}`}
      aria-labelledby={`mapping-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const MappingDetailsDialog: React.FC<MappingDetailsDialogProps> = ({
  open,
  onClose,
  mapping,
}) => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [naverProduct, setNaverProduct] = useState<any>(null);
  const [shopifyProduct, setShopifyProduct] = useState<any>(null);
  const [syncHistory, setSyncHistory] = useState<any[]>([]);

  useEffect(() => {
    if (open && mapping) {
      loadProductDetails();
      loadSyncHistory();
    }
  }, [open, mapping]);

  const loadProductDetails = async () => {
    setLoading(true);
    try {
      // 실제 상품 정보 조회 API 호출
      // const [naver, shopify] = await Promise.all([
      //   productService.getNaverProduct(mapping.naverProductId),
      //   productService.getShopifyProduct(mapping.shopifyProductId),
      // ]);
      // setNaverProduct(naver.data);
      // setShopifyProduct(shopify.data);
    } catch (error) {
      console.error('Failed to load product details:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncHistory = async () => {
    try {
      // 동기화 이력 조회 API 호출
      // const response = await mappingService.getSyncHistory(mapping._id);
      // setSyncHistory(response.data);
    } catch (error) {
      console.error('Failed to load sync history:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'INACTIVE': return 'default';
      case 'ERROR': return 'error';
      default: return 'default';
    }
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'synced': return <CheckCircle color="success" />;
      case 'pending': return <Warning color="warning" />;
      case 'error': return <Error color="error" />;
      default: return null;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            매핑 상세: {mapping?.sku}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          <Tab label="기본 정보" />
          <Tab label="네이버 상품" />
          <Tab label="Shopify 상품" />
          <Tab label="동기화 이력" />
        </Tabs>

        {/* 기본 정보 탭 */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        SKU
                      </Typography>
                      <Typography variant="body1" fontWeight="bold">
                        {mapping?.sku}
                      </Typography>
                    </Box>
                    <Divider />
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        상품명
                      </Typography>
                      <Typography variant="body2">
                        {mapping?.productName || '-'}
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        벤더
                      </Typography>
                      <Typography variant="body2">
                        {mapping?.vendor || '-'}
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        마진율
                      </Typography>
                      <Chip
                        label={`${(mapping?.priceMargin * 100).toFixed(0)}%`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        상태
                      </Typography>
                      <Chip
                        label={mapping?.status}
                        size="small"
                        color={getStatusColor(mapping?.status) as any}
                      />
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        동기화 상태
                      </Typography>
                      <Box display="flex" alignItems="center" gap={1}>
                        {getSyncStatusIcon(mapping?.syncStatus)}
                        <Typography variant="body2">
                          {mapping?.syncStatus}
                        </Typography>
                      </Box>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        마지막 동기화
                      </Typography>
                      <Typography variant="body2">
                        {mapping?.lastSyncedAt 
                          ? formatDateTime(mapping.lastSyncedAt)
                          : '동기화 안됨'}
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        생성일
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(mapping?.createdAt)}
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        수정일
                      </Typography>
                      <Typography variant="body2">
                        {formatDateTime(mapping?.updatedAt)}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {mapping?.syncError && (
              <Grid item xs={12}>
                <Alert severity="error">
                  <Typography variant="subtitle2" gutterBottom>
                    동기화 오류
                  </Typography>
                  <Typography variant="body2">
                    {mapping.syncError}
                  </Typography>
                </Alert>
              </Grid>
            )}
          </Grid>
        </TabPanel>

        {/* 네이버 상품 탭 */}
        <TabPanel value={tabValue} index={1}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Store color="primary" />
                  <Typography variant="h6">네이버 상품 정보</Typography>
                </Box>
                <Divider />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="subtitle2" color="text.secondary">
                    상품 ID
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace">
                    {mapping?.naverProductId}
                  </Typography>
                </Box>
                {loading ? (
                  <Box display="flex" justifyContent="center" p={4}>
                    <CircularProgress />
                  </Box>
                ) : naverProduct ? (
                  <>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        상품명
                      </Typography>
                      <Typography variant="body2">
                        {naverProduct.name}
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        가격
                      </Typography>
                      <Typography variant="body2">
                        {formatCurrency(naverProduct.price, 'KRW')}
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        재고
                      </Typography>
                      <Typography variant="body2">
                        {naverProduct.stockQuantity}개
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <Alert severity="info">
                    상품 정보를 불러오려면 새로고침하세요.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </TabPanel>

        {/* Shopify 상품 탭 */}
        <TabPanel value={tabValue} index={2}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <ShoppingCart color="primary" />
                  <Typography variant="h6">Shopify 상품 정보</Typography>
                </Box>
                <Divider />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="subtitle2" color="text.secondary">
                    상품 ID
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace">
                    {mapping?.shopifyProductId}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="subtitle2" color="text.secondary">
                    Variant ID
                  </Typography>
                  <Typography variant="body2" fontFamily="monospace">
                    {mapping?.shopifyVariantId}
                  </Typography>
                </Box>
                {loading ? (
                  <Box display="flex" justifyContent="center" p={4}>
                    <CircularProgress />
                  </Box>
                ) : shopifyProduct ? (
                  <>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        상품명
                      </Typography>
                      <Typography variant="body2">
                        {shopifyProduct.title}
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        가격
                      </Typography>
                      <Typography variant="body2">
                        ${shopifyProduct.price}
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="subtitle2" color="text.secondary">
                        재고
                      </Typography>
                      <Typography variant="body2">
                        {shopifyProduct.inventoryQuantity}개
                      </Typography>
                    </Box>
                  </>
                ) : (
                  <Alert severity="info">
                    상품 정보를 불러오려면 새로고침하세요.
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </TabPanel>

        {/* 동기화 이력 탭 */}
        <TabPanel value={tabValue} index={3}>
          {syncHistory.length > 0 ? (
            <Table size="small">
              <TableBody>
                {syncHistory.map((history, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <AccessTime fontSize="small" />
                        <Typography variant="caption">
                          {formatDateTime(history.timestamp)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={history.type}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {history.description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {history.status === 'success' ? (
                        <CheckCircle color="success" fontSize="small" />
                      ) : (
                        <Error color="error" fontSize="small" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert severity="info">
              동기화 이력이 없습니다.
            </Alert>
          )}
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
};

export default MappingDetailsDialog;