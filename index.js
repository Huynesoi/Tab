const express = require('express');
const app = express();
app.use(express.json());

const serverState = {};
const BASE_POWER_KW = 0.04; // Điện nền gốc (40W) dùng chung cho tất cả tab
const ELECTRICITY_RATE = 2500;

app.post('/api/sync-power', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    if (!serverState[ip]) {
        serverState[ip] = { 
            clients: {}, globalFps: 10, globalAntiLag: false, resetTimestamp: Date.now() 
        };
    }
    const state = serverState[ip];
    const { sessionId, accountName, ram, fps, action, actionValue } = req.body;

    // Xử lý lệnh Reset Tổng Tiền (Chỉ reset tiền, không reset thời gian treo)
    if (action === "reset_cost") {
        state.resetTimestamp = Date.now();
    } else if (action === "set_fps") {
        state.globalFps = Number(actionValue);
    } else if (action === "toggle_antilag") {
        state.globalAntiLag = Boolean(actionValue);
    }

    const now = Date.now();

    // Cập nhật tab gửi request
    if (sessionId) {
        state.clients[sessionId] = {
            accountName: accountName || "Unknown Acc",
            lastPing: now,
            ram: Number(ram) || 0,
            fps: Number(fps) || 0
        };
    }

    // TÍNH TOÁN ĐIỆN NĂNG CHIA SẺ VÀ XÓA TAB OFFLINE QUÁ LÂU
    let totalNetworkPowerKW = 0;
    let activeTabCount = 0;
    let hasActive = false;
    const logs = [];

    for (const id in state.clients) {
        const client = state.clients[id];
        const timeSinceLastPing = now - client.lastPing;
        
        // Nếu quá 60s không phản hồi -> Xóa hẳn khỏi server
        if (timeSinceLastPing > 60000) {
            delete state.clients[id];
            continue;
        }

        const isOffline = timeSinceLastPing > 15000; // Quá 15s -> Đánh dấu Đỏ (Offline/Văng)
        const isLag = !isOffline && (client.ram > 2000 || client.fps < 15); // Đánh dấu Vàng (Lag)

        let statusIcon = "🟢";
        if (isOffline) statusIcon = "🔴";
        else if (isLag) statusIcon = "🟡";

        if (!isOffline) {
            activeTabCount++;
            hasActive = true;
            // Tải thêm của riêng tab này
            const tabSpecificLoad = ((client.ram / 1000) * 0.012) + ((client.fps / 60) * 0.035);
            totalNetworkPowerKW += tabSpecificLoad;
        }

        // Tính chi phí mỗi giây cho Log
        const sharedBase = activeTabCount > 0 ? (BASE_POWER_KW / activeTabCount) : 0;
        const tabSpecificLoad = ((client.ram / 1000) * 0.012) + ((client.fps / 60) * 0.035);
        const costPerSec = ((sharedBase + tabSpecificLoad) * ELECTRICITY_RATE) / 3600;

        logs.push({
            name: client.accountName,
            statusIcon: statusIcon,
            ram: client.ram,
            fps: client.fps,
            costPerSec: costPerSec
        });
    }

    // Cộng dòng điện nền (40W) CHỈ 1 LẦN DÀNH CHO CẢ DÀN MÁY
    if (hasActive) {
        totalNetworkPowerKW += BASE_POWER_KW; 
    }

    // Tính tổng tiền điện 1 giây của toàn bộ dàn
    const totalNetworkCostPerSec = (totalNetworkPowerKW * ELECTRICITY_RATE) / 3600;

    res.json({
        success: true,
        activeTabs: activeTabCount,
        totalNetworkCostPerSec: totalNetworkCostPerSec, // Trả về số tiền mỗi giây
        logs: logs,
        globalFps: state.globalFps,
        globalAntiLag: state.globalAntiLag,
        resetTimestamp: state.resetTimestamp
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
