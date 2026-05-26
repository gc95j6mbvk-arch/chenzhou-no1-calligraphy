# 上线到 .com 域名

这个项目不是纯静态网页，包含报名、作品上传和后台管理，所以需要部署到能运行 Node.js 的平台。

## 你需要准备

1. 一个 `.com` 域名  
   可以在阿里云、腾讯云、Namecheap、Cloudflare Registrar 等平台购买。

2. 一个部署平台账号  
   推荐 Render 或 Railway。也可以用学校服务器、腾讯云、阿里云轻量服务器。

3. 一个 GitHub 账号  
   大多数平台会从 GitHub 仓库自动部署。

## 推荐方案：Render

Render 对 Node.js 项目比较省心，并且可以绑定自定义域名和自动配置 HTTPS。

### 1. 上传项目到 GitHub

把整个 `chenzhou-no1-calligraphy` 文件夹上传到一个 GitHub 仓库。

### 2. 在 Render 创建服务

1. 打开 Render。
2. New + 选择 Web Service。
3. 连接你的 GitHub 仓库。
4. 配置：
   - Runtime：Node
   - Build Command：`npm install`
   - Start Command：`npm start`
   - Health Check Path：`/api/health`

项目里已经有 `render.yaml`，Render 也可以用 Blueprint 自动读取配置。

### 3. 设置环境变量

必须设置：

```text
ADMIN_PASSWORD=你的后台强密码
ADMIN_SECRET=一串很长的随机字符
DATA_DIR=/var/data/data
UPLOAD_DIR=/var/data/uploads
```

如果使用 `render.yaml` 创建，`DATA_DIR`、`UPLOAD_DIR` 和持久磁盘已经写好，`ADMIN_PASSWORD` 需要你在 Render 控制台填写。

### 4. 绑定 .com 域名

在 Render 服务里找到 Custom Domains，添加你的域名：

```text
www.你的域名.com
```

Render 会给你一个 DNS 记录，通常是 CNAME。到你购买域名的平台添加这条记录。

常见设置：

```text
类型：CNAME
主机记录：www
记录值：Render 给你的地址
```

生效后访问：

```text
https://www.你的域名.com
```

后台地址：

```text
https://www.你的域名.com/admin.html
```

前台没有后台入口，只有知道后台网址和密码的人才能进入。

## Railway 方案

Railway 也可以部署这个项目。

配置项：

```text
Start Command: npm start
Health Check Path: /api/health
```

环境变量：

```text
ADMIN_PASSWORD=你的后台强密码
ADMIN_SECRET=一串很长的随机字符
```

如果需要长期保存报名数据和上传图片，请在 Railway 添加 Volume，并设置：

```text
DATA_DIR=/data/site-data
UPLOAD_DIR=/data/uploads
```

然后在 Railway 的 Networking / Domains 里添加你的 `.com` 域名，按它给出的 DNS 记录去域名平台配置。

## 云服务器方案

如果学校有服务器，或者你买了腾讯云、阿里云服务器：

1. 安装 Node.js 18 或更新版本。
2. 上传项目文件夹。
3. 在项目目录运行：

```bash
npm install
npm start
```

4. 用 Nginx 反向代理到 `http://127.0.0.1:3000`。
5. 域名 DNS A 记录指向服务器公网 IP。
6. 用 Certbot 或服务器面板配置 HTTPS。

## 上线后要改的内容

进入后台：

```text
https://你的域名.com/admin.html
```

然后替换：

- 成立时间
- 指导老师
- 社长/干部
- QQ 群二维码
- 校园照片
- 活动照片
- 真实书法作品
- 公告和活动文章

## 重要提醒

- 不要把后台密码设置成默认的 `calligraphy2026`。
- 不要删除持久磁盘里的 `data` 和 `uploads`，否则报名、投稿和上传图片会丢失。
- 如果只是把代码重新部署，数据不会丢；如果换平台或换服务器，需要先备份 `data` 和 `uploads`。
