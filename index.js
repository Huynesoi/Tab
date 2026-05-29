const express = require('express');
const app = express();
app.use(express.json());

// Lưu trữ trạng thái theo IP mạng của bạn
const serverState = {};
const BASE_POWER_KW = 0.04; 
const ELECTRICITY_RATE = 2500;

app.post('/api/sync-power', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Khởi tạo State cho IP mới nếu chưa có
    if (!serverState[ip]) {
        serverState[ip] = { 
            clients: {}, 
            globalFps: 10, 
            globalAntiLag: false, 
            resetTimestamp: Date.now() 
        };
    }
    const state = serverState[ip];
    const { sessionId, accountName, ram, fps, action, actionValue } = req.body;

    // XỬ LÝ LỆNH ĐIỀU KHIỂN TỪ CLIENT (NẾU CÓ)
    if (action === "reset_cost") {
        state.resetTimestamp = Date.now();
    } else if (action === "set_fps") {
        state.globalFps = Number(actionValue);
    } else if (action === "toggle_antilag") {
        state.globalAntiLag = Boolean(actionValue);
    }

    // DỌN DẸP TAB AFK (12s không ping)
    const now = Date.now();
    for (const id in state.clients) {
        if (now - state.clients[id].lastPing > 12000) {
            delete state.clients[id];
        }
    }

    // TÍNH TOÁN CHO TAB GỬI REQUEST
    if (sessionId) {
        const totalActiveTabs = Object.keys(state.clients).length + (state.clients[sessionId] ? 0 : 1);
        const sharedBasePower = BASE_POWER_KW / totalActiveTabs;
        const tabSpecificLoad = ((Number(ram) / 1000) * 0.012) + ((Number(fps) / 60) * 0.035);
        const tabTotalKWPerHour = sharedBasePower + tabSpecificLoad;
        
        state.clients[sessionId] = {
            accountName: accountName || "Unknown",
            lastPing: now,
            cost24h: tabTotalKWPerHour * 24 * ELECTRICITY_RATE
        };
    }

    // TỔNG HỢP LOGS VÀ TỔNG TIỀN
    let totalNetworkCost24h = 0;
    const logs = [];
    let activeTabCount = 0;
    for (const id in state.clients) {
        activeTabCount++;
        totalNetworkCost24h += state.clients[id].cost24h;
        logs.push({
            name: state.clients[id].accountName,
            cost: Math.floor(state.clients[id].cost24h)
        });
    }

    // TRẢ VỀ DỮ LIỆU ĐỒNG BỘ CHO TẤT CẢ CÁC TAB
    res.json({
        success: true,
        activeTabs: activeTabCount,
        tabCostPer24h: state.clients[sessionId]?.cost24h || 0,
        totalNetworkCost24h: totalNetworkCost24h,
        logs: logs,
        globalFps: state.globalFps,
        globalAntiLag: state.globalAntiLag,
        resetTimestamp: state.resetTimestamp
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
