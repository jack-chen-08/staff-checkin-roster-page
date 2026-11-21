#!/usr/bin/env python3
"""把 record-demo.js 录到的连续帧合成一段带字幕的演示视频 + 一张过程缩略拼图。

输入：demo/evidence/ac2/frame-01..07.png（2x，780x1800）
输出：
  demo/ac2-manual-checkin.mp4          演示视频（带字幕）
  demo/ac2-manual-checkin.gif          同内容 GIF（体积小，便于 IM/网页内嵌预览）
  demo/evidence/ac2/frames-contact-sheet.png  7 帧缩略拼图
  demo/evidence/ac2/frame-01..07.png   原始连续帧（保留，作为帧序列证据）
"""
import os
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES = os.path.join(ROOT, "demo", "evidence", "ac2")
DEMO = os.path.join(ROOT, "demo")

CAPTIONS = [
    ("frame-01.png", 2.2, ["① 进入页面：应到 48 · 已到 25 · 未到 23", "顾清和（第 4 行）仍为「未签到」，右侧有「手动补签」"]),
    ("frame-02.png", 1.6, ["② 光标移到该行「手动补签」按钮", "（同一次页面加载，未刷新）"]),
    ("frame-03.png", 2.2, ["③ 点击后弹出「手动补签」", "补签原因必选，未选/未填说明不可提交"]),
    ("frame-04.png", 1.4, ["④ 选择补签原因「未带手机」后，确认按钮可用"]),
    ("frame-05.png", 1.0, ["⑤ 点「确认补签」：按钮进入「提交中…」", "makeup 接口已发出"]),
    ("frame-06.png", 2.6, ["⑥ 同一行变为「手动 · 已签到」", "顶部 已到 25→26、未到 23→22、签到率 52%→54%"]),
    ("frame-07.png", 2.4, ["⑦ 整页没有刷新：load ID 全程不变", "整页重载 0 次 · list 接口仍为 1 次"]),
]

FONT_CANDIDATES = [
    ("/mnt/c/Windows/Fonts/msyh.ttc", 0),
    ("/mnt/c/Windows/Fonts/msyhbd.ttc", 0),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 0),
    ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc", 0),
]


def load_font(size):
    for path, idx in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=idx)
            except Exception:
                continue
    return ImageFont.load_default()


def wrap_cjk(text, font, max_width, draw):
    lines, cur = [], ""
    for ch in text:
        trial = cur + ch
        if draw.textlength(trial, font=font) <= max_width:
            cur = trial
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def annotate(img, caption_lines):
    """在底部加深色字幕条（不遮挡页面主体信息）。"""
    img = img.convert("RGB")
    W, H = img.size
    font = load_font(30)
    probe = ImageDraw.Draw(img)
    pad = 18
    line_h = 40
    wrapped = []
    for line in caption_lines:
        wrapped.extend(wrap_cjk(line, font, W - pad * 2, probe))
    bar_h = line_h * len(wrapped) + pad * 2 - 6
    canvas = Image.new("RGB", (W, H + bar_h), (15, 23, 42))
    canvas.paste(img, (0, 0))
    # 页面截图与字幕条之间画一条分隔线：强调字幕在画面外，不是遮在页面上
    ImageDraw.Draw(canvas).rectangle([0, H - 3, W, H], fill=(37, 99, 235))
    d = ImageDraw.Draw(canvas)
    y = H + pad
    for line in wrapped:
        d.text((pad, y), line, font=font, fill=(235, 242, 255))
        y += line_h
    return canvas


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")


def main():
    ff = ffmpeg_exe()
    if not ff:
        raise SystemExit("找不到 ffmpeg（pip install imageio-ffmpeg）")

    tmp = tempfile.mkdtemp(prefix="ac2-video-")
    fps = 12
    seq_index = 0
    img_paths = []

    for name, dur, lines in CAPTIONS:
        src = os.path.join(FRAMES, name)
        if not os.path.exists(src):
            raise SystemExit(f"缺少帧：{src}")
        annotated = annotate(Image.open(src), lines)
        keep = os.path.join(tmp, name.replace(".png", "-caption.png"))
        annotated.save(keep)
        n = max(1, int(round(dur * fps)))
        for _ in range(n):
            seq_index += 1
            p = os.path.join(tmp, f"seq_{seq_index:04d}.png")
            annotated.save(p)
            img_paths.append(p)

    mp4 = os.path.join(DEMO, "ac2-manual-checkin.mp4")
    subprocess.run(
        [ff, "-y", "-loglevel", "error", "-framerate", str(fps),
         "-i", os.path.join(tmp, "seq_%04d.png"),
         "-vf", "scale=780:-2,format=yuv420p",
         "-c:v", "libx264", "-preset", "slow", "-crf", "20",
         "-movflags", "+faststart", mp4],
        check=True,
    )

    # GIF：缩小一半、降帧，便于内嵌预览
    gif = os.path.join(DEMO, "ac2-manual-checkin.gif")
    subprocess.run(
        [ff, "-y", "-loglevel", "error", "-framerate", str(fps),
         "-i", os.path.join(tmp, "seq_%04d.png"),
         "-vf", "fps=8,scale=390:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer",
         "-loop", "0", gif],
        check=True,
    )

    # 过程缩略拼图（7 帧，2 列）
    thumbs = []
    for name, _dur, lines in CAPTIONS:
        p = os.path.join(tmp, name.replace(".png", "-caption.png"))
        im = Image.open(p).convert("RGB")
        im.thumbnail((390, 1000))
        thumbs.append(im)
    cols = 2
    rows = (len(thumbs) + cols - 1) // cols
    gap = 12
    cw = max(t.width for t in thumbs)
    ch = max(t.height for t in thumbs)
    sheet = Image.new("RGB", (cols * cw + gap * (cols + 1), rows * ch + gap * (rows + 1)), (226, 232, 240))
    for i, t in enumerate(thumbs):
        r, c = divmod(i, cols)
        sheet.paste(t, (gap + c * (cw + gap), gap + r * (ch + gap)))
    sheet_path = os.path.join(FRAMES, "frames-contact-sheet.png")
    sheet.save(sheet_path)

    for f in (mp4, gif, sheet_path):
        print(f"{os.path.relpath(f, ROOT)}  {os.path.getsize(f)/1024:.0f} KB")

    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
