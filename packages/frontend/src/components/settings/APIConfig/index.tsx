// packages/frontend/src/components/settings/APIConfig/index.tsx
import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  TextField,
  Button,
  Stack,
  InputAdornment,
  IconButton,
  Alert,
  Box,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useTestConnectionMutation } from '@/store/api/apiSlice';

interface APIConfigProps {
  platform: 'naver' | 'shopify';
  config: {
    clientId?: string;
    clientSecret?: string;
    storeId?: string;
    shopDomain?: string;
    accessToken?: string;
  };
  onSave: (config: any) => void;
}

const APIConfig: React.FC<APIConfigProps> = ({ platform, config, onSave }) => {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState(config);
  const [testConnection, { isLoading: isTesting }] = useTestConnectionMutation();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleToggleVisibility = (field: string) => {
    setShowSecrets(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTest = async () => {
    try {
      const result = await testConnection({ platform, config: formData }).unwrap();
      setTestResult({ success: true, message: '연결 성공!' });
    } catch (error: any) {
      setTestResult({ success: false, message: error.data?.message || '연결 실패' });
    }
  };

  const handleSave = () => {
    onSave(formData);
  };

  const renderNaverConfig = () => (
    <>
      <TextField
        label="Client ID"
        value={formData.clientId || ''}
        onChange={(e) => handleChange('clientId', e.target.value)}
        fullWidth
        required
      />
      <TextField
        label="Client Secret"
        type={showSecrets.clientSecret ? 'text' : 'password'}
        value={formData.clientSecret || ''}
        onChange={(e) => handleChange('clientSecret', e.target.value)}
        fullWidth
        required
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => handleToggleVisibility('clientSecret')}
                edge="end"
              >
                {showSecrets.clientSecret ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <TextField
        label="Store ID"
        value={formData.storeId || ''}
        onChange={(e) => handleChange('storeId', e.target.value)}
        fullWidth
        required
      />
    </>
  );

  const renderShopifyConfig = () => (
    <>
      <TextField
        label="Shop Domain"
        value={formData.shopDomain || ''}
        onChange={(e) => handleChange('shopDomain', e.target.value)}
        fullWidth
        required
        placeholder="your-shop.myshopify.com"
      />
      <TextField
        label="Access Token"
        type={showSecrets.accessToken ? 'text' : 'password'}
        value={formData.accessToken || ''}
        onChange={(e) => handleChange('accessToken', e.target.value)}
        fullWidth
        required
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => handleToggleVisibility('accessToken')}
                edge="end"
              >
                {showSecrets.accessToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </>
  );

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            {platform === 'naver' ? '네이버 커머스' : 'Shopify'} API 설정
          </Typography>
          <Chip
            icon={<CheckIcon />}
            label="연결됨"
            color="success"
            size="small"
            sx={{ display: testResult?.success ? 'flex' : 'none' }}
          />
        </Box>

        <Stack spacing={2}>
          {platform === 'naver' ? renderNaverConfig() : renderShopifyConfig()}

          {testResult && (
            <Alert severity={testResult.success ? 'success' : 'error'}>
              {testResult.message}
            </Alert>
          )}
        </Stack>
      </CardContent>

      <CardActions sx={{ justifyContent: 'space-between' }}>
        <Button
          onClick={handleTest}
          disabled={isTesting}
          startIcon={isTesting ? <CircularProgress size={16} /> : null}
        >
          {isTesting ? '테스트 중...' : '연결 테스트'}
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!testResult?.success}
        >
          저장
        </Button>
      </CardActions>
    </Card>
  );
};

export default APIConfig;
