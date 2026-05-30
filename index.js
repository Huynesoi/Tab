const express = require('express');
const app = express();
app.use(express.json());

// Lưu trữ bộ nhớ cache phiên làm việc
let sessionDatabase = {}; 
let globalSettings = {
    globalFps: 10,
    globalAntiLag: false,
    remoteScript: "",
    accumulatedTotalCost: 0,
    lastResetTimestamp: Date.now(),
    partyOwners: {} // partyId -> accountName
};

// Vòng lặp dọn dẹp các tab mất kết nối (quá 15 giây không gửi tín hiệu)
setInterval(() => {
    const now = Date.now();
    Object.keys(sessionDatabase).forEach(id => {
        if (now - sessionDatabase[id].lastSeen > 15000) {
            delete sessionDatabase[id];
        }
    });
}, 5000);

app.post('/api/sync-power', (req, res) => {
    const { sessionId, partyId, accountName, ram, fps, region, incognito, action, actionValue } = req.body;
    const now = Date.now();

    // 1. Xử lý các lệnh điều khiển từ xa (Actions)
    if (action) {
        if (action === "set_fps") globalSettings.globalFps = Number(actionValue);
        if (action === "toggle_antilag") globalSettings.globalAntiLag = Boolean(actionValue);
        if (action === "run_remote_script") globalSettings.remoteScript = String(actionValue);
        if (action === "reset_cost") {
            globalSettings.accumulatedTotalCost = 0;
            globalSettings.lastResetTimestamp = now;
        }
        if (action === "disband_party" && sessionId) {
            const userSession = sessionDatabase[sessionId];
            if (userSession) {
                const pId = userSession.partyId;
                delete globalSettings.partyOwners[pId];
                Object.keys(sessionDatabase).forEach(id => {
                    if (sessionDatabase[id].partyId === pId) {
                        sessionDatabase[id].partyId = "GLOBAL";
                    }
                });
                return res.json({ success: true, actionBroadcast: "disband_party" });
            }
        }
        return res.json({ success: true });
    }

    if (!sessionId || !accountName) {
        return res.status(400).json({ success: false, error: "Missing identity data" });
    }

    // 2. Xử lý logic ẨN DANH: Nếu ON, xóa sạch dữ liệu cũ/hiện tại khỏi Log hệ thống ngay lập tức
    if (incognito) {
        if (sessionDatabase[sessionId]) {
            delete sessionDatabase[sessionId];
        }
        // Trả về dữ liệu trống an toàn để Client không bị lỗi hiển thị
        return res.json({
            success: true,
            activeTabs: 0,
            tabCostPer24h: 0,
            totalNetworkCost24h: 0,
            totalNetworkCostPerSec: 0,
            accumulatedTotalCost: 0,
            globalFps: globalSettings.globalFps,
            globalAntiLag: globalSettings.globalAntiLag,
            remoteScript: globalSettings.remoteScript,
            resetTimestamp: globalSettings.lastResetTimestamp,
            logs: []
        });
    }

    // 3. Cập nhật dữ liệu Session (Lọc trùng tuyệt đối bằng sessionId)
    sessionDatabase[sessionId] = {
        id: sessionId,
        name: accountName,
        partyId: partyId || "GLOBAL",
        ram: Number(ram) || 0,
        fps: Number(fps) || 0,
        region: region || "VN",
        incognito: false,
        lastSeen: now
    };

    // Đăng ký chủ Party nếu chưa có
    if (partyId && partyId !== "GLOBAL" && !globalSettings.partyOwners[partyId]) {
        globalSettings.partyOwners[partyId] = accountName;
    }

    // 4. Tính toán Chi phí Điện Năng cho mạng chung (All Tab đang hoạt động)
    let activeTabsCount = 0;
    let totalFps = 0;
    let totalRam = 0;
    let logsList = [];

    Object.values(sessionDatabase).forEach(session => {
        activeTabsCount++;
        totalFps += session.fps;
        totalRam += session.ram;
        logsList.push({
            name: session.name,
            partyId: session.partyId,
            ram: session.ram,
            fps: session.fps,
            region: session.region,
            incognito: false
        });
    });

    // Công thức tính toán điện năng mạng chung
    const electricityRate = 2500; 
    const totalLoadKW = ((totalRam / 1000) * 0.012) + ((totalFps / 60) * 0.035);
    const totalNetworkCostPerSec = (totalLoadKW * (electricityRate / 3600));
    
    // Tích lũy tiền điện server theo thời gian thực (5 giây cập nhật 1 lần)
    globalSettings.accumulatedTotalCost += (totalNetworkCostPerSec * 5);
    const totalNetworkCost24h = totalNetworkCostPerSec * 86400;

    // Phản hồi dữ liệu đồng bộ về Client
    res.json({
        success: true,
        activeTabs: activeTabsCount,
        totalNetworkCost24h: totalNetworkCost24h,
        totalNetworkCostPerSec: totalNetworkCostPerSec,
        accumulatedTotalCost: globalSettings.accumulatedTotalCost,
        globalFps: globalSettings.globalFps,
        globalAntiLag: globalSettings.globalAntiLag,
        remoteScript: globalSettings.remoteScript,
        resetTimestamp: globalSettings.lastResetTimestamp,
        partyOwner: partyId ? globalSettings.partyOwners[partyId] : "",
        logs: logsList
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server chạy tại port ${PORT}`));
