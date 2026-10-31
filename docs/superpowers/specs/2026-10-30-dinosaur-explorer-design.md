# Thiết kế: Trang khám phá khủng long 3D

Ngày: 2026-10-30 · Trạng thái: chờ người dùng duyệt

## 1. Ý định và lý do

Một trang web cho **người yêu thích khủng long** để *quan sát* các loài một cách trực quan nhất, chứ không chỉ đọc. Trải nghiệm phải giống như bước vào thế giới của chúng: con vật sống, chuyển động trong môi trường thật của nó, người xem đi quanh và nhìn cận cảnh.

Hai giá trị dẫn dắt mọi quyết định (do người dùng xác định):

1. **Vẻ chân thực của từng loài** quan trọng hơn số lượng loài.
2. **Mượt mà là trên hết.** Giật/lag là điều khó chịu nhất — tệ hơn cả việc cảnh kém chi tiết.

Thứ tự ưu tiên khi xung đột: **mượt > chân thực của con khủng long > độ dày của cảnh rừng > số loài.**

## 2. Mục tiêu

- Màn mở đầu điện ảnh: camera len qua tán rừng nguyên sinh, rồi mở toang ra khu rừng nơi các loài khủng long đang sinh hoạt.
- Một khu rừng duy nhất, **đúng khoa học**: Bắc Mỹ cuối kỷ Phấn Trắng (tầng Maastricht, ~68–66 triệu năm trước, hệ sinh thái kiểu Hell Creek). Chỉ có các loài sống cùng thời, cùng nơi.
- Bấm vào một con → camera bay tới cận cảnh; con vật **vẫn chuyển động** trong khi người xem đọc; người xem **xoay quanh** con vật (kéo chuột / một ngón tay), phóng to/thu nhỏ (cuộn / hai ngón).
- Mỗi loài có phần mô tả: **hành vi, đặc điểm, cách săn mồi hoặc tự vệ**, và bối cảnh lịch sử (thời kỳ, nơi sống, phát hiện hóa thạch).
- **Song ngữ Việt – Anh**, chuyển đổi được trên trang.
- **Thuyết minh bằng giọng đọc tự động** khi vào cận cảnh, theo ngôn ngữ đang chọn; có nút tạm dừng/tắt tiếng.
- **Chạy mượt cả trên máy tính và điện thoại.**
- **Hoàn toàn miễn phí**: mô hình, giọng đọc, công cụ, hosting.

## 3. Ngoài phạm vi (lần này)

- Các thời kỳ khác (kỷ Jura, Trias, các châu lục khác). Sẽ mở rộng sau — kiến trúc nên cho phép thêm "cảnh" mới mà không viết lại, nhưng không xây sẵn bộ chuyển cảnh.
- Tài khoản, bình luận, chia sẻ mạng xã hội, trò chơi/điểm số, VR/AR.
- Hệ thống quản trị nội dung (CMS) — nội dung nằm trong file dữ liệu.

## 4. Điều tuyệt đối tránh (anti-goals)

- **Giật/lag, tải lâu không phản hồi.** Kể cả nếu cảnh đẹp — mượt quan trọng hơn.
- **Khủng long trông hoạt hình/low-poly/đồ chơi.** Thà bớt loài còn hơn có một con trông giả.
- **Sai khoa học**: trộn loài khác thời kỳ, số liệu sai, mô hình có lỗi giải phẫu rõ ràng (ví dụ bàn tay T-rex úp xuống, "shrink-wrapped" lộ xương sọ).
- Giọng đọc máy móc kiểu trình duyệt mặc định.

## 5. Trải nghiệm chi tiết

### 5.1 Màn mở đầu
- Camera di chuyển xuyên qua tán lá dày, sương mù, ánh sáng xuyên lá, âm thanh rừng; sau vài giây mở ra khung cảnh rộng.
- Có thể bỏ qua (nhấp/chạm). Trong lúc chạy intro, tài nguyên của khu rừng tải ngầm.
- Ngay từ đầu phải có hình ảnh động/phản hồi — không có màn trắng chờ tải lâu.

### 5.2 Khu rừng (màn khám phá)
- Các loài sinh hoạt: đi lại, ăn, đứng nghỉ. Edmontosaurus có thể đi thành đàn nhỏ.
- Gợi ý nhẹ "Bấm vào một con để xem cận cảnh"; tên loài hiện khi rê chuột / chạm.
- Người xem có thể nhìn quanh trong giới hạn (không đi lang thang tự do).

