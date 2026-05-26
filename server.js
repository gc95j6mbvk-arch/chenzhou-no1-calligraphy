const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const SEED_DATA_DIR = path.join(ROOT, "data");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : SEED_DATA_DIR;
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(PUBLIC_DIR, "uploads");
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "calligraphy2026";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-this-secret-before-public-deploy";

const DATA_FILES = {
  site: path.join(DATA_DIR, "site.json"),
  submissions: path.join(DATA_DIR, "submissions.json"),
  uploads: path.join(DATA_DIR, "uploads.json")
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, "utf8"));
}

async function writeJson(file, data) {
  const temp = `${file}.${Date.now()}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(data, null, 2), "utf8");
  await fsp.rename(temp, file);
}

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new Error("请求体过大");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const body = await readBody(req, 1024 * 1024);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function safeText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 1000);
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signToken(payload) {
  const body = base64Url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = crypto.createHmac("sha256", ADMIN_SECRET).update(body).digest("base64url");
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return payload.exp > Date.now();
}

function splitBuffer(buffer, separator) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);
  while (index !== -1) {
    parts.push(buffer.subarray(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  parts.push(buffer.subarray(start));
  return parts;
}

function parseMultipart(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const sections = splitBuffer(buffer, boundaryBuffer).slice(1, -1);
  const fields = {};
  const files = {};

  for (const raw of sections) {
    let part = raw;
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === "\r\n") part = part.subarray(0, part.length - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const headerText = part.subarray(0, headerEnd).toString("utf8");
    const body = part.subarray(headerEnd + 4);
    const disposition = headerText.match(/content-disposition:[^\r\n]+/i)?.[0] || "";
    const name = disposition.match(/name="([^"]+)"/)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];
    const contentType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "";
    if (!name) continue;
    if (filename) {
      files[name] = { filename, contentType, body };
    } else {
      fields[name] = body.toString("utf8").trim();
    }
  }

  return { fields, files };
}

async function saveUploadedImage(file) {
  const allowed = new Map([
    ["image/png", ".png"],
    ["image/jpeg", ".jpg"],
    ["image/webp", ".webp"]
  ]);
  const ext = allowed.get(file.contentType);
  if (!ext) throw new Error("只支持 PNG、JPG、WEBP 图片");
  if (file.body.length > 6 * 1024 * 1024) throw new Error("图片不能超过 6MB");
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  await fsp.writeFile(path.join(UPLOAD_DIR, filename), file.body);
  return `/uploads/${filename}`;
}

async function serveUploadedFile(res, pathname) {
  const relative = decodeURIComponent(pathname.replace(/^\/uploads\//, "")).replace(/\\/g, "/");
  if (!relative || relative.includes("..")) return notFound(res);
  const filePath = path.resolve(UPLOAD_DIR, relative);
  if (!filePath.startsWith(path.resolve(UPLOAD_DIR))) return notFound(res);
  try {
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, await fsp.readFile(filePath), {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable"
    });
  } catch {
    notFound(res);
  }
}

async function handleAdmin(req, res, pathname) {
  if (pathname === "/api/admin/login" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (body.password !== ADMIN_PASSWORD) {
      return sendJson(res, 401, { error: "密码不正确" });
    }
    return sendJson(res, 200, {
      token: signToken({ iat: Date.now(), exp: Date.now() + 12 * 60 * 60 * 1000 })
    });
  }

  if (!verifyToken(req)) {
    return sendJson(res, 401, { error: "需要管理员登录" });
  }

  if (pathname === "/api/admin/content" && req.method === "GET") {
    return sendJson(res, 200, await readJson(DATA_FILES.site));
  }

  if (pathname === "/api/admin/content" && req.method === "PUT") {
    const body = await readJsonBody(req);
    if (!body.club || !Array.isArray(body.announcements) || !Array.isArray(body.artworks)) {
      return badRequest(res, "内容结构不完整");
    }
    await writeJson(DATA_FILES.site, body);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/admin/submissions" && req.method === "GET") {
    return sendJson(res, 200, await readJson(DATA_FILES.submissions));
  }

  if (pathname === "/api/admin/asset" && req.method === "POST") {
    const type = req.headers["content-type"] || "";
    const boundary = type.match(/boundary=(.+)$/)?.[1];
    if (!boundary) return badRequest(res, "缺少上传边界");
    const { files } = parseMultipart(await readBody(req, 8 * 1024 * 1024), boundary);
    if (!files.image) return badRequest(res, "请选择图片");
    return sendJson(res, 201, { url: await saveUploadedImage(files.image) });
  }

  if (pathname.startsWith("/api/admin/submissions/") && req.method === "PATCH") {
    const id = pathname.split("/").pop();
    const body = await readJsonBody(req);
    const submissions = await readJson(DATA_FILES.submissions);
    const item = submissions.find((entry) => entry.id === id);
    if (!item) return notFound(res);
    item.status = safeText(body.status, item.status || "new");
    item.note = safeText(body.note, item.note || "");
    item.updatedAt = new Date().toISOString();
    await writeJson(DATA_FILES.submissions, submissions);
    return sendJson(res, 200, item);
  }

  if (pathname === "/api/admin/uploads" && req.method === "GET") {
    return sendJson(res, 200, await readJson(DATA_FILES.uploads));
  }

  if (pathname.match(/^\/api\/admin\/uploads\/[^/]+\/approve$/) && req.method === "POST") {
    const id = pathname.split("/")[4];
    const uploads = await readJson(DATA_FILES.uploads);
    const upload = uploads.find((entry) => entry.id === id);
    if (!upload) return notFound(res);
    upload.status = "approved";
    upload.updatedAt = new Date().toISOString();
    const site = await readJson(DATA_FILES.site);
    if (!site.artworks.some((art) => art.sourceUploadId === id)) {
      site.artworks.unshift({
        id: makeId("art"),
        sourceUploadId: id,
        title: upload.title,
        author: upload.author,
        grade: upload.grade,
        style: upload.style,
        image: upload.image,
        description: upload.description
      });
    }
    await writeJson(DATA_FILES.uploads, uploads);
    await writeJson(DATA_FILES.site, site);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith("/api/admin/uploads/") && req.method === "PATCH") {
    const id = pathname.split("/").pop();
    const body = await readJsonBody(req);
    const uploads = await readJson(DATA_FILES.uploads);
    const item = uploads.find((entry) => entry.id === id);
    if (!item) return notFound(res);
    item.status = safeText(body.status, item.status || "pending");
    item.updatedAt = new Date().toISOString();
    await writeJson(DATA_FILES.uploads, uploads);
    return sendJson(res, 200, item);
  }

  return notFound(res);
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === "/api/content" && req.method === "GET") {
    return sendJson(res, 200, await readJson(DATA_FILES.site));
  }

  if (pathname === "/api/join" && req.method === "POST") {
    const body = await readJsonBody(req);
    const required = ["name", "grade", "className", "phone", "reason"];
    if (required.some((key) => !safeText(body[key]))) {
      return badRequest(res, "请完整填写姓名、年级班级、联系方式和报名理由");
    }
    const submissions = await readJson(DATA_FILES.submissions);
    const entry = {
      id: makeId("join"),
      name: safeText(body.name, ""),
      grade: safeText(body.grade, ""),
      className: safeText(body.className, ""),
      phone: safeText(body.phone, ""),
      styleInterest: safeText(body.styleInterest, ""),
      experience: safeText(body.experience, ""),
      reason: safeText(body.reason, ""),
      status: "new",
      createdAt: new Date().toISOString()
    };
    submissions.unshift(entry);
    await writeJson(DATA_FILES.submissions, submissions);
    return sendJson(res, 201, { ok: true, id: entry.id });
  }

  if (pathname === "/api/artworks" && req.method === "POST") {
    const type = req.headers["content-type"] || "";
    const boundary = type.match(/boundary=(.+)$/)?.[1];
    if (!boundary) return badRequest(res, "缺少上传边界");
    const { fields, files } = parseMultipart(await readBody(req, 8 * 1024 * 1024), boundary);
    if (!files.image) return badRequest(res, "请选择作品图片");
    const uploads = await readJson(DATA_FILES.uploads);
    const image = await saveUploadedImage(files.image);
    const entry = {
      id: makeId("upload"),
      title: safeText(fields.title, "未命名作品"),
      author: safeText(fields.author, "匿名成员"),
      grade: safeText(fields.grade, ""),
      style: safeText(fields.style, "书法"),
      description: safeText(fields.description, ""),
      image,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    uploads.unshift(entry);
    await writeJson(DATA_FILES.uploads, uploads);
    return sendJson(res, 201, { ok: true, id: entry.id });
  }

  if (pathname.startsWith("/api/admin/")) {
    return handleAdmin(req, res, pathname);
  }

  return notFound(res);
}

async function serveStatic(req, res, pathname) {
  const normalized = decodeURIComponent(pathname).replace(/\\/g, "/");
  let filePath = path.join(PUBLIC_DIR, normalized === "/" ? "index.html" : normalized);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) return notFound(res);
  try {
    const stats = await fsp.stat(resolved);
    if (stats.isDirectory()) filePath = path.join(resolved, "index.html");
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, await fsp.readFile(filePath), {
      "Content-Type": MIME[ext] || "application/octet-stream"
    });
  } catch {
    send(res, 200, await fsp.readFile(path.join(PUBLIC_DIR, "index.html")), {
      "Content-Type": "text/html; charset=utf-8"
    });
  }
}

async function ensureDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  for (const [name, file] of Object.entries(DATA_FILES)) {
    if (!fs.existsSync(file)) {
      const seed = path.join(SEED_DATA_DIR, `${name}.json`);
      if (fs.existsSync(seed)) {
        await fsp.copyFile(seed, file);
      } else {
        await writeJson(file, name === "site" ? {} : []);
      }
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
    } else if (pathname.startsWith("/uploads/")) {
      await serveUploadedFile(res, pathname);
    } else {
      await serveStatic(req, res, pathname);
    }
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "服务器错误" });
  }
});

ensureDirs().then(() => {
  server.listen(PORT, () => {
    console.log(`郴州一中书法社官网已启动: http://localhost:${PORT}`);
    console.log(`后台入口: http://localhost:${PORT}/admin.html`);
    console.log(`默认后台密码: ${ADMIN_PASSWORD}`);
  });
});
