# make_-thumbnail (Web版)

このプロジェクトは、ローカルでのRAW現像対応コンタクトシート作成機能をWeb UIで再現します。

要件:

- Python 3.8+
- system に `libraw` が必要な場合があります（rawpy のビルド要件）

セットアップ:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

実行:

```bash
python app.py
```

ブラウザで http://localhost:5000 を開き、複数の画像（ARW/JPG/PNG 等）をアップロードして実行してください。

注意:

- 大きなRAWファイルを多数アップロードするとメモリ／CPU負荷が高くなる可能性があります。
- 必要なら Docker 化やアップロード済みファイルをサーバー上のフォルダ参照に変更できます。

ブラウザ単体（WASM）での実行:

- このリポジトリにはクライアント単体でJPEG/PNG等を処理する実装があります。UIで「ブラウザ単体で処理」を選ぶと、ブラウザ内で並列（Web Worker）にサムネイル生成と合成を行い、結果をダウンロードできます。
- RAW（.arw）ファイルもブラウザ内で完全処理したい場合は、`libraw` を WASM にビルドしたバイナリ（例: `libraw.wasm`）と、それを呼び出すラッパーJSを `/static/` に配置する必要があります。現状は RAW のデコードがない場合 `arw` ファイルはエラーになります。

推奨ワークフロー（簡単）:

1. サーバーを起動してブラウザ経由で処理（サーバー側で RAW を扱う: 既存の `app.py` を使用）
2. または、クライアント単体で高速に処理したい場合は、ブラウザの「ブラウザ単体で処理」を選択（ただし RAW は未対応）

将来的に完全ブラウザ内 RAW を実現するには:

- libraw を Emscripten でビルドして `libraw.wasm` と JS ラッパーを作成する
- ブラウザ側で WASM をロードして ArrayBuffer を渡し、RGB バッファを受け取って `ImageBitmap` を作成する

