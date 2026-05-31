const express = require('express');
const app = express();
app.use(express.json());

// Bộ nhớ tạm lưu trữ dữ liệu hệ thống
let globalAccumulatedCost = 0;
let lastResetTimestamp = Date.now();
let activeTabsData = {}; // Kỷ lục các session tab active

let parties = {
    // Cấu trúc: "MÃ_PHÒNG": { owner: "Tên_Player", accumulatedCost: 0, lastActivity: timestamp }
};

// Hàm dọn dẹp các tab mất kết nối (sau 15 giây)
setInterval(() => {
    const now = Date.now();
    for (let id in activeTabsData) {
        if (now - activeTabsData[id].lastSeen > 15000) {
            delete activeTabsData[id];
        }
    }
    // Dọn dẹp phòng trống không có ai sử dụng sau 10 phút
    for (let pId in parties) {
        if (pId !== "GLOBAL") {
            const hasPlayers = Object.values(activeTabsData).some(t => t.partyId === pId);
            if (!hasPlayers && (now - parties[pId].lastActivity > 600000)) {
                delete parties[pId];
            }
        }
    }
}, 5000);

app.post('/api/sync-power', (req, res) => {
    const { 
        sessionId, partyId, accountName, ram, fps, region, 
        incognito, localDeltaCost, action, actionValue 
    } = req.body;

    const now = Date.now();

    // 1. XỬ LÝ CÁC HÀNH ĐỘNG ĐIỀU KHIỂN ĐẶC BIỆT (COMMANDS)
    if (action) {
        if (action === "reset_cost") {
            const targetParty = actionValue || "GLOBAL";
            if (targetParty === "GLOBAL") {
                globalAccumulatedCost = 0;
            } else if (parties[targetParty]) {
                parties[targetParty].accumulatedCost = 0;
            }
            lastResetTimestamp = now;
            return res.json({ success: true, msg: "Reset thành công" });
        }
        
        if (action === "create_party") {
            const requestedName = String(actionValue).trim().toUpperCase();
            if (requestedName === "GLOBAL" || requestedName === "") {
                return res.json({ success: false, error: "Tên phòng không hợp lệ!" });
            }
            if (parties[requestedName]) {
                return res.json({ success: false, error: "Tên Party này đã tồn tại! Hãy chọn tên khác." });
            }
            // Tạo phòng mới hợp lệ
            parties[requestedName] = {
                owner: accountName,
                accumulatedCost: 0,
                lastActivity: now
            };
            return res.json({ success: true, partyId: requestedName, owner: accountName });
        }

        if (action === "join_party") {
            const targetParty = String(actionValue).trim().toUpperCase();
            if (targetParty === "GLOBAL") {
                return res.json({ success: true, partyId: "GLOBAL", owner: "" });
            }
            if (!parties[targetParty]) {
                return res.json({ success: false, error: "Phòng không tồn tại! Kiểm tra lại ID." });
            }
            return res.json({ success: true, partyId: targetParty, owner: parties[targetParty].owner });
        }

        if (action === "disband_party") {
            const targetParty = String(actionValue).trim().toUpperCase();
            if (parties[targetParty] && parties[targetParty].owner === accountName) {
                delete parties[targetParty];
                return res.json({ success: true, disband: true });
            }
            return res.json({ success: false, error: "Bạn không có quyền giải tán!" });
        }
    }

    // 2. LOGIC ĐỒNG BỘ VÀ GIỮ PHÒNG KHI RE-EXECUTE
    // Kiểm tra xem người chơi này trước đó đã nằm trong một phòng nào chưa
    let finalPartyId = partyId || "GLOBAL";
    let currentOwner = "";

    if (accountName) {
        const existingSession = Object.values(activeTabsData).find(t => t.accountName === accountName && t.partyId !== "GLOBAL");
        if (existingSession && (!partyId || partyId === "GLOBAL")) {
            // Khôi phục lại phòng cũ cho người chơi khi re-execute script
            if (parties[existingSession.partyId]) {
                finalPartyId = existingSession.partyId;
            }
        }
    }

    if (finalPartyId !== "GLOBAL" && parties[finalPartyId]) {
        currentOwner = parties[finalPartyId].owner;
        parties[finalPartyId].lastActivity = now;
    } else {
        finalPartyId = "GLOBAL"; // Trả về global nếu phòng không tồn tại
    }

    // 3. CẬP NHẬT TÍCH LŨY TIỀN ĐIỆN CHUẨN XÁC
    if (!incognito && localDeltaCost && localDeltaCost > 0) {
        if (finalPartyId === "GLOBAL") {
            globalAccumulatedCost += localDeltaCost;
        } else if (parties[finalPartyId]) {
            parties[finalPartyId].accumulatedCost += localDeltaCost;
        }
    }

    // Ghi nhận trạng thái hoạt động của Tab hiện tại
    activeTabsData[sessionId] = {
        sessionId,
        accountName,
        partyId: finalPartyId,
        ram,
        fps,
        region,
        isOnline: true,
        lastSeen: now
    };

    // Lọc danh sách log các tab thuộc cùng một phân vùng (Zone)
    const subLogs = Object.values(activeTabsData)
        .filter(t => t.partyId === finalPartyId)
        .map(t => ({
            name: t.accountName,
            ram: t.ram,
            fps: t.fps,
            partyId: t.partyId,
            isOnline: true
        }));

    const activeTabsCount = subLogs.length;

    // Trả kết quả đồng bộ về cho Client
    res.json({
        success: true,
        partyId: finalPartyId,
        partyOwner: currentOwner,
        activeTabs: activeTabsCount,
        globalAccumulatedCost: globalAccumulatedCost,
        partyAccumulatedCost: finalPartyId !== "GLOBAL" && parties[finalPartyId] ? parties[finalPartyId].accumulatedCost : 0,
        resetTimestamp: lastResetTimestamp,
        logs: subLogs
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server SuperSaver chạy trên port ${PORT}`));
