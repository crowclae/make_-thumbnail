from flask import Flask, render_template, request, send_file, jsonify
from werkzeug.utils import secure_filename
import os
import math
import tempfile
from concurrent.futures import ProcessPoolExecutor
import rawpy
from PIL import Image

app = Flask(__name__)

ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.arw'}


def allowed(filename):
    return os.path.splitext(filename.lower())[1] in ALLOWED_EXTENSIONS


# --- 並列実行される1枚単位の処理関数 ---

def process_single_image(args):
    file_path, (tw, th), use_cropping = args
    try:
        if file_path.lower().endswith('.arw'):
            with rawpy.imread(file_path) as raw:
                rgb = raw.postprocess(use_camera_wb=True, half_size=True, no_auto_bright=False)
                img = Image.fromarray(rgb)
        else:
            img = Image.open(file_path).convert("RGB")

        if use_cropping:
            img_ratio = img.width / img.height
            target_ratio = tw / th

            if img_ratio > target_ratio:
                new_h = th
                new_w = int(new_h * img_ratio)
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                left = (new_w - tw) / 2
                img = img.crop((left, 0, left + tw, th))
            else:
                new_w = tw
                new_h = int(new_w / img_ratio)
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                top = (new_h - th) / 2
                img = img.crop((0, top, tw, top + th))
        else:
            img.thumbnail((tw, th), Image.Resampling.LANCZOS)

        return img

    except Exception as e:
        print(f"Error: {os.path.basename(file_path)} - {e}")
        return None


# --- メイン処理 ---

def create_contact_sheet_parallel(source_files, output_path, total_width, total_height, use_cropping, bg_color="white"):
    image_files = [f for f in source_files if allowed(f)]

    if not image_files:
        return False, "画像ファイルが見つかりませんでした。"

    num_images = len(image_files)
    cols = int(math.ceil(math.sqrt(num_images)))
    rows = int(math.ceil(num_images / cols))

    thumb_w = total_width // cols
    thumb_h = total_height // rows

    sheet_w = cols * thumb_w
    sheet_h = rows * thumb_h

    tasks = [(f, (thumb_w, thumb_h), use_cropping) for f in image_files]

    with ProcessPoolExecutor() as executor:
        processed_images = list(executor.map(process_single_image, tasks))

    contact_sheet = Image.new('RGB', (sheet_w, sheet_h), color=bg_color)

    for index, img in enumerate(processed_images):
        if img is None:
            continue
        col = index % cols
        row = index // cols
        contact_sheet.paste(img, (col * thumb_w, row * thumb_h))

    try:
        contact_sheet.save(output_path, quality=92)
        return True, f"保存完了: {output_path}"
    except Exception as e:
        return False, f"保存失敗: {e}"


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/process', methods=['POST'])
def process():
    files = request.files.getlist('images')
    if not files:
        return jsonify({'ok': False, 'msg': '画像をアップロードしてください'}), 400

    total_width = int(request.form.get('total_width', 2400))
    total_height = int(request.form.get('total_height', 1800))
    cropping = request.form.get('cropping', 'true') == 'true'
    bg_color = request.form.get('bg_color', 'black')
    output_name = secure_filename(request.form.get('output_name', 'contact_sheet.jpg'))

    with tempfile.TemporaryDirectory() as tmpdir:
        saved_files = []
        for f in files:
            filename = secure_filename(f.filename)
            if not allowed(filename):
                continue
            path = os.path.join(tmpdir, filename)
            f.save(path)
            saved_files.append(path)

        if not saved_files:
            return jsonify({'ok': False, 'msg': '対応する画像がありませんでした'}), 400

        output_path = os.path.join(tmpdir, output_name)
        success, msg = create_contact_sheet_parallel(saved_files, output_path, total_width, total_height, cropping, bg_color)

        if not success:
            return jsonify({'ok': False, 'msg': msg}), 500

        return send_file(output_path, as_attachment=True, download_name=output_name)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
