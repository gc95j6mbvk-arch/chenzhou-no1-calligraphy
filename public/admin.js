const tokenKey = "calligraphyAdminToken";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
let token = localStorage.getItem(tokenKey) || "";
let site = null;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

function showAdmin() {
  $("#loginView").hidden = true;
  $("#adminView").hidden = false;
}

function showLogin() {
  $("#loginView").hidden = false;
  $("#adminView").hidden = true;
}

async function uploadAsset(file) {
  const form = new FormData();
  form.append("image", file);
  const result = await api("/api/admin/asset", { method: "POST", body: form });
  return result.url;
}

function fillBaseFields() {
  const club = site.club || {};
  const contacts = site.contacts || {};
  $$("[data-club]").forEach((field) => {
    field.value = club[field.dataset.club] || "";
  });
  $$("[data-contact]").forEach((field) => {
    field.value = contacts[field.dataset.contact] || "";
  });
}

function collectBaseFields() {
  site.club ||= {};
  site.contacts ||= {};
  $$("[data-club]").forEach((field) => {
    site.club[field.dataset.club] = field.value.trim();
  });
  $$("[data-contact]").forEach((field) => {
    site.contacts[field.dataset.contact] = field.value.trim();
  });
}

function textInput(name, value, label, wide = false) {
  return `<label class="${wide ? "wide" : ""}">${label}<input data-field="${name}" value="${escapeHtml(value)}" /></label>`;
}

function textareaInput(name, value, label) {
  return `<label class="wide">${label}<textarea data-field="${name}" rows="3">${escapeHtml(value)}</textarea></label>`;
}

function imageInput(name, value, label) {
  return `
    <label>${label}<input data-field="${name}" value="${escapeHtml(value)}" /></label>
    <label>上传图片<input data-upload-field="${name}" type="file" accept="image/png,image/jpeg,image/webp" /></label>
  `;
}

function editorShell(listName, index, inner) {
  return `
    <article class="editor-item" data-list="${listName}" data-index="${index}">
      <div class="editor-actions">
        <strong>${index + 1}</strong>
        <button data-remove="${listName}" data-index="${index}" type="button">删除</button>
      </div>
      <div class="editor-grid">${inner}</div>
    </article>
  `;
}

function renderEditors() {
  $("#announcementEditor").innerHTML = (site.announcements || []).map((item, index) => editorShell("announcements", index, `
    ${textInput("title", item.title, "标题")}
    ${textInput("date", item.date, "日期")}
    ${textareaInput("summary", item.summary, "摘要")}
    ${textareaInput("content", item.content, "正文")}
  `)).join("");

  $("#activityEditor").innerHTML = (site.activities || []).map((item, index) => editorShell("activities", index, `
    ${textInput("title", item.title, "标题")}
    ${textInput("date", item.date, "日期")}
    ${textInput("place", item.place, "地点")}
    ${imageInput("image", item.image, "图片地址")}
    ${textareaInput("summary", item.summary, "活动简介")}
  `)).join("");

  $("#memberEditor").innerHTML = (site.members || []).map((item, index) => editorShell("members", index, `
    ${textInput("name", item.name, "姓名")}
    ${textInput("role", item.role, "职务")}
    ${textareaInput("bio", item.bio, "简介")}
  `)).join("");

  $("#artworkEditor").innerHTML = (site.artworks || []).map((item, index) => editorShell("artworks", index, `
    ${textInput("title", item.title, "标题")}
    ${textInput("author", item.author, "作者")}
    ${textInput("grade", item.grade, "年级")}
    ${textInput("style", item.style, "书体")}
    ${imageInput("image", item.image, "图片地址")}
    ${textareaInput("description", item.description, "说明")}
  `)).join("");
}

function collectList(listName) {
  return $$(`[data-list="${listName}"]`).map((row) => {
    const existing = site[listName][Number(row.dataset.index)] || {};
    const item = { id: existing.id || uid(listName.slice(0, -1)) };
    $$("[data-field]", row).forEach((field) => {
      item[field.dataset.field] = field.value.trim();
    });
    if (existing.sourceUploadId) item.sourceUploadId = existing.sourceUploadId;
    return item;
  });
}

function collectEditors() {
  site.announcements = collectList("announcements");
  site.activities = collectList("activities");
  site.members = collectList("members");
  site.artworks = collectList("artworks");
}

function renderSite() {
  fillBaseFields();
  renderEditors();
}

async function loadSite() {
  site = await api("/api/admin/content");
  renderSite();
}

async function saveContent() {
  const message = $("#contentMessage");
  message.textContent = "正在保存...";
  collectBaseFields();
  collectEditors();
  await api("/api/admin/content", { method: "PUT", body: JSON.stringify(site) });
  message.textContent = "已保存。";
}

