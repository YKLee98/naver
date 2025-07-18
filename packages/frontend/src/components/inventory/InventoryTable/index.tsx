import React, { useState, useMemo } from 'react';
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridToolbar,
  GridValueGetterParams,
} from '@mui/x-data-grid';
import {
  Box,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  Typography,
} from '@mui/material';
import {
  Edit as EditIcon,
  Sync as SyncIcon,
  History as HistoryIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { ProductMapping } from '@/types';
import { formatNumber, formatDateTime, formatStockStatus } from '@/utils/formatters';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

interface InventoryTableProps {
  products: ProductMapping[];
  loading?: boolean;
  onEdit?: (product: ProductMapping) => void;
  onSync?: (sku: string) => void;
  onViewHistory?: (sku: string) => void;
}

const InventoryTable: React.FC<InventoryTableProps> = ({
  products,
  loading,
  onEdit,
  onSync,
  onViewHistory,
}) => {
  const [pageSize, setPageSize] = useState(20);
  const realTimeUpdates = useSelector(
    (state: RootState) => state.inventory.realTimeUpdates
  );

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'sku',
      headerName: 'SKU',
      width: 150,
      pinnable: true,
    },
    {
      field: 'productName',
      headerName: '상품명',
      width: 250,
      renderCell: (params: GridRenderCellParams) => (
        <Tooltip title={params.value}>
          <Typography noWrap>{params.value}</Typography>
        </Tooltip>
      ),
    },
    {
      field: 'quantity',
      headerName: '재고 수량',
      width: 120,
      type: 'number',
      valueGetter: (params: GridValueGetterParams) => {
        const realtimeData = realTimeUpdates[params.row.sku];
        return realtimeData?.quantity ?? params.row.quantity ?? 0;
      },
      renderCell: (params: GridRenderCellParams) => {
        const quantity = params.value as number;
        const status = formatStockStatus(quantity);
        
        return (
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography
              variant="body2"
              color={status.color === 'error' ? 'error' : 'inherit'}
            >
              {formatNumber(quantity)}
            </Typography>
            {quantity <= 10 && quantity > 0 && (
              <WarningIcon color="warning" fontSize="small" />
            )}
          </Stack>
        );
      },
    },
    {
      field: 'stockStatus',
      headerName: '재고 상태',
      width: 120,
      valueGetter: (params: GridValueGetterParams) => {
        const realtimeData = realTimeUpdates[params.row.sku];
        const quantity = realtimeData?.quantity ?? params.row.quantity ?? 0;
        return formatStockStatus(quantity);
      },
      renderCell: (params: GridRenderCellParams) => {
        const status = params.value as ReturnType<typeof formatStockStatus>;
        return (
          <Chip
            label={status.text}
            color={status.color}
            size="small"
          />
        );
      },
    },
    {
      field: 'lastSyncedAt',
      headerName: '마지막 동기화',
      width: 180,
      valueGetter: (params: GridValueGetterParams) => {
        const realtimeData = realTimeUpdates[params.row.sku];
        return realtimeData?.lastUpdated || params.value;
      },
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '-';
        return formatDateTime(params.value as string);
      },
    },
    {
      field: 'syncStatus',
      headerName: '동기화 상태',
      width: 120,
      renderCell: (params: GridRenderCellParams) => {
        const statusMap = {
          synced: { label: '동기화됨', color: 'success' as const },
          pending: { label: '대기중', color: 'warning' as const },
          error: { label: '오류', color: 'error' as const },
        };
        const status = statusMap[params.value as keyof typeof statusMap];
        
        return (
          <Chip
            label={status?.label || params.value}
            color={status?.color || 'default'}
            size="small"
          />
        );
      },
    },
    {
      field: 'actions',
      headerName: '작업',
      width: 150,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="재고 조정">
            <IconButton
              size="small"
              onClick={() => onEdit?.(params.row as ProductMapping)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="동기화">
            <IconButton
              size="small"
              onClick={() => onSync?.(params.row.sku)}
            >
              <SyncIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="이력 보기">
            <IconButton
              size="small"
              onClick={() => onViewHistory?.(params.row.sku)}
            >
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ], [realTimeUpdates, onEdit, onSync, onViewHistory]);

  return (
    <Box sx={{ height: 600, width: '100%' }}>
      <DataGrid
        rows={products}
        columns={columns}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        rowsPerPageOptions={[10, 20, 50, 100]}
        loading={loading}
        disableSelectionOnClick
        getRowId={(row) => row._id}
        components={{
          Toolbar: GridToolbar,
        }}
        componentsProps={{
          toolbar: {
            showQuickFilter: true,
            quickFilterProps: { debounceMs: 500 },
          },
        }}
        sx={{
          '& .MuiDataGrid-row:hover': {
            backgroundColor: 'action.hover',
          },
        }}
      />
    </Box>
  );
};

export default InventoryTable;

