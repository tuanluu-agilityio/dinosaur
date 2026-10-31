# Thiết kế: Quy trình làm việc tự động bằng agent

Ngày: 2026-10-30 · Trạng thái: chờ người dùng duyệt
Đi kèm: `2026-10-30-dinosaur-explorer-design.md` (sản phẩm mà quy trình này xây dựng)

## 1. Ý định và lý do

Người dùng đang **học cách dùng AI agent trong dự án thật**. Quy trình này vừa để xây trang khủng long, vừa để người dùng **quan sát và hiểu agent làm việc thế nào**.

Yêu cầu cốt lõi (của người dùng):

1. **Sau khi kế hoạch được chốt, quy trình chạy hoàn toàn tự động, không cần con người can thiệp.** Vì vậy kế hoạch phải được nghĩ kỹ trước.
2. Kế hoạch chia thành **task nhỏ**, quản lý trên **GitHub Project** với các trạng thái **Todo → In Progress → Review → Done**.
3. Mỗi task **giao cho một subagent**, thông tin giao việc được lưu lại.
4. **Mỗi giai đoạn dùng model phù hợp nhất**, có kế hoạch **tối ưu token**.
5. **Chạy song song** càng nhiều càng tốt.
6. Người dùng có thể **tắt máy / mất kết nối giữa chừng**; khi quay lại, quy trình **tiếp tục mà không làm lại** việc đã xong.
7. **Agent chạy trên máy người dùng** (không chạy cloud) để theo dõi và học.
8. Có nơi quản lý **quyết định (decision) và known issue** để agent sau không phá vỡ quy tắc dự án.
9. **Quy tắc commit theo best practice, mỗi task một branch riêng.**

## 2. Mục tiêu, ngoài phạm vi, điều tránh

**Mục tiêu:** một lần "bấm chạy" sau khi chuẩn bị xong, quy trình đi hết kế hoạch; mọi bước để lại dấu vết đọc được trên GitHub và trong repo.

**Ngoài phạm vi:** chạy agent trên cloud; CI phức tạp ngoài build + test + deploy; nhiều người dùng cùng điều khiển.

**Điều tránh (anti-goals):**
- Mất kết nối → **làm lại** việc đã xong, hoặc hai agent cùng làm một task.
- Quy trình **dừng chờ người** giữa chừng.
- Agent sửa tính năng mà **vi phạm quyết định đã ghi**.
- Agent song song **giẫm lên file của nhau** (xung đột merge).
- Tốn token vô ích: agent đọc lại cả repo, dùng model mạnh cho việc máy móc.

## 3. Chuẩn bị một lần trước khi bấm chạy (việc của người dùng)

Những việc chỉ con người làm được; kế hoạch phải liệt kê thành checklist và **bước đầu tiên của orchestrator là tự kiểm tra checklist này**, báo rõ thiếu gì trước khi chạy bất kỳ task nào.

- `gh auth refresh -s project` (token hiện thiếu quyền `project`).
- Tạo repo GitHub và đặt remote (**công khai** — người dùng chọn). Đổi nhánh `master` → `main` (*quyết định của tôi*).
- Cài **Blender** (bản 4.x LTS), Node.js LTS, Python + `edge-tts`. (Hiện máy đã có Node và Python, chưa có Blender.)
- Tạo **Sketchfab API token**, đặt vào biến môi trường / file `.env` (không commit).
- Cấu hình quyền cho Claude Code (`.claude/settings.json`) đủ để agent chạy `git`, `gh`, `npm`, `npx`, `python`, `blender` mà **không bật hộp thoại xin phép** — nếu không, quy trình sẽ dừng chờ người.

## 4. Cấu trúc thư mục (*đề xuất của tôi*)

```
CLAUDE.md                     # luật chung, ngắn (<~100 dòng), chủ yếu là "đọc gì khi nào"
.claude/
  settings.json               # quyền + hooks (kiểm tra commit message…)
  agents/                     # định nghĩa từng subagent, mỗi file gắn sẵn model
docs/
  superpowers/specs/          # thiết kế (2 file này)
  superpowers/plans/          # kế hoạch chi tiết, nguồn để tạo issue
  decisions/                  # ADR: 0001-<tên>.md … (quyết định)
  known-issues.md             # lỗi/hạn chế đã biết
  conventions/                # commit, branch, code style, ngân sách hiệu năng
  rubrics/                    # tiêu chí chấm: hình ảnh mô hình, nội dung khoa học, code
  runbook.md                  # cách bấm chạy, cách tiếp tục sau khi mất kết nối
scripts/agent/                # script thao tác board/issue/checkpoint (giảm token)
.worktrees/                   # mỗi task một git worktree (gitignore)
```

