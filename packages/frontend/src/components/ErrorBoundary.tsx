import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { styled } from '@mui/material/styles';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const ErrorContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  margin: theme.spacing(2),
  textAlign: 'center',
  backgroundColor: theme.palette.error.light,
  color: theme.palette.error.contrastText,
}));

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    if (import.meta.env.VITE_SENTRY_DSN) {
      console.log('Sentry error logging would go here');
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      return (
        <ErrorContainer elevation={3}>
          <Typography variant="h4" gutterBottom>
            문제가 발생했습니다
          </Typography>
          <Typography variant="body1" paragraph>
            애플리케이션에서 예기치 않은 오류가 발생했습니다.
          </Typography>
          {import.meta.env.DEV && this.state.error && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
              <Typography variant="body2" color="error" sx={{ fontFamily: 'monospace', textAlign: 'left' }}>
                {this.state.error.toString()}
              </Typography>
              {this.state.errorInfo && (
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', textAlign: 'left', mt: 1 }}>
                  {this.state.errorInfo.componentStack}
                </Typography>
              )}
            </Box>
          )}
          <Box sx={{ mt: 3 }}>
            <Button variant="contained" onClick={this.handleReset} sx={{ mr: 2 }}>
              다시 시도
            </Button>
            <Button variant="outlined" onClick={() => window.location.href = '/'}>
              홈으로 이동
            </Button>
          </Box>
        </ErrorContainer>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;