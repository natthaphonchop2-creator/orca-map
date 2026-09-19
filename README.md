# ORCA Workspace

แอปสำหรับจัดการระบบ MCP ขององค์กร แยกหน้าใช้งานออกจากเว็บไซต์ประชาสัมพันธ์
และเรียก API ของ ORCA/Obot backend เดิมผ่าน server ของแอป

| ส่วน | URL เริ่มต้น | หน้าที่ |
| --- | --- | --- |
| แอปที่ build แล้ว | `http://localhost:4000` | Workspace, sign-in และ proxy ไป backend |
| ระบบเดิม | `http://localhost:8787` | เว็บไซต์เดิม, API, authentication และข้อมูลเดิม |
| Vite สำหรับพัฒนา | `http://localhost:5175` | UI พร้อม HMR และ backend middleware เดียวกับแอป |

Repository นี้มี frontend และ Node adapter เท่านั้น ไม่ได้รวม Go backend และไม่สร้าง
ฐานข้อมูลหรือคัดลอกบัญชี ผู้ใช้ การเชื่อมต่อ หรือ OAuth grants จากระบบเดิม

## หน้าหลักและการจัดการการเชื่อมต่อ

**ข้อสรุปล่าสุด 17 กันยายน 2026:** `/app` เป็น **Dashboard** เพื่อให้หน้าแรกยังอ่านง่าย
เมื่อองค์กรมีแอปจำนวนมาก แสดงภาพรวมจากข้อมูลจริง พร้อมรายการล่าสุดสูงสุด 5 การเชื่อมต่อ,
3 พื้นที่ทำงาน และ 5 กิจกรรม มีลิงก์ไปดูรายการทั้งหมด ไม่ขยายแผนผังตามจำนวนแอป
การตัดสินใจนี้แทนการออกแบบก่อนหน้าที่ใช้ Connections และแผนผังเป็นหน้าแรก

| หน้า | เส้นทาง | ขอบเขต |
| --- | --- | --- |
| Dashboard | `/app` | ภาพรวมและรายการล่าสุดตามจำนวนสูงสุดข้างต้น |
| Connections | `/app?view=connections` | ค้นหาชื่อ/คำอธิบาย กรองสถานะ และแสดงครั้งละ 10 รายการ |
| Workspaces | `/app?view=workspaces` | พื้นที่ทำงานที่บัญชีนี้เข้าถึงได้ |

Connections มีตัวกรองทั้งหมด, เปิดใช้งานและตรวจสอบแล้ว, รอตรวจสอบ และระงับแล้ว
พร้อมจำนวนรายการและปุ่มก่อนหน้า/ถัดไป เมื่อค้นหาหรือเปลี่ยนตัวกรองจะกลับหน้าที่ 1 ของรายการ
สถานะบัญชีโหลดเฉพาะแหล่งข้อมูลในหน้าที่กำลังแสดง โดยจำกัดพร้อมกัน 4 คำขอและใช้ผลที่โหลดไว้
เส้นทางเลือกแอป → เชื่อมบัญชี → ตรวจเครื่องมือ/สิทธิ์ยังอยู่ในหน้าจัดการการเชื่อมต่อ

นี่เป็นข้อสรุปและพฤติกรรมของแอป local ไม่ใช่การประกาศ deploy หรือยืนยัน source OAuth/AI client
ดูผลตรวจแต่ละรอบใน [docs](docs)

## ติดตั้งจาก fresh clone

ต้องใช้ Node.js 24 ขึ้นไป และ pnpm 11.7.0

```sh
npm install --global pnpm@11.7.0
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
pnpm run build
pnpm run start
```

เปิด `http://localhost:4000` โดย backend เดิมต้องทำงานที่ `http://localhost:8787`
แอปรับคำขอที่ loopback interface เป็นค่าเริ่มต้น `pnpm run preview` ใช้ Node adapter
เดียวกับ `start` เพื่อให้ API และการเข้าสู่ระบบทำงานผ่าน origin ของแอป

สำหรับพัฒนา frontend:

```sh
pnpm run dev
```

เปิด `http://localhost:5175` Vite ใช้ `createBackendMiddleware` จาก `server/app.mjs`
สำหรับ API/auth routes ส่วนไฟล์ frontend และ HMR อยู่ภายใต้ Vite

`pnpm run ci` เรียก check, tests และ build ตามลำดับ โดยไม่จัดรูปแบบหรือแก้ source files
ชุดทดสอบรวม proxy, catalog, services, connection presentation และ component behavior

## ตั้งค่า backend และ origin

ค่าเริ่มต้นใช้งานกับ backend เดิมได้โดยไม่ต้องมีไฟล์ `.env` หากต้องเปลี่ยนค่า:

```sh
cp .env.example .env
node --env-file=.env server/index.mjs
```

Vite อ่านตัวแปร `ORCA_` จาก env สำหรับ middleware ฝั่ง server ส่วน Node adapter
ไม่โหลด `.env` อัตโนมัติ จึงต้องใช้ `--env-file` หรือกำหนด environment ของ process