## 5. Các subagent và model (*đề xuất của tôi*)

Nguyên tắc: **model rẻ nhất làm tốt việc đó**; Opus chỉ ở nơi sai lầm đắt.

| Agent | Việc | Model |
|---|---|---|
| orchestrator (phiên chính) | đọc board, chọn task, giao việc, tiếp tục sau mất kết nối | Sonnet |
| asset-scout | tìm mô hình Sketchfab, kiểm tra giấy phép, ghi metadata/ghi công | Haiku |
| asset-engineer | script Blender, rig/animation, nén glTF-Transform, bản nhẹ cho điện thoại | Sonnet |
| content-writer | soạn nội dung loài song ngữ có nguồn | Sonnet |
| fact-checker | đối chiếu từng khẳng định với nguồn, kiểm tra tiếng Việt | Opus |
| frontend-dev | code three.js/TypeScript, UI, i18n | Sonnet |
| perf-engineer | mức chất lượng, đo fps, tối ưu | Opus |
| narrator | chạy script `edge-tts` | Haiku |
| code-reviewer | review PR theo ADR, quy ước, test | Opus |
| visual-judge | chấm ảnh/video mô hình và cảnh theo rubric | Opus |
| board-keeper | (không phải agent) — script trong `scripts/agent/` | — |

Model cụ thể: Haiku 5.5 / Sonnet 5.5 / Opus 5.5 (bản mới nhất lúc chạy).

## 6. Task và GitHub Project

- **Mỗi task = 1 GitHub Issue**, tạo tự động từ file kế hoạch. Thân issue tự đủ: mục tiêu, file được phép sửa, ADR liên quan, tiêu chí hoàn thành (kiểm chứng được bằng lệnh/test/rubric), phụ thuộc (`Blocked by #n`).
- **Kích thước task:** nhỏ — một agent hoàn thành trong một phiên ngắn, chạm vào ít file. Mất kết nối chỉ mất tối đa một bước nhỏ.
- **GitHub Project** với trường:
  - `Status`: Todo / In Progress / Review / Done
  - `Agent`, `Model` — ai đang/đã làm (subagent không phải tài khoản GitHub nên không dùng Assignee)
  - `Wave` — đợt chạy song song
  - `Attempt` — số lần thử
  - `Heartbeat` — thời điểm cập nhật cuối (phát hiện task "mồ côi")
- **Nhãn:** `phase:*`, `area:*` (scene, dino, ui, i18n, audio, assets, perf, content, build), `needs-human`, `known-issue`.
- **Lịch sử giao việc** = comment trong issue mỗi lần nhận việc / đổi trạng thái (agent, model, thời gian, branch).

## 7. Vòng đời một task

1. **Nhận việc:** orchestrator chọn task Todo đã hết phụ thuộc → Status = In Progress, ghi Agent/Model/Attempt, comment giao việc.
2. **Làm:** subagent làm trong worktree `.worktrees/task-<n>` trên branch `task/<n>-<slug>`. **Sau mỗi bước nhỏ: commit + comment checkpoint** vào issue (bước đã xong, bước tiếp theo, commit SHA).
3. **Mở PR** → Status = Review.
4. **Review:** `code-reviewer` (và `visual-judge` / `fact-checker` nếu task có hình ảnh / nội dung) chấm theo rubric, kiểm tra không vi phạm ADR, test + build chạy qua.
   - Đạt → squash merge vào `main`, Status = Done, xóa worktree.
   - Không đạt → quay lại In Progress với nhận xét, `Attempt + 1`.
5. **Không dừng chờ người:** quá **3 lần thử** (*quyết định của tôi*) → gắn `needs-human`, ghi vào `known-issues.md`, task phụ thuộc bị chặn, **các task khác vẫn chạy tiếp**. Cuối đợt có báo cáo tổng hợp.

## 8. Tiếp tục sau khi mất kết nối

**Nguồn sự thật duy nhất là GitHub (issue, Project, PR) + git (branch, commit)** — không bao giờ là bộ nhớ phiên chat.

