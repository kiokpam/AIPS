# 📚 Tài Liệu Hệ Thống AIPS

Thư mục này chứa tài liệu chi tiết về hệ thống AIPS, được tạo để giúp người mới học Full-Stack AI Development.

## 📖 Danh Sách Tài Liệu

### 1. [walkthrough.md](./walkthrough.md)
**Bắt đầu từ đây!** - Tổng quan và hướng dẫn sử dụng các tài liệu

**Nội dung**:
- Tổng quan về tài liệu đã tạo
- Cách sử dụng tài liệu hiệu quả
- Roadmap học tập
- FAQ và next steps

---

### 2. [aips_system_guide.md](./aips_system_guide.md)
**Hướng dẫn chi tiết** - 13,000+ từ giải thích toàn bộ hệ thống

**Nội dung**:
- 🏗️ Kiến trúc hệ thống với sơ đồ Mermaid
- 🔌 Cách các service kết nối với nhau
- 💻 Công nghệ được sử dụng (Frontend, Backend, AI, Database)
- 🐳 Docker và Docker Compose chi tiết
- 📄 Giải thích file .toml và .sh
- 🚀 Hướng dẫn deploy production (nhiều servers)
- 🔐 Bảo mật và monitoring
- 🎓 Roadmap học Full-Stack AI (8-12 tháng)

---

### 3. [code_examples.md](./code_examples.md)
**Ví dụ code thực tế** - 8,000+ từ về cách services giao tiếp

**Nội dung**:
- Frontend → Backend (REST API)
- Frontend → Backend (WebSocket)
- Backend → Database (SQLAlchemy)
- Backend ↔ AI Service (WebSocket)
- Backend → Notification Service
- Notification → Telegram/Email
- Sequence diagrams và best practices

---

### 4. [docker_guide.md](./docker_guide.md)
**Docker & Docker Compose chi tiết** - Hướng dẫn từ cơ bản đến nâng cao

**Nội dung**:
- Docker là gì? Container vs VM
- Docker Compose và quản lý multi-container
- Dockerfile, Images, Containers, Volumes, Networks
- Lệnh Docker và Docker Compose thường dùng
- Troubleshooting và Best Practices
- Ví dụ thực tế từ AIPS system

---

## 🎯 Cách Sử dụng

### Nếu bạn là người mới:
1. Đọc [walkthrough.md](./walkthrough.md) để có cái nhìn tổng quan
2. Đọc [aips_system_guide.md](./aips_system_guide.md) phần "Kiến Trúc Hệ Thống"
3. Chạy thử hệ thống với Docker
4. Đọc [code_examples.md](./code_examples.md) để hiểu code

### Nếu bạn đã có kinh nghiệm:
1. Skim [aips_system_guide.md](./aips_system_guide.md) để hiểu architecture
2. Xem [code_examples.md](./code_examples.md) để nắm patterns
3. Đọc phần deploy để apply vào production

---

## 🔍 Tìm Nhanh

### Muốn hiểu Docker?
→ [aips_system_guide.md](./aips_system_guide.md) - Phần "Docker và Docker Compose"

### Muốn hiểu .toml và .sh?
→ [aips_system_guide.md](./aips_system_guide.md) - Phần "File .toml Là Gì?" và "File .sh Là Gì?"

### Muốn xem code giao tiếp giữa services?
→ [code_examples.md](./code_examples.md) - Tất cả các phần

### Muốn deploy production?
→ [aips_system_guide.md](./aips_system_guide.md) - Phần "Deploy Thực Tế"

### Muốn roadmap học tập?
→ [aips_system_guide.md](./aips_system_guide.md) - Phần "Tổng Kết: Roadmap Học Full-Stack AI"

---

## 📊 Sơ Đồ Hệ Thống Tóm Tắt

```
User → Frontend (Next.js:3000)
           ↓
      Backend (FastAPI:8000) ← → AI Service (GPU)
           ↓                         ↓
      Database (PostgreSQL)      Video Clips
           ↓
   Notification (FastAPI:8004)
           ↓
   Email + Telegram
```

---

## 🚀 Quick Start

```bash
# Chạy hệ thống
cd "c:\Users\quang\OneDrive\Desktop\AIPS-master (1)\AIPS-master"
docker-compose up -d --build

# Xem logs
docker-compose logs -f ai

# Truy cập
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000/docs
```

---

## 📞 Liên Hệ

Nếu có câu hỏi, tham khảo phần FAQ trong [walkthrough.md](./walkthrough.md)

**Chúc bạn học tập hiệu quả!** 🎉
