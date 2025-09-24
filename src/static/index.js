let currentCam = null;
let drawing = false;
let zonePoints = [];

// =============== CAMERA LIST ===============
async function loadCameras() {
    const res = await fetch("/api/camera/list");
    const data = await res.json();
    const list = document.getElementById("camera-list");
    list.innerHTML = "";

    data.cameras.forEach(camId => {
        const li = document.createElement("li");
        li.innerHTML = `
            <span onclick="selectCamera('${camId}')">${camId}</span>
            <button onclick="openSettings('${camId}')">⚙</button>
        `;
        list.appendChild(li);
    });
}

async function addCamera() {
    const source = document.getElementById("new-source").value.trim();
    if (!source) return alert("Nhập RTSP hoặc file path!");
    const res = await fetch("/api/camera/add", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({source})
    });
    const data = await res.json();
    if (data.cam_id) {
        await loadCameras();
        selectCamera(data.cam_id);
    } else {
        alert("Error: " + JSON.stringify(data));
    }
}

function selectCamera(camId) {
    currentCam = camId;
    const img = document.getElementById("video-stream");
    img.src = `/camera/${camId}/stream`;

    const canvas = document.getElementById("overlay");
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
    };
}

// =============== DRAW ZONE ===============
function enableZoneDraw() {
    if (!currentCam) return alert("Chọn camera trước!");
    const canvas = document.getElementById("overlay");
    canvas.style.pointerEvents = "auto";
    canvas.onclick = e => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        zonePoints.push([x, y]);
        drawZone();
    };
    drawing = true;
}

function drawZone() {
    const canvas = document.getElementById("overlay");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (zonePoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(zonePoints[0][0], zonePoints[0][1]);
        zonePoints.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();

        ctx.fillStyle = "blue";
        zonePoints.forEach(p => ctx.fillRect(p[0] - 3, p[1] - 3, 6, 6));
    }
}

async function saveZone() {
    if (!currentCam || zonePoints.length < 3) return alert("Zone phải >= 3 điểm");
    await fetch(`/api/camera/${currentCam}/set_task`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({task: "zone", params: {points: zonePoints}})
    });
    alert("Zone saved!");
    zonePoints = [];
    drawZone();
    document.getElementById("overlay").style.pointerEvents = "none";
}

// =============== SETTINGS POPUP ===============
function openSettings(camId) {
    document.getElementById("settings-camid").value = camId;
    document.getElementById("settings-overlay").style.display = "block";
    document.getElementById("settings-popup").style.display = "block";
}

function closeSettings() {
    document.getElementById("settings-overlay").style.display = "none";
    document.getElementById("settings-popup").style.display = "none";
}

async function saveSettings() {
    const camId = document.getElementById("settings-camid").value;
    const conf = parseFloat(document.getElementById("conf").value);
    const iou = parseFloat(document.getElementById("iou").value);
    const maxdet = parseInt(document.getElementById("maxdet").value);

    await fetch(`/api/camera/${camId}/set_task`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            task: "settings",
            params: {conf, iou, maxdet}
        })
    });

    closeSettings();
    alert("Settings saved!");
}

// =============== SUMMARY AUTO REFRESH ===============
async function loadSummary() {
    const res = await fetch("/api/stats/summary");
    const data = await res.json();
    document.getElementById("summary").innerText =
        `Total Cameras: ${data.total_cameras} | Total People: ${data.total_people}`;
}

setInterval(loadSummary, 3000);

window.onload = () => {
    loadCameras();
    loadSummary();
};

document.addEventListener("DOMContentLoaded", () => {
    const cameraListDiv = document.getElementById("camera-list");
    const addCameraForm = document.getElementById("add-camera-form");

    // Load danh sách camera
    async function loadCameras() {
        const res = await fetch("/api/camera/list");
        const data = await res.json();
        cameraListDiv.innerHTML = "";

        if (!data.cameras || data.cameras.length === 0) {
            cameraListDiv.innerHTML = "<p>No cameras added yet.</p>";
            return;
        }

        data.cameras.forEach(cam_id => {
            renderCameraCard(cam_id);
        });
    }

    // Render 1 camera card
    function renderCameraCard(cam_id) {
        const card = document.createElement("div");
        card.className = "camera-card";
        card.innerHTML = `
            <h3>Camera ${cam_id}</h3>
            <div class="stream-wrapper">
                <img src="/camera/${cam_id}/stream" alt="Camera Stream" class="camera-stream"/>
            </div>
            <div class="camera-actions">
                <button class="settings-btn" data-id="${cam_id}">⚙ Settings</button>
                <button class="remove-btn" data-id="${cam_id}">❌ Remove</button>
            </div>
            <div class="camera-settings" id="settings-${cam_id}" style="display: none;">
                <label>Confidence: <input type="number" step="0.01" id="conf-${cam_id}" value="0.5"></label><br/>
                <label>IoU: <input type="number" step="0.01" id="iou-${cam_id}" value="0.5"></label><br/>
                <label>MaxDet: <input type="number" id="maxdet-${cam_id}" value="100"></label><br/>
                <button class="save-settings-btn" data-id="${cam_id}">💾 Save</button>
            </div>
        `;
        cameraListDiv.appendChild(card);

        // Nút Settings toggle
        card.querySelector(".settings-btn").addEventListener("click", () => {
            const settingsDiv = document.getElementById(`settings-${cam_id}`);
            settingsDiv.style.display = (settingsDiv.style.display === "none") ? "block" : "none";
        });

        // Nút Save settings
        card.querySelector(".save-settings-btn").addEventListener("click", async () => {
            const conf = parseFloat(document.getElementById(`conf-${cam_id}`).value);
            const iou = parseFloat(document.getElementById(`iou-${cam_id}`).value);
            const maxdet = parseInt(document.getElementById(`maxdet-${cam_id}`).value);

            await fetch(`/api/camera/${cam_id}/update_config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confidence: conf, iou: iou, max_det: maxdet })
            });

            alert(`✅ Config updated for Camera ${cam_id}`);
        });

        // Nút Remove camera
        card.querySelector(".remove-btn").addEventListener("click", async () => {
            await fetch(`/api/camera/${cam_id}/remove`, { method: "DELETE" });
            loadCameras();
        });
    }

    // Form add camera
    addCameraForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const source = document.getElementById("camera-source").value;

        const res = await fetch("/api/camera/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: source })
        });

        if (res.ok) {
            loadCameras();
            addCameraForm.reset();
        } else {
            alert("❌ Failed to add camera");
        }
    });

    loadCameras();
});
