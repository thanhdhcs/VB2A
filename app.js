/* ================= Timeline app – Supabase backed ================= */
(function () {
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const TABLE = "milestones";
  const LINKS_TABLE = "links";
  let sb = null;
  let editing = false;
  let items = [];          // milestones from DB
  let links = [];          // quick links from DB
  let editingId = null;    // milestone id being edited (null = new)
  let editingLinkId = null;// link id being edited (null = new)
  let demo = false;        // true when Supabase not configured

  const $ = (id) => document.getElementById(id);

  // ---- Sample data used only when Supabase chưa cấu hình (xem thử giao diện) ----
  const DEMO_DATA = [
    { id: 1, position: 1, event_date: "2026-09-01", title: "Họp triển khai, phân công nhiệm vụ", progress: 100, is_exam: false },
    { id: 2, position: 2, event_date: "2026-09-05", title: "Mời PA06 quét an ninh", progress: 100, is_exam: false },
    { id: 3, position: 3, event_date: "2026-09-06", title: "Thử tải hệ thống (mới có 20% công việc)", progress: 20, is_exam: false, note: "Phụ trách: Tuấn. Cần kiểm tra tải 550 máy đồng thời, ghi lại thời gian phản hồi." },
    { id: 4, position: 4, event_date: "2026-09-06", title: "Chuẩn bị phòng máy, thiết bị dự phòng", progress: 0, is_exam: false },
    { id: 5, position: 5, event_date: "2026-09-08", title: "Tập huấn cán bộ coi thi", progress: 0, is_exam: false },
    { id: 6, position: 6, event_date: "2026-09-09", title: "Rà soát danh sách thí sinh", progress: 0, is_exam: false },
    { id: 7, position: 99, event_date: "2026-09-10", title: "Tổ chức kỳ thi chính thức", progress: 0, is_exam: true },
  ];
  const DEMO_LINKS = [
    { id: 1, position: 1, label: "Danh sách thí sinh", url: "https://docs.google.com/spreadsheets" },
    { id: 2, position: 2, label: "Phân công cán bộ", url: "https://docs.google.com/spreadsheets" },
    { id: 3, position: 3, label: "Sơ đồ phòng máy", url: "https://drive.google.com" },
  ];

  // ---------------- Init ----------------
  function init() {
    if (cfg.SITE_TITLE) {
      $("siteTitle").textContent = cfg.SITE_TITLE;
      document.title = cfg.SITE_TITLE;
    }
    const configured =
      cfg.SUPABASE_URL &&
      cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_URL.includes("PASTE_") &&
      !cfg.SUPABASE_ANON_KEY.includes("PASTE_");

    if (configured && window.supabase) {
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      $("conn").textContent = "đã kết nối Supabase";
      subscribeRealtime();
    } else {
      demo = true;
      $("conn").textContent = "CHẾ ĐỘ XEM THỬ (chưa cấu hình Supabase)";
      setStatus("Đang chạy dữ liệu mẫu. Điền khóa Supabase trong config.js để lưu thật.");
    }

    bindUI();
    load();
    loadLinks();
  }

  function bindUI() {
    $("btnEdit").addEventListener("click", toggleEdit);
    $("btnAdd").addEventListener("click", () => openModal(null));
    $("btnRefresh").addEventListener("click", () => { load(); loadLinks(); });
    $("btnCancel").addEventListener("click", closeModal);
    $("modalBg").addEventListener("click", (e) => { if (e.target === $("modalBg")) closeModal(); });
    $("btnSave").addEventListener("click", saveModal);
    $("btnDelete").addEventListener("click", deleteItem);
    $("fProg").addEventListener("input", (e) => { $("fProgOut").textContent = e.target.value + "%"; });
    // Links
    $("btnAddLink").addEventListener("click", () => openLinkModal(null));
    $("btnCancelLink").addEventListener("click", closeLinkModal);
    $("linkModalBg").addEventListener("click", (e) => { if (e.target === $("linkModalBg")) closeLinkModal(); });
    $("btnSaveLink").addEventListener("click", saveLinkModal);
    $("btnDeleteLink").addEventListener("click", deleteLink);
  }

  function setStatus(msg) {
    $("statusMsg").textContent = msg || "";
    if (msg) clearTimeout(setStatus._t), (setStatus._t = setTimeout(() => ($("statusMsg").textContent = ""), 4000));
  }

  // ---------------- Data ----------------
  async function load() {
    if (demo) { items = DEMO_DATA.slice(); render(); return; }
    setStatus("Đang tải…");
    const { data, error } = await sb.from(TABLE).select("*").order("event_date", { ascending: true }).order("position", { ascending: true });
    if (error) { setStatus("Lỗi tải dữ liệu: " + error.message); console.error(error); return; }
    items = data || [];
    render();
    setStatus("");
  }

  function subscribeRealtime() {
    try {
      sb.channel("ms-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, () => load())
        .on("postgres_changes", { event: "*", schema: "public", table: LINKS_TABLE }, () => loadLinks())
        .subscribe();
    } catch (e) { /* realtime optional */ }
  }

  // ---------------- Quick links ----------------
  async function loadLinks() {
    if (demo) { links = DEMO_LINKS.slice(); renderLinks(); return; }
    const { data, error } = await sb.from(LINKS_TABLE).select("*").order("position", { ascending: true });
    if (error) { console.warn("links:", error.message); links = []; }
    else links = data || [];
    renderLinks();
  }

  function renderLinks() {
    const box = $("quicklinks");
    if (!links.length) {
      box.innerHTML = '<span class="empty-links">Chưa có link. Bật Chỉnh sửa → “➕ Thêm link”.</span>';
      return;
    }
    box.innerHTML = links.map(l => `
      <span class="chip-wrap" style="display:inline-flex">
        <a class="chip" href="${esc(l.url)}" target="_blank" rel="noopener">
          <span class="ic">📄</span>${esc(l.label || l.url)}
          <button class="edit" data-editlink="${l.id}" title="Sửa">✏️</button>
        </a>
      </span>`).join("");
    box.querySelectorAll("[data-editlink]").forEach(b =>
      b.addEventListener("click", (e) => { e.preventDefault(); openLinkModal(Number(b.getAttribute("data-editlink"))); }));
  }

  function openLinkModal(id) {
    editingLinkId = id;
    const l = id != null ? links.find(x => x.id === id) : null;
    $("linkModalTitle").textContent = l ? "Sửa liên kết" : "Thêm liên kết";
    $("lName").value = l ? (l.label || "") : "";
    $("lUrl").value = l ? (l.url || "") : "";
    $("btnDeleteLink").style.display = l ? "inline-flex" : "none";
    $("linkModalBg").classList.add("open");
  }
  function closeLinkModal() { $("linkModalBg").classList.remove("open"); editingLinkId = null; }

  async function saveLinkModal() {
    let url = $("lUrl").value.trim();
    const label = $("lName").value.trim();
    if (!url) { alert("Nhập đường dẫn (URL)."); return; }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const rec = { label: label || url, url };

    if (demo) {
      if (editingLinkId != null) Object.assign(links.find(x => x.id === editingLinkId), rec);
      else links.push(Object.assign({ id: Date.now(), position: links.length + 1 }, rec));
      closeLinkModal(); renderLinks(); return;
    }
    setStatus("Đang lưu link…");
    let res;
    if (editingLinkId != null) res = await sb.from(LINKS_TABLE).update(rec).eq("id", editingLinkId);
    else { rec.position = links.reduce((m, x) => Math.max(m, x.position || 0), 0) + 1; res = await sb.from(LINKS_TABLE).insert(rec); }
    if (res.error) { setStatus("Lỗi lưu link: " + res.error.message); alert("Lỗi: " + res.error.message); return; }
    closeLinkModal(); await loadLinks(); setStatus("Đã lưu link ✓");
  }

  async function deleteLink() {
    if (editingLinkId == null) return;
    if (!confirm("Xóa link này?")) return;
    if (demo) { links = links.filter(x => x.id !== editingLinkId); closeLinkModal(); renderLinks(); return; }
    const { error } = await sb.from(LINKS_TABLE).delete().eq("id", editingLinkId);
    if (error) { setStatus("Lỗi xóa link: " + error.message); return; }
    closeLinkModal(); await loadLinks(); setStatus("Đã xóa link ✓");
  }

  // ---------------- Render ----------------
  function statusClass(m) {
    if (m.is_exam) return "";
    if (m.progress >= 100) return "done";
    if (m.progress > 0) return "doing";
    return "todo";
  }
  function statusText(m) {
    if (m.progress >= 100) return "Hoàn thành";
    if (m.progress > 0) return "Đang làm";
    return "Chưa bắt đầu";
  }
  function fmtDate(s) {
    if (!s) return "";
    const p = s.split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
  }
  function esc(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function render() {
    const tl = $("timeline");
    // Sắp xếp theo NGÀY (mốc không ngày xuống cuối); cùng ngày thì theo position
    const normal = items.filter(m => !m.is_exam).slice().sort((a, b) => {
      const da = a.event_date || "9999-12-31";
      const db = b.event_date || "9999-12-31";
      if (da !== db) return da < db ? -1 : 1;
      return (a.position || 0) - (b.position || 0);
    });
    const exam = items.find(m => m.is_exam);

    // overall = trung bình % của các mốc thường
    const overall = normal.length ? Math.round(normal.reduce((s, m) => s + (m.progress || 0), 0) / normal.length) : 0;
    $("overallPct").textContent = overall + "%";
    $("overallBar").style.width = overall + "%";

    // exam stats
    if (exam && exam.event_date) {
      $("examDate").textContent = fmtDate(exam.event_date);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const d = new Date(exam.event_date + "T00:00:00");
      const days = Math.round((d - today) / 86400000);
      $("examCountdown").textContent = days > 0 ? days + " ngày" : days === 0 ? "Hôm nay" : "Đã qua";
    } else {
      $("examDate").textContent = "—"; $("examCountdown").textContent = "—";
    }

    if (!items.length) {
      tl.innerHTML = '<div class="empty">Chưa có mốc nào. Bật <b>Chỉnh sửa</b> rồi bấm <b>Thêm mốc</b>.</div>';
      return;
    }

    let html = "";
    normal.forEach((m, i) => {
      const side = i % 2 === 0 ? "left" : "right";
      const cls = statusClass(m);
      html += `
        <div class="node ${side} ${cls}">
          <div class="dot"></div>
          <div class="card">
            <div class="date">📅 ${esc(fmtDate(m.event_date))}</div>
            <div class="title">${esc(m.title)}</div>
            ${m.note ? `<div class="note"><b>📝 Note:</b> ${esc(m.note)}</div>` : ""}
            <div class="pbar"><i style="width:${Math.max(0, Math.min(100, m.progress))}%"></i></div>
            <div class="prow">
              <span class="badge">${statusText(m)}</span>
              <span class="pct">${m.progress}%</span>
            </div>
            <div class="edit-actions">
              <button class="btn ghost small" data-edit="${m.id}">✏️ Sửa</button>
            </div>
          </div>
        </div>`;
    });

    if (exam) {
      html += `
        <div class="node exam">
          <div class="dot"></div>
          <div class="card">
            <div class="date">📅 ${esc(fmtDate(exam.event_date))}</div>
            <div class="title">🎯 NGÀY THI — ${esc(exam.title || "Tổ chức kỳ thi")}</div>
            ${exam.note ? `<div class="note" style="background:rgba(255,255,255,.18);border-left-color:#ffd7cf;color:#fff">${esc(exam.note)}</div>` : ""}
            <div class="count">${$("examCountdown").textContent} còn lại</div>
            <div class="edit-actions" style="justify-content:center">
              <button class="btn ghost small" data-edit="${exam.id}">✏️ Sửa</button>
            </div>
          </div>
        </div>`;
    }

    tl.innerHTML = html;
    tl.querySelectorAll("[data-edit]").forEach(b =>
      b.addEventListener("click", () => openModal(Number(b.getAttribute("data-edit")))));
  }

  // ---------------- Edit mode ----------------
  function toggleEdit() {
    if (!editing) {
      if (demo) { setStatus("Xem thử: cấu hình Supabase để lưu chỉnh sửa."); }
      const pass = prompt("Nhập mật khẩu chỉnh sửa:");
      if (pass === null) return;
      if (pass !== (cfg.EDIT_PASSCODE || "admin123")) { alert("Sai mật khẩu."); return; }
      editing = true;
    } else {
      editing = false;
    }
    document.body.classList.toggle("editing", editing);
    $("btnAdd").style.display = editing ? "inline-flex" : "none";
    $("btnAddLink").style.display = editing ? "inline-flex" : "none";
    $("btnEdit").textContent = editing ? "✔️ Xong" : "✏️ Chỉnh sửa";
    $("btnEdit").classList.toggle("green", !editing);
  }

  // ---------------- Modal ----------------
  function openModal(id) {
    editingId = id;
    const m = id != null ? items.find(x => x.id === id) : null;
    $("modalTitle").textContent = m ? "Sửa mốc công việc" : "Thêm mốc mới";
    $("fDate").value = m ? (m.event_date || "") : "";
    $("fTitle").value = m ? (m.title || "") : "";
    $("fNote").value = m ? (m.note || "") : "";
    $("fProg").value = m ? (m.progress || 0) : 0;
    $("fProgOut").textContent = ($("fProg").value) + "%";
    $("fExam").checked = m ? !!m.is_exam : false;
    $("btnDelete").style.display = m ? "inline-flex" : "none";
    $("modalBg").classList.add("open");
  }
  function closeModal() { $("modalBg").classList.remove("open"); editingId = null; }

  async function saveModal() {
    const rec = {
      event_date: $("fDate").value || null,
      title: $("fTitle").value.trim(),
      note: $("fNote").value.trim() || null,
      progress: Math.max(0, Math.min(100, parseInt($("fProg").value, 10) || 0)),
      is_exam: $("fExam").checked,
    };
    if (!rec.title && !rec.is_exam) { alert("Nhập nội dung công việc."); return; }

    if (demo) {
      if (editingId != null) Object.assign(items.find(x => x.id === editingId), rec);
      else items.push(Object.assign({ id: Date.now(), position: items.length + 1 }, rec));
      closeModal(); render(); setStatus("Đã lưu (tạm thời – chưa cấu hình Supabase).");
      return;
    }

    setStatus("Đang lưu…");
    let res;
    if (editingId != null) {
      res = await sb.from(TABLE).update(rec).eq("id", editingId);
    } else {
      const maxPos = items.filter(x => !x.is_exam).reduce((m, x) => Math.max(m, x.position || 0), 0);
      rec.position = rec.is_exam ? 999 : maxPos + 1;
      res = await sb.from(TABLE).insert(rec);
    }
    if (res.error) { setStatus("Lỗi lưu: " + res.error.message); alert("Lỗi lưu: " + res.error.message); return; }
    closeModal(); await load(); setStatus("Đã lưu ✓");
  }

  async function deleteItem() {
    if (editingId == null) return;
    if (!confirm("Xóa mốc này?")) return;
    if (demo) { items = items.filter(x => x.id !== editingId); closeModal(); render(); return; }
    setStatus("Đang xóa…");
    const { error } = await sb.from(TABLE).delete().eq("id", editingId);
    if (error) { setStatus("Lỗi xóa: " + error.message); return; }
    closeModal(); await load(); setStatus("Đã xóa ✓");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
