const express = require('express');
const app = express();
app.use(express.json());

let sessionDatabase = {}; 
let globalSettings = {
    globalFps: 10,
    globalAntiLag: false,
    remoteScript: "",
    
    // TIỀN ĐIỆN TÍCH LŨY LƯU TRÊN SERVER
    globalAccumulatedCost: 0, 
    partyAccumulatedCosts: {}, 
    
    // TIMESTAMP LẦN CẬP NHẬT GẦN NHẤT CỦA PHÂN VÙNG (DÙNG ĐỂ TÍNH DELTA TIME)
    lastGlobalUpdate: Date.now(),
    lastPartyUpdates: {},
    
    partyOwners: {}        
};

const ELECTRICITY_RATE = 2500; // VNĐ/kWh

// Hàm tính toán chi phí điện của 1 tab dựa trên cấu hình RAM và FPS
function calculateTabCostPerSec(ram, fps) {
    let localLoadKW = ((ram / 1000) * 0.025) + ((fps / 60) * 0.035);
    if (localLoadKW < 0.015) localLoadKW = 0.015;
    return localLoadKW * (ELECTRICITY_RATE / 3600);
}

// Hàm cập nhật tiền điện tích lũy ngay khi có tương tác (Realtime Event-Driven)
function updateAccumulatedCost(currentPartyId) {
    const now = Date.now();
    
    if (currentPartyId === "GLOBAL") {
        let elapsedGlobalSec = (now - globalSettings.lastGlobalUpdate) / 1000;
        if (elapsedGlobalSec > 0) {
            let totalGlobalCostSec = 0;
            Object.values(sessionDatabase).forEach(session => {
                if (session.partyId === "GLOBAL" && (now - session.lastSeen < 15000)) {
                    totalGlobalCostSec += calculateTabCostPerSec(session.ram, session.fps);
                }
            });
            globalSettings.globalAccumulatedCost += (totalGlobalCostSec * elapsedGlobalSec);
        }
        globalSettings.lastGlobalUpdate = now;
    } else {
        if (!globalSettings.lastPartyUpdates[currentPartyId]) {
            globalSettings.lastPartyUpdates[currentPartyId] = now;
        }
        if (!globalSettings.partyAccumulatedCosts[currentPartyId]) {
            globalSettings.partyAccumulatedCosts[currentPartyId] = 0;
        }
        
        let elapsedPartySec = (now - globalSettings.lastPartyUpdates[currentPartyId]) / 1000;
        if (elapsedPartySec > 0) {
            let totalPartyCostSec = 0;
            Object.values(sessionDatabase).forEach(session => {
                if (session.partyId === currentPartyId && (now - session.lastSeen < 15000)) {
                    totalPartyCostSec += calculateTabCostPerSec(session.ram, session.fps);
                }
            });
            globalSettings.partyAccumulatedCosts[currentPartyId] += (totalPartyCostSec * elapsedPartySec);
        }
        globalSettings.lastPartyUpdates[currentPartyId] = now;
    }
}

// setInterval giờ CHỈ làm nhiệm vụ quét dọn các tab mất kết nối (Không tính tiền ở đây nữa để tránh lệch chu kỳ)
setInterval(() => {
    const now = Date.now();
    Object.keys(sessionDatabase).forEach(id => {
        if (now - sessionDatabase[id].lastSeen > 20000) { // Quá 20s không sync -> Offline
            let pId = sessionDatabase[id].partyId;
            
            // Cập nhật tiền điện lần cuối trước khi xóa session đó
            updateAccumulatedCost(pId);
            
            delete sessionDatabase[id];
            
            // Nếu phòng không còn ai online, dọn dẹp owner và bộ đếm thời gian phòng đó
            let anyLeft = Object.values(sessionDatabase).some(s => s.partyId === pId);
            if (!anyLeft && pId !== "GLOBAL") {
                delete globalSettings.partyOwners[pId];
                delete globalSettings.lastPartyUpdates[pId];
            }
        }
    });
}, 5000);

app.post('/api/sync-power', (req, res) => {
    const { sessionId, partyId, accountName, ram, fps, region, incognito, action, actionValue } = req.body;
    const now = Date.now();
    const currentPartyId = partyId || "GLOBAL";

    // 1. LỆNH ĐIỀU KHIỂN TỪ ADMIN / OWNER
    if (action) {
        if (incognito) return res.status(403).json({ success: false, error: "Chế độ ẩn danh không thể thực thi lệnh." });
        
        if (action === "set_fps") globalSettings.globalFps = Number(actionValue);
        if (action === "toggle_antilag") globalSettings.globalAntiLag = Boolean(actionValue);
        if (action === "run_remote_script") globalSettings.remoteScript = String(actionValue);
        
        if (action === "reset_cost") {
            const targetParty = actionValue || "GLOBAL";
            if (targetParty === "GLOBAL") {
                globalSettings.globalAccumulatedCost = 0;
                globalSettings.lastGlobalUpdate = now;
            } else {
                globalSettings.partyAccumulatedCosts[targetParty] = 0;
                globalSettings.lastPartyUpdates[targetParty] = now;
            }
        }
        
        if (action === "create_party" && sessionId && actionValue) {
            if (!globalSettings.partyOwners[actionValue]) {
                globalSettings.partyOwners[actionValue] = accountName;
                globalSettings.partyAccumulatedCosts[actionValue] = globalSettings.partyAccumulatedCosts[actionValue] || 0;
                globalSettings.lastPartyUpdates[actionValue] = now;
            }
            return res.json({ success: true, partyOwner: globalSettings.partyOwners[actionValue] });
        }

        if (action === "disband_party" && sessionId) {
            const userSession = sessionDatabase[sessionId];
            if (userSession) {
                const pId = userSession.partyId;
                delete globalSettings.partyOwners[pId];
                delete globalSettings.partyAccumulatedCosts[pId];
                delete globalSettings.lastPartyUpdates[pId];
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

    // 2. XỬ LÝ CHẾ ĐỘ ẨN DANH (Chỉ lấy cấu hình về, không đẩy data lên hệ thống)
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

    // 3. XỬ LÝ ĐỒNG BỘ THƯỜNG (Cập nhật tiền điện TRƯỚC KHI thay đổi thông số phần cứng mới)
    updateAccumulatedCost(currentPartyId);

    // Xóa session trùng lặp nếu trùng tên nhưng khác GUID máy
    Object.keys(sessionDatabase).forEach(id => {
        if (sessionDatabase[id].name === accountName && id !== sessionId) {
            delete sessionDatabase[id];
        }
    });

    // Cập nhật thông số mới của Tab vào DB
    sessionDatabase[sessionId] = {
        id: sessionId,
        name: accountName,
        partyId: currentPartyId,
        ram: Number(ram) || 0,
        fps: Number(fps) || 0,
        region: region || "VN",
        lastSeen: now
    };

    // Đếm số lượng tab đang hoạt động và tạo danh sách logs
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

    // Trả về dữ liệu đã được tính toán đồng bộ tức thì
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
