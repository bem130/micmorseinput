/**
 * @fileoverview DOM要素のイベントハンドリングと状態管理を担当します。
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
            
            // ユーザーへのフィードバック
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