import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Grid,
  Paper,
  Button,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  DatePicker,
  Card,
  CardContent,
  CardActions,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  Download as DownloadIcon,
  Assessment as ReportIcon,
  Schedule as ScheduleIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import ko from 'date-fns/locale/ko';

const reportTypes = [
  {
    id: 'inventory',
    title: '재고 리포트',
    description: '재고 현황, 변동 내역, 불일치 항목 등을 포함한 종합 재고 리포트',
    icon: <ReportIcon />,
  },
  {
    id: 'sales',
    title: '판매 리포트',
    description: '플랫폼별 판매 현황, 베스트셀러, 판매 추이 분석',
    icon: <ReportIcon />,
  },
  {
    id: 'sync',
    title: '동기화 리포트',
    description: '동기화 성공/실패 내역, 오류 분석, 성능 지표',
    icon: <ReportIcon />,
  },
  {
    id: 'price',
    title: '가격 분석 리포트',
    description: '가격 변동 이력, 마진 분석, 환율 영향 분석',
    icon: <ReportIcon />,
  },
];

const Reports: React.FC = () => {
  const [selectedReport, setSelectedReport] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)),
    end: new Date(),
  });
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const handleGenerateReport = (reportId: string) => {
    console.log('Generating report:', reportId, dateRange);
  };

  const handleScheduleReport = (reportId: string) => {
    setSelectedReport(reportId);
    setScheduleOpen(true);
  };

  const handleExportReport = (reportId: string, format: 'pdf' | 'excel' | 'csv') => {
    console.log('Exporting report:', reportId, format);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ko}>
      <Container maxWidth="xl">
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            리포트
          </Typography>
          <Typography variant="body1" color="text.secondary">
            다양한 분석 리포트를 생성하고 내보내세요.
          </Typography>
        </Box>

        {/* 날짜 범위 선택 */}
        <Paper sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            리포트 기간 설정
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <DatePicker
              label="시작일"
              value={dateRange.start}
              onChange={(date) => date && setDateRange({ ...dateRange, start: date })}
              renderInput={(params) => <TextField {...params} />}
            />
            <Typography>~</Typography>
            <DatePicker
              label="종료일"
              value={dateRange.end}
              onChange={(date) => date && setDateRange({ ...dateRange, end: date })}
              renderInput={(params) => <TextField {...params} />}
            />
            <Button variant="outlined">
              빠른 선택
            </Button>
          </Stack>
        </Paper>

        {/* 리포트 유형 */}
        <Grid container spacing={3}>
          {reportTypes.map((report) => (
            <Grid item xs={12} md={6} key={report.id}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    {report.icon}
                    <Typography variant="h6" sx={{ ml: 1 }}>
                      {report.title}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {report.description}
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<ReportIcon />}
                    onClick={() => handleGenerateReport(report.id)}
                  >
                    생성
                  </Button>
                  <Button
                    size="small"
                    startIcon={<ScheduleIcon />}
                    onClick={() => handleScheduleReport(report.id)}
                  >
                    예약
                  </Button>
                  <Button
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={() => handleExportReport(report.id, 'excel')}
                  >
                    Excel
                  </Button>
                  <Button
                    size="small"
                    startIcon={<DownloadIcon />}
                    onClick={() => handleExportReport(report.id, 'pdf')}
                  >
                    PDF
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* 예약된 리포트 */}
        <Paper sx={{ p: 3, mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            예약된 리포트
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              예약된 리포트가 없습니다.
            </Typography>
          </Box>
        </Paper>
      </Container>
    </LocalizationProvider>
  );
};

export default Reports;

