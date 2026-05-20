document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form');
    const fileInput = document.getElementById('image_input');
    const totalWidthInput = document.getElementById('total_width');
    const totalHeightInput = document.getElementById('total_height');
    const croppingInput = document.getElementById('cropping');
    const bgColorInput = document.getElementById('bg_color');
    const outputNameInput = document.getElementById('output_name');
    
    const status = document.getElementById('status');
    const downloadDiv = document.getElementById('download');

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // 1. 画像ファイルの選択チェック
        const files = Array.from(fileInput.files);
        if (files.length === 0) {
            status.textContent = 'エラー：元画像を選択してください（複数可）。';
            status.style.color = 'red';
            return;
        }

        // 2. パラメータの取得
        const totalWidth = parseInt(totalWidthInput.value, 10) || 2400;
        const totalHeight = parseInt(totalHeightInput.value, 10) || 1800;
        const cropping = croppingInput.checked;
        const bgColor = bgColorInput.value || 'black';
        const outputName = outputNameInput.value.trim() || 'contact_sheet.jpg';

        status.textContent = '処理中...（ブラウザ内で並列処理を実行中）';
        status.style.color = 'inherit';
        downloadDiv.innerHTML = '';

        // 3. Web Worker の初期化 (static/ から見て一つ上の階層にある worker.js を指定)
        const worker = new Worker('../worker.js');

        // 4. Worker からの処理結果の受け取り
        worker.onmessage = (event) => {
            if (event.data.error) {
                status.textContent = 'エラー: ' + event.data.error;
                status.style.color = 'red';
                return;
            }

            if (event.data.progress) {
                status.textContent = `処理中... (${event.data.progress})`;
                return;
            }

            if (event.data.blob) {
                const blob = event.data.blob;
                const url = URL.createObjectURL(blob);
                
                // ダウンロードボタンの生成
                const a = document.createElement('a');
                a.href = url;
                a.download = outputName;
                a.textContent = `🚀 結果をダウンロード (${outputName})`;
                a.style.display = 'inline-block';
                a.style.marginTop = '10px';
                a.style.padding = '10px 20px';
                a.style.backgroundColor = '#007bff';
                a.style.color = '#fff';
                a.style.textDecoration = 'none';
                a.style.borderRadius = '4px';
                a.style.fontWeight = 'bold';
                
                downloadDiv.appendChild(a);
                status.textContent = '完了：ダウンロードボタンをクリックしてください。';
                status.style.color = 'green';
            }
        };

        worker.onerror = (err) => {
            status.textContent = 'Worker内部エラー: ' + err.message;
            status.style.color = 'red';
        };

        // 5. 画像データを配列化して一括送信
        worker.postMessage({
            files: files,
            totalWidth: totalWidth,
            totalHeight: totalHeight,
            cropping: cropping,
            bgColor: bgColor
        });
    });
});
