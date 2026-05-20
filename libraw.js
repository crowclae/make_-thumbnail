var createLibRaw = (function() {
  return function(Module) {
    Module = Module || {};
    
    // Wasmバイナリファイルのパス指定（index.htmlと同じ階層を想定）
    Module['locateFile'] = Module['locateFile'] || function(path, prefix) {
      if (path.endsWith('.wasm')) return prefix + path;
      return path;
    };

    // EmscriptenによるWasmメモリ初期化（マルチスレッド/SharedArrayBuffer対応の足場）
    var WASM_PAGE_SIZE = 65536;
    Module['wasmMemory'] = new WebAssembly.Memory({
      'initial': 256,
      'maximum': 2048,
      'shared': true // coi-serviceworkerによって有効化されるマルチスレッド要件
    });

    // C++側の関数（LibRaw API）とJavaScriptのバインディング
    Module['onRuntimeInitialized'] = function() {
      console.log("LibRaw WebAssembly Runtime Initialized.");
    };

    // 外部から呼び出すラッパー関数の実装
    Module['process_to_rgba'] = function(bufferPtr, bufferSize) {
      if (!Module['_libraw_init'] || !Module['_libraw_open_buffer']) {
        console.error("Wasm functions not exported correctly.");
        return null;
      }

      // 1. LibRaw インスタンスの生成
      var lr = Module['_libraw_init'](0);
      
      // 2. メモリバッファのオープン
      var ret = Module['_libraw_open_buffer'](lr, bufferPtr, bufferSize);
      if (ret !== 0) {
        Module['_libraw_recycle'](lr);
        throw new Error("LibRaw open_buffer failed: " + ret);
      }

      // 3. RAWデータの展開（Unpack）
      ret = Module['_libraw_unpack'](lr);
      if (ret !== 0) {
        Module['_libraw_recycle'](lr);
        throw new Error("LibRaw unpack failed: " + ret);
      }

      // 4. 現像処理（dcraw emulation）の実行
      // 必要に応じて半自動ホワイトバランスやカラースペースを設定可能
      ret = Module['_libraw_dcraw_process'](lr);
      if (ret !== 0) {
        Module['_libraw_recycle'](lr);
        throw new Error("LibRaw dcraw_process failed: " + ret);
      }

      // 5. メモリ上にRGB(A)ビットマップ画像を生成
      var errPtr = Module['_navigator_malloc'](4); // エラーコード格納用ポインタ
      var memImagePtr = Module['_libraw_dcraw_make_mem_image'](lr, errPtr);
      
      if (memImagePtr === 0) {
        Module['_libraw_recycle'](lr);
        throw new Error("LibRaw make_mem_image failed");
      }

      // 6. 構造体データから幅・高さ・ピクセルデータポインタを抽出
      // (LibRawの libraw_processed_image_t 構造体のオフセットに基づくパース)
      var width  = Module['HEAPU16'][(memImagePtr + 4) >> 1];
      var height = Module['HEAPU16'][(memImagePtr + 6) >> 1];
      var colors = Module['HEAPU16'][(memImagePtr + 8) >> 1]; // 通常は3(RGB)または4(RGBA)
      var dataOffset = memImagePtr + 16; // データ本体へのポインタ(実装により変動)

      // Canvas(ImageData)はRGBA(4チャンネル)を要求するため、RGBの場合はコンバート
      var rgbaPointer = Module['_malloc'](width * height * 4);
      var rgbaView = new Uint8ClampedArray(Module['HEAPU8'].buffer, rgbaPointer, width * height * 4);
      var rgbView  = new Uint8Array(Module['HEAPU8'].buffer, dataOffset, width * height * colors);

      if (colors === 3) {
        // RGB -> RGBA の高速ピクセル変換
        var idxRGB = 0, idxRGBA = 0;
        var totalPixels = width * height;
        for (var i = 0; i < totalPixels; i++) {
          rgbaView[idxRGBA]     = rgbView[idxRGB];     // R
          rgbaView[idxRGBA + 1] = rgbView[idxRGB + 1]; // G
          rgbaView[idxRGBA + 2] = rgbView[idxRGB + 2]; // B
          rgbaView[idxRGBA + 3] = 255;                 // A (不透明)
          idxRGB += 3;
          idxRGBA += 4;
        }
      } else {
        rgbaView.set(rgbView);
      }

      // 7. C++側の内部メモリ解放
      Module['_libraw_dcraw_clear_mem'](memImagePtr);
      Module['_libraw_recycle'](lr);

      return {
        width: width,
        height: height,
        rgbaPointer: rgbaPointer
      };
    };

    Module['free_result'] = function(pointer) {
      if (pointer) Module['_free'](pointer);
    };

    // 通常の Emscripten ランタイムロード呼び出し
    return new Promise(function(resolve) {
      // Wasmコンパイルがバックグラウンドで完了した段階でresolve
      Module['then'] = function() {
        resolve(Module);
      };
      // 実際の環境ではここにEmscriptenが生成するバイナリロード処理が組み込まれます
    });
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = createLibRaw;
}
