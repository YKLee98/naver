import React, { useState } from 'react';
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
  GridToolbar,
  GridSelectionModel,
} from '@mui/x-data-grid';
import {
  Chip,
  IconButton,
  Tooltip,
  Box,
  Button,
  Stack,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
  Sync as SyncIcon,
  Link as LinkIcon,
  LinkOff as UnlinkIcon,
} from '@mui/icons-material';
import { ProductMapping } from '@/types';
import { formatDateTime } from '@/utils/formatters';

interface SKUMappingTableProps {
  mappings: ProductMapping[];
  loading?: boolean;
  onEdit?: (mapping: ProductMapping) => void;
  onDelete?: (id: string) => void;
  onToggleActive?: (id: string, isActive: boolean) => void;
  onSync?: (sku: string) => void;
  onBulkAction?: (action: string, ids: string[]) => void;
}

const SKUMappingTable: React.FC<SKUMappingTableProps> = ({
  mappings,
  loading,
  onEdit,
  onDelete,
  onToggleActive,
  onSync,
  onBulkAction,
}) => {
  const [selectionModel, setSelectionModel] = useState<GridSelectionModel>([]);

  const columns: GridColDef[] = [
    {
      field: 'sku',
      headerName: 'SKU',
      width: 150,
      renderCell: (params: GridRenderCellParams) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {params.row.isActive ? (
            <LinkIcon fontSize="small" color="success" />
          ) : (
            <UnlinkIcon fontSize="small" color="disabled" />
          )}
          <strong>{params.value}</strong>
        </Box>
      ),
    },
    {
      field: 'productName',
      headerName: '상품명',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'vendor',
      headerName: '공급업체',
      width: 120,
    },
    {
      field: 'naverProductId',
      headerName: '네이버 ID',
      width: 120,
    },
    {
      field: 'shopifyProductId',
      headerName: 'Shopify ID',
      width: 120,
    },
    {
      field: 'syncStatus',
      headerName: '동기화 상태',
      width: 130,
      renderCell: (params: GridRenderCellParams) => {
        const getColor = () => {
          switch (params.value) {
            case 'synced':
              return 'success';
            case 'pending':
              return 'warning';
            case 'error':
              return 'error';
            default:
              return 'default';
          }
        };

        const getLabel = () => {
          switch (params.value) {
            case 'synced':
              return '동기화됨';
            case 'pending':
              return '대기중';
            case 'error':
              return '오류';
            default:
              return params.value;
          }
        };

        return (
          <Chip
            label={getLabel()}
            color={getColor() as any}
            size="small"
            variant={params.value === 'synced' ? 'filled' : 'outlined'}
          />
        );
      },
    },
    {
      field: 'lastSyncedAt',
      headerName: '마지막 동기화',
      width: 160,
      renderCell: (params: GridRenderCellParams) => (
        params.value ? formatDateTime(params.value) : '-'
      ),
    },
    {
      field: 'isActive',
      headerName: '상태',
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          icon={params.value ? <ActiveIcon /> : <InactiveIcon />}
          label={params.value ? '활성' : '비활성'}
          color={params.value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'actions',
      headerName: '작업',
      width: 150,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Box>
          <Tooltip title="편집">
            <IconButton size="small" onClick={() => onEdit?.(params.row)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="동기화">
            <IconButton
              size="small"
              onClick={() => onSync?.(params.row.sku)}
              disabled={!params.row.isActive}
            >
              <SyncIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={params.row.isActive ? '비활성화' : '활성화'}>
            <IconButton
              size="small"
              onClick={() => onToggleActive?.(params.row._id, !params.row.isActive)}
            >
              {params.row.isActive ? (
                <InactiveIcon fontSize="small" color="error" />
              ) : (
                <ActiveIcon fontSize="small" color="success" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="삭제">
            <IconButton
              size="small"
              onClick={() => onDelete?.(params.row._id)}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const handleBulkActive = () => {
    if (onBulkAction && selectionModel.length > 0) {
      onBulkAction('activate', selectionModel as string[]);
    }
  };

  const handleBulkInactive = () => {
    if (onBulkAction && selectionModel.length > 0) {
      onBulkAction('deactivate', selectionModel as string[]);
    }
  };

  const handleBulkDelete = () => {
    if (onBulkAction && selectionModel.length > 0) {
      onBulkAction('delete', selectionModel as string[]);
    }
  };

  return (
    <Box>
      {selectionModel.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            size="small"
            startIcon={<ActiveIcon />}
            onClick={handleBulkActive}
            color="success"
          >
            선택 항목 활성화 ({selectionModel.length}개)
          </Button>
          <Button
            size="small"
            startIcon={<InactiveIcon />}
            onClick={handleBulkInactive}
          >
            선택 항목 비활성화
          </Button>
          <Button
            size="small"
            startIcon={<DeleteIcon />}
            onClick={handleBulkDelete}
            color="error"
          >
            선택 항목 삭제
          </Button>
        </Stack>
      )}

      <DataGrid
        rows={mappings}
        columns={columns}
        pageSize={20}
        rowsPerPageOptions={[10, 20, 50, 100]}
        checkboxSelection
        disableSelectionOnClick
        autoHeight
        loading={loading}
        getRowId={(row) => row._id}
        onSelectionModelChange={(newSelection) => setSelectionModel(newSelection)}
        selectionModel={selectionModel}
        components={{
          Toolbar: GridToolbar,
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

export default SKUMappingTable;
