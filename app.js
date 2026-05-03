const STORAGE_KEY = "pothole-reporter-records";

const reportForm = document.getElementById("reportForm");
const imageFileInput = document.getElementById("imageFile");
const imageNameInput = document.getElementById("imageName");
const detectionClassInput = document.getElementById("detectionClass");
const latitudeInput = document.getElementById("latitude");
const longitudeInput = document.getElementById("longitude");
const useLocationBtn = document.getElementById("useLocation");
const previewBox = document.getElementById("previewBox");
const rowsEl = document.getElementById("rows");
const clearAllBtn = document.getElementById("clearAll");
const downloadCsvBtn = document.getElementById("downloadCsv");

let selectedImageDataUrl = "";

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

function render() {
  const records = getRecords();

  if (!records.length) {
    rowsEl.innerHTML = "<tr><td colspan='6'>No reports yet.</td></tr>";
    return;
  }

  rowsEl.innerHTML = records
    .map((r) => {
      return `<tr>
        <td>${r.timestamp}</td>
        <td>${r.imageDataUrl ? `<img class="thumb" src="${r.imageDataUrl}" alt="${r.imageName}" />` : "-"}</td>
        <td>${r.imageName}</td>
        <td>${r.detectionClass}</td>
        <td>${r.latitude}</td>
        <td>${r.longitude}</td>
      </tr>`;
    })
    .join("");
}

function setPreview(imageDataUrl) {
  if (!imageDataUrl) {
    previewBox.innerHTML = "<p>No image selected yet.</p>";
    return;
  }
  previewBox.innerHTML = `<img class="preview-image" src="${imageDataUrl}" alt="Selected preview" />`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = new Image();
  image.src = dataUrl;

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Invalid image"));
  });

  const maxSide = 1280;
  let { width, height } = image;
  if (Math.max(width, height) > maxSide) {
    const ratio = maxSide / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

imageFileInput.addEventListener("change", async () => {
  const file = imageFileInput.files?.[0];
  if (!file) {
    selectedImageDataUrl = "";
    setPreview("");
    return;
  }

  try {
    selectedImageDataUrl = await compressImage(file);
    setPreview(selectedImageDataUrl);

    if (!imageNameInput.value.trim()) {
      imageNameInput.value = file.name || `capture_${Date.now()}.jpg`;
    }
  } catch {
    selectedImageDataUrl = "";
    setPreview("");
    alert("Could not process this image. Please try again.");
  }
});

reportForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!selectedImageDataUrl) {
    alert("Please capture or select an image first.");
    return;
  }

  const record = {
    timestamp: new Date().toLocaleString(),
    imageName: imageNameInput.value.trim(),
    detectionClass: detectionClassInput.value,
    latitude: Number(latitudeInput.value),
    longitude: Number(longitudeInput.value),
    imageDataUrl: selectedImageDataUrl,
  };

  const records = getRecords();
  records.unshift(record);
  setRecords(records);
  reportForm.reset();
  selectedImageDataUrl = "";
  setPreview("");
  render();
});

useLocationBtn.addEventListener("click", async () => {
  if (!navigator.geolocation) {
    alert("Geolocation is not available in this browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      latitudeInput.value = position.coords.latitude.toFixed(6);
      longitudeInput.value = position.coords.longitude.toFixed(6);
    },
    () => {
      alert("Could not fetch location. Please allow permission.");
    }
  );
});

clearAllBtn.addEventListener("click", () => {
  if (!confirm("Delete all saved reports?")) return;
  setRecords([]);
  render();
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

render();
setPreview("");
