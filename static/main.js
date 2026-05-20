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

  try {
    const resp = await fetch('/process', { method: 'POST', body: form });
    if (!resp.ok) {
      const j = await resp.json().catch(()=>null);
      status.textContent = j && j.msg ? ('エラー: '+j.msg) : ('HTTP error '+resp.status);
      return;
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = document.getElementById('output_name').value || 'contact_sheet.jpg';
    a.textContent = '結果をダウンロード';
    download.appendChild(a);
    status.textContent = '完了: ダウンロードリンクをクリックしてください';
  } catch (err) {
    status.textContent = 'エラー: ' + err.message;
  }
});
