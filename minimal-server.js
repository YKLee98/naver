// minimal-server.js
const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Mock data
const mockStats = {
  totalProducts: 150,
  activeProducts: 120,
  totalSales: 85,
  syncStatus: {
    synced: 100,
    pending: 30,
    error: 20
  },
  inventoryStatus: {
    inStock: 90,
    lowStock: 20,
    outOfStock: 10
  },
  recentActivity: []
};

// Routes
app.get('/api/v1/dashboard/stats', (req, res) => {
  console.log('GET /api/v1/dashboard/stats');
  res.json(mockStats);
});

app.get('/api/v1/dashboard/activity', (req, res) => {
  console.log('GET /api/v1/dashboard/activity');
  res.json({
    data: [
      {
        _id: '1',
        type: 'sync',
        action: '재고 동기화 완료',
        details: '50개 상품 업데이트됨',
        createdAt: new Date().toISOString()
      },
      {
        _id: '2',
        type: 'price_update',
        action: '가격 업데이트',
        details: '환율 변경 적용됨',
        createdAt: new Date(Date.now() - 3600000).toISOString()
      }
    ]
  });
});

// 기타 필요한 엔드포인트들
app.get('/api/v1/products', (req, res) => {
  res.json({ data: [], total: 0, page: 1, totalPages: 0 });
});

app.get('/api/v1/inventory/status', (req, res) => {
  res.json({ data: [], total: 0, page: 1, totalPages: 0 });
});

app.get('/api/v1/mappings', (req, res) => {
  res.json({ data: [], total: 0, page: 1, totalPages: 0 });
});

app.get('/api/v1/settings', (req, res) => {
  res.json([]);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  console.log(`404 - ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🚀 Mock Backend Server is running!
📡 Port: ${PORT}
🌐 URL: http://localhost:${PORT}
💡 Health check: http://localhost:${PORT}/health
  `);
});