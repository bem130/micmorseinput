/**
 * @fileoverview マイク音声の取得とWeb Audio APIの管理
 * @description
 * このファイルは、ブラウザのマイク機能とのすべてのやり取りを担当します。
 * ユーザーにマイクの使用許可を求め、音声ストリームを取得し、
 * リアルタイムで周波数分析を行うための`AnalyserNode`をセットアップします。
 *
 * 現在の戦略:
 * 1. `navigator.mediaDevices.getUserMedia` APIを使用して、安全なコンテキストでマイクへのアクセスを要求します。
 * 2. 音声ストリームが取得できたら、`AudioContext`を生成します。
 * 3. ストリームをソースとして、高速フーリエ変換(FFT)を実行する`AnalyserNode`に接続します。
 * 4. AnalyserNodeの`smoothingTimeConstant`を低い値に設定し、モールス信号の素早い
 *    音量変化を捉えられるように、応答性を高めています。
 */

/**
 * マイクからの音声キャプチャとAudioContextの管理を行います。
 */
export class AudioCapturer {
    constructor() {
        /** @private {AudioContext|null} */
        this.audioContext = null;
        /** @private {AnalyserNode|null} */
        this.analyser = null;
        /** @private {MediaStream|null} */
        this.mediaStream = null;
    }

    /**
     * マイクへのアクセスを要求し、音声のキャプチャを開始します。
     * @returns {Promise<void>}
     */
    async start() {
        if (this.audioContext) return;

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new AudioContext();

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            
            this.analyser.fftSize = 2048;
            // 音量変化の応答性を高めるため、時間平滑化の定数を下げる（デフォルトは0.8）
            this.analyser.smoothingTimeConstant = 0.1;

            source.connect(this.analyser);
            
            console.log("Audio capture started.");

        } catch (err) {
            console.error("Error capturing audio.", err);
            this.stop();
            throw err;
        }
    }

    /**
     * 音声のキャプチャを停止し、関連するリソースを解放します。
     */
    stop() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
            this.analyser = null;
        }
        console.log("Audio capture stopped.");
    }

    /**
     * 音声分析用のAnalyserNodeを返します。
     * @returns {AnalyserNode|null}
     */
    getAnalyser() {
        return this.analyser;
    }

    /**
     * AudioContextを返します。
     * @returns {AudioContext|null}
     */
    getAudioContext() {
        return this.audioContext;
    }
}