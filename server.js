// backend/server.js
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const config = require('./config/config');
const VPSMonitor = require('./vpsMonitor');

// Inisialisasi Express
const app = express();
app.use(cors());
app.use(express.json());

// Buat HTTP server
const server = require('http').createServer(app);

// Setup WebSocket server
const wss = new WebSocket.Server({ server });

// Inisialisasi VPS Monitor
const vpsMonitor = new VPSMonitor(config.vps);

// Tambahkan route untuk root path
app.get('/', (req, res) => {
    res.send('VPS Monitoring Server is running');
});

// WebSocket connection handler
wss.on('connection', async (ws) => {
    console.log('New client connected');
    
    try {
        // Kirim data awal
        const metrics = await vpsMonitor.getSystemMetrics();
        ws.send(JSON.stringify(metrics));

        // Setup interval untuk update regular
        const interval = setInterval(async () => {
            try {
                const metrics = await vpsMonitor.getSystemMetrics();
                ws.send(JSON.stringify(metrics));
            } catch (error) {
                console.error('Error sending metrics:', error);
            }
        }, 2000);

        // Cleanup pada disconnect
        ws.on('close', () => {
            clearInterval(interval);
            console.log('Client disconnected');
        });
    } catch (error) {
        console.error('Error in WebSocket connection:', error);
    }
});

// REST endpoints
app.get('/api/metrics', async (req, res) => {
    try {
        const metrics = await vpsMonitor.getSystemMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'Test endpoint working' });
});

// Test SSH Connection endpoint
app.get('/test-ssh', async (req, res) => {
  try {
      const result = await vpsMonitor.testConnection();
      res.json({ status: 'success', message: result });
  } catch (error) {
      console.error('SSH Test failed:', error);
      res.status(500).json({ 
          error: error.message,
          details: {
              host: process.env.VPS_HOST,
              user: process.env.VPS_USER,
              // Jangan tampilkan password di production
              connected: vpsMonitor.isConnected
          }
      });
  }
});

// Start server
const PORT = config.server.port;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});