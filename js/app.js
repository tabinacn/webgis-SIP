// ===============================
// 1. Konfigurasi basemap
// ===============================
// Basemap adalah peta dasar. Pada tutorial ini kita hanya memakai satu basemap Light.
// Dengan satu basemap, tampilan panel lebih sederhana dan tidak membutuhkan basemap switcher.
const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// ===============================
// 2. Inisialisasi peta MapLibre
// ===============================
// container: id elemen HTML tempat peta ditampilkan.
// style: URL style basemap Light.
// center: koordinat pusat peta [longitude, latitude] Surabaya.
// zoom: tingkat kedekatan peta.
const map = new maplibregl.Map({
  container: "map",
  style: BASEMAP,
  center: [112.7521, -7.2575],
  zoom: 11
});

// Menambahkan tombol zoom dan kompas.
map.addControl(new maplibregl.NavigationControl(), "top-right");

// Variabel global untuk menyimpan data GeoJSON setelah dibaca.
let pendudukData = null;

// Nama source dan layer dibuat sebagai konstanta agar tidak salah ketik.
const SOURCE_ID = "penduduk-surabaya-source";
const FILL_LAYER_ID = "penduduk-surabaya-fill";
const LINE_LAYER_ID = "penduduk-surabaya-outline";

// ===============================
// 3. Membaca file GeoJSON lokal
// ===============================
// File berada di folder data, sehingga path-nya ./data/jumlah_penduduk_surabaya.geojson
async function loadGeoJSON() {
  try {
    const response = await fetch("./data/jumlah_penduduk_surabaya.geojson");

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    pendudukData = await response.json();

    addPendudukLayer();
    buildKecamatanFilter();
  } catch (error) {
    console.error("Gagal membaca GeoJSON:", error);
    alert("GeoJSON gagal dimuat. Pastikan file berada di folder data.");
  }
}

// ===============================
// 4. Menambahkan layer GeoJSON ke peta
// ===============================
function addPendudukLayer() {
  // Jika source atau layer sudah ada, hapus dulu agar tidak terjadi duplikasi.
  if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
  if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

  // Source adalah sumber data spasial yang akan dibaca MapLibre.
  map.addSource(SOURCE_ID, {
    type: "geojson",
    data: pendudukData
  });

  // Layer fill untuk menampilkan polygon kelurahan/kecamatan.
  map.addLayer({
    id: FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      // Warna polygon dibuat berdasarkan atribut jumlah_pdd.
      // Semakin besar jumlah penduduk, semakin gelap warnanya.
      "fill-color": [
        "interpolate",
        ["linear"],
        ["get", "jumlah_pdd"],
        0, "#fff7bc",
        10000, "#fec44f",
        25000, "#d95f0e",
        50000, "#7f2704"
      ],
      "fill-opacity": 0.72
    }
  });

  // Layer garis batas agar polygon lebih mudah dibaca.
  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": "#0f172a",
      "line-width": 0.7,
      "line-opacity": 0.65
    }
  });
}

// ===============================
// 5. Membuat dropdown filter kecamatan
// ===============================
function buildKecamatanFilter() {
  const select = document.getElementById("kecamatanSelect");

  // Kosongkan option lama agar tidak dobel jika fungsi terpanggil ulang.
  select.innerHTML = '<option value="all">Semua Kecamatan</option>';

  // Ambil semua nilai WADMKC dari fitur GeoJSON.
  const kecamatanList = pendudukData.features
    .map((feature) => feature.properties.WADMKC)
    .filter(Boolean);

  // Buat daftar unik dan urutkan alfabetis.
  const uniqueKecamatan = [...new Set(kecamatanList)].sort();

  // Tambahkan setiap kecamatan sebagai option di dropdown.
  uniqueKecamatan.forEach((namaKecamatan) => {
    const option = document.createElement("option");
    option.value = namaKecamatan;
    option.textContent = namaKecamatan;
    select.appendChild(option);
  });
}

// ===============================
// 6. Menerapkan filter layer
// ===============================
function applyKecamatanFilter(kecamatan) {
  if (kecamatan === "all") {
    map.setFilter(FILL_LAYER_ID, null);
    map.setFilter(LINE_LAYER_ID, null);
    return;
  }

  // Filter MapLibre: tampilkan fitur yang atribut WADMKC-nya sama dengan pilihan user.
  const filter = ["==", ["get", "WADMKC"], kecamatan];
  map.setFilter(FILL_LAYER_ID, filter);
  map.setFilter(LINE_LAYER_ID, filter);

  // Zoom otomatis ke wilayah kecamatan yang dipilih.
  zoomToKecamatan(kecamatan);
}

// ===============================
// 7. Zoom otomatis ke kecamatan terpilih
// ===============================
function zoomToKecamatan(kecamatan) {
  const selectedFeatures = pendudukData.features.filter(
    (feature) => feature.properties.WADMKC === kecamatan
  );

  if (selectedFeatures.length === 0) return;

  const bounds = new maplibregl.LngLatBounds();

  selectedFeatures.forEach((feature) => {
    extendBoundsByCoordinates(bounds, feature.geometry.coordinates);
  });

  map.fitBounds(bounds, {
    padding: 60,
    duration: 900
  });
}

// Fungsi rekursif untuk membaca koordinat Polygon atau MultiPolygon.
function extendBoundsByCoordinates(bounds, coordinates) {
  coordinates.forEach((coord) => {
    if (typeof coord[0] === "number" && typeof coord[1] === "number") {
      bounds.extend(coord);
    } else {
      extendBoundsByCoordinates(bounds, coord);
    }
  });
}

// ===============================
// 8. Popup ketika polygon diklik
// ===============================
function setupPopup() {
  // Popup akan muncul saat user klik polygon pada layer fill.
  map.on("click", FILL_LAYER_ID, (event) => {
    const props = event.features[0].properties;

    const popupHTML = `
      <div>
        <div class="popup-title">${props.NAMOBJ || "Tanpa Nama"}</div>
        <div class="popup-row"><b>Kecamatan:</b> ${props.WADMKC || "-"}</div>
        <div class="popup-row"><b>Jumlah Penduduk:</b> ${Number(props.jumlah_pdd || 0).toLocaleString("id-ID")} jiwa</div>
        <div class="popup-row"><b>Luas:</b> ${props.luas ? Number(props.luas).toFixed(2) : "-"} km²</div>
      </div>
    `;

    new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true
    })
      .setLngLat(event.lngLat)
      .setHTML(popupHTML)
      .addTo(map);
  });

  // Ubah cursor menjadi pointer saat mouse berada di atas polygon.
  map.on("mouseenter", FILL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", FILL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });
}

// ===============================
// 9. Event listener untuk UI
// ===============================
// Kita hanya menyediakan filter kecamatan dan tombol reset.
document.getElementById("kecamatanSelect").addEventListener("change", (event) => {
  applyKecamatanFilter(event.target.value);
});

document.getElementById("resetFilterBtn").addEventListener("click", () => {
  document.getElementById("kecamatanSelect").value = "all";
  applyKecamatanFilter("all");

  map.flyTo({
    center: [112.7521, -7.2575],
    zoom: 11
  });
});

// ===============================
// 10. Memuat data dan popup saat peta siap
// ===============================
// Karena hanya ada satu basemap, cukup memuat data setelah peta selesai dimuat.
map.on("load", () => {
  loadGeoJSON();
  setupPopup();
});