### 5.3 Cận cảnh một loài
- Camera bay mượt tới con vật; chuyển động của nó tiếp tục (idle, đi, cúi ăn, gầm… tùy những animation mô hình có).
- **Bố cục đã chọn: A — bảng thông tin bên phải** (mô hình ~2/3 màn hình, bảng ~1/3, cuộn để đọc). Trên điện thoại dọc: bảng thành **khung trượt lên từ đáy**, con vật ở phần trên.
- Bảng gồm: tên khoa học + tên thường gọi, thông số nhanh (chiều dài, cân nặng, thời kỳ, chế độ ăn), các mục **Hành vi · Đặc điểm · Săn mồi/Tự vệ · Lịch sử phát hiện**, nguồn tham khảo, ghi công tác giả mô hình.
- Thuyết minh tự phát khi vào cận cảnh (cú bấm chọn con vật là thao tác người dùng, nên trình duyệt cho phép phát âm thanh). Nút dừng/tắt tiếng; trạng thái tắt tiếng được nhớ.
- Nút quay lại khu rừng.

### 5.4 Ngôn ngữ
- Nút chuyển VI / EN luôn hiển thị. Mặc định theo ngôn ngữ trình duyệt (*quyết định của tôi*), nhớ lựa chọn.
- Đổi ngôn ngữ thì đổi cả chữ và file thuyết minh.

## 6. Danh sách loài (bản đầu)

*Đề xuất của tôi, người dùng đồng ý hướng "một khu rừng, đúng khoa học":*

| Loài | Vai trò trong cảnh |
|---|---|
| *Tyrannosaurus rex* | Kẻ săn mồi đỉnh cao |
| *Triceratops horridus* | Ăn cỏ lớn, sừng và diềm cổ |
| *Ankylosaurus magniventris* | Giáp và đuôi chùy |
| *Edmontosaurus annectens* | Khủng long mỏ vịt, sống theo đàn — con mồi chính của T-rex |
| *Pachycephalosaurus wyomingensis* | Đầu vòm dày |

**Người dùng cho phép sửa mô hình:** được lấy mô hình tĩnh chân thực (giấy phép cho phép chỉnh sửa) rồi tự rig, làm animation, sửa lỗi giải phẫu trong Blender để con vật sống động. Ưu tiên mô hình đã có animation tốt; tự làm khi không có. Nếu ngay cả mô hình tĩnh chân thực cũng không có cho một loài, **bỏ loài đó** thay vì dùng mô hình kém (*quyết định của tôi*, theo ưu tiên của người dùng). Tối thiểu cần T-rex và ít nhất 2 loài khác mới ra mắt.

**Thứ tự làm (*quyết định của tôi*):** bước đầu tiên của kế hoạch là **tìm và duyệt mô hình**, trước mọi việc dựng cảnh. Ra mắt với các loài đã qua duyệt (tối thiểu T-rex + 2), các loài còn lại thêm dần.

**Duyệt tự động (người dùng chọn — không dừng quy trình chờ người):** mọi bước duyệt do agent thực hiện theo bảng tiêu chí ghi sẵn (`docs/rubrics/`), kết quả chấm và ảnh/video bằng chứng được lưu lại để người dùng xem sau và mở lại task nếu không ưng. Cụ thể:
- **Mô hình:** render nhiều góc + video chuyển động; agent chấm (Opus, có thị giác) theo tiêu chí: giải phẫu đúng theo hiểu biết hiện tại, không trông hoạt hình/low-poly, chuyển động tự nhiên, giấy phép hợp lệ, đạt ngân sách hiệu năng.
- **Nội dung chữ:** agent soạn cả hai ngôn ngữ từ nguồn uy tín; một agent khác kiểm tra lại từng khẳng định với nguồn, kiểm tra tiếng Việt tự nhiên và thuật ngữ đúng. Thuyết minh chỉ tạo sau khi chữ đã qua duyệt.

**Độ chính xác:** thông tin chỉ lấy từ nguồn uy tín (bảo tàng, bài báo khoa học có bình duyệt, tổng quan học thuật); những điểm còn tranh cãi (ví dụ T-rex có lông hay không, tốc độ chạy) phải được nói rõ là đang tranh cãi chứ không khẳng định. Mỗi loài ghi nguồn.

## 7. Cách làm (quyết định đã có)