Khi người dùng mở lại và chạy lệnh tiếp tục (ghi trong `runbook.md`), orchestrator:
1. Đọc board. Task **In Progress**: đọc checkpoint cuối + branch; nếu worktree có thay đổi chưa commit thì xem xét và commit hoặc bỏ; **giao lại cho agent cùng loại, bắt đầu từ "bước tiếp theo" trong checkpoint**.
2. Task **Review**: PR còn mở → chạy lại review; PR đã merge → chuyển Done.
3. Mọi thao tác phải **làm lại được an toàn** (idempotent): tạo issue/branch/PR kiểm tra tồn tại trước; script board không tạo trùng.
4. Chỉ **một orchestrator** chạy một lúc (khóa đơn giản trên máy + `Heartbeat`).

## 9. Chạy song song

- Kế hoạch xếp task thành **các đợt (wave)** theo đồ thị phụ thuộc; task cùng đợt chạy cùng lúc, mỗi task một worktree.
- Kế hoạch **khai báo file mỗi task được sửa**; task cùng đợt **không được chung file** → không xung đột merge.
- Giới hạn đồng thời: tối đa **3–4 agent** (*quyết định của tôi*, theo sức máy cá nhân). Task nặng (Blender, trình duyệt đo fps) **chạy tuần tự** với nhau.

## 10. Quyết định và known issue

- **ADR** trong `docs/decisions/NNNN-<tên>.md`: bối cảnh, quyết định, hệ quả, trạng thái (Accepted / Superseded by NNNN). Không xóa, chỉ thay thế.
- Khởi tạo sẵn ADR cho các quyết định đã có trong 2 bản thiết kế (three.js thuần, cảnh Hell Creek, giấy phép mô hình, edge-tts, ngân sách hiệu năng…).
- Agent đưa ra quyết định kiến trúc mới **bắt buộc** viết ADR trong cùng PR. `code-reviewer` từ chối PR vi phạm ADR mà không thay thế nó.
- `known-issues.md`: mô tả, ảnh hưởng, cách tránh, liên kết issue.
- Thân mỗi issue liệt kê ADR liên quan → agent chỉ đọc những gì cần.

## 11. Quy tắc commit và branch

- **Branch:** `task/<số-issue>-<slug>` từ `main`; một task một branch; một PR; **squash merge**.
- **Commit:** Conventional Commits — `<type>(<scope>): <mô tả>`; type: `feat fix perf refactor test docs build ci chore content asset`; scope theo `area:*`; dòng đầu ≤ 72 ký tự, mệnh lệnh; thân giải thích *vì sao*; chân có `Refs #<n>` và dòng `Co-Authored-By` của model.
- Ngôn ngữ commit/PR: tiếng Anh (*quyết định của tôi* — chuẩn phổ biến, công cụ đọc tốt); tài liệu dự án tiếng Việt.
- **Hook** kiểm tra định dạng commit message; không bao giờ bỏ qua hook.

## 12. Tối ưu token

- Model theo agent (mục 5); Haiku cho việc máy móc.
- Thân issue tự đủ → agent không phải khám phá repo.
- `CLAUDE.md` ngắn, trỏ tới tài liệu theo chủ đề; agent chỉ đọc ADR được liệt kê.
- Thao tác board/issue gói trong script (`scripts/agent/`) — một lệnh thay vì nhiều lệnh `gh` và nhiều lượt suy nghĩ.
- Reviewer nhận diff + tiêu chí, không đọc cả repo.
- Báo cáo của subagent ngắn, có cấu trúc; giới hạn số vòng review.
- Ghi lại token/chi phí theo task (nếu lấy được) vào comment cuối issue để người dùng học và tinh chỉnh.

## 13. Các quyết định bổ sung (*quyết định của tôi*, sau vòng đánh giá)