function setTab(name) {
  $$(".admin-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  $$(".tab-panel").forEach((panel) => panel.hidden = panel.id !== `${name}Tab`);
  if (name === "submissions") loadSubmissions();
  if (name === "uploads") loadUploads();
}

async function loadSubmissions() {
  const list = await api("/api/admin/submissions");
  $("#submissionList").innerHTML = list.length ? list.map((item) => `
    <article class="record-item">
      <div>
        <p class="card-meta">${escapeHtml(item.createdAt)} · ${escapeHtml(item.status || "new")}</p>
        <h3>${escapeHtml(item.name)} <span>${escapeHtml(item.grade)} ${escapeHtml(item.className)}</span></h3>
        <p>联系方式：${escapeHtml(item.phone)}</p>
        <p>兴趣：${escapeHtml(item.styleInterest || "未填写")}</p>
        <p>基础：${escapeHtml(item.experience || "未填写")}</p>
        <p>理由：${escapeHtml(item.reason)}</p>
      </div>
      <div class="record-actions">
        <select data-submission-status="${escapeHtml(item.id)}">
          ${["new", "contacted", "accepted", "archived"].map((status) => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <button data-save-submission="${escapeHtml(item.id)}">更新</button>
      </div>
    </article>
  `).join("") : "<p>暂无报名记录。</p>";
}

async function loadUploads() {
  const list = await api("/api/admin/uploads");
  $("#uploadList").innerHTML = list.length ? list.map((item) => `
    <article class="record-item upload-record">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" />
      <div>
        <p class="card-meta">${escapeHtml(item.createdAt)} · ${escapeHtml(item.status || "pending")}</p>
        <h3>${escapeHtml(item.title)} <span>${escapeHtml(item.style)}</span></h3>
        <p>作者：${escapeHtml(item.author)} ${escapeHtml(item.grade)}</p>
        <p>${escapeHtml(item.description)}</p>
      </div>
      <div class="record-actions">
        <button data-approve-upload="${escapeHtml(item.id)}">通过并展示</button>
        <button data-reject-upload="${escapeHtml(item.id)}">退回</button>
      </div>
    </article>
  `).join("") : "<p>暂无作品投稿。</p>";
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#loginMessage").textContent = "正在登录...";
  try {
    const result = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
    });
    token = result.token;
    localStorage.setItem(tokenKey, token);
    showAdmin();
    await loadSite();
  } catch (error) {
    $("#loginMessage").textContent = error.message;
  }
});

$("#saveContent").addEventListener("click", () => saveContent().catch((error) => {
  $("#contentMessage").textContent = error.message;
}));

$("#qqImageFile").addEventListener("change", async (event) => {
  if (!event.target.files[0]) return;
  const field = $('[data-contact="qqImage"]');
  field.value = "正在上传...";
  field.value = await uploadAsset(event.target.files[0]);
});

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-tab]");
  if (tab) setTab(tab.dataset.tab);

  const add = event.target.closest("[data-add]");
  if (add) {
    collectBaseFields();
    collectEditors();
    const name = add.dataset.add;
    const defaults = {
      announcements: { id: uid("notice"), title: "新公告", date: new Date().toISOString().slice(0, 10), summary: "", content: "" },
      activities: { id: uid("activity"), title: "新活动", date: "", place: "", summary: "", image: "/assets/activity-practice.png" },
      members: { id: uid("member"), name: "新成员", role: "", bio: "" },
      artworks: { id: uid("art"), title: "新作品", author: "", grade: "", style: "", image: "/assets/work-kaishu.png", description: "" }
    };
    site[name].unshift(defaults[name]);
    renderEditors();
  }

  const remove = event.target.closest("[data-remove]");
  if (remove) {
    collectBaseFields();
    collectEditors();
    site[remove.dataset.remove].splice(Number(remove.dataset.index), 1);
    renderEditors();
  }

  const saveSubmission = event.target.closest("[data-save-submission]");
  if (saveSubmission) {
    const id = saveSubmission.dataset.saveSubmission;
    const status = $(`[data-submission-status="${id}"]`).value;
    await api(`/api/admin/submissions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await loadSubmissions();
  }

  const approve = event.target.closest("[data-approve-upload]");
  if (approve) {
    await api(`/api/admin/uploads/${approve.dataset.approveUpload}/approve`, { method: "POST", body: "{}" });
    await loadUploads();
    await loadSite();
  }

  const reject = event.target.closest("[data-reject-upload]");
  if (reject) {
    await api(`/api/admin/uploads/${reject.dataset.rejectUpload}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) });
    await loadUploads();
  }
});

document.addEventListener("change", async (event) => {
  const uploadField = event.target.closest("[data-upload-field]");
  if (!uploadField || !uploadField.files[0]) return;
  const row = uploadField.closest("[data-list]");
  const target = $(`[data-field="${uploadField.dataset.uploadField}"]`, row);
  target.value = "正在上传...";
  target.value = await uploadAsset(uploadField.files[0]);
});

$("#refreshSubmissions").addEventListener("click", loadSubmissions);
$("#refreshUploads").addEventListener("click", loadUploads);

if (token) {
  showAdmin();
  loadSite().catch(() => {
    localStorage.removeItem(tokenKey);
    token = "";
    showLogin();
  });
} else {
  showLogin();
}
