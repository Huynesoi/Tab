const express = require('express');
const app = express();
app.use(express.json());

let sessionDatabase = {}; 
let globalSettings = {
    globalFps: 10,
    globalAntiLag: false,
    remoteScript: "",
    
    // Đánh dấu mốc thời gian thay đổi để Client nhận biết lệnh MỚI (Tránh spam)
    fpsTimestamp: Date.now(),
    antiLagTimestamp: Date.now(),
    scriptTimestamp: Date.now(),
    
    globalAccumulatedCost: 0, 
    partyAccumulatedCosts: {}, 
    
    lastGlobalUpdate: Date.now(),
    lastPartyUpdates: {},
    partyOwners: {} 
};

const ELECTRICITY_RATE = 2500; 

function calculateTabCostPerSec(ram, fps) {
    let localLoadKW = ((ram / 1000) * 0.025) + ((fps / 60) * 0.035);
    if (localLoadKW < 0.015) localLoadKW = 0.015;
    return localLoadKW * (ELECTRICITY_RATE / 3600);
}

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
        if (globalSettings.partyOwners[currentPartyId]) {
            if (!globalSettings.lastPartyUpdates[currentPartyId]) globalSettings.lastPartyUpdates[currentPartyId] = now;
            if (!globalSettings.partyAccumulatedCosts[currentPartyId]) globalSettings.partyAccumulatedCosts[currentPartyId] = 0;
            
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
}

setInterval(() => {
    const now = Date.now();
    Object.keys(sessionDatabase).forEach(id => {
        if (now - sessionDatabase[id].lastSeen > 20000) { 
            let pId = sessionDatabase[id].partyId;
            updateAccumulatedCost(pId);
            delete sessionDatabase[id];
            
            let anyLeft = Object.values(sessionDatabase).some(s => s.partyId === pId);
            if (!anyLeft && pId !== "GLOBAL") {
                delete globalSettings.lastPartyUpdates[pId];
            }
        }
    });
}, 5000);

app.post('/api/sync-power', (req, res) => {
    const { sessionId, partyId, accountName, ram, fps, region, incognito, action, actionValue } = req.body;
    const now = Date.now();
    let currentPartyId = partyId || "GLOBAL";

    if (action) {
        if (incognito) return res.status(403).json({ success: false, error: "Ẩn danh không lệnh." });
        
        if (action === "set_fps") {
            globalSettings.globalFps = Number(actionValue);
            globalSettings.fpsTimestamp = now;
        }
        if (action === "toggle_antilag") {
            globalSettings.globalAntiLag = Boolean(actionValue);
            globalSettings.antiLagTimestamp = now;
        }
        if (action === "run_remote_script") {
            globalSettings.remoteScript = String(actionValue);
            globalSettings.scriptTimestamp = now;
        }
        
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
        
        if (action === "create_party" && actionValue) {
            const targetParty = String(actionValue).trim();
            if (!globalSettings.partyOwners[targetParty]) {
                globalSettings.partyOwners[targetParty] = accountName;
                globalSettings.partyAccumulatedCosts[targetParty] = globalSettings.partyAccumulatedCosts[targetParty] || 0;
                globalSettings.lastPartyUpdates[targetParty] = now;
            }
            return res.json({ success: true, partyOwner: globalSettings.partyOwners[targetParty] });
        }

        if (action === "disband_party" && sessionId) {
            const userSession = sessionDatabase[sessionId];
            if (userSession) {
                const pId = userSession.partyId;
                if (globalSettings.partyOwners[pId] === accountName) {
                    delete globalSettings.partyOwners[pId];
                    delete globalSettings.partyAccumulatedCosts[pId];
                    delete globalSettings.lastPartyUpdates[pId];
                    Object.keys(sessionDatabase).forEach(id => {
                        if (sessionDatabase[id].partyId === pId) sessionDatabase[id].partyId = "GLOBAL";
                    });
                    return res.json({ success: true, actionBroadcast: "disband_party" });
                }
            }
        }
        return res.json({ success: true });
    }

    if (!sessionId || !accountName) return res.status(400).json({ success: false });

    if (incognito) {
        Object.keys(sessionDatabase).forEach(id => {
            if (sessionDatabase[id].name === accountName) delete sessionDatabase[id];
        });
        return res.json({
            success: true, activeTabs: 0, globalAccumulatedCost: globalSettings.globalAccumulatedCost, partyAccumulatedCost: 0,
            globalFps: globalSettings.globalFps, globalAntiLag: globalSettings.globalAntiLag, remoteScript: globalSettings.remoteScript,
            fpsTimestamp: globalSettings.fpsTimestamp, antiLagTimestamp: globalSettings.antiLagTimestamp, scriptTimestamp: globalSettings.scriptTimestamp,
            logs: []
        });
    }

    // FIX TRIỆT ĐỂ JOIN PHÒNG ẢO KHÔNG TỒN TẠI HOẶC PHÒNG CHẾT CHỦ hoàn toàn
    if (currentPartyId !== "GLOBAL") {
        if (!globalSettings.partyOwners[currentPartyId]) {
            currentPartyId = "GLOBAL"; // Đẩy thẳng về mạng chung
        }
    }

    updateAccumulatedCost(currentPartyId);

    Object.keys(sessionDatabase).forEach(id => {
        if (sessionDatabase[id].name === accountName && id !== sessionId) delete sessionDatabase[id];
    });

    sessionDatabase[sessionId] = {
        id: sessionId, name: accountName, partyId: currentPartyId,
        ram: Number(ram) || 0, fps: Number(fps) || 0, region: region || "VN", lastSeen: now
    };

    let activeTabsCount = 0;
    let logsList = [];
    Object.values(sessionDatabase).forEach(session => {
        if (session.partyId === currentPartyId && (now - session.lastSeen < 15000)) activeTabsCount++;
        logsList.push({
            name: session.name, partyId: session.partyId, ram: session.ram, fps: session.fps, region: session.region,
            isOnline: (now - session.lastSeen < 15000)
        });
    });

    res.json({
        success: true,
        activeTabs: activeTabsCount,
        forcedPartyId: currentPartyId, 
        globalAccumulatedCost: globalSettings.globalAccumulatedCost,
        partyAccumulatedCost: currentPartyId !== "GLOBAL" ? (globalSettings.partyAccumulatedCosts[currentPartyId] || 0) : 0,
        globalFps: globalSettings.globalFps,
        globalAntiLag: globalSettings.globalAntiLag,
        remoteScript: globalSettings.remoteScript,
        fpsTimestamp: globalSettings.fpsTimestamp,
        antiLagTimestamp: globalSettings.antiLagTimestamp,
        scriptTimestamp: globalSettings.scriptTimestamp,
        partyOwner: globalSettings.partyOwners[currentPartyId] || "",
        logs: logsList
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server optimized on port ${PORT}`));
