// 同時実行数を制限する並列処理ヘルパー（MAX 4制限用）
async function limitConcurrency(tasks, limit, progressCallback) {
  const results = [];
  const executing = [];
  let completed = 0;
  
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task()).then((res) => {
      completed++;
      progressCallback(completed, tasks.length);
      return res;
    });
    results.push(p);
    
    if (limit <= tasks.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing); // 4つのうちどれかが終わるまでスロットを空けない
      }
    }
  }
  return Promise.all(results);
}

// ARW(TIFF構造)から埋め込みJPEG(Exif/Preview)のバイナリ領域を高速にパース・抽出する関数
function extractEmbeddedJpeg(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  // JPEGの開始マーカー(SOI: 0xFFD8)と終了マーカー(EOI: 0xFFD9)をスキャン
  let start = -1;
  for (let i = 0; i < view.byteLength - 1; i++) {
    if (view.getUint8(i) === 0xFF && view.getUint8(i + 1) === 0xD8) {
      start = i;
      break; 
    }
  }
  if (start === -1) return null;

  let end = -1;
  // 安全のため、ファイル末尾側から逆引きスキャン
  for (let i = view.byteLength - 2; i > start; i--) {
    if (view.getUint8(i) === 0xFF && view.getUint8(i + 1) === 0xD9) {
      end = i + 2;
      break;
    }
  }
  if (end === -1) return null;

  return new Uint8Array(arrayBuffer, start, end - start);
}

self.addEventListener('message', async (e) => {
  try {
    const { files, totalWidth, totalHeight, cropping, bgColor } = e.data;

    if (!files) {
      self.postMessage({ error: '画像データが送信されませんでした。' });
      return;
    }

    const fileArray = Array.isArray(files) ? files : Array.from(files);

    // .arw を含む対応画像のみフィルタリング
    const validFiles = fileArray.filter(file => {
      if (!file || typeof file !== 'object' || !('name' in file)) return false;
      const name = file.name || '';
      return /\.(png|jpg|jpeg|bmp|gif|arw)$/i.test(name);
    });

    if (validFiles.length === 0) {
      self.postMessage({ error: '有効な画像（JPEG/PNG/ARW等）が見つかりませんでした。' });
      return;
    }

    // グリッド（行列）寸法の算出
    const numImages = validFiles.length;
    const cols = Math.ceil(Math.sqrt(numImages));
    const rows = Math.ceil(numImages / cols);

    const thumbW = Math.floor(totalWidth / cols);
    const thumbH = Math.floor(totalHeight / rows);

    const sheetW = cols * thumbW;
    const sheetH = rows * thumbH;

    // 出力用巨大キャンバスの確保
    const offCanvas = new OffscreenCanvas(sheetW, sheetH);
    const ctx = offCanvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, sheetW, sheetH);

    // 各個別画像の処理タスク配列を定義
    const tasks = validFiles.map((file, index) => {
      return async () => {
        let bitmap = null;
        try {
          const isRaw = /\.arw$/i.test(file.name);

          if (isRaw) {
            // RAW画像の場合はバイナリから内包JPEGを高速抽出し、メモリ消費を激減させる
            const arrayBuffer = await file.arrayBuffer();
            const jpegBytes = extractEmbeddedJpeg(arrayBuffer);
            
            if (jpegBytes) {
              const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
              bitmap = await createImageBitmap(blob);
            } else {
              throw new Error('RAWファイル内に埋め込みJPEGが見つかりませんでした。');
            }
          } else {
            // 通常のJPEG/PNG等はそのまま展開
            bitmap = await createImageBitmap(file);
          }

          if (!bitmap) return;

          // 各画像のスロット内配置計算
          const col = index % cols;
          const row = Math.floor(index / cols);
          const dx = col * thumbW;
          const dy = row * thumbH;

          const imgRatio = bitmap.width / bitmap.height;
          const targetRatio = thumbW / thumbH;

          if (cropping) {
            // 短辺トリミングモード
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
            // 枠内フィットモード（アスペクト比維持・中央配置）
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

          // 描画完了後、即座にメモリ上のBitmapオブジェクトを破棄（超重要）
          bitmap.close();

        } catch (imgErr) {
          console.error(`ファイル処理失敗: ${file.name}`, imgErr);
          if (bitmap) bitmap.close();
        }
      };
    });

    // 最大並列数を4に制限して進捗をメインスレッドへ通知しながら実行
    await limitConcurrency(tasks, 4, (completed, total) => {
      self.postMessage({ progress: `${completed} / ${total} 枚を処理完了` });
    });

    // 結合完了した最終的な1枚のコンタクトシートを生成してメインスレッドへ返却
    const finalBlob = await offCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    self.postMessage({ blob: finalBlob }, [finalBlob]);

  } catch (err) {
    self.postMessage({ error: err.message || String(err) });
  }
});
