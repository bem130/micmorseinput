/**
 * @fileoverview 音声周波数データの分析と口笛の検出
 * @description
 * このファイルは、生の周波数データを受け取り、それを分析して口笛の音に特有の
 * 周波数ピークを特定する役割を担います。声や環境ノイズのような広帯域の音と、
 * 口笛のような狭帯域の鋭い音を区別することが目的です。
 *
 * 現在の戦略:
 * 1. 【デフォルト周波数の設定】探索の基点となる周波数を約2kHzに初期設定します。
 *    これにより、起動直後や信号が完全に途切れた後でも、即座に口笛の音域の探索を開始できます。
 * 2. 【平滑化された周波数の追跡】毎フレーム検出される「生の」ピーク周波数に対し、
 *    線形補間を用いて「平滑化された」周波数が滑らかに追従します。
 *    ただし、再捕捉の初動を速くするため、無音からの復帰時は平滑化を適用せず即座に移動します。
 * 3. 【鋭さの判定】ピークが見つかると、それが口笛特有の「鋭い」ピークであるかを検証し、
 *    そうでなければノイズとして棄却します。
 * 4. 【信号ロストへの耐性】信号が一時的に途切れた場合、即座にリセットするのではなく、
 *    長めの「猶予期間」を設け、その間は最後の周波数を保持することで、追跡の安定性を高めています。
 */

export class MorseAnalyzer {
    /**
     * @param {object} audioParams - オーディオ関連のパラメータ。
     */
    constructor(audioParams) {
        this.sampleRate = audioParams.sampleRate;
        this.fftSize = audioParams.fftSize;
        
        this.frequencyBandwidth = 5;
        this.noiseThreshold = 30;
        this.sharpnessThreshold = 2.5;

        // --- 状態を保持するためのプロパティ ---
        this.defaultFreqIndex = Math.round(2000 * this.fftSize / this.sampleRate); // 約2kHzをデフォルトの探索基点とする
        this.persistedFreqIndex = this.defaultFreqIndex; // 信号ロスト後も記憶し続ける、最後に有効だったピーク位置
        this.smoothedFreqIndex = -1;  // 平滑化された、外部に提供する用の周波数インデックス
        this.smoothingFactor = 0.2;
        this.searchNeighborhood = 20;

        this.framesSinceLastPeak = 0; // 最後にピークを検出してからのフレーム数
        this.maxFramesToPersist = 30; // 信号を保持する猶予フレーム数
    }

    /**
     * @private
     * 指定された範囲内で最も鋭いピークを探します。
     */
    _findSharpestPeak(frequencyData, startIndex, endIndex) {
        let peakIndex = -1;
        let peakVolume = 0;

        for (let i = startIndex; i < endIndex; i++) {
            if (frequencyData[i] > peakVolume) {
                peakVolume = frequencyData[i];
                peakIndex = i;
            }
        }

        if (peakVolume < this.noiseThreshold) {
            return { index: -1, volume: 0 };
        }

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
        let currentRawPeakIndex = -1;
        
        if (this.persistedFreqIndex !== -1) {
            const start = Math.max(0, this.persistedFreqIndex - this.searchNeighborhood);
            const end = Math.min(frequencyData.length, this.persistedFreqIndex + this.searchNeighborhood);
            const peak = this._findSharpestPeak(frequencyData, start, end);
            currentRawPeakIndex = peak.index;
        }

        if (currentRawPeakIndex === -1) {
            const start = Math.floor(100 * this.fftSize / this.sampleRate);
            const end = frequencyData.length;
            const peak = this._findSharpestPeak(frequencyData, start, end);
            currentRawPeakIndex = peak.index;
        }

        if (currentRawPeakIndex !== -1) {
            this.framesSinceLastPeak = 0;
            
            if (this.smoothedFreqIndex === -1) {
                this.smoothedFreqIndex = currentRawPeakIndex;
            } else {
                this.smoothedFreqIndex += (currentRawPeakIndex - this.smoothedFreqIndex) * this.smoothingFactor;
            }
            this.persistedFreqIndex = this.smoothedFreqIndex;
        } else {
            this.framesSinceLastPeak++;
            if (this.framesSinceLastPeak > this.maxFramesToPersist) {
                this.smoothedFreqIndex = -1;
                this.persistedFreqIndex = this.defaultFreqIndex;
            }
        }

        if (this.smoothedFreqIndex === -1) {
             return { dominantFreqIndex: -1, targetVolume: 0 };
        }

        let totalVolume = 0;
        let count = 0;
        const roundedIndex = Math.round(this.smoothedFreqIndex);
        const startIndex = Math.max(0, roundedIndex - this.frequencyBandwidth);
        const endIndex = Math.min(frequencyData.length - 1, roundedIndex + this.frequencyBandwidth);

        for (let i = startIndex; i <= endIndex; i++) {
            totalVolume += frequencyData[i];
            count++;
        }
        
        const targetVolume = count > 0 ? totalVolume / count : 0;

        return { dominantFreqIndex: this.smoothedFreqIndex, targetVolume };
    }
}