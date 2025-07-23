// packages/frontend/src/components/common/BackupRestore/index.tsx
import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Chip,
} from '@mui/material';
import {
  CloudUpload as BackupIcon,
  CloudDownload as RestoreIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useGetBackupsQuery, useCreateBackupMutation, useRestoreBackupMutation } from '@store/api/apiSlice';
import { formatDateTime, formatFileSize } from '@utils/formatters';
import { useNotification } from '@hooks/useNotification';

const BackupRestore: React.FC = () => {
  const notify = useNotification();
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; action: string; id?: string }>({
    open: false,
    action: '',
  });
  
  const { data: backups, isLoading, refetch } = useGetBackupsQuery();
  const [createBackup, { isLoading: isCreating }] = useCreateBackupMutation();
  const [restoreBackup, { isLoading: isRestoring }] = useRestoreBackupMutation();

  const handleCreateBackup = async () => {
    try {
      await createBackup({
        description: `수동 백업 - ${formatDateTime(new Date())}`,
      }).unwrap();
      notify.success('백업 완료', '데이터 백업이 성공적으로 생성되었습니다.');
      refetch();
    } catch (error) {
      notify.error('백업 실패', '백업 생성 중 오류가 발생했습니다.');
    }
  };

  const handleRestore = async (backupId: string) => {
    try {
      await restoreBackup(backupId).unwrap();
      notify.success('복원 완료', '데이터가 성공적으로 복원되었습니다.');
      setConfirmDialog({ open: false, action: '' });
      // 페이지 새로고침
      window.location.reload();
    } catch (error) {
      notify.error('복원 실패', '데이터 복원 중 오류가 발생했습니다.');
    }
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6">백업 및 복원</Typography>
          <Button
            variant="contained"
            startIcon={<BackupIcon />}
            onClick={handleCreateBackup}
            disabled={isCreating}
          >
            {isCreating ? '백업 중...' : '새 백업 생성'}
          </Button>
        </Box>

        <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 3 }}>
          정기적인 백업으로 데이터를 안전하게 보호하세요. 자동 백업은 매일 새벽 3시에 실행됩니다.
        </Alert>

        {isLoading ? (
          <LinearProgress />
        ) : (
          <List>
            {backups?.map((backup: any) => (
              <ListItem key={backup.id} divider>
                <ListItemText
                  primary={backup.description}
                  secondary={
                    <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                      <Typography variant="caption">
                        생성: {formatDateTime(backup.createdAt)}
                      </Typography>
                      <Typography variant="caption">
                        크기: {formatFileSize(backup.size)}
                      </Typography>
                      <Chip
                        label={backup.type === 'auto' ? '자동' : '수동'}
                        size="small"
                        color={backup.type === 'auto' ? 'default' : 'primary'}
                      />
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Button
                    size="small"
                    startIcon={<RestoreIcon />}
                    onClick={() => setConfirmDialog({ open: true, action: 'restore', id: backup.id })}
                    sx={{ mr: 1 }}
                  >
                    복원
                  </Button>
                  <IconButton
                    edge="end"
                    onClick={() => setConfirmDialog({ open: true, action: 'delete', id: backup.id })}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>

      {/* 확인 다이얼로그 */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, action: '' })}
      >
        <DialogTitle>
          {confirmDialog.action === 'restore' ? '백업 복원' : '백업 삭제'}
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            {confirmDialog.action === 'restore'
              ? '현재 데이터가 선택한 백업으로 대체됩니다. 계속하시겠습니까?'
              : '백업을 삭제하면 복구할 수 없습니다. 계속하시겠습니까?'}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, action: '' })}>
            취소
          </Button>
          <Button
            variant="contained"
            color={confirmDialog.action === 'restore' ? 'primary' : 'error'}
            onClick={() => {
              if (confirmDialog.action === 'restore' && confirmDialog.id) {
                handleRestore(confirmDialog.id);
              }
            }}
            disabled={isRestoring}
          >
            {confirmDialog.action === 'restore' ? '복원' : '삭제'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default BackupRestore;