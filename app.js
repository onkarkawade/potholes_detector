const STORAGE_KEY = "pothole-reporter-records";

// DOM elements
const reportForm = document.getElementById("reportForm");
const cameraFeed = document.getElementById("cameraFeed");
const cameraCapture = document.getElementById("cameraCapture");
const captureBtn = document.getElementById("captureBtn");
const imagePrefixInput = document.getElementById("imagePrefix");
const detectionClassInput = document.getElementById("detectionClass");
const captureIntervalInput = document.getElementById("captureInterval");
const latitudeInput = document.getElementById("latitude");
const longitudeInput = document.getElementById("longitude");
const useLocationBtn = document.getElementById("useLocation");
const startCameraBtn = document.getElementById("startCamera");
const stopCameraBtn = document.getElementById("stopCamera");
const captureNowBtn = document.getElementById("captureNow");
const startAutoCaptureBtn = document.getElementById("startAutoCapture");
const stopAutoCaptureBtn = document.getElementById("stopAutoCapture");
const statusText = document.getElementById("statusText");
const previewBox = document.getElementById("previewBox");
const rowsEl = document.getElementById("rows");
const clearAllBtn = document.getElementById("clearAll");
const downloadCsvBtn = document.getElementById("downloadCsv");

// State
let stream = null;
let autoCaptureTimer = null;
let captureSequence = 1;
let latestCoords = null;
let isMobile = /iPhone|iPad|iPod|Android|Mobile/.test(navigator.userAgent);

function getRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function updateStatus(text) {
  statusText.textContent = `Status: ${text}`;
}

function safe(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toImageBlob(dataUrl) {
  const [meta, payload] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const bytes = atob(payload);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    arr[i] = bytes.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

function triggerDownload(dataUrl, filename) {
  const blob = toImageBlob(dataUrl);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function render() {
  const records = getRecords();

  if (!records.length) {
    rowsEl.innerHTML = "<tr><td colspan='7'>No captures yet.</td></tr>";
    return;
  }

  rowsEl.innerHTML = records
    .map((r) => {
      const filename = safe(r.imageName);
      return `<tr>
        <td>${safe(r.timestamp)}</td>
        <td>${r.imageDataUrl ? `<img class="thumb" src="${r.imageDataUrl}" alt="${filename}" />` : "-"}</td>
        <td>${filename}</td>
        <td>${safe(r.detectionClass)}</td>
        <td>${safe(r.latitude)}</td>
        <td>${safe(r.longitude)}</td>
        <td>${r.imageDataUrl ? `<a class="save-link" href="${r.imageDataUrl}" download="${filename}">Save</a>` : "-"}</td>
      </tr>`;
    })
    .join("");
}

function setPreview(dataUrl) {
  if (!dataUrl) {
    previewBox.innerHTML = "<p>No image captured yet.</p>";
    return;
  }
  previewBox.innerHTML = `<img class="preview-image" src="${dataUrl}" alt="Latest capture" />`;
}

function fileSafeTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function refreshLocation() {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not available on this browser.");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        latestCoords = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        };
        latitudeInput.value = String(latestCoords.latitude);
        longitudeInput.value = String(latestCoords.longitude);
        resolve(latestCoords);
      },
      () => reject(new Error("Could not fetch GPS. Allow location permission.")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// Mobile: Use file input capture
function openMobileCamera() {
  cameraCapture.click();
}

// Desktop: Use getUserMedia
async function startCamera() {
  if (stream) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Camera API is not supported in this browser.");
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    cameraFeed.srcObject = stream;
    cameraFeed.style.display = "block";
    await cameraFeed.play();
    updateStatus("camera ready");
  } catch (error) {
    throw error;
  }
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
  cameraFeed.srcObject = null;
  cameraFeed.style.display = "none";
  updateStatus("camera stopped");
}

function captureFrameDataUrl() {
  if (!stream || !cameraFeed.videoWidth) {
    throw new Error("Open camera first.");
  }

  const width = cameraFeed.videoWidth;
  const height = cameraFeed.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not available.");
  }
  ctx.drawImage(cameraFeed, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// Handle mobile file capture
async function handleMobileCapture(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    // Ensure GPS is set
    if (!latestCoords) {
      await refreshLocation();
    }

    // Read image file
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result;
      if (!dataUrl) return;

      const now = new Date();
      const imagePrefix = imagePrefixInput.value.trim() || "pothole";
      const imageName = `${imagePrefix}_${fileSafeTimestamp(now)}_${captureSequence}.jpg`;
      captureSequence += 1;

      const record = {
        timestamp: now.toLocaleString(),
        imageName,
        detectionClass: detectionClassInput.value,
        latitude: latestCoords.latitude,
        longitude: latestCoords.longitude,
        imageDataUrl: dataUrl,
      };

      const records = getRecords();
      records.unshift(record);
      setRecords(records);
      setPreview(dataUrl);
      render();
      updateStatus(`captured ${imageName}`);
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    cameraCapture.value = "";
  } catch (error) {
    updateStatus(error.message);
    alert(error.message);
  }
}

async function captureAndStore() {
  try {
    if (!latestCoords) {
      await refreshLocation();
    }

    if (isMobile) {
      // Mobile: trigger file picker (user will select image from camera)
      openMobileCamera();
    } else {
      // Desktop: capture from video stream
      if (!stream) {
        await startCamera();
      }

      const dataUrl = captureFrameDataUrl();
      const now = new Date();
      const imagePrefix = imagePrefixInput.value.trim() || "pothole";
      const imageName = `${imagePrefix}_${fileSafeTimestamp(now)}_${captureSequence}.jpg`;
      captureSequence += 1;

      const record = {
        timestamp: now.toLocaleString(),
        imageName,
        detectionClass: detectionClassInput.value,
        latitude: latestCoords.latitude,
        longitude: latestCoords.longitude,
        imageDataUrl: dataUrl,
      };

      const records = getRecords();
      records.unshift(record);
      setRecords(records);
      setPreview(dataUrl);
      render();
      updateStatus(`captured ${imageName}`);
    }
  } catch (error) {
    updateStatus(error.message);
    throw error;
  }
}

function startAutoCapture() {
  if (autoCaptureTimer) return;

  const seconds = Number(captureIntervalInput.value || 5);
  const ms = Math.max(1, seconds) * 1000;
  updateStatus(`auto capture running every ${seconds}s`);

  captureAndStore().catch((err) => {
    updateStatus(err.message);
  });

  autoCaptureTimer = setInterval(() => {
    captureAndStore().catch((err) => {
      updateStatus(err.message);
      stopAutoCapture();
    });
  }, ms);
}

function stopAutoCapture() {
  if (!autoCaptureTimer) return;
  clearInterval(autoCaptureTimer);
  autoCaptureTimer = null;
  updateStatus("auto capture stopped");
}

reportForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

// Mobile: Capture button
captureBtn.addEventListener("click", () => {
  if (isMobile) {
    captureAndStore().catch((err) => {
      updateStatus(err.message);
    });
  } else {
    // Desktop: show traditional camera UI
    startCameraBtn.style.display = "inline-block";
    stopCameraBtn.style.display = "inline-block";
    captureNowBtn.style.display = "inline-block";
    captureBtn.style.display = "none";
    
    startCamera().catch((err) => {
      updateStatus(err.message);
      alert(err.message);
    });
  }
});

// Mobile: File input change
cameraCapture.addEventListener("change", handleMobileCapture);

// Desktop: Camera controls
startCameraBtn.addEventListener("click", () => {
  startCamera().catch((err) => {
    updateStatus(err.message);
    alert(err.message);
  });
});

stopCameraBtn.addEventListener("click", () => {
  stopAutoCapture();
  stopCamera();
});

captureNowBtn.addEventListener("click", () => {
  captureAndStore().catch((err) => {
    updateStatus(err.message);
    alert(err.message);
  });
});

startAutoCaptureBtn.addEventListener("click", () => {
  startAutoCapture();
});

stopAutoCaptureBtn.addEventListener("click", () => {
  stopAutoCapture();
});

useLocationBtn.addEventListener("click", () => {
  refreshLocation()
    .then(() => updateStatus("gps updated"))
    .catch((err) => {
      updateStatus(err.message);
      alert(err.message);
    });
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("Delete all saved captures?")) return;
  setRecords([]);
  setPreview("");
  render();
  updateStatus("all captures removed");
});

function toCsv(records) {
  const headers = ["timestamp", "image_name", "detection", "latitude", "longitude", "has_image"];
  const lines = records.map((r) => [
    r.timestamp,
    r.imageName,
    r.detectionClass,
    r.latitude,
    r.longitude,
    r.imageDataUrl ? "yes" : "no",
  ]);

  return [headers, ...lines]
    .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

downloadCsvBtn.addEventListener("click", () => {
  const records = getRecords();
  if (!records.length) {
    alert("No data to export.");
    return;
  }

  const blob = new Blob([toCsv(records)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pothole_reports.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

rowsEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLAnchorElement)) return;

  // On some mobile browsers, the download attribute is ignored.
  // Keep default behavior so user can long-press and save image manually.
  if (target.classList.contains("save-link")) {
    updateStatus("saving image to device");
  }
});

window.addEventListener("beforeunload", () => {
  stopAutoCapture();
  stopCamera();
});

// Initialize UI based on device type
if (isMobile) {
  // Mobile: Show capture button only
  captureBtn.style.display = "block";
  startCameraBtn.style.display = "none";
  stopCameraBtn.style.display = "none";
  captureNowBtn.style.display = "none";
  startAutoCaptureBtn.style.display = "none";
  
  // Pre-fetch GPS on load
  refreshLocation().catch(() => {
    updateStatus("GPS: tap 'Refresh GPS' button to enable");
  });
} else {
  // Desktop: Show traditional controls
  captureBtn.style.display = "none";
  startCameraBtn.style.display = "inline-block";
}

render();
setPreview("");
updateStatus("ready");