- **Orchestrator là một phiên Claude Code tương tác** trên máy người dùng — người dùng xem trực tiếp agent được giao và báo cáo. Phiên này **không giữ trạng thái**: mọi thứ nằm trên GitHub + git, subagent chỉ trả báo cáo ngắn. Khi ngữ cảnh đầy hoặc phiên bị ngắt, chỉ cần mở phiên mới và chạy lệnh tiếp tục — đó cũng chính là đường phục hồi sau mất kết nối (một cơ chế cho cả hai).
- **Giai đoạn 0 — dựng hạ tầng** (CLAUDE.md, agents, scripts, hooks, ADR khởi đầu, rubric, Project và các trường, commit đầu tiên): chạy **tuần tự, một agent**. **Mọi task, kể cả giai đoạn 0, đi qua branch `task/<n>-<slug>` → Pull Request → merge** (người dùng yêu cầu 2026-10-31; không commit thẳng vào `main`). Nhánh `main` được bảo vệ: bắt buộc PR, cấm force-push và xóa nhánh. Giai đoạn 0 chưa có agent review riêng nên orchestrator tự review trước khi merge; từ giai đoạn 1 dùng đầy đủ quy trình ở mục 6–9. Giai đoạn 0 có bước tự kiểm tra cuối (tạo thử 1 issue giả, nhận việc, checkpoint, giả lập ngắt, tiếp tục, đóng) trước khi chuyển sang giai đoạn 1.
- **Orchestrator được phép sửa kế hoạch giữa chừng** trong giới hạn: tạo task sửa lỗi/tiếp nối, đóng (không xóa) task của loài bị loại, kèm comment lý do; thay đổi lớn hơn phải có ADR. Không được nới tiêu chí rubric.
- **Nếu dưới mức tối thiểu (T-rex + 2 loài) qua duyệt:** gắn `needs-human` vào mốc ra mắt, ghi known issue, **vẫn chạy tiếp** mọi task không phụ thuộc (cảnh rừng, UI, i18n, hiệu năng) với các loài đã có. Không nới tiêu chí.
- **Triển khai:** mỗi lần merge vào `main` đều build và deploy (dự án cá nhân, không cần giữ lại).

## 14. Quyết định của người dùng (vòng cuối)

- **Hết hạn mức sử dụng Claude:** quy trình **dừng** (không tự chờ). Trước khi dừng, ghi chú vào tracking: comment trên các issue đang chạy ("tạm dừng: hết hạn mức", bước tiếp theo), và cập nhật một issue/ghi chú tổng `Run status` trên Project (thời điểm dừng, các task dở dang). Lần sau người dùng chạy lệnh tiếp tục → làm đúng phần việc tiếp theo. Vì giới hạn có thể cắt ngang trước khi kịp ghi chú, **checkpoint sau mỗi bước nhỏ (mục 7–8) vẫn là lớp bảo vệ chính**; ghi chú tạm dừng chỉ là lớp bổ sung cho dễ đọc.
- **Quyền:** dùng **chế độ auto** của Claude Code + danh sách lệnh được phép (`git`, `gh`, `npm`/`npx`, `node`, `python`, `blender`, Playwright, web search/fetch). **Không dùng bypass.** Giai đoạn 0 chạy thử một lượt để phát hiện lệnh nào còn bật hộp thoại xin phép và bổ sung vào danh sách.
- **Repo công khai** → triển khai GitHub Pages (miễn phí). Hệ quả: **tuyệt đối không commit bí mật** (Sketchfab token trong `.env` đã gitignore; có hook/kiểm tra chặn commit chứa token); mọi ghi công tác giả mô hình phải đầy đủ vì trang công khai.

## 15. Để người xây dựng tự quyết

- Ngôn ngữ của script (`scripts/agent/`): Node/TS hoặc Python.
- Chi tiết nội dung rubric (dựa trên tiêu chí trong 2 bản thiết kế).
- Cơ chế khóa orchestrator, định dạng chính xác của comment checkpoint.
- Cách lưu ảnh/video bằng chứng của visual-judge (miễn người dùng xem lại được từ issue/PR).

## 16. Nhãn PR theo tỉ lệ code do AI viết (người dùng yêu cầu 2026-10-31)

- Commit có dòng `Co-Authored-By:` chứa "Claude" = AI viết; còn lại = người viết. Tỉ lệ AI = dòng thay đổi (thêm + xóa) của commit AI ÷ tổng dòng thay đổi của PR.
- **> 70%** → `agent-author`; **> 50% và ≤ 70%** → `agent-assistant`; **≤ 50%** → `agent-unused` (mốc đúng 70% / 50% là *quyết định của tôi*, người dùng đồng ý).
- GitHub Action tính lại mỗi lần mở PR / push; luôn chỉ một trong ba nhãn.
- Hạn chế đã biết: đo theo commit, không theo từng dòng (`git blame`); sửa tay trong commit AI vẫn tính là AI.
