const express = require('express');
const app = express();
app.use(express.json());

let sessionDatabase = {}; 
let globalSettings = {
    globalFps: 10,
    globalAntiLag: false,
    remoteScript: "",
    globalAccumulatedCost: 0, 
    lastResetTimestamp: Date.now(),
    partyOwners: {},        
    partyAccumulatedCosts: {} 
};

// Quét trạng thái offline sau 15 giây dựa trên tên tài khoản
setInterval(() => {
    const now = Date.now();
    Object.keys(sessionDatabase).forEach(name => {
        if (sessionDatabase[name].isOnline && (now - sessionDatabase[name].lastSeen > 15000)) {
            sessionDatabase[name].isOnline = false;
        }
    });
}, 5000);

app.post('/api/sync-power', (req, res) => {
    const { partyId, accountName, ram, fps, region, incognito, action, actionValue, localDeltaCost } = req.body;
    const now = Date.now();

    // KIỂM TRA BẢO MẬT: Nếu ẩn danh, chặn đứng mọi thao tác thay đổi hệ thống
    if (incognito && action) {
        return res.status(403).json({ success: false, error: "Incognito profiles are restricted from making system changes." });
    }

    // XỬ LÝ CÁC LỆNH ĐIỀU KHIỂN TỪ XA
    if (action) {
        if (action === "set_fps") globalSettings.globalFps = Number(actionValue);
        if (action === "toggle_antilag") globalSettings.globalAntiLag = Boolean(actionValue);
        if (action === "run_remote_script") globalSettings.remoteScript = String(actionValue);
        if (action === "reset_cost") {
            const currentParty = actionValue || "GLOBAL";
            if (currentParty === "GLOBAL") {
                globalSettings.globalAccumulatedCost = 0;
            } else {
                globalSettings.partyAccumulatedCosts[currentParty] = 0;
            }
            globalSettings.lastResetTimestamp = now;
        }
        if (action === "disband_party" && accountName) {
            const userSession = sessionDatabase[accountName];
            if (userSession) {
                const pId = userSession.partyId;
                delete globalSettings.partyOwners[pId];
                delete globalSettings.partyAccumulatedCosts[pId];
                Object.keys(sessionDatabase).forEach(name => {
                    if (sessionDatabase[name].partyId === pId) {
                        sessionDatabase[name].partyId = "GLOBAL";
                    }
                });
                return res.json({ success: true, actionBroadcast: "disband_party" });
            }
        }
        return res.json({ success: true });
    }

    if (!accountName) {
        return res.status(400).json({ success: false, error: "Missing identity data" });
    }

    // Nếu người chơi dùng chế độ ẩn danh, không ghi nhận vào Database để tránh lộ thông tin và tránh dupe log
    if (incognito) {
        if (sessionDatabase[accountName]) delete sessionDatabase[accountName];
        return res.json({
            success: true,
            activeTabs: 0,
            globalAccumulatedCost: globalSettings.globalAccumulatedCost,
            partyAccumulatedCost: 0,
            globalFps: globalSettings.globalFps,
            globalAntiLag: globalSettings.globalAntiLag,
            remoteScript: globalSettings.remoteScript,
            resetTimestamp: globalSettings.lastResetTimestamp,
            logs: []
        });
    }

    // Ghi đè trực tiếp dựa trên accountName để triệt tiêu lỗi Dupe Log
    sessionDatabase[accountName] = {
        name: accountName,
        partyId: partyId || "GLOBAL",
        ram: Number(ram) || 0,
        fps: Number(fps) || 0,
        region: region || "VN",
        isOnline: true,
        lastSeen: now
    };

    const currentPartyId = partyId || "GLOBAL";

    if (currentPartyId !== "GLOBAL" && !globalSettings.partyOwners[currentPartyId]) {
        globalSettings.partyOwners[currentPartyId] = accountName;
    }
    if (currentPartyId !== "GLOBAL" && globalSettings.partyAccumulatedCosts[currentPartyId] === undefined) {
        globalSettings.partyAccumulatedCosts[currentPartyId] = 0;
    }

    // Tích lũy tuyến tính chính xác từ chi phí đơn lẻ của máy client gửi lên
    const delta = Number(localDeltaCost) || 0;
    if (currentPartyId === "GLOBAL") {
        globalSettings.globalAccumulatedCost += delta;
    } else {
        globalSettings.partyAccumulatedCosts[currentPartyId] += delta;
    }

    // Thiết lập bộ lọc danh sách dữ liệu đầu ra công khai
    let activeTabsCount = 0;
    let logsList = [];

    Object.values(sessionDatabase).forEach(session => {
        if (session.partyId === currentPartyId) {
            if (session.isOnline) activeTabsCount++;
            logsList.push({
                name: session.name,
                partyId: session.partyId,
                ram: session.ram,
                fps: session.fps,
                region: session.region,
                isOnline: session.isOnline
            });
        }
    });

    res.json({
        success: true,
        activeTabs: activeTabsCount,
        globalAccumulatedCost: globalSettings.globalAccumulatedCost,
        partyAccumulatedCost: currentPartyId !== "GLOBAL" ? (globalSettings.partyAccumulatedCosts[currentPartyId] || 0) : 0,
        globalFps: globalSettings.globalFps,
        globalAntiLag: globalSettings.globalAntiLag,
        remoteScript: globalSettings.remoteScript,
        resetTimestamp: globalSettings.lastResetTimestamp,
        partyOwner: globalSettings.partyOwners[currentPartyId] || "",
        logs: logsList
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
