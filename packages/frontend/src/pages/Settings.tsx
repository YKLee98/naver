// packages/frontend/src/pages/Settings.tsx
import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Tabs,
  Tab,
  TextField,
  Button,
  Stack,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  IconButton,
  InputAdornment,
  Chip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Science as TestIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { SYNC_INTERVALS } from '@/utils/constants';

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
      id={`settings-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [showPassword, setShowPassword] = useState({
    naver: false,
    shopify: false,
  });

  const { control: apiControl, handleSubmit: handleApiSubmit } = useForm({
    defaultValues: {
      naverClientId: '',
      naverClientSecret: '',
      naverStoreId: '',
      shopifyShopDomain: '',
      shopifyAccessToken: '',
    },
  });

  const { control: syncControl, handleSubmit: handleSyncSubmit } = useForm({
    defaultValues: {
      syncInterval: 15,
      autoSync: true,
      syncInventory: true,
      syncPrice: true,
      priceMargin: 10,
      conflictResolution: 'naver',
    },
  });

  const { control: notificationControl, handleSubmit: handleNotificationSubmit } = useForm({
    defaultValues: {
      emailNotifications: true,
      notificationEmail: '',
      lowStockAlert: true,
      lowStockThreshold: 10,
      syncErrorAlert: true,
      dailyReport: false,
    },
  });

  const handleApiSave = (data: any) => {
    console.log('Saving API settings:', data);
  };

  const handleSyncSave = (data: any) => {
    console.log('Saving sync settings:', data);
  };

  const handleNotificationSave = (data: any) => {
    console.log('Saving notification settings:', data);
  };

  const handleTestConnection = (platform: 'naver' | 'shopify') => {
    console.log('Testing connection:', platform);
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          설정
        </Typography>
        <Typography variant="body1" color="text.secondary">
          시스템 설정을 관리하고 API 연결을 구성하세요.
        </Typography>
      </Box>

      <Paper>
        <Tabs
          value={activeTab}
          onChange={(e, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="API 설정" />
          <Tab label="동기화 설정" />
          <Tab label="알림 설정" />
          <Tab label="시스템 정보" />
        </Tabs>

        {/* API 설정 */}
        <TabPanel value={activeTab} index={0}>
          <form onSubmit={handleApiSubmit(handleApiSave)}>
            <Stack spacing={4}>
              {/* 네이버 API */}
              <Box>
                <Typography variant="h6" gutterBottom>
                  네이버 커머스 API
                </Typography>
                <Stack spacing={2}>
                  <Controller
                    name="naverClientId"
                    control={apiControl}
                    rules={{ required: 'Client ID를 입력하세요' }}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        label="Client ID"
                        fullWidth
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                      />
                    )}
                  />
                  <Controller
                    name="naverClientSecret"
                    control={apiControl}
                    rules={{ required: 'Client Secret을 입력하세요' }}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        type={showPassword.naver ? 'text' : 'password'}
                        label="Client Secret"
                        fullWidth
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => setShowPassword({
                                  ...showPassword,
                                  naver: !showPassword.naver,
                                })}
                              >
                                {showPassword.naver ? <VisibilityOffIcon /> : <VisibilityIcon />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}
                  />
                  <Controller
                    name="naverStoreId"
                    control={apiControl}
                    rules={{ required: 'Store ID를 입력하세요' }}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        label="Store ID"
                        fullWidth
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                      />
                    )}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<TestIcon />}
                    onClick={() => handleTestConnection('naver')}
                  >
                    연결 테스트
                  </Button>
                </Stack>
              </Box>

              <Divider />

              {/* Shopify API */}
              <Box>
                <Typography variant="h6" gutterBottom>
                  Shopify API
                </Typography>
                <Stack spacing={2}>
                  <Controller
                    name="shopifyShopDomain"
                    control={apiControl}
                    rules={{ required: 'Shop Domain을 입력하세요' }}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        label="Shop Domain"
                        placeholder="your-shop.myshopify.com"
                        fullWidth
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                      />
                    )}
                  />
                  <Controller
                    name="shopifyAccessToken"
                    control={apiControl}
                    rules={{ required: 'Access Token을 입력하세요' }}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        type={showPassword.shopify ? 'text' : 'password'}
                        label="Access Token"
                        fullWidth
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => setShowPassword({
                                  ...showPassword,
                                  shopify: !showPassword.shopify,
                                })}
                              >
                                {showPassword.shopify ? <VisibilityOffIcon /> : <VisibilityIcon />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<TestIcon />}
                    onClick={() => handleTestConnection('shopify')}
                  >
                    연결 테스트
                  </Button>
                </Stack>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                >
                  API 설정 저장
                </Button>
              </Box>
            </Stack>
          </form>
        </TabPanel>

        {/* 동기화 설정 */}
        <TabPanel value={activeTab} index={1}>
          <form onSubmit={handleSyncSubmit(handleSyncSave)}>
            <Stack spacing={3}>
              <Controller
                name="syncInterval"
                control={syncControl}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>동기화 주기</InputLabel>
                    <Select {...field} label="동기화 주기">
                      {SYNC_INTERVALS.map((interval) => (
                        <MenuItem key={interval.value} value={interval.value}>
                          {interval.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />

              <Controller
                name="autoSync"
                control={syncControl}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch {...field} checked={field.value} />}
                    label="자동 동기화 활성화"
                  />
                )}
              />

              <Controller
                name="syncInventory"
                control={syncControl}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch {...field} checked={field.value} />}
                    label="재고 동기화"
                  />
                )}
              />

              <Controller
                name="syncPrice"
                control={syncControl}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch {...field} checked={field.value} />}
                    label="가격 동기화"
                  />
                )}
              />

              <Controller
                name="priceMargin"
                control={syncControl}
                render={({ field }) => (
                  <TextField
                    {...field}
                    type="number"
                    label="기본 마진율 (%)"
                    fullWidth
                    InputProps={{
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                    }}
                  />
                )}
              />

              <Controller
                name="conflictResolution"
                control={syncControl}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>충돌 해결 방식</InputLabel>
                    <Select {...field} label="충돌 해결 방식">
                      <MenuItem value="naver">네이버 우선</MenuItem>
                      <MenuItem value="shopify">Shopify 우선</MenuItem>
                      <MenuItem value="manual">수동 해결</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                >
                  동기화 설정 저장
                </Button>
              </Box>
            </Stack>
          </form>
        </TabPanel>

        {/* 알림 설정 */}
        <TabPanel value={activeTab} index={2}>
          <form onSubmit={handleNotificationSubmit(handleNotificationSave)}>
            <Stack spacing={3}>
              <Controller
                name="emailNotifications"
                control={notificationControl}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch {...field} checked={field.value} />}
                    label="이메일 알림 활성화"
                  />
                )}
              />

              <Controller
                name="notificationEmail"
                control={notificationControl}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    type="email"
                    label="알림 이메일"
                    fullWidth
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                  />
                )}
              />

              <Controller
                name="lowStockAlert"
                control={notificationControl}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch {...field} checked={field.value} />}
                    label="재고 부족 알림"
                  />
                )}
              />

              <Controller
                name="lowStockThreshold"
                control={notificationControl}
                render={({ field }) => (
                  <TextField
                    {...field}
                    type="number"
                    label="재고 부족 임계값"
                    fullWidth
                    helperText="이 수량 이하일 때 알림을 받습니다"
                  />
                )}
              />

              <Controller
                name="syncErrorAlert"
                control={notificationControl}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch {...field} checked={field.value} />}
                    label="동기화 오류 알림"
                  />
                )}
              />

              <Controller
                name="dailyReport"
                control={notificationControl}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch {...field} checked={field.value} />}
                    label="일일 리포트 수신"
                  />
                )}
              />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                >
                  알림 설정 저장
                </Button>
              </Box>
            </Stack>
          </form>
        </TabPanel>

        {/* 시스템 정보 */}
        <TabPanel value={activeTab} index={3}>
          <Stack spacing={3}>
            <Alert severity="info">
              시스템 버전: 1.0.0
            </Alert>
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                API 상태
              </Typography>
              <Stack spacing={1}>
                <Typography variant="body2">
                  네이버 API: <Chip label="연결됨" color="success" size="small" />
                </Typography>
                <Typography variant="body2">
                  Shopify API: <Chip label="연결됨" color="success" size="small" />
                </Typography>
              </Stack>
            </Box>
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                시스템 리소스
              </Typography>
              <Stack spacing={1}>
                <Typography variant="body2">CPU 사용률: 23%</Typography>
                <Typography variant="body2">메모리 사용률: 45%</Typography>
                <Typography variant="body2">디스크 사용률: 67%</Typography>
              </Stack>
            </Box>
          </Stack>
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default Settings;