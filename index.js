const express = require('express');
const app = express();
app.use(express.json());

let sessionDatabase = {}; 
let globalSettings = {
    globalFps: 10,
    globalAntiLag: false,
    remoteScript: "",
    accumulatedTotalCost: 0,
    lastResetTimestamp: Date.now(),
    partyOwners: {} // partyId -> accountName
};

// Vòng lặp quét trạng thái: Quá 15 giây không gửi tín hiệu -> Chuyển sang OFFLINE chứ KHÔNG xóa log
setInterval(() => {
    const now = Date.now();
    Object.keys(sessionDatabase).forEach(id => {
        if (sessionDatabase[id].isOnline && (now - sessionDatabase[id].lastSeen > 15000)) {
            sessionDatabase[id].isOnline = false; // Đánh dấu đã Offline
        }
    });
}, 5000);

app.post('/api/sync-power', (req, res) => {
    const { sessionId, partyId, accountName, ram, fps, region, incognito, action, actionValue } = req.body;
    const now = Date.now();

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

    // Nếu bật ẩn danh, xóa hẳn khỏi database để không ai nhìn thấy
    if (incognito) {
        if (sessionDatabase[sessionId]) {
            delete sessionDatabase[sessionId];
        }
        return res.json({
            success: true,
            activeTabs: 0,
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

    // Cập nhật hoặc ghi nhận mới session hoạt động (Đảm bảo On)
    sessionDatabase[sessionId] = {
        id: sessionId,
        name: accountName,
        partyId: partyId || "GLOBAL",
        ram: Number(ram) || 0,
        fps: Number(fps) || 0,
        region: region || "VN",
        isOnline: true,
        lastSeen: now
    };

    if (partyId && partyId !== "GLOBAL" && !globalSettings.partyOwners[partyId]) {
        globalSettings.partyOwners[partyId] = accountName;
    }

    let activeTabsCount = 0;
    let totalFps = 0;
    let totalRam = 0;
    let logsList = [];

    Object.values(sessionDatabase).forEach(session => {
        if (session.isOnline) {
            activeTabsCount++;
            totalFps += session.fps;
            totalRam += session.ram;
        }
        logsList.push({
            name: session.name,
            partyId: session.partyId,
            ram: session.ram,
            fps: session.fps,
            region: session.region,
            isOnline: session.isOnline
        });
    });

    const electricityRate = 2500; 
    const totalLoadKW = ((totalRam / 1000) * 0.025) + ((totalFps / 60) * 0.035);
    const totalNetworkCostPerSec = (totalLoadKW * (electricityRate / 3600));
    
    globalSettings.accumulatedTotalCost += (totalNetworkCostPerSec * 5);
    const totalNetworkCost24h = totalNetworkCostPerSec * 86400;

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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
