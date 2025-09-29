/**
 * @fileoverview DOM要素のイベントハンドリング
 * @description
 * このファイルは、Canvas以外のHTML要素（ボタンなど）のユーザー操作を管理します。
 *
 * 現在の戦略:
 * 1. `initialize`関数が、アプリケーションの初期化時に`main.js`から呼び出されます。
 * 2. 開始/停止ボタンや画像コピーボタンに、クリックイベントリスナーを登録します。
 * 3. イベントが発生した際、このファイル自身がアプリケーションのロジックを直接操作する
 *    のではなく、`main.js`から渡されたコールバック関数(`onStateChange`)を呼び出します。
 *    これにより、UIの関心事とアプリケーションのロジックを分離しています（関心の分離）。
 * 4. 画像のコピー機能のように、DOMに密接に関連する処理は、このファイル内で完結させます。
 */

/**
 * UIの初期化を行い、ボタンのクリックイベントにコールバックを登録します。
 * @param {function(boolean): void} onStateChange - 開始/停止状態が変更されたときに呼び出されるコールバック。
 * @param {string} canvasId - コピー対象のCanvas要素のID。
 */
export function initialize(onStateChange, canvasId) {
    const startButton = document.getElementById('startButton');
    const copyButton = document.getElementById('copyButton');
    const canvas = document.getElementById(canvasId);

    let isCapturing = false;

    startButton.addEventListener('click', () => {
        isCapturing = !isCapturing;
        startButton.textContent = isCapturing ? 'Stop' : 'Start';
        onStateChange(isCapturing);
    });

    copyButton.addEventListener('click', async () => {
        if (!canvas) return;

        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            
            const originalText = copyButton.textContent;
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
                copyButton.textContent = originalText;
            }, 2000);

        } catch (err) {
            console.error('Failed to copy image to clipboard:', err);
            alert('画像のコピーに失敗しました。');
        }
    });
}