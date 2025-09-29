/**
 * @fileoverview 音声周波数データを分析し、モールス信号を抽出します。
 */

export class MorseAnalyzer {
    /**
     * @param {object} audioParams - オーディオ関連のパラメータ。
     */
    constructor(audioParams) {
        this.sampleRate = audioParams.sampleRate;
        this.fftSize = audioParams.fftSize;
        
        this.frequencyBandwidth = 2; // ピーク周辺で平均化する周波数ビンの数
        this.noiseThreshold = 30; // これを下回る音量は無音と見なすノイズ閾値
        this.sharpnessThreshold = 2.5; // ピークの「鋭さ」の閾値

        // --- 【追加】状態を保持するためのプロパティ ---
        // 前回のフレームで検出したピークのインデックス
        this.lastDominantFreqIndex = -1;
        // lastDominantFreqIndexの周辺を探索する範囲（ビン単位）
        this.searchNeighborhood = 20;
    }

    /**
     * @private
     * 指定された範囲内で最も鋭いピークを探します。
     * @param {Uint8Array} frequencyData - 周波数データ。
     * @param {number} startIndex - 探索開始インデックス。
     * @param {number} endIndex - 探索終了インデックス。
     * @returns {{index: number, volume: number}} 見つかったピークの情報。なければindexは-1。
     */
    _findSharpestPeak(frequencyData, startIndex, endIndex) {
        let peakIndex = -1;
        let peakVolume = 0;

        // 1. 範囲内で最大の音量を持つピークを見つける
        for (let i = startIndex; i < endIndex; i++) {
            if (frequencyData[i] > peakVolume) {
                peakVolume = frequencyData[i];
                peakIndex = i;
            }
        }

        // 2. ノイズ閾値を下回っていれば無効
        if (peakVolume < this.noiseThreshold) {
            return { index: -1, volume: 0 };
        }

        // 3. ピークの「鋭さ」を検証
        const neighborhood = 10;
        let avgNeighborVolume = 0;
        let neighborCount = 0;
        
        for (let i = peakIndex - neighborhood; i < peakIndex + neighborhood; i++) {
            if (i >= 0 && i < frequencyData.length && Math.abs(i - peakIndex) > this.frequencyBandwidth) {
                avgNeighborVolume += frequencyData[i];
                neighborCount++;
            }
        }
        avgNeighborVolume = neighborCount > 0 ? avgNeighborVolume / neighborCount : 0;

        // 鋭さが足りなければ無効
        if (peakVolume < avgNeighborVolume * this.sharpnessThreshold) {
            return { index: -1, volume: 0 };
        }

        return { index: peakIndex, volume: peakVolume };
    }


    /**
     * 周波数データのスナップショットを分析し、安定して口笛の信号を追跡します。
     * @param {Uint8Array} frequencyData - AnalyserNodeから取得した周波数データ。
     * @returns {{dominantFreqIndex: number, targetVolume: number}}
     */
    analyze(frequencyData) {
        let dominantFreqIndex = -1;
        let maxVolume = 0;

        // 【変更】ステップ1: 前回のピーク位置の近くを優先的に探索
        if (this.lastDominantFreqIndex !== -1) {
            const start = Math.max(0, this.lastDominantFreqIndex - this.searchNeighborhood);
            const end = Math.min(frequencyData.length, this.lastDominantFreqIndex + this.searchNeighborhood);
            const peak = this._findSharpestPeak(frequencyData, start, end);
            dominantFreqIndex = peak.index;
            maxVolume = peak.volume;
        }

        // 【変更】ステップ2: 近くで見つからなかった場合、全体を探索
        if (dominantFreqIndex === -1) {
            const start = Math.floor(100 * this.fftSize / this.sampleRate);
            const end = frequencyData.length;
            const peak = this._findSharpestPeak(frequencyData, start, end);
            dominantFreqIndex = peak.index;
            maxVolume = peak.volume;
        }

        // 次のフレームのために状態を更新
        this.lastDominantFreqIndex = dominantFreqIndex;

        // 有効なピークが見つからなかった場合
        if (dominantFreqIndex === -1) {
             return { dominantFreqIndex: -1, targetVolume: 0 };
        }

        // ステップ3: 有効なピークの周辺の音量を計算する (変更なし)
        let totalVolume = 0;
        let count = 0;
        const startIndex = Math.max(0, dominantFreqIndex - this.frequencyBandwidth);
        const endIndex = Math.min(frequencyData.length - 1, dominantFreqIndex + this.frequencyBandwidth);

        for (let i = startIndex; i <= endIndex; i++) {
            totalVolume += frequencyData[i];
            count++;
        }
        
        const targetVolume = count > 0 ? totalVolume / count : 0;

        return { dominantFreqIndex, targetVolume };
    }
}