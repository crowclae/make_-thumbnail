// Client-side processing for JPEG/PNG in browser using Web Workers and OffscreenCanvas
// If libraw.wasm + wrapper are provided at /static/libraw.wasm and /static/libraw.js,
// the code can be extended to decode RAW files. For now, .arw will error unless a WASM decoder is available.

const MAX_WORKERS = navigator.hardwareConcurrency ? Math.max(1, navigator.hardwareConcurrency - 1) : 2;
let workerPool = [];
let workerIndex = 0;

function initWorkers() {
  workerPool = [];
  for (let i = 0; i < MAX_WORKERS; i++) workerPool.push(new Worker('/static/worker.js'));
}

function getWorker() {
  const w = workerPool[workerIndex % workerPool.length];
  workerIndex++;
  return w;
}

async function processFilesInBrowser(files, totalWidth, totalHeight, cropping) {
  if (!workerPool.length) initWorkers();

  const allowed = f => (/(\.png|\.jpe?g|\.bmp|\.gif)$/i).test(f.name) || (/\.arw$/i).test(f.name);
  const fileList = Array.from(files).filter(allowed);
  if (!fileList.length) throw new Error('対応する画像がありません。');

  const num = fileList.length;
  const cols = Math.ceil(Math.sqrt(num));
  const rows = Math.ceil(num / cols);
  const thumbW = Math.floor(totalWidth / cols);
  const thumbH = Math.floor(totalHeight / rows);

  // send each file to a worker
  const promises = fileList.map((file, idx) => new Promise((resolve, reject) => {
    const worker = getWorker();
    const onmsg = (e) => {
      if (e.data && e.data.error) { worker.removeEventListener('message', onmsg); return reject(new Error(e.data.error)); }
      if (e.data && e.data.blob) {
        worker.removeEventListener('message', onmsg);
        resolve({index: idx, blob: e.data.blob});
      }
    };
    worker.addEventListener('message', onmsg);
    worker.postMessage({file, thumbW, thumbH, cropping});
  }));

  const results = await Promise.all(promises);
  // sort by index
  results.sort((a,b)=>a.index-b.index);
  const images = await Promise.all(results.map(async r => ({
    blob: r.blob,
    bitmap: await createImageBitmap(r.blob)
  })));

  // compose contact sheet
  const cols2 = cols, rows2 = rows;
  const canvas = document.createElement('canvas');
  canvas.width = cols2 * thumbW;
  canvas.height = rows2 * thumbH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  images.forEach((it, i) => {
    const col = i % cols2;
    const row = Math.floor(i / cols2);
    ctx.drawImage(it.bitmap, col*thumbW, row*thumbH, thumbW, thumbH);
  });

  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
}

// Wire up to form
document.getElementById('form').addEventListener('submit', async (e)=>{
  const clientOnly = document.getElementById('client_only').checked;
  if (!clientOnly) return; // let main.js handle it (server)
  e.preventDefault();
  const status = document.getElementById('status');
  const download = document.getElementById('download');
  status.textContent = 'ブラウザ処理を開始します...';
  download.innerHTML = '';

  const files = document.getElementById('images').files;
  if (!files.length) { status.textContent = '画像を選択してください'; return; }

  try {
    const totalWidth = parseInt(document.getElementById('total_width').value, 10) || 2400;
    const totalHeight = parseInt(document.getElementById('total_height').value, 10) || 1800;
    const cropping = document.getElementById('cropping').checked;

    const blob = await processFilesInBrowser(files, totalWidth, totalHeight, cropping);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = document.getElementById('output_name').value || 'contact_sheet.jpg';
    a.textContent = '結果をダウンロード (ブラウザ処理)';
    download.appendChild(a);
    status.textContent = '完了: ダウンロードリンクをクリックしてください';
  } catch (err) {
    status.textContent = 'エラー: ' + err.message;
  }
});
