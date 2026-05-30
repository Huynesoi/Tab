const express = require('express');
const app = express();
app.use(express.json());

const rooms = {}; 

const BASE_POWER_KW = 0.04; 
const ELECTRICITY_RATE = 2500;

function getRoom(roomId, isParty = false, owner = "") {
    if (!rooms[roomId]) {
        rooms[roomId] = { 
            clients: {}, globalFps: 10, globalAntiLag: false, 
            globalScript: { code: "", time: 0 }, 
            accumulatedCost: 0, lastTick: Date.now(), 
            isParty: isParty, owner: owner, disbanded: false
        };
    }
    return rooms[roomId];
}

function generatePartyId() {
    return 'PTY-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

app.post('/api/sync-power', (req, res) => {
    // Không còn dùng IP để chia phòng chung nữa
    const { sessionId, accountName, ram, fps, region, stealthMode, partyId, action, actionValue } = req.body;

    // Nếu không có partyId, gán thẳng vào phòng "GLOBAL"
    const currentRoomId = (partyId && partyId !== "") ? partyId : "GLOBAL";
    const room = getRoom(currentRoomId);

    if (room.disbanded) {
        return res.json({ success: true, partyDisbanded: true });
    }

    if (action === "reset_cost") {
        room.accumulatedCost = 0;
    } else if (action === "set_fps") {
        room.globalFps = Number(actionValue);
    } else if (action === "toggle_antilag") {
        room.globalAntiLag = Boolean(actionValue);
    } else if (action === "run_script") {
        room.globalScript = { code: actionValue, time: Date.now() };
    } else if (action === "create_party") {
        const newPartyId = generatePartyId();
        getRoom(newPartyId, true, accountName);
        return res.json({ success: true, newPartyId: newPartyId });
    } else if (action === "disband_party" && room.isParty && room.owner === accountName) {
        room.disbanded = true;
        return res.json({ success: true, partyDisbanded: true });
    }

    const now = Date.now();
    let dt = (now - room.lastTick) / 1000;
    room.lastTick = now;
    if (dt > 10) dt = 0; 

    if (sessionId) {
        room.clients[sessionId] = {
            accountName: accountName || "Unknown Acc",
            region: region || "??", // Lưu Region
            lastPing: now,
            ram: Number(ram) || 0,
            fps: Number(fps) || 0,
            stealthMode: Boolean(stealthMode)
        };
    }

    let totalNetworkPowerKW = 0;
    let activeTabCount = 0;
    let hasActive = false;
    const logs = [];

    for (const id in room.clients) {
        const client = room.clients[id];
        const timeSinceLastPing = now - client.lastPing;
        
        if (timeSinceLastPing > 60000) { delete room.clients[id]; continue; }

        const isOffline = timeSinceLastPing > 15000;
        const isLag = !isOffline && (client.ram > 2000 || client.fps < 15);
        let statusIcon = isOffline ? "🔴" : (isLag ? "🟡" : "🟢");

        if (!isOffline) {
            activeTabCount++;
            hasActive = true;
            totalNetworkPowerKW += ((client.ram / 1000) * 0.012) + ((client.fps / 60) * 0.035);
        }

        const sharedBase = activeTabCount > 0 ? (BASE_POWER_KW / activeTabCount) : 0;
        const tabSpecificLoad = ((client.ram / 1000) * 0.012) + ((client.fps / 60) * 0.035);
        const costPerSec = ((sharedBase + tabSpecificLoad) * ELECTRICITY_RATE) / 3600;

        if (!client.stealthMode || id === sessionId) {
            logs.push({
                name: client.accountName,
                region: client.region, // Đẩy Region xuống cho các Client khác xem
                statusIcon: statusIcon,
                ram: client.ram,
                fps: client.fps,
                costPerSec: costPerSec,
                isStealth: client.stealthMode
            });
        }
    }

    if (hasActive) totalNetworkPowerKW += BASE_POWER_KW; 
    const totalNetworkCostPerSec = (totalNetworkPowerKW * ELECTRICITY_RATE) / 3600;
    
    room.accumulatedCost += (totalNetworkCostPerSec * dt);

    res.json({
        success: true,
        activeTabs: activeTabCount,
        totalNetworkCostPerSec: totalNetworkCostPerSec,
        accumulatedCost: room.accumulatedCost,
        logs: logs,
        globalFps: room.globalFps,
        globalAntiLag: room.globalAntiLag,
        globalScript: room.globalScript,
        isParty: room.isParty,
        partyOwner: room.owner
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
