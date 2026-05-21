README.md

```markdown
# CONTACT SHEET — RAW Generator (Wasm Multi-thread)

ブラウザ上で動作する、RAWデータ（.ARW, .NEF, .CR2, .CR3, .ORF, .DNG）および一般的な画像ファイル（JPEG, PNG）から超高画質なコンタクトシート（インデックスプリント）を高速に一括生成するWebアプリケーションです。

WebAssembly（Wasm）にビルドされた `LibRaw` をバックグラウンド（Web Worker）でマルチスレッド動作させ、ローカル環境のCPUパワーを最大限に活かしたネイティブ現像処理を行います。

---

## 🚀 主な特徴

* **WasmによるネイティブRAW現像**: `LibRaw` の dcraw エミュレーションをブラウザ上で実行。RAWデータのバイナリ構造から直接RGBピクセルを高画質に展開します。
* **マルチスレッド＆非同期処理**: Web Worker（最大4スロットの並行処理）を利用し、重い現像処理中もメインスレッド（UI）をフリーズさせません。
* **高速Embedded JPEGフォールバック**: Wasmの初期化前や非対応環境、または破損ファイル処理時には、RAWデータ内に埋め込まれているプレビュー用JPEG構造を高速にシーク・抽出する独自のフォールバックロジックを搭載。
* **自動最適グリッド計算**: 読み込んだファイル数と指定した出力解像度から、余白（PAD）や間隔（GAP）を考慮して最も隙間の少なくなる最適な配置（列数・行数）を自動計算します。
* **完全ローカル完結**: サーバーへ画像をアップロードすることなく、すべての処理をブラウザ（クライアントサイド）のメモリ上で完結するため、機密性・プライバシーに優れています。

---

## 🛠️ 技術スタック

* **Frontend**: HTML5, CSS3 (Grid/Flexbox), JavaScript (Vanilla ES6)
* **Core Logic**: `LibRaw` (C++ライブラリ) ➔ Emscriptenによる WebAssembly (Wasm) コンパイル
* **Concurrency**: Web Workers (OffscreenCanvas / SharedArrayBuffer)
* **Cross-Origin Isolation**: `coi-serviceworker.js`（マルチスレッド/SharedArrayBuffer有効化用）

---

## 📂 ファイル構成

```text
├── index.html          # メインのUIおよびWeb Worker制御ロジック
├── libraw.js           # Emscriptenが生成したWasmラッパー・バインディング glue code
├── libraw.wasm         # LibRaw本体のコンパイル済みWebAssemblyバイナリ (※別途必要)
└── coi-serviceworker.js # SharedArrayBufferを有効化するためのService Worker (※別途必要)

```

---

## ⚙️ 動作要件・セットアップ

本ツールはマルチスレッド動作（`SharedArrayBuffer`）を行うため、**強固なセキュリティヘッダー（COOP / COEP）が出力されるWebサーバー環境**が必要です。ローカルファイル（`file://`）をダブルクリックしただけでは動作しません。

### 1. ローカルサーバーの起動例

**Node.js (http-server) の場合:**

```bash
npx http-server . -p 8080

```

**Python の場合 (※Python単体ではCOOP/COEPヘッダーが出ないため、インラインの `coi-serviceworker.js` 等での補正が必要です):**

```bash
python -m http-server 8080

```

### 2. 依存ファイルの配置

本ソースコードの他に、コンパイル済みの `libraw.wasm` および `coi-serviceworker.js` を `index.html` と同一階層に配置してください。

---

## 📖 使い方

1. 画面右側のドロップゾーンに、RAWファイルまたは画像ファイルをドラッグ＆ドロップ（またはクリックして選択）します。
* リスト表示時には、表示速度を落とさないために内蔵JPEGの高速切り出しプレビューが適用されます。


2. 左側のコントロールパネルから各種パラメータを調整します。
* **グリッド設定**: 横間隔（GAP X）、縦間隔（GAP Y）、外周余白（PAD X / Y）
* **出力サイズ**: 最終的なコンタクトシートのピクセル幅・高さ（デフォルト: 4000 × 3000 px）
* **描画モード**: 短辺でのスクエアクロップ（1:1）か、枠内フィット（アスペクト比維持）かを選択
* **背景・ファイル名**: 背景色（デフォルト: 黒）および出力ファイル名


3. 画面右下の **`▶ GENERATE`** ボタンをクリックすると現像・結合処理が開始されます。
4. 各スロットのステータスランプが `busy(黄)` ➔ `ok(緑)` or `err(赤)` と推移し、進捗バーが100%になると画面下部に出力プレビューが表示されます。
5. **`↓ DOWNLOAD JPEG`** ボタンをクリックして、生成された高解像度コンタクトシートをダウンロードします。

---

## 📝 開発者向け：Wasm内部処理メモ (`libraw.js`)

JavaScript側から呼び出される `Module.process_to_rgba` は、C++側の以下のライフサイクルをエミュレートして実行されています。

1. `_libraw_init(0)`: インスタンス初期化
2. `_libraw_open_buffer()`: メモリ上のRAWバイナリ空間をオープン
3. `_libraw_unpack()`: RAWデータの展開
4. `_libraw_dcraw_process()`: デモザイク等の現像処理を実行
5. `_libraw_dcraw_make_mem_image()`: メモリ上にRGB(A)ビットマップを生成
6. **ピクセルコンバート**: 生成された画像が RGB（3ch）の場合、HTML5 Canvas（ImageData）が要求する RGBA（4ch / 32bit）へ高速にピクセル配列を再配置してJavaScript側のメモリ空間（`createImageBitmap` 用）に引き渡します。

```

---

何か修正したい点や、追加したい項目（ライセンス表記や特定のビルド方法など）があればお気軽にお申し付けください。

```
