// packages/frontend/src/components/mapping/ConflictResolver/index.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  Chip,
} from '@mui/material';
import { formatNumber, formatCurrency } from '@/utils/formatters';

interface ConflictData {
  sku: string;
  productName: string;
  field: string;
  naverValue: any;
  shopifyValue: any;
  recommendation: 'naver' | 'shopify';
}

interface ConflictResolverProps {
  open: boolean;
  onClose: () => void;
  conflicts: ConflictData[];
  onResolve: (resolutions: Record<string, 'naver' | 'shopify'>) => void;
}

const ConflictResolver: React.FC<ConflictResolverProps> = ({
  open,
  onClose,
  conflicts,
  onResolve,
}) => {
  const [resolutions, setResolutions] = useState<Record<string, 'naver' | 'shopify'>>({});

  const handleResolutionChange = (conflictId: string, value: 'naver' | 'shopify') => {
    setResolutions(prev => ({
      ...prev,
      [conflictId]: value,
    }));
  };

  const handleResolveAll = (platform: 'naver' | 'shopify') => {
    const allResolutions: Record<string, 'naver' | 'shopify'> = {};
    conflicts.forEach((conflict, index) => {
      allResolutions[`${conflict.sku}-${index}`] = platform;
    });
    setResolutions(allResolutions);
  };

  const handleSubmit = () => {
    onResolve(resolutions);
    onClose();
  };

  const formatValue = (value: any, field: string) => {
    if (field === 'price') {
      return formatCurrency(value, 'KRW');
    }
    if (field === 'quantity') {
      return formatNumber(value);
    }
    return value;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">충돌 해결</Typography>
          <Box>
            <Button size="small" onClick={() => handleResolveAll('naver')}>
              모두 네이버 기준
            </Button>
            <Button size="small" onClick={() => handleResolveAll('shopify')} sx={{ ml: 1 }}>
              모두 Shopify 기준
            </Button>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>상품명</TableCell>
                <TableCell>필드</TableCell>
                <TableCell align="center">네이버</TableCell>
                <TableCell align="center">Shopify</TableCell>
                <TableCell align="center">선택</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {conflicts.map((conflict, index) => {
                const conflictId = `${conflict.sku}-${index}`;
                const selectedValue = resolutions[conflictId] || conflict.recommendation;

                return (
                  <TableRow key={conflictId}>
                    <TableCell>{conflict.sku}</TableCell>
                    <TableCell>{conflict.productName}</TableCell>
                    <TableCell>
                      <Chip
                        label={conflict.field}
                        size="small"
                        color={conflict.field === 'quantity' ? 'primary' : 'secondary'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box
                        sx={{
                          fontWeight: selectedValue === 'naver' ? 'bold' : 'normal',
                          color: selectedValue === 'naver' ? 'primary.main' : 'text.secondary',
                        }}
                      >
                        {formatValue(conflict.naverValue, conflict.field)}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Box
                        sx={{
                          fontWeight: selectedValue === 'shopify' ? 'bold' : 'normal',
                          color: selectedValue === 'shopify' ? 'primary.main' : 'text.secondary',
                        }}
                      >
                        {formatValue(conflict.shopifyValue, conflict.field)}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <RadioGroup
                        row
                        value={selectedValue}
                        onChange={(e) => handleResolutionChange(conflictId, e.target.value as 'naver' | 'shopify')}
                      >
                        <FormControlLabel
                          value="naver"
                          control={<Radio size="small" />}
                          label="네이버"
                        />
                        <FormControlLabel
                          value="shopify"
                          control={<Radio size="small" />}
                          label="Shopify"
                        />
                      </RadioGroup>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={Object.keys(resolutions).length !== conflicts.length}
        >
          충돌 해결
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConflictResolver;