- **three.js** để hiển thị 3D (người dùng chỉ định).
- **Mô hình:** miễn phí, chủ yếu từ Sketchfab. Trang **phi thương mại** (người dùng xác nhận: không quảng cáo, không thu phí), nên dùng được **CC0, CC-BY và CC-BY-NC** (BY/NC → bắt buộc ghi tên tác giả + giấy phép trên trang). **Không dùng NoDerivatives (ND)**, vì mô hình sẽ bị nén, giảm chi tiết và có thể rig lại — đều là chỉnh sửa. Lưu tên tác giả, link gốc và giấy phép của từng mô hình ngay khi tải về. Ưu tiên mô hình đã rig và có animation. Bộ low-poly Quaternius đã bị loại vì không đủ chân thực.
- **Giọng đọc:** tạo sẵn file âm thanh bằng **`edge-tts`** (giọng neural của Microsoft Edge, miễn phí), giọng Việt (ví dụ `vi-VN-HoaiMyNeural` / `vi-VN-NamMinhNeural`) và giọng Anh kiểu phim tài liệu. Script tạo audio là một phần của dự án để tạo lại khi sửa nội dung. Lưu ý: dịch vụ không chính thức — file đã tạo vẫn dùng được nếu dịch vụ ngừng.
- **Hosting:** trang tĩnh trên GitHub Pages (repo công khai, miễn phí).
- **Hướng kỹ thuật kiểu Aurelia** (người dùng chốt ngày 2026-10-31, tham khảo [holtsetio/aurelia](https://github.com/holtsetio/aurelia), MIT):
  - Bộ vẽ **three.js `WebGPURenderer`**, shader viết bằng **TSL** (three.js Shading Language), **compute shader** chạy trên GPU.
  - **Khủng long vẫn là mô hình GLB chân thực** (không sinh bằng toán như con sứa — cách đó cho ra dáng cách điệu, trái với ưu tiên chân thực).
  - **Môi trường dùng hiệu ứng GPU kiểu Aurelia:** cây cỏ (dương xỉ, tuế…) đung đưa theo gió bằng compute/vertex shader; hạt trong không khí (bụi, phấn hoa, côn trùng bay); sương mù với tia nắng giả thể tích.
  - **Chuyển động phụ mềm** trên khủng long (da cổ, quán tính đuôi…) bằng mô phỏng hạt Verlet trên GPU: **thử nghiệm**, chỉ giữ nếu trông tự nhiên hơn và không vượt ngân sách hiệu năng (*quyết định của tôi*).
  - Không sao chép mã Aurelia; nếu mượn đoạn mã nào thì giữ thông báo giấy phép MIT.

**Tham chiếu Aurelia cho agent** — "kiểu Aurelia" nghĩa là các kỹ thuật cụ thể dưới đây. Repo: https://github.com/holtsetio/aurelia, **khóa tại commit `724aba263459d1b11a49b72bfc7ce8baac840ca8`** (2025-06-10) để tham chiếu không đổi. Aurelia dùng `three@^0.175`, import từ `three/webgpu` và `three/tsl`, Vite + plugin `vite-plugin-tsl-operator`. Agent đọc **đúng file liên quan tới task của mình**, không cần đọc cả repo:

| Kỹ thuật dùng trong dự án này | Ý nghĩa cụ thể | Đọc file Aurelia |
|---|---|---|
| Khởi tạo `WebGPURenderer`, vòng lặp, cấu hình | Dựng renderer WebGPU (tự lùi về WebGL2), postprocessing bằng TSL/MRT | `src/app.js`, `index.js`, `vite.config.js` |
| Hạt trong không khí (bụi, phấn hoa, côn trùng) | Hàng nghìn sprite **instanced + billboard**, vị trí/chuyển động tính hoàn toàn trong shader TSL bằng hash + noise theo `instanceIndex` và `time` — CPU không cập nhật từng hạt | `src/plankton.js` |
| Sương mù + tia nắng giả thể tích | Hình học tia sáng trong suốt, độ đậm tính trong shader theo góc nhìn/khoảng cách, hòa với nền | `src/godrays.js`, `src/background.js`, `src/lights.js` |
| Cây cỏ đung đưa theo gió | (Aurelia không có cây — áp dụng cùng cách) dịch chuyển đỉnh trong vertex shader TSL bằng noise theo vị trí + `time`, trên mesh **instanced** | `src/common/noise.js` (hàm noise), cách dùng `instanceIndex` trong `src/plankton.js` |
| Mô phỏng hạt Verlet trên GPU (chuyển động phụ mềm — thử nghiệm) | Hạt + lò xo lưu trong buffer GPU (`instancedArray`), cập nhật bằng **compute shader** mỗi khung hình; "bridge" gắn đỉnh của mesh vào hạt mô phỏng | `src/physics/verletPhysics.js`, `src/medusaVerletBridge.js` (xúc tu: `src/medusaTentacles.js`) |
| Bảng tinh chỉnh khi phát triển | Tweakpane để chỉnh tham số trực tiếp; **chỉ có trong bản dev**, không xuất hiện trên trang thật (*quyết định của tôi*) | `src/conf.js` |

Phần **không** dùng từ Aurelia: hình học sinh bằng công thức (`medusaBell*.js`) — khủng long dùng mô hình GLB.

**Tech stack (*quyết định của tôi*):**
- **Vite + TypeScript + three.js thuần** (không React/React Three Fiber) — kiểm soát trực tiếp vòng lặp render và bộ nhớ, ít lớp trung gian, hợp với ưu tiên mượt. Dùng bản three.js mới nhất có `WebGPURenderer` + TSL ổn định, khóa phiên bản.
- Giao diện (bảng thông tin, nút ngôn ngữ, điều khiển âm thanh): **HTML/CSS thường** phủ lên canvas, không framework.
- Camera: `OrbitControls` của three.js cho cận cảnh; bay camera bằng nội suy tự viết hoặc GSAP (miễn phí).
- Nội dung: mỗi loài một file JSON song ngữ (vi/en).
- Xử lý mô hình: **glTF-Transform CLI** (nén Draco/meshopt, texture KTX2, tạo bản nhẹ cho điện thoại), Blender khi cần chuyển FBX → GLB.
- Giọng đọc: script Python gọi `edge-tts`, đọc từ các file JSON nội dung.
- Kiểm thử: Vitest cho phần logic (dữ liệu, chọn mức chất lượng, i18n); Playwright để chạy thử trang và đo fps cơ bản.
- Triển khai: GitHub Actions build và đẩy lên GitHub Pages.

## 8. Ràng buộc hiệu năng (ưu tiên số 1)

- **Thiết bị mục tiêu:** máy tính và điện thoại **có WebGPU** (người dùng: "các dòng máy di động hiện tại tương đối mạnh"). Ví dụ (*quyết định của tôi*): iPhone chạy iOS 26 trở lên, Android tầm trung đời 2022 trở lên với Chrome bản mới.
- Mục tiêu (*con số là quyết định của tôi*): **60 fps** trên máy tính tầm trung; **≥ 30 fps ổn định** trên điện thoại tầm trung có WebGPU.
- **Máy không có WebGPU:** `WebGPURenderer` tự chuyển sang WebGL2; trang vẫn chạy đầy đủ chức năng (khủng long, cận cảnh, thông tin, thuyết minh) nhưng **tắt các hiệu ứng compute** (cây đứng yên hoặc đung đưa đơn giản, không hạt, không chuyển động phụ mềm). Không tối ưu riêng cho nhóm máy này (*quyết định của tôi*).
- **Kiểm chứng sớm** (*quyết định của tôi*): task đầu tiên của phần dựng cảnh là một mảng rừng dương xỉ đung đưa + hạt bụi + một con T-rex, đo fps trên máy tính và cấu hình điện thoại giả lập; kết quả đặt ngân sách cụ thể (số cây, số hạt) cho các mức chất lượng. Ổn định quan trọng hơn đỉnh — không có khựng khi bay camera, khi tải loài mới, khi mở bảng.
- **Nhiều mức chất lượng** tự chọn theo thiết bị, và **tự hạ mức** nếu fps tụt kéo dài.
- Nén tài nguyên: mesh (Draco/meshopt), texture (KTX2), giảm độ phân giải texture cho điện thoại; bản đơn giản hóa mô hình cho khoảng cách xa.
- Tải dần: khu rừng + mô hình xa trước, bản chi tiết của một loài khi vào cận cảnh; không tải toàn bộ ngay từ đầu.
- Cây cỏ dùng instancing / billboard ở xa; số cây, số hạt, độ phân giải sương thể tích, bóng đổ và hậu kỳ (bloom…) thay đổi theo mức chất lượng.

## 9. Để người xây dựng tự quyết

- Bundler/khung dự án, cấu trúc mã, định dạng file nội dung (đề xuất: mỗi loài một file dữ liệu song ngữ).
- Cách khủng long di chuyển trong rừng (đường đi cố định, vùng hoạt động…), miễn là trông tự nhiên và rẻ về hiệu năng.
- Mô hình cây cối/địa hình (miễn phí, đúng thực vật cuối kỷ Phấn Trắng ở mức hợp lý: dương xỉ, tuế, cây lá kim, cây hạt kín sớm — **không có cỏ**, vì cỏ chưa phổ biến).
- Âm thanh môi trường và tiếng khủng long (miễn phí, giấy phép phù hợp); phong cách giao diện, phông chữ, màu sắc.
- Chi tiết camera của màn mở đầu.
