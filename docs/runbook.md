# Runbook — vận hành quy trình agent

Tài liệu cho bạn (người vận hành). Agent đọc `CLAUDE.md` và `.claude/commands/run.md`.

## 1. Chuẩn bị một lần

Chạy `node scripts/agent/board.mjs preflight --pretty`. Mọi dòng phải `ok: true`; dòng nào lỗi có sẵn lệnh sửa (`fix`). Hiện cần:

| Kiểm tra | Cách sửa |
|---|---|
| `python-edge-tts` | `python -m pip install edge-tts` |
| `blender` (4.2+) | `winget install BlenderFoundation.Blender`, rồi thêm thư mục cài Blender vào PATH |
| `toktx` | `winget install KhronosGroup.KTX-Software` |
| `sketchfab-token` | Lấy token ở https://sketchfab.com/settings/password → thêm dòng `SKETCHFAB_API_TOKEN=<token>` vào file `.env` (đã gitignore — không bao giờ commit) |

Mở terminal mới sau khi cài để PATH được cập nhật.

## 2. Bắt đầu chạy

```
cd "D:\2026 - Tuan\t-rex"
claude
/run
```

- Luôn **mở phiên Claude Code mới** để chạy `/run`. Agent mới thêm vào `.claude/agents/` có thể chưa được nhận ngay trong phiên đang mở (KI-4).
- Agent điều phối dùng Sonnet; từng agent con dùng model ghi trong `.claude/agents/*.md`.

## 3. Theo dõi và học

- **Board:** https://github.com/users/tuanluu-agilityio/projects/5 — cột Todo / In Progress / Review / Done; trường Agent, Model, Attempt, Heartbeat cho biết ai đang làm gì.
- **Issue của từng task:** comment "🤖 Assigned" (giao việc), các "Checkpoint" (đã xong bước nào, bước tiếp theo, branch, commit).
- **Pull request:** mỗi task một PR, có nhận xét của agent review và bằng chứng (ảnh, video, số fps). Nhãn `agent-author` / `agent-assistant` / `agent-unused` cho biết tỉ lệ code AI viết.
- **Issue "Run status" (#1):** nhật ký bắt đầu / tạm dừng / kết thúc.
- **Terminal:** agent điều phối báo bằng tiếng Việt khi giao việc, review, merge.
- Xem nhanh bằng lệnh: `node scripts/agent/board.mjs status --pretty`.

## 4. Tắt máy, mất mạng, hết hạn mức

Không cần làm gì đặc biệt. Khi quay lại:

```
claude
/run
```

`/run` đọc lại board: task đang làm dở sẽ được giao lại cho agent cùng loại, bắt đầu từ **bước tiếp theo** trong checkpoint cuối (không làm lại từ đầu); task đang review được review lại hoặc đánh dấu Done nếu PR đã merge.

- Hết hạn mức: agent điều phối ghi "⏸️ Paused (usage-limit)" lên các issue đang chạy và #1, rồi dừng. Chạy lại `/run` khi hạn mức được làm mới.
- Nếu `/run` báo "Another orchestrator holds the lock" mà bạn chắc chắn không còn phiên nào chạy: đợi 30 phút (khóa tự hết hạn) hoặc chạy `node scripts/agent/board.mjs unlock`.

## 5. Không ưng một kết quả

1. Comment vào issue (hoặc PR đã merge) nói rõ điều chưa ưng.
2. Kéo thẻ về **Todo** trên board (hoặc `node scripts/agent/board.mjs move <số issue> Todo`) — issue tự mở lại.
3. Lần `/run` sau, task được làm lại (agent đọc comment của bạn trong issue).

Task gắn nhãn **`needs-human`** là task đã thất bại 3 lần: đọc comment cuối, sửa điều kiện (ví dụ cài thêm công cụ), gỡ nhãn, kéo về Todo.

## 6. Quy tắc không được phá

- Không commit thẳng vào `main` (nhánh đã được bảo vệ). Mọi thay đổi: issue → branch `task/<n>-<slug>` → PR → squash merge.
- Không đưa token vào repo (repo công khai). Hook `pre-commit` sẽ chặn.
- Commit message tiếng Anh theo `docs/conventions/commits.md`. Hook `commit-msg` sẽ chặn nếu sai.
