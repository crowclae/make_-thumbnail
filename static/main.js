document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('status');
  const download = document.getElementById('download');
  status.textContent = 'アップロード中...';
  download.innerHTML = '';

  const form = new FormData();
  const files = document.getElementById('images').files;
  if (!files.length) { status.textContent = '画像を選択してください'; return; }

  for (let i = 0; i < files.length; i++) form.append('images', files[i]);
  form.append('total_width', document.getElementById('total_width').value);
  form.append('total_height', document.getElementById('total_height').value);
  form.append('cropping', document.getElementById('cropping').checked ? 'true' : 'false');
  form.append('bg_color', document.getElementById('bg_color').value);
  form.append('output_name', document.getElementById('output_name').value);

// 1. Workerの初期化（ファイルの先頭付近、またはイベントハンドラ外で定義）
const worker = new Worker('worker.js');

// --- 実行ボタンが押された時の処理の中身 ---
// (フォームから画像やパラメータを取得する部分はそのまま)

try {
    status.textContent = '処理中...（ブラウザ内で実行中）';

    // 2. Workerからの処理完了メッセージを待つPromiseを作成
    const processImagesInFrontend = () => {
        return new Promise((resolve, reject) => {
            // Workerから結果が返ってきたときの処理
            worker.onmessage = (e) => {
                if (e.data.success) {
                    resolve(e.data.blob); // 処理された画像のBlobを受け取る
                } else {
                    reject(new Error(e.data.error || '画像処理に失敗しました'));
                }
            };
            
            worker.onerror = (err) => reject(err);

            // 3. Workerへ画像データと設定パラメータを送信
            // ※ formから画像（Fileオブジェクト）や設定値を取り出してオブジェクトにする
            const files = document.getElementById('image_input').files; 
            const cropping = document.getElementById('cropping').checked;
            const bg_color = document.getElementById('bg_color').value;
            const output_name = document.getElementById('output_name').value;

            worker.postMessage({
                files: Array.from(files),
                cropping: cropping,
                bg_color: bg_color,
                output_name: output_name
            });
        });
    };

    // 4. フロントエンドでの処理を実行
    const blob = await processImagesInFrontend();

    // 5. ダウンロード処理（現在の28行目以降のロジックをそのまま活用）
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = document.getElementById('output_name').value || 'thumbnail.jpg';
    a.innerText = '結果をダウンロード';
    
    download.appendChild(a);
    status.textContent = '完了：ダウンロードリンクをクリックしてください';

} catch (err) {
    status.textContent = 'エラー：' + err.message;
}
});
