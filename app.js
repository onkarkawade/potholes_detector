const STORAGE_KEY = "pothole-reporter-records";

const reportForm = document.getElementById("reportForm");
const imageNameInput = document.getElementById("imageName");
const detectionClassInput = document.getElementById("detectionClass");
const latitudeInput = document.getElementById("latitude");
const longitudeInput = document.getElementById("longitude");
const useLocationBtn = document.getElementById("useLocation");
const rowsEl = document.getElementById("rows");
const clearAllBtn = document.getElementById("clearAll");
const downloadCsvBtn = document.getElementById("downloadCsv");

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
    rowsEl.innerHTML = "<tr><td colspan='5'>No reports yet.</td></tr>";
    return;
  }

  rowsEl.innerHTML = records
    .map((r) => {
      return `<tr>
        <td>${r.timestamp}</td>
        <td>${r.imageName}</td>
        <td>${r.detectionClass}</td>
        <td>${r.latitude}</td>
        <td>${r.longitude}</td>
      </tr>`;
    })
    .join("");
}

reportForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const record = {
    timestamp: new Date().toLocaleString(),
    imageName: imageNameInput.value.trim(),
    detectionClass: detectionClassInput.value,
    latitude: Number(latitudeInput.value),
    longitude: Number(longitudeInput.value),
  };

  const records = getRecords();
  records.unshift(record);
  setRecords(records);
  reportForm.reset();
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
  const headers = ["timestamp", "image_name", "detection", "latitude", "longitude"];
  const lines = records.map((r) => [
    r.timestamp,
    r.imageName,
    r.detectionClass,
    r.latitude,
    r.longitude,
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
