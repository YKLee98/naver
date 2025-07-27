// packages/frontend/src/components/Dialogs/BulkUploadDialog.tsx
import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from '@mui/material';

interface BulkUploadDialogProps {
  open: boolean;
  onClose: () => void;
}

const BulkUploadDialog: React.FC<BulkUploadDialogProps> = ({ open, onClose }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>대량 업로드</DialogTitle>
      <DialogContent>
        <Typography>대량 업로드 기능이 여기에 구현됩니다.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={onClose}>
          업로드
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkUploadDialog;