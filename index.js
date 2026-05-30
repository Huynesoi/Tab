const express = require('express');
const app = express();
app.use(express.json());

let sessionDatabase = {}; 
let globalSettings = {
    globalFps: 10,
    globalAntiLag: false,
    remoteScript: "",
    globalAccumulatedCost: 0, // Lưu tiền điện thực tế tích lũy của toàn hệ thống Global
    lastResetTimestamp: Date.now(),
    partyOwners: {},        // partyId -> accountName
    partyAccumulatedCosts: {} // partyId -> Số tiền tích lũy riêng của Party đó
};

// Quét trạng thái offline sau 15 giây
setInterval(() => {
    const now = Date.now();
    Object.keys(sessionDatabase).forEach(id => {
        if (sessionDatabase[id].isOnline && (now - sessionDatabase[id].lastSeen > 15000)) {
            sessionDatabase[id].isOnline = false;
        }
    });
}, 5000);

app.post('/api/sync-power', (req, res) => {
    const { sessionId, partyId, accountName, ram, fps, region, incognito, action, actionValue, localDeltaCost } = req.body;
    const now = Date.now();

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
        if (action === "disband_party" && sessionId) {
            const userSession = sessionDatabase[sessionId];
            if (userSession) {
                const pId = userSession.partyId;
                delete globalSettings.partyOwners[pId];
                delete globalSettings.partyAccumulatedCosts[pId];
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

    if (incognito) {
        if (sessionDatabase[sessionId]) delete sessionDatabase[sessionId];
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

    // Cập nhật thông tin Session dữ liệu máy
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

    const currentPartyId = partyId || "GLOBAL";

    if (currentPartyId !== "GLOBAL" && !globalSettings.partyOwners[currentPartyId]) {
        globalSettings.partyOwners[currentPartyId] = accountName;
    }
    if (currentPartyId !== "GLOBAL" && globalSettings.partyAccumulatedCosts[currentPartyId] === undefined) {
        globalSettings.partyAccumulatedCosts[currentPartyId] = 0;
    }

    // Đồng bộ cộng dồn tiền điện thực tế gửi lên từ client bảo toàn dữ liệu tránh trùng lặp
    const delta = Number(localDeltaCost) || 0;
    if (currentPartyId === "GLOBAL") {
        globalSettings.globalAccumulatedCost += delta;
    } else {
        globalSettings.partyAccumulatedCosts[currentPartyId] += delta;
    }

    // Thống kê logs bộ lọc dữ liệu
    let activeTabsCount = 0;
    let logsList = [];

    Object.values(sessionDatabase).forEach(session => {
        if (session.partyId === currentPartyId && session.isOnline) {
            activeTabsCount++;
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
