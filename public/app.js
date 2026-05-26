const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderCard(item) {
  return `
    <article class="card">
      <time>${escapeHtml(item.date)}</time>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.summary || item.content)}</p>
    </article>
  `;
}

function renderContent(data) {
  const club = data.club || {};
  const contacts = data.contacts || {};
  document.title = club.name || "湖南省郴州市第一中学书法社";
  $("#heroIntro").textContent = club.slogan || "";
  $("#clubEstablished").textContent = club.established || "待补充";
  $("#clubTeacher").textContent = club.teacher || "待补充";
  $("#clubLocation").textContent = club.location || "校园内";
  $("#clubIntro").textContent = club.intro || "";
  $("#clubSlogan").textContent = club.slogan || "";
  $("#clubPresident").textContent = club.president || "待补充";
  $("#noticeTicker").textContent = (data.announcements || [])[0]?.title || "暂无公告";
  $("#joinNote").textContent = contacts.joinNote || "";
  $("#contactText").textContent = contacts.qqText || club.qq || "";
  $("#contactEmail").textContent = club.email ? `邮箱：${club.email}` : "";
  $("#year").textContent = new Date().getFullYear();

  $("#announcementList").innerHTML = (data.announcements || []).map(renderCard).join("");

  $("#artworkList").innerHTML = (data.artworks || []).map((art) => `
    <article class="art-card">
      <img src="${escapeHtml(art.image)}" alt="${escapeHtml(art.title)}" loading="lazy" />
      <div>
        <p class="card-meta">${escapeHtml(art.style)} · ${escapeHtml(art.grade)}</p>
        <h3>${escapeHtml(art.title)}</h3>
        <p>${escapeHtml(art.author)}</p>
        <p>${escapeHtml(art.description)}</p>
      </div>
    </article>
  `).join("");

  $("#activityList").innerHTML = (data.activities || []).map((activity) => `
    <article class="activity-item">
      <img src="${escapeHtml(activity.image || "/assets/activity-practice.png")}" alt="${escapeHtml(activity.title)}" loading="lazy" />
      <div>
        <p class="card-meta">${escapeHtml(activity.date)} · ${escapeHtml(activity.place)}</p>
        <h3>${escapeHtml(activity.title)}</h3>
        <p>${escapeHtml(activity.summary)}</p>
      </div>
    </article>
  `).join("");

  $("#memberList").innerHTML = (data.members || []).map((member) => `
    <article class="member-card">
      <p class="card-meta">${escapeHtml(member.role)}</p>
      <h3>${escapeHtml(member.name)}</h3>
      <p>${escapeHtml(member.bio)}</p>
    </article>
  `).join("");

  const qrImage = contacts.qqImage || club.qqImage;
  $("#qrBox").innerHTML = qrImage
    ? `<img src="${escapeHtml(qrImage)}" alt="QQ群二维码" />`
    : `<strong>${escapeHtml(contacts.qqText || "QQ群二维码待上传")}</strong>`;
}

async function loadContent() {
  const response = await fetch("/api/content");
  renderContent(await response.json());
}

async function postJson(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "提交失败");
  return payload;
}

$("#joinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#joinMessage");
  message.textContent = "正在提交...";
  try {
    await postJson("/api/join", Object.fromEntries(new FormData(event.currentTarget)));
    event.currentTarget.reset();
    message.textContent = "报名已提交，请留意社团联系。";
  } catch (error) {
    message.textContent = error.message;
  }
});

$("#uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#uploadMessage");
  message.textContent = "正在上传...";
  try {
    const response = await fetch("/api/artworks", {
      method: "POST",
      body: new FormData(event.currentTarget)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "上传失败");
    event.currentTarget.reset();
    message.textContent = "作品已提交，审核通过后会显示在作品展。";
  } catch (error) {
    message.textContent = error.message;
  }
});

loadContent().catch((error) => {
  console.error(error);
  $("#noticeTicker").textContent = "内容加载失败";
});
