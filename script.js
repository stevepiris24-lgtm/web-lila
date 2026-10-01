
/* =========================================================
   UNTUK LILA - MAIN JAVASCRIPT
   GitHub Pages + Supabase
========================================================= */

(() => {
  "use strict";

  /* 1. KONFIGURASI SUPABASE */
  const SUPABASE_URL = "https://lzuqaqysqmavxxstifjy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_XAbDjSXAHywqAGJ4eWz3OA_iO5PDNiF";
  const STORAGE_BUCKET = "album-photos";

  // Tanggal awal hubungan: 24 April 2024
  const START_DATE = new Date("2024-04-24T00:00:00+09:00");

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  let currentUser = null;
  let currentAlbum = null;
  let albumCache = [];
  let storyCache = [];
  let toastTimeout = null;
  let loading = false;

  const $ = (id) => document.getElementById(id);

  /* 2. UTILITAS */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatDate(value) {
    if (!value) return "Tanggal belum diisi";

    const date = new Date(value + (
      /^\d{4}-\d{2}-\d{2}$/.test(value) ? "T00:00:00" : ""
    ));

    if (Number.isNaN(date.getTime())) return "Tanggal tidak tersedia";

    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function showToast(message) {
    const toast = $("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }

  function setMessage(id, message, isError = false) {
    const el = $(id);
    if (!el) return;

    el.textContent = message;
    el.style.color = isError ? "#ff9ba9" : "#ff82a9";
  }

  function setBusy(form, busy, buttonText = "Menyimpan...") {
    if (!form) return;

    const button = form.querySelector('button[type="submit"]');
    if (!button) return;

    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = buttonText;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || "Simpan";
      button.disabled = false;
    }
  }

  function openModal(id) {
    const modal = $(id);
    if (!modal) return;

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeModal(id) {
    const modal = $(id);
    if (!modal) return;

    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");

    if (!document.querySelector(".modal.open")) {
      document.body.classList.remove("modal-open");
    }
  }

  function closeAllModals() {
    document.querySelectorAll(".modal.open").forEach((modal) => {
      closeModal(modal.id);
    });
  }

  function requireLogin() {
    if (currentUser) return true;

    showToast("Silakan login admin terlebih dahulu.");
    openModal("loginModal");
    return false;
  }

  /* 3. PENGHITUNG HARI DAN JAM BERSAMA */

  function updateTogetherCounter() {
    const now = new Date();
    const elapsed = Math.max(0, now.getTime() - START_DATE.getTime());

    const totalHours = Math.floor(elapsed / 3600000);
    const totalDays = Math.floor(elapsed / 86400000);

    if ($("daysTogether")) {
      $("daysTogether").textContent = totalDays.toLocaleString("id-ID");
    }

    if ($("hoursTogether")) {
      $("hoursTogether").textContent = totalHours.toLocaleString("id-ID");
    }

    if ($("startDateText")) {
      $("startDateText").textContent = formatDate("2024-04-24");
    }
  }

  /* 4. STATUS ADMIN */

  function updateAdminUI() {
    const loggedIn = Boolean(currentUser);

    document.querySelectorAll(".admin-only").forEach((element) => {
      element.hidden = !loggedIn;
    });

    const adminButton = $("adminButton");

    if (adminButton) {
      adminButton.textContent = loggedIn ? "Keluar Admin" : "Admin";
      adminButton.setAttribute(
        "aria-label",
        loggedIn ? "Keluar dari admin" : "Login admin"
      );
    }

    if ($("loginMessage")) {
      $("loginMessage").textContent = "";
    }
  }

  /* 5. LOGIN ADMIN */

  async function loginAdmin(event) {
    event.preventDefault();

    const form = $("loginForm");
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    if (!email || !password) {
      setMessage("loginMessage", "Email dan password wajib diisi.", true);
      return;
    }

    setBusy(form, true, "Memeriksa login...");

    try {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      currentUser = data.user;
      updateAdminUI();
      closeModal("loginModal");
      form.reset();

      await loadAllData();
      showToast("Login berhasil. Selamat datang!");
    } catch (error) {
      console.error("Login gagal:", error);

      setMessage(
        "loginMessage",
        "Login gagal: " + (error.message || "Periksa email dan password."),
        true
      );
    } finally {
      setBusy(form, false);
    }
  }

  async function logoutAdmin() {
    try {
      const { error } = await db.auth.signOut();
      if (error) throw error;

      currentUser = null;
      updateAdminUI();
      closeAllModals();
      await loadAllData();

      showToast("Kamu sudah keluar dari admin.");
    } catch (error) {
      console.error("Logout gagal:", error);
      showToast("Gagal logout: " + error.message);
    }
  }

  async function initializeAuth() {
    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;

      currentUser = data.session?.user ?? null;
      updateAdminUI();
    } catch (error) {
      console.error("Gagal memeriksa sesi:", error);
      currentUser = null;
      updateAdminUI();
      showToast("Sesi admin belum dapat diperiksa.");
    }

    db.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user ?? null;
      updateAdminUI();

      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setTimeout(() => loadAllData(), 0);
      }
    });
  }

  /* 6. STORAGE FOTO */

  function validateImage(file) {
    if (!file) return "Pilih foto terlebih dahulu.";

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      return "Format foto harus JPG, PNG, atau WEBP.";
    }

    if (file.size > 8 * 1024 * 1024) {
      return "Ukuran foto maksimal 8 MB per file.";
    }

    return null;
  }

  async function uploadImage(file, folder = "misc") {
    if (!requireLogin()) {
      throw new Error("Login admin diperlukan.");
    }

    const validationError = validateImage(file);
    if (validationError) throw new Error(validationError);

    const safeName = file.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-100);

    const path = `${folder}/${crypto.randomUUID()}-${safeName}`;

    const { error } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;

    const { data } = db.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    return {
      path,
      url: data.publicUrl
    };
  }

  async function deleteStoredImage(path) {
    if (!path || !requireLogin()) return;

    const { error } = await db.storage
      .from(STORAGE_BUCKET)
      .remove([path]);

    if (error) {
      console.error("Gagal menghapus file storage:", error);
    }
  }

  /* 7. LOAD TIMELINE */

  async function loadStories() {
    const container = $("timelineList");
    if (!container) return;

    const { data, error } = await db
      .from("timeline_stories")
      .select("*")
      .order("tanggal", { ascending: false });

    if (error) {
      console.error("Gagal memuat cerita:", error);
      container.innerHTML =
        '<p class="empty-state">Cerita belum bisa dimuat. Periksa tabel timeline_stories dan kebijakan RLS Supabase.</p>';
      return;
    }

    storyCache = data || [];
    renderStories();
  }

  function renderStories() {
    const container = $("timelineList");
    if (!container) return;

    if (!storyCache.length) {
      container.innerHTML =
        '<p class="empty-state">Belum ada cerita. Login admin untuk menambahkan cerita pertama. ♡</p>';
      return;
    }

    container.innerHTML = storyCache.map((story) => {
      const photo = story.foto_url
        ? `<img class="timeline-thumb" src="${escapeHTML(story.foto_url)}" alt="Foto ${escapeHTML(story.judul)}" loading="lazy">`
        : "";

      const location = story.lokasi
        ? `<p>📍 ${escapeHTML(story.lokasi)}</p>`
        : "";

      const linkedAlbum = story.album_id
        ? albumCache.find((item) => String(item.id) === String(story.album_id))
        : null;

      const albumLink = linkedAlbum
        ? `<button class="story-album-link" data-story-album="${escapeHTML(linkedAlbum.id)}" type="button">
             <span class="story-album-link-icon">♡</span>
             Lihat highlight: ${escapeHTML(linkedAlbum.judul || linkedAlbum.title || "Album kenangan")} →
           </button>`
        : "";

      const actions = currentUser
        ? `<div class="inline-actions">
             <button class="danger-button" data-delete-story="${escapeHTML(story.id)}" type="button">Hapus cerita</button>
           </div>`
        : "";

      return `
        <article class="timeline-card">
          <div class="timeline-date">${escapeHTML(formatDate(story.tanggal || story.event_date))}</div>
          <div class="timeline-content">
            <h3>${escapeHTML(story.judul || story.title || "Kenangan kita")}</h3>
            ${location}
            <p>${escapeHTML(story.cerita || story.description || "")}</p>
            ${photo}
            ${albumLink}
            ${actions}
          </div>
        </article>
      `;
    }).join("");
  }

  async function addStory(event) {
    event.preventDefault();
    if (!requireLogin()) return;

    const form = $("storyForm");
    const file = $("storyPhoto").files[0];

    let uploaded = null;
    setBusy(form, true);

    try {
      if (file) uploaded = await uploadImage(file, "stories");

      const payload = {
        judul: $("storyTitle").value.trim(),
        tanggal: $("storyDate").value,
        lokasi: $("storyLocation").value.trim() || null,
        cerita: $("storyDescription").value.trim(),
        album_id: $("storyAlbum")?.value || null,
        foto_url: uploaded?.url || null,
        foto_path: uploaded?.path || null,
        created_by: currentUser.id
      };

      const { error } = await db
        .from("timeline_stories")
        .insert(payload);

      if (error) throw error;

      form.reset();
      closeModal("storyModal");
      await loadStories();
      showToast("Cerita berhasil disimpan ♡");
    } catch (error) {
      console.error("Gagal menyimpan cerita:", error);

      if (uploaded?.path) await deleteStoredImage(uploaded.path);

      setMessage(
        "storyMessage",
        "Gagal menyimpan cerita: " + error.message,
        true
      );
    } finally {
      setBusy(form, false);
    }
  }

  async function deleteStory(id) {
    if (!requireLogin()) return;

    const story = storyCache.find((item) => String(item.id) === String(id));
    if (!story) return;

    if (!confirm(`Hapus cerita "${story.judul || story.title || "Kenangan"}"?`)) return;

    try {
      const { error } = await db
        .from("timeline_stories")
        .delete()
        .eq("id", id);

      if (error) throw error;

      if (story.foto_path) {
        await deleteStoredImage(story.foto_path);
      }

      await loadStories();
      showToast("Cerita berhasil dihapus.");
    } catch (error) {
      console.error("Gagal menghapus cerita:", error);
      showToast("Gagal menghapus cerita: " + error.message);
    }
  }

  /* 8. LOAD ALBUM */

  async function loadAlbums() {
    const container = $("albumGrid");
    if (!container) return;

    const { data, error } = await db
      .from("albums")
      .select("*")
      .order("tanggal", { ascending: false });

    if (error) {
      console.error("Gagal memuat album:", error);
      container.innerHTML =
        '<p class="empty-state">Album belum bisa dimuat. Periksa tabel albums dan kebijakan RLS Supabase.</p>';
      return;
    }

    albumCache = data || [];
    renderAlbums();
    renderStoryAlbumOptions();
    renderStories();
  }

  function renderStoryAlbumOptions() {
    const select = $("storyAlbum");
    if (!select) return;

    const selected = select.value;
    select.innerHTML = '<option value="">Tidak dihubungkan ke album</option>' +
      albumCache.map((album) => `
        <option value="${escapeHTML(album.id)}">${escapeHTML(album.judul || album.title || "Album kenangan")}</option>
      `).join("");

    if (selected && albumCache.some((album) => String(album.id) === String(selected))) {
      select.value = selected;
    }
  }

  function renderAlbums() {
    const container = $("albumGrid");
    if (!container) return;

    if (!albumCache.length) {
      container.innerHTML =
        '<p class="empty-state">Belum ada album kenangan. Login admin untuk membuat album pertama. ♡</p>';
      return;
    }

    container.innerHTML = albumCache.map((album) => {
      const albumTitle = album.judul || album.title || "Album kenangan";
      const cover = album.cover_url
        ? `<img class="album-cover" src="${escapeHTML(album.cover_url)}" alt="Sampul ${escapeHTML(albumTitle)}" loading="lazy">`
        : '<div class="album-placeholder">♡</div>';

      const actions = currentUser
        ? `<div class="album-actions">
             <button class="small-button" data-add-photo="${escapeHTML(album.id)}" type="button">+ Tambah Foto</button>
             <button class="danger-button" data-delete-album="${escapeHTML(album.id)}" type="button">Hapus</button>
           </div>`
        : "";

      return `
        <article class="album-card">
          <button class="album-open" data-open-album="${escapeHTML(album.id)}" type="button">
            <span class="highlight-ring">${cover}</span>
            <div class="album-info">
              <h3>${escapeHTML(albumTitle)}</h3>
              <p>${escapeHTML(formatDate(album.tanggal || album.event_date))}</p>
              <p>${escapeHTML(album.lokasi || "Kenangan kita ♡")}</p>
              <span class="highlight-hint">Buka highlight ♡</span>
            </div>
          </button>
          ${actions}
        </article>
      `;
    }).join("");
  }

  async function createAlbum(event) {
    event.preventDefault();
    if (!requireLogin()) return;

    const form = $("albumForm");
    const file = $("albumCover").files[0];

    if (!file) {
      setMessage("albumMessage", "Pilih foto sampul album.", true);
      return;
    }

    let uploaded = null;
    setBusy(form, true);

    try {
      uploaded = await uploadImage(file, "covers");

      const payload = {
        judul: $("albumTitle").value.trim(),
        tanggal: $("albumDate").value,
        lokasi: $("albumLocation").value.trim() || null,
        cerita: $("albumDescription").value.trim() || null,
        cover_url: uploaded.url,
        cover_path: uploaded.path,
        created_by: currentUser.id
      };

      const { error } = await db
        .from("albums")
        .insert(payload);

      if (error) throw error;

      form.reset();
      closeModal("albumModal");
      await loadAlbums();
      showToast("Album berhasil dibuat! ♡");
    } catch (error) {
      console.error("Gagal membuat album:", error);

      if (uploaded?.path) await deleteStoredImage(uploaded.path);

      setMessage(
        "albumMessage",
        "Gagal membuat album: " + error.message,
        true
      );
    } finally {
      setBusy(form, false);
    }
  }

  /* 9. DETAIL ALBUM DAN FOTO */

  async function openAlbum(albumId) {
    const album = albumCache.find((item) => String(item.id) === String(albumId));
    if (!album) {
      showToast("Album tidak ditemukan. Muat ulang halaman.");
      return;
    }

    currentAlbum = album;

    const albumTitle = album.judul || album.title || "Album kenangan";
    const relatedStories = storyCache.filter(
      (story) => String(story.album_id || "") === String(album.id)
    );

    const relatedStoriesHTML = relatedStories.length
      ? relatedStories.map((story) => `
          <article class="album-related-story">
            <p class="timeline-date">${escapeHTML(formatDate(story.tanggal || story.event_date))}</p>
            <h4>${escapeHTML(story.judul || story.title || "Kenangan kita")}</h4>
            <p>${escapeHTML(story.cerita || story.description || "")}</p>
          </article>
        `).join("")
      : '<p class="muted">Belum ada cerita timeline yang dihubungkan ke album ini.</p>';

    $("albumDetailContent").innerHTML = `
      <p class="eyebrow">OUR MEMORIES · HIGHLIGHT</p>
      <h2 class="album-detail-title">${escapeHTML(albumTitle)}</h2>
      <p class="muted">${escapeHTML(formatDate(album.tanggal || album.event_date))}${album.lokasi ? " · " + escapeHTML(album.lokasi) : ""}</p>
      ${album.cover_url ? `<img class="album-detail-cover" src="${escapeHTML(album.cover_url)}" alt="Sampul ${escapeHTML(albumTitle)}">` : ""}
      <p class="album-detail-description">${escapeHTML(album.cerita || album.description || "Satu album, banyak kenangan indah. ♡")}</p>
      <section class="album-related-stories">
        <h3>Cerita timeline di highlight ini</h3>
        ${relatedStoriesHTML}
      </section>
      <h3>Foto di dalam album</h3>
      <div id="photoGallery" class="photo-gallery"><p class="empty-state">Memuat foto...</p></div>
    `;

    $("photoForm").hidden = !currentUser;
    setMessage("photoMessage", "");
    openModal("albumDetailModal");

    await loadAlbumPhotos(album.id);
  }

  async function loadAlbumPhotos(albumId) {
    const gallery = $("photoGallery");
    if (!gallery) return;

    const { data, error } = await db
      .from("album_photos")
      .select("*")
      .eq("album_id", albumId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Gagal memuat foto album:", error);
      gallery.innerHTML =
        '<p class="empty-state">Foto belum bisa dimuat. Periksa tabel album_photos.</p>';
      return;
    }

    if (!data || !data.length) {
      gallery.innerHTML =
        '<p class="empty-state">Belum ada foto di album ini.</p>';
      return;
    }

    gallery.innerHTML = data.map((photo) => `
      <div class="gallery-item">
        <a href="${escapeHTML(photo.foto_url)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeHTML(photo.foto_url)}" alt="Foto kenangan" loading="lazy">
        </a>
        ${currentUser ? `
          <button class="danger-button" data-delete-photo="${escapeHTML(photo.id)}" type="button">Hapus foto</button>
        ` : ""}
      </div>
    `).join("");
  }

  async function addAlbumPhotos(event) {
    event.preventDefault();
    if (!requireLogin() || !currentAlbum) return;

    const form = $("photoForm");
    const files = Array.from($("albumPhotos").files || []);

    if (!files.length) {
      setMessage("photoMessage", "Pilih minimal satu foto.", true);
      return;
    }

    if (files.length > 20) {
      setMessage("photoMessage", "Maksimal 20 foto setiap unggahan.", true);
      return;
    }

    for (const file of files) {
      const validationError = validateImage(file);
      if (validationError) {
        setMessage("photoMessage", `${file.name}: ${validationError}`, true);
        return;
      }
    }

    setBusy(form, true, "Mengunggah foto...");
    const uploadedFiles = [];

    try {
      for (const file of files) {
        const uploaded = await uploadImage(file, `albums/${currentAlbum.id}`);
        uploadedFiles.push(uploaded);

        const { error } = await db.from("album_photos").insert({
          album_id: currentAlbum.id,
          foto_url: uploaded.url,
          foto_path: uploaded.path,
          created_by: currentUser.id
        });

        if (error) throw error;
      }

      form.reset();
      setMessage("photoMessage", "Semua foto berhasil diunggah.");
      await loadAlbumPhotos(currentAlbum.id);
      showToast("Foto berhasil ditambahkan ♡");
    } catch (error) {
      console.error("Gagal mengunggah foto:", error);

      setMessage(
        "photoMessage",
        "Unggahan belum selesai: " + error.message +
        ". Periksa galeri sebelum mencoba lagi.",
        true
      );
    } finally {
      setBusy(form, false);
    }
  }

  async function deleteAlbumPhoto(id) {
    if (!requireLogin() || !currentAlbum) return;
    if (!confirm("Hapus foto ini dari album?")) return;

    try {
      const { data: photo, error: findError } = await db
        .from("album_photos")
        .select("*")
        .eq("id", id)
        .eq("album_id", currentAlbum.id)
        .single();

      if (findError) throw findError;

      const { error } = await db
        .from("album_photos")
        .delete()
        .eq("id", id)
        .eq("album_id", currentAlbum.id);

      if (error) throw error;

      if (photo.foto_path) {
        await deleteStoredImage(photo.foto_path);
      }

      await loadAlbumPhotos(currentAlbum.id);
      showToast("Foto berhasil dihapus.");
    } catch (error) {
      console.error("Gagal menghapus foto:", error);
      showToast("Gagal menghapus foto: " + error.message);
    }
  }

  async function deleteAlbum(id) {
    if (!requireLogin()) return;

    const album = albumCache.find((item) => String(item.id) === String(id));
    if (!album) return;

    if (!confirm(`Hapus album "${album.judul || album.title || "Album kenangan"}" beserta semua foto di dalamnya?`)) {
      return;
    }

    try {
      const { data: photos, error: photoError } = await db
        .from("album_photos")
        .select("foto_path")
        .eq("album_id", id);

      if (photoError) throw photoError;

      const { error: deletePhotosError } = await db
        .from("album_photos")
        .delete()
        .eq("album_id", id);

      if (deletePhotosError) throw deletePhotosError;

      const { error: deleteAlbumError } = await db
        .from("albums")
        .delete()
        .eq("id", id);

      if (deleteAlbumError) throw deleteAlbumError;

      const paths = (photos || [])
        .map((photo) => photo.foto_path)
        .filter(Boolean);

      if (album.cover_path) paths.push(album.cover_path);

      if (paths.length) {
        const { error: storageError } = await db.storage
          .from(STORAGE_BUCKET)
          .remove(paths);

        if (storageError) {
          console.error("Sebagian file storage belum terhapus:", storageError);
        }
      }

      if (currentAlbum && String(currentAlbum.id) === String(id)) {
        currentAlbum = null;
        closeModal("albumDetailModal");
      }

      await loadAlbums();
      showToast("Album berhasil dihapus.");
    } catch (error) {
      console.error("Gagal menghapus album:", error);
      showToast("Gagal menghapus album: " + error.message);
    }
  }

  /* 10. MUAT SEMUA DATA */

  async function loadAllData() {
    if (loading) return;
    loading = true;

    try {
      await Promise.all([
        loadStories(),
        loadAlbums()
      ]);
    } finally {
      loading = false;
    }
  }

  /* 11. EVENT LISTENERS */

  function bindEvents() {
    $("adminButton")?.addEventListener("click", () => {
      if (currentUser) {
        logoutAdmin();
      } else {
        setMessage("loginMessage", "");
        openModal("loginModal");
      }
    });

    $("loginForm")?.addEventListener("submit", loginAdmin);
    $("storyForm")?.addEventListener("submit", addStory);
    $("albumForm")?.addEventListener("submit", createAlbum);
    $("photoForm")?.addEventListener("submit", addAlbumPhotos);

    $("addTimelineButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;
      setMessage("storyMessage", "");
      $("storyDate").value = new Date().toLocaleDateString("en-CA");
      openModal("storyModal");
    });

    $("addAlbumButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;
      setMessage("albumMessage", "");
      $("albumDate").value = new Date().toLocaleDateString("en-CA");
      openModal("albumModal");
    });

    document.querySelectorAll("[data-close]").forEach((button) => {
      button.addEventListener("click", () => closeModal(button.dataset.close));
    });

    document.querySelectorAll(".modal").forEach((modal) => {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal(modal.id);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAllModals();
    });

    $("timelineList")?.addEventListener("click", (event) => {
      const albumButton = event.target.closest("[data-story-album]");
      if (albumButton) {
        openAlbum(albumButton.dataset.storyAlbum);
        return;
      }

      const button = event.target.closest("[data-delete-story]");
      if (button) deleteStory(button.dataset.deleteStory);
    });

    $("albumGrid")?.addEventListener("click", (event) => {
      const openButton = event.target.closest("[data-open-album]");
      const addButton = event.target.closest("[data-add-photo]");
      const deleteButton = event.target.closest("[data-delete-album]");

      if (deleteButton) {
        deleteAlbum(deleteButton.dataset.deleteAlbum);
        return;
      }

      if (addButton) {
        if (!requireLogin()) return;
        openAlbum(addButton.dataset.addPhoto);
        return;
      }

      if (openButton) openAlbum(openButton.dataset.openAlbum);
    });

    $("albumDetailContent")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-photo]");
      if (button) deleteAlbumPhoto(button.dataset.deletePhoto);
    });
  }

  /* 12. START APLIKASI */

  async function init() {
    updateTogetherCounter();
    setInterval(updateTogetherCounter, 60 * 1000);

    bindEvents();

    if (!window.supabase) {
      showToast("Supabase gagal dimuat. Periksa koneksi internet.");
      return;
    }

    await initializeAuth();
    await loadAllData();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
