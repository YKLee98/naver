// packages/frontend/src/components/inventory/InventoryTable.tsx
import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  IconButton,
  Chip,
  Box,
  Tooltip,
  Checkbox,
  TableSortLabel,
} from '@mui/material';
import {
  Edit as EditIcon,
  Sync as SyncIcon,
  History as HistoryIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { Product } from '@/types/models';
import { formatNumber, formatDateTime, formatStockStatus } from '@/utils/formatters';

interface InventoryTableProps {
  products: Product[];
  loading?: boolean;
  onEdit?: (product: Product) => void;
  onSync?: (sku: string) => void;
  onViewHistory?: (sku: string) => void;
  selectable?: boolean;
  selectedItems?: string[];
  onSelectionChange?: (selected: string[]) => void;
}

type Order = 'asc' | 'desc';

interface HeadCell {
  id: keyof Product | 'actions';
  label: string;
  numeric: boolean;
  sortable: boolean;
}

const headCells: HeadCell[] = [
  { id: 'sku', label: 'SKU', numeric: false, sortable: true },
  { id: 'productName', label: '상품명', numeric: false, sortable: true },
  { id: 'naverQuantity', label: '네이버 재고', numeric: true, sortable: true },
  { id: 'shopifyQuantity', label: 'Shopify 재고', numeric: true, sortable: true },
  { id: 'syncStatus', label: '동기화 상태', numeric: false, sortable: true },
  { id: 'lastSyncedAt', label: '마지막 동기화', numeric: false, sortable: true },
  { id: 'actions', label: '작업', numeric: false, sortable: false },
];

const InventoryTable: React.FC<InventoryTableProps> = ({
  products,
  loading = false,
  onEdit,
  onSync,
  onViewHistory,
  selectable = false,
  selectedItems = [],
  onSelectionChange,
}) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState<keyof Product>('sku');
  const [order, setOrder] = useState<Order>('asc');

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleRequestSort = (property: keyof Product) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = products.map((p) => p.sku);
      onSelectionChange?.(newSelected);
      return;
    }
    onSelectionChange?.([]);
  };

  const handleClick = (sku: string) => {
    if (!selectable) return;

    const selectedIndex = selectedItems.indexOf(sku);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedItems, sku);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedItems.slice(1));
    } else if (selectedIndex === selectedItems.length - 1) {
      newSelected = newSelected.concat(selectedItems.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedItems.slice(0, selectedIndex),
        selectedItems.slice(selectedIndex + 1)
      );
    }

    onSelectionChange?.(newSelected);
  };

  const isSelected = (sku: string) => selectedItems.indexOf(sku) !== -1;

  const getInventoryDifference = (naverQty: number, shopifyQty: number) => {
    const diff = Math.abs(naverQty - shopifyQty);
    if (diff === 0) return null;
    if (diff > 5) {
      return <Chip label={`차이: ${diff}`} color="error" size="small" />;
    }
    return <Chip label={`차이: ${diff}`} color="warning" size="small" />;
  };

  const getSyncStatusChip = (status: string) => {
    const statusConfig = {
      synced: { label: '동기화됨', color: 'success' as const },
      pending: { label: '대기중', color: 'warning' as const },
      error: { label: '오류', color: 'error' as const },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      label: status,
      color: 'default' as const,
    };

    return <Chip label={config.label} color={config.color} size="small" />;
  };

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      <TableContainer>
        <Table stickyHeader aria-label="inventory table">
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox">
                  <Checkbox
                    color="primary"
                    indeterminate={
                      selectedItems.length > 0 && selectedItems.length < products.length
                    }
                    checked={products.length > 0 && selectedItems.length === products.length}
                    onChange={handleSelectAllClick}
                  />
                </TableCell>
              )}
              {headCells.map((headCell) => (
                <TableCell
                  key={headCell.id}
                  align={headCell.numeric ? 'right' : 'left'}
                  sortDirection={orderBy === headCell.id ? order : false}
                >
                  {headCell.sortable ? (
                    <TableSortLabel
                      active={orderBy === headCell.id}
                      direction={orderBy === headCell.id ? order : 'asc'}
                      onClick={() => handleRequestSort(headCell.id as keyof Product)}
                    >
                      {headCell.label}
                    </TableSortLabel>
                  ) : (
                    headCell.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {products
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((product) => {
                const isItemSelected = isSelected(product.sku);
                const stockStatus = formatStockStatus(
                  Math.min(product.naverQuantity, product.shopifyQuantity)
                );

                return (
                  <TableRow
                    hover
                    onClick={() => handleClick(product.sku)}
                    role="checkbox"
                    aria-checked={isItemSelected}
                    tabIndex={-1}
                    key={product.sku}
                    selected={isItemSelected}
                    sx={{ cursor: selectable ? 'pointer' : 'default' }}
                  >
                    {selectable && (
                      <TableCell padding="checkbox">
                        <Checkbox color="primary" checked={isItemSelected} />
                      </TableCell>
                    )}
                    <TableCell component="th" scope="row">
                      {product.sku}
                    </TableCell>
                    <TableCell>{product.productName}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                        <Chip
                          label={formatNumber(product.naverQuantity)}
                          color={stockStatus.color}
                          size="small"
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                        <Chip
                          label={formatNumber(product.shopifyQuantity)}
                          color={stockStatus.color}
                          size="small"
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getSyncStatusChip(product.syncStatus)}
                        {getInventoryDifference(product.naverQuantity, product.shopifyQuantity)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      {product.lastSyncedAt ? formatDateTime(product.lastSyncedAt) : '-'}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {onEdit && (
                          <Tooltip title="수정">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(product);
                              }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onSync && (
                          <Tooltip title="동기화">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSync(product.sku);
                              }}
                            >
                              <SyncIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {onViewHistory && (
                          <Tooltip title="이력 보기">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewHistory(product.sku);
                              }}
                            >
                              <HistoryIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={products.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        labelRowsPerPage="페이지당 행:"
      />
    </Paper>
  );
};

export default InventoryTable;