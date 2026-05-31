const express = require('express');
const app = express();
app.use(express.json());

let sessionDatabase = {}; 
let globalSettings = {
    globalFps: 10,
    globalAntiLag: false,
    remoteScript: "",
    
    // TIỀN ĐIỆN LƯU TRÊN SERVER
    globalAccumulatedCost: 0, 
    partyAccumulatedCosts: {}, 
    
    // TIMESTAMPS ĐỂ TÍNH TIỀN THEO THỜI GIAN THỰC
    lastGlobalUpdate: Date.now(),
    lastPartyUpdates: {},
    
    partyOwners: {}        
};

const ELECTRICITY_RATE = 2500; // VNĐ/kWh

// Hàm tính toán chi phí điện dựa trên RAM và FPS trung bình
function calculateTabCostPerSec(ram, fps) do {
    let localLoadKW = ((ram / 1000) * 0.025) + ((fps / 60) * 0.035);
    if (localLoadKW < 0.015) localLoadKW = 0.015;
    return localLoadKW * (ELECTRICITY_RATE / 3600);
}

// Cập nhật trạng thái Online/Offline định kỳ và tính toán tiền điện tích lũy tự động
setInterval(() => {
    const now = Date.now();
    
    // 1. Tính toán cho sảnh GLOBAL
    let activeGlobalTabs = 0;
    let totalGlobalCostSec = 0;
    
    Object.values(sessionDatabase).forEach(session => {
        if (session.partyId === "GLOBAL" && (now - session.lastSeen < 15000)) {
            activeGlobalTabs++;
            totalGlobalCostSec += calculateTabCostPerSec(session.ram, session.fps);
        }
    });
    
    let elapsedGlobalSec = (now - globalSettings.lastGlobalUpdate) / 1000;
    if (elapsedGlobalSec > 0 && activeGlobalTabs > 0) {
        globalSettings.globalAccumulatedCost += (totalGlobalCostSec * elapsedGlobalSec);
    }
    globalSettings.lastGlobalUpdate = now;

    // 2. Tính toán cho các phòng PARTY
    let partyGroups = {};
    Object.values(sessionDatabase).forEach(session => {
        if (session.partyId !== "GLOBAL" && (now - session.lastSeen < 15000)) {
            if (!partyGroups[session.partyId]) partyGroups[session.partyId] = [];
            partyGroups[session.partyId].push(session);
        }
    });

    Object.keys(partyGroups).forEach(pId => {
        let tabsInParty = partyGroups[pId];
        let totalPartyCostSec = 0;
        tabsInParty.forEach(s => {
            totalPartyCostSec += calculateTabCostPerSec(s.ram, s.fps);
        });

        if (!globalSettings.partyAccumulatedCosts[pId]) globalSettings.partyAccumulatedCosts[pId] = 0;
        if (!globalSettings.lastPartyUpdates[pId]) globalSettings.lastPartyUpdates[pId] = now;

        let elapsedPartySec = (now - globalSettings.lastPartyUpdates[pId]) / 1000;
        if (elapsedPartySec > 0) {
            globalSettings.partyAccumulatedCosts[pId] += (totalPartyCostSec * elapsedPartySec);
        }
        globalSettings.lastPartyUpdates[pId] = now;
    });

    // 3. Quét dọn các Session ngắt kết nối quá lâu
    Object.keys(sessionDatabase).forEach(id => {
        if (now - sessionDatabase[id].lastSeen > 20000) {
            let pId = sessionDatabase[id].partyId;
            delete sessionDatabase[id];
            
            // Nếu phòng không còn ai online, dọn dẹp owner luôn
            let anyLeft = Object.values(sessionDatabase).some(s => s.partyId === pId);
            if (!anyLeft && pId !== "GLOBAL") {
                delete globalSettings.partyOwners[pId];
            }
        }
    });
}, 2000);

app.post('/api/sync-power', (req, res) => {
    const { sessionId, partyId, accountName, ram, fps, region, incognito, action, actionValue } = req.body;
    const now = Date.now();

    // Xử lý các lệnh điều khiển từ Admin / Owner
    if (action) {
        if (incognito) return res.status(403).json({ success: false, error: "Chế độ ẩn danh không thể thực thi lệnh." });
        
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
        }
        
        if (action === "create_party" && sessionId && actionValue) {
            // KHÓA CỨNG QUYỀN OWNER: Chỉ cho phép người tạo đầu tiên giữ quyền
            if (!globalSettings.partyOwners[actionValue]) {
                globalSettings.partyOwners[actionValue] = accountName;
            }
            return res.json({ success: true, partyOwner: globalSettings.partyOwners[actionValue] });
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
        return res.status(400).json({ success: false, error: "Thiếu dữ liệu định danh." });
    }

    // Chế độ ẩn danh (Chỉ nhận dữ liệu đồng bộ chung từ sảnh, không lưu trữ thông tin lên Server)
    if (incognito) {
        Object.keys(sessionDatabase).forEach(id => {
            if (sessionDatabase[id].name === accountName) delete sessionDatabase[id];
        });
        return res.json({
            success: true,
            activeTabs: 0,
            globalAccumulatedCost: globalSettings.globalAccumulatedCost,
            partyAccumulatedCost: 0,
            globalFps: globalSettings.globalFps,
            globalAntiLag: globalSettings.globalAntiLag,
            remoteScript: globalSettings.remoteScript,
            logs: []
        });
    }

    // Xóa session trùng lặp của cùng một accountName (Fix Dupe Log)
    Object.keys(sessionDatabase).forEach(id => {
        if (sessionDatabase[id].name === accountName && id !== sessionId) {
            delete sessionDatabase[id];
        }
    });

    // Cập nhật thông tin tài khoản vào DB
    sessionDatabase[sessionId] = {
        id: sessionId,
        name: accountName,
        partyId: partyId || "GLOBAL",
        ram: Number(ram) || 0,
        fps: Number(fps) || 0,
        region: region || "VN",
        lastSeen: now
    };

    const currentPartyId = partyId || "GLOBAL";

    // Đếm số lượng tab active trong phân vùng
    let activeTabsCount = 0;
    let logsList = [];
    Object.values(sessionDatabase).forEach(session => {
        if (session.partyId === currentPartyId && (now - session.lastSeen < 15000)) {
            activeTabsCount++;
        }
        logsList.push({
            name: session.name,
            partyId: session.partyId,
            ram: session.ram,
            fps: session.fps,
            region: session.region,
            isOnline: (now - session.lastSeen < 15000)
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
        partyOwner: globalSettings.partyOwners[currentPartyId] || "",
        logs: logsList
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
