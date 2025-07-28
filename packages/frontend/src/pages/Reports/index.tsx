// packages/frontend/src/pages/Reports/index.tsx
import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Divider,
  Tab,
  Tabs,
  Alert,
} from '@mui/material';
import {
  Download as DownloadIcon,
  DateRange as DateRangeIcon,
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

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
      id={`report-tabpanel-${index}`}
      aria-labelledby={`report-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

const Reports: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [period, setPeriod] = useState('week');
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(new Date());

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleExportReport = () => {
    console.log('Export report');
  };

  // 차트 데이터
  const salesChartData = {
    labels: ['월', '화', '수', '목', '금', '토', '일'],
    datasets: [
      {
        label: '네이버 판매',
        data: [65, 59, 80, 81, 56, 55, 40],
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
      {
        label: 'Shopify 판매',
        data: [45, 39, 60, 71, 46, 35, 30],
        fill: false,
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
      },
    ],
  };

  const inventoryChartData = {
    labels: ['재고 충분', '재고 부족', '재고 없음'],
    datasets: [
      {
        data: [300, 50, 100],
        backgroundColor: [
          'rgba(75, 192, 192, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(255, 99, 132, 0.8)',
        ],
      },
    ],
  };

  const syncChartData = {
    labels: ['1월', '2월', '3월', '4월', '5월', '6월'],
    datasets: [
      {
        label: '동기화 성공',
        data: [1200, 1900, 3000, 5000, 4000, 3500],
        backgroundColor: 'rgba(75, 192, 192, 0.8)',
      },
      {
        label: '동기화 실패',
        data: [100, 200, 100, 50, 20, 10],
        backgroundColor: 'rgba(255, 99, 132, 0.8)',
      },
    ],
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          리포트 및 분석
        </Typography>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleExportReport}
        >
          리포트 내보내기
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>기간 선택</InputLabel>
              <Select
                value={period}
                label="기간 선택"
                onChange={(e) => setPeriod(e.target.value)}
              >
                <MenuItem value="day">일별</MenuItem>
                <MenuItem value="week">주별</MenuItem>
                <MenuItem value="month">월별</MenuItem>
                <MenuItem value="custom">사용자 지정</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {period === 'custom' && (
            <>
              <Grid item xs={12} md={3}>
                <DatePicker
                  label="시작 날짜"
                  value={startDate}
                  onChange={(newValue) => setStartDate(newValue)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <DatePicker
                  label="종료 날짜"
                  value={endDate}
                  onChange={(newValue) => setEndDate(newValue)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                />
              </Grid>
            </>
          )}
        </Grid>
      </Paper>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUpIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="subtitle2">총 판매량</Typography>
              </Box>
              <Typography variant="h4">1,234</Typography>
              <Typography variant="caption" color="success.main">
                +12.5% 지난 주 대비
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <MoneyIcon sx={{ mr: 1, color: 'success.main' }} />
                <Typography variant="subtitle2">총 매출</Typography>
              </Box>
              <Typography variant="h4">₩12.5M</Typography>
              <Typography variant="caption" color="success.main">
                +8.3% 지난 주 대비
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <InventoryIcon sx={{ mr: 1, color: 'warning.main' }} />
                <Typography variant="subtitle2">재고 회전율</Typography>
              </Box>
              <Typography variant="h4">4.2</Typography>
              <Typography variant="caption" color="text.secondary">
                월 평균
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <AssessmentIcon sx={{ mr: 1, color: 'info.main' }} />
                <Typography variant="subtitle2">동기화 성공률</Typography>
              </Box>
              <Typography variant="h4">98.5%</Typography>
              <Typography variant="caption" color="success.main">
                +0.5% 개선
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="판매 분석" />
          <Tab label="재고 현황" />
          <Tab label="동기화 통계" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          <TabPanel value={tabValue} index={0}>
            <Typography variant="h6" gutterBottom>
              플랫폼별 판매 추이
            </Typography>
            <Box sx={{ height: 400 }}>
              <Line data={salesChartData} options={{ maintainAspectRatio: false }} />
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={8}>
                <Typography variant="h6" gutterBottom>
                  재고 상태 분포
                </Typography>
                <Box sx={{ height: 400 }}>
                  <Doughnut data={inventoryChartData} options={{ maintainAspectRatio: false }} />
                </Box>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="h6" gutterBottom>
                  재고 경고
                </Typography>
                <Stack spacing={2}>
                  <Alert severity="warning">
                    5개 상품이 재고 부족 상태입니다.
                  </Alert>
                  <Alert severity="error">
                    2개 상품의 재고가 없습니다.
                  </Alert>
                </Stack>
              </Grid>
            </Grid>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Typography variant="h6" gutterBottom>
              월별 동기화 현황
            </Typography>
            <Box sx={{ height: 400 }}>
              <Bar data={syncChartData} options={{ maintainAspectRatio: false }} />
            </Box>
          </TabPanel>
        </Box>
      </Paper>
    </Box>
  );
};

export default Reports;