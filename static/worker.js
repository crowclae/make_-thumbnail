// worker.js の中身を以下に丸ごと置き換えます

self.addEventListener('message', async (e) => {
  try {
    const { files, totalWidth, totalHeight, cropping, bgColor } = e.data;

    // 1. 画像のフィルタリング（.arw はブラウザ標準で読めないためスキップするか警告）
    const validFiles = files.filter(file => {
      const name = file.name || '';
      return /\.(png|jpg|jpeg|bmp|gif)$/i.test(name);
    });

    if (validFiles.length === 0) {
      self.postMessage({ error: '処理可能な画像ファイル（JPEG/PNG等）が見つかりませんでした。※現時点でRAW(.arw)は非対応です。' });
      return;
    }

    // 2. 行列（グリッド）数の計算 (app.py のロジックを移植)
    const numImages = validFiles.length;
    const cols = Math.ceil(Math.sqrt(numImages));
    const rows = Math.ceil(numImages / cols);

    const thumbW = Math.floor(totalWidth / cols);
    const thumbH = Math.floor(totalHeight / rows);

    const sheetW = cols * thumbW;
    const sheetH = rows * thumbH;

    // 3. 土台となる巨大キャンバスを作成
    const offCanvas = new OffscreenCanvas(sheetW, sheetH);
    const ctx = offCanvas.getContext('2d');

    // 背景色の塗りつぶし
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, sheetW, sheetH);

    // 4. すべての画像を並列でデコードしてキャンバスに描画 (Promise.all による高速化)
    await Promise.all(validFiles.map(async (file, index) => {
      try {
        // 画像のデコード
        const bitmap = await createImageBitmap(file);
        
        const col = index % cols;
        const row = Math.floor(index / cols);
        const dx = col * thumbW;
        const dy = row * thumbH;

        const imgRatio = bitmap.width / bitmap.height;
        const targetRatio = thumbW / thumbH;

        if (cropping) {
          // 短辺でトリミングしてフィットさせる (app.py / 元のworkerの移植)
          let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
          if (imgRatio > targetRatio) {
            const cropW = Math.round(bitmap.height * targetRatio);
            sx = Math.round((bitmap.width - cropW) / 2);
            sw = cropW;
          } else {
            const cropH = Math.round(bitmap.width / targetRatio);
            sy = Math.round((bitmap.height - cropH) / 2);
            sh = cropH;
          }
          ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, thumbW, thumbH);
        } else {
          // 枠内に収まるようにアスペクト比を維持して縮小（中央配置）
          let drawW = thumbW;
          let drawH = thumbH;
          if (imgRatio > targetRatio) {
            drawH = Math.round(thumbW / imgRatio);
          } else {
            drawW = Math.round(thumbH * imgRatio);
          }
          const offsetX = dx + Math.round((thumbW - drawW) / 2);
          const offsetY = dy + Math.round((thumbH - drawH) / 2);
          ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, offsetX, offsetY, drawW, drawH);
        }

        // メモリ解放
        bitmap.close();
      } catch (imageErr) {
        console.error(`ファイル「${file.name}」の処理に失敗しました:`, imageErr);
        // 1枚のエラーで全体を止めないよう、ここではスキップして続行
      }
    }));

    // 5. 1枚に結合されたキャンバスをJPEG Blobに変換してメインスレッドに返却
    const blob = await offCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    self.postMessage({ blob: blob }, [blob]);

  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
});
