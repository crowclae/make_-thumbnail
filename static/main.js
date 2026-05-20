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

    // フォームのデフォルトの送信（ページリロード）を防止
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // 1. 画像ファイルの選択チェック
        const files = Array.from(fileInput.files);
        if (files.length === 0) {
            status.textContent = 'エラー：元画像を選択してください（複数可）。';
            status.style.color = 'red';
            return;
        }

        // 2. フォームから設定パラメータを取得
        const totalWidth = parseInt(totalWidthInput.value, 10) || 2400;
        const totalHeight = parseInt(totalHeightInput.value, 10) || 1800;
        const cropping = croppingInput.checked;
        const bgColor = bgColorInput.value || 'black';
        const outputName = outputNameInput.value.trim() || 'contact_sheet.jpg';

        // 画面表示のリセット
        status.textContent = '処理中...（ブラウザ内で結合しています）';
        status.style.color = 'inherit';
        downloadDiv.innerHTML = '';

        // 3. Web Worker の初期化
        // 毎回新しく生成することで、連続で実行した際のメモリや状態の混線を防ぎます
        const worker = new Worker('worker.js');

        // 4. Worker からの結果（メッセージ）を受け取る処理
        worker.onmessage = (event) => {
            if (event.data.error) {
                status.textContent = 'エラー: ' + event.data.error;
                status.style.color = 'red';
                return;
            }

            if (event.data.blob) {
                const blob = event.data.blob;
                const url = URL.createObjectURL(blob);
                
                // ダウンロードリンク（ボタン状の要素）の生成
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
                
                downloadDiv.appendChild(a);
                status.textContent = '完了：ダウンロードリンクをクリックしてください。';
                status.style.color = 'green';
            }
        };

        // Worker 自体のエラーハンドリング
        worker.onerror = (err) => {
            status.textContent = 'Worker内部エラー: ' + err.message;
            status.style.color = 'red';
        };

        // 5. Worker へ画像データとパラメータを一括送信
        worker.postMessage({
            files: files,
            totalWidth: totalWidth,
            totalHeight: totalHeight,
            cropping: cropping,
            bgColor: bgColor
        });
    });
});
