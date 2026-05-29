// index.js
const express = require('express');
const app = express();
app.use(express.json());

// Lưu trữ dữ liệu các tab: { ip_address: { sessionId: { lastPing, ram, fps } } }
const activeClients = {};

// Hằng số điện năng
const BASE_POWER_KW = 0.04; // Điện nền của PC/Laptop (40W)
const ELECTRICITY_RATE = 2500; // Giá điện VNĐ/kWh

app.post('/api/sync-power', (req, res) => {
    // Lấy IP của người dùng (Render dùng x-forwarded-for)
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const { sessionId, ram, fps } = req.body;

    if (!activeClients[ip]) {
        activeClients[ip] = {};
    }

    // Cập nhật thời gian ping cuối cùng của Tab này
    activeClients[ip][sessionId] = { 
        lastPing: Date.now(), 
        ram: Number(ram), 
        fps: Number(fps) 
    };

    // Dọn dẹp các Tab đã tắt (không ping trong 10 giây)
    let totalActiveTabs = 0;
    const now = Date.now();
    for (const id in activeClients[ip]) {
        if (now - activeClients[ip][id].lastPing > 10000) {
            delete activeClients[ip][id];
        } else {
            totalActiveTabs++;
        }
    }

    // TÍNH TOÁN ĐIỆN NĂNG CHO RIÊNG TAB NÀY
    // 1. Chia đều tiền điện nền cho số lượng tab đang mở
    const sharedBasePowerKW = BASE_POWER_KW / totalActiveTabs;
    
    // 2. Tính lượng điện phát sinh do phần cứng phải xử lý đồ họa/RAM cho tab này
    const tabSpecificLoadKW = ((ram / 1000) * 0.012) + ((fps / 60) * 0.035);
    
    // 3. Tổng điện của Tab này
    const totalKW_PerHour = sharedBasePowerKW + tabSpecificLoadKW;
    const cost_PerHour = totalKW_PerHour * ELECTRICITY_RATE;

    res.json({
        success: true,
        activeTabs: totalActiveTabs,
        tabKWPerHour: totalKW_PerHour,
        tabCostPerHour: cost_PerHour,
        tabCostPer24h: cost_PerHour * 24
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server chạy trên port ${PORT}`);
});