| ตัวแปร | การใช้งาน |
| --- | --- |
| `ORCA_BACKEND_URL` | Origin ของ backend ที่เชื่อถือได้ ค่าเริ่มต้น `http://127.0.0.1:8787` |
| `ORCA_BACKEND_PUBLIC_ORIGIN` | Origin ที่ backend ประกาศ หากต่างจาก URL ภายใน; default local รู้จัก `http://localhost:8787` |
| `ORCA_PUBLIC_ORIGIN` | Origin จริงของแอปเมื่อเปิดใช้นอก localhost เช่น `https://app.example.com`; บน Render หากไม่ได้ตั้ง จะใช้ `RENDER_EXTERNAL_URL` ของบริการโดยอัตโนมัติ |
| `HOST` / `PORT` | Listener เริ่มต้น `127.0.0.1` / `4000` |
| `ORCA_BUILD_DIR` | โฟลเดอร์ static build เริ่มต้น `build` |

ไม่ใส่ token หรือ URL ที่มี credentials ลง environment ของ frontend, Git หรือ build arguments
การยืนยันตัวตนยังใช้ session/bearer token ที่ backend เดิมตรวจสอบ

## Docker และ deployment

```sh
docker build -t orca-workspace .
docker run --rm -p 127.0.0.1:4000:4000 -e ORCA_BACKEND_URL=http://host.docker.internal:8787 -e ORCA_BACKEND_PUBLIC_ORIGIN=http://localhost:8787 orca-workspace
```

ตัวอย่าง Docker ใช้ host gateway ของ Docker Desktop; backend ต้องเข้าถึงได้จาก container
หากใช้ Docker network หรือ Linux ให้เปลี่ยนเป็น service URL/host gateway ที่ใช้งานจริง
`localhost` ภายใน container หมายถึง container นั้นเอง

เมื่อ deploy ให้ตั้ง `ORCA_PUBLIC_ORIGIN` เป็น HTTPS origin จริงและวางหลัง TLS reverse proxy
ที่ส่ง Host เดิมถึง adapter ใช้ backend เดิมพร้อม volume และ encryption/auth configuration เดิม
ไม่เริ่ม backend อีกชุดบน volume เดียวกัน

บน Render ใช้ URL ของบริการจาก `RENDER_EXTERNAL_URL` ได้โดยไม่ต้องเดา hostname ล่วงหน้า
หากใช้ custom domain ให้ตั้ง `ORCA_PUBLIC_ORIGIN` ซึ่งมีลำดับความสำคัญสูงกว่า
ทั้งสองค่ายังต้องผ่านการตรวจ origin เดิมของ adapter

การแยก frontend ไม่ได้ย้าย OAuth registrations อัตโนมัติ ต้องตั้ง canonical backend/app
origin และ provider callbacks ให้ตรงกับ deployment แล้วตรวจ sign-in และ source OAuth จริง
URL สำหรับ Google OAuth, issuer metadata และ `redirect_uri` ภายใน query ยังคงค่าที่ backend
ลงทะเบียนไว้ ไม่มีการแก้ URL เหล่านั้นด้วยการแทนข้อความทั่วไป

## ขอบเขตการตรวจสอบ

`GET /healthz` รายงาน app build และ backend reachability แยกกัน พร้อม
`authentication: "not_checked"` ผล health/check/build/tests ไม่ยืนยัน Google OAuth
หรือการเชื่อม employee AI client จริง การยืนยันสอง flow นี้ยังต้องใช้บัญชีและ client
ที่ได้รับอนุญาตกับ origin ของ deployment เป้าหมาย

ดูรายละเอียด proxy, cookie, callback, streaming และข้อจำกัด WebSocket ที่
[server/README.md](server/README.md) หลักฐาน QA ที่บันทึกไว้ใน [docs](docs)
ระบุผลเฉพาะการตรวจแต่ละรายการ

## Dependency และ source provenance

Checkout ที่ใช้พัฒนาเริ่มต้นนี้มี `node_modules` เป็น **symlink ภายในเครื่อง** ไปยัง dependency
ที่ติดตั้งแล้วของ `../khum-obot/ui/user` เพื่อใช้ตรวจงาน ไม่มีการ commit หรือใช้ symlink นี้ใน
Docker/fresh clone ผู้ติดตั้งใหม่ต้องใช้ `pnpm install --frozen-lockfile` ภายใน repository นี้
ไม่ต้องมี project ข้างเคียง และไม่ควรสั่งติดตั้ง dependency ทับ symlink ใน checkout เดิม

`.gitignore` กันทั้ง symlink/directory `node_modules`, `.local`, env files และ build outputs
โดยเก็บเฉพาะ `.env.example` เป็นตัวอย่าง public

Frontend บางส่วนพัฒนาต่อจาก Obot UI โดยเก็บ copyright และ MIT license ของส่วน upstream
ไว้ที่ [licenses/Obot-MIT.txt](licenses/Obot-MIT.txt) รายละเอียดที่มาของ source อยู่ใน
[licenses/README.md](licenses/README.md) และ [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
การเก็บ license นี้ไม่ได้ระบุว่า code หรือ branding ของ ORCA ทั้งหมดเป็นผลงานของ Obot
