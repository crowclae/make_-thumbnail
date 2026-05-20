self.addEventListener('message', async (e) => {
  try {
    const {file, thumbW, thumbH, cropping} = e.data;
    const name = file.name || '';
    if (/\.arw$/i.test(name)) {
      // RAW decoding requires WASM decoder; not available in this worker by default
      self.postMessage({error: 'RAW(.arw)ファイルのデコードには libraw WASM が必要です。'});
      return;
    }

    // createImageBitmap can decode many image types
    const bitmap = await createImageBitmap(file);
    const imgRatio = bitmap.width / bitmap.height;
    const targetRatio = thumbW / thumbH;

    let drawW = thumbW, drawH = thumbH, sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;

    if (cropping) {
      if (imgRatio > targetRatio) {
        // image is wider: fit height, crop sides
        const newW = Math.round(bitmap.height * targetRatio);
        sw = Math.round(bitmap.height * imgRatio);
        // compute source crop to center
        const cropW = Math.round(bitmap.height * targetRatio);
        sx = Math.round((bitmap.width - cropW) / 2);
        sw = cropW; sh = bitmap.height;
      } else {
        // image is taller: fit width, crop top/bottom
        const cropH = Math.round(bitmap.width / targetRatio);
        sy = Math.round((bitmap.height - cropH) / 2);
        sw = bitmap.width; sh = cropH;
      }
    } else {
      // no cropping: fit inside
      if (bitmap.width > thumbW || bitmap.height > thumbH) {
        const ratio = Math.min(thumbW / bitmap.width, thumbH / bitmap.height);
        drawW = Math.round(bitmap.width * ratio);
        drawH = Math.round(bitmap.height * ratio);
      } else {
        drawW = bitmap.width; drawH = bitmap.height;
      }
    }

    const off = new OffscreenCanvas(thumbW, thumbH);
    const ctx = off.getContext('2d');
    // fill transparent/black background
    ctx.fillStyle = 'black';
    ctx.fillRect(0,0,thumbW,thumbH);

    if (cropping) {
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, thumbW, thumbH);
    } else {
      // center the image
      const dx = Math.round((thumbW - drawW) / 2);
      const dy = Math.round((thumbH - drawH) / 2);
      ctx.drawImage(bitmap, 0,0,bitmap.width,bitmap.height, dx,dy, drawW,drawH);
    }

    const blob = await off.convertToBlob({type:'image/jpeg', quality:0.92});
    self.postMessage({blob}, [blob]);
  } catch (err) {
    self.postMessage({error: err.message || String(err)});
  }
});
