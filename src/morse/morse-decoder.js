/**
 * @fileoverview モールス信号のデコード処理
 * @description
 * このファイルは、時系列の音量データを受け取り、それをモールス信号の
 * 要素（短点, 長点, 各種スペース）に分解し、最終的にテキストに変換する役割を担います。
 *
 * 現在の戦略:
 * 1. 【状態管理】現在の入力が「音あり(Mark)」か「音なし(Space)」かを常に追跡します。
 * 2. 【持続時間計測】同じ状態が何フレーム続いたかを計測します。
 * 3. 【要素の識別】状態が変化したタイミングで、直前の状態の持続時間に基づき、
 *    それが短点(Dit)・長点(Dah)なのか、あるいは文字間・単語間のスペースなのかを識別します。
 *    この識別のための時間の閾値は、標準的なモールス信号の比率（長点=短点x3, 文字間=短点x3）
 *    に基づいています。
 * 4. 【文字への変換】文字間スペースが検出されると、それまでに蓄積された短点と長点の
 *    シーケンスを、モールス符号の対応表を使って文字に変換します。
 */

const State = {
    SPACE: 0,
    MARK: 1,
};

const MORSE_CODE_MAP = {
    '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
    '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
    '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
    '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
    '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
    '--..': 'Z', '-----': '0', '.----': '1', '..---': '2',
    '...--': '3', '....-': '4', '.....': '5', '-....': '6',
    '--...': '7', '---..': '8', '----.': '9'
};

export class MorseDecoder {
    /**
     * @param {{framesPerSecond: number, volumeThreshold: number, ditTime: number}} params
     */
    constructor(params) {
        this.framesPerSecond = params.framesPerSecond || 60;
        this.volumeThreshold = params.volumeThreshold || 40;
        this.ditTime = params.ditTime || 0.15; // 短点の基準時間 (秒)
        
        // モールス符号のルールに基づき、各要素の時間の閾値をフレーム数で計算
        this.dahTimeFrames = (this.ditTime * 2) * this.framesPerSecond; // DitとDahの境界
        this.charSpaceFrames = (this.ditTime * 2) * this.framesPerSecond; // 要素間と文字間の境界
        this.wordSpaceFrames = (this.ditTime * 5) * this.framesPerSecond; // 文字間と単語間の境界

        this.state = State.SPACE;
        this.currentStateDuration = 0;
        this.currentSequence = [];
        this.decodedText = "";
        
        // 5秒間入力がなかったらリセット
        this.lastMarkTime = Date.now();
        this.resetTimeout = 5000;
    }

    /**
     * 音量データを受け取り、デコード処理を進めます。
     * @param {number} targetVolume - 現在のフレームの音量。
     */
    process(targetVolume) {
        if ((Date.now() - this.lastMarkTime) > this.resetTimeout) {
            this._handleStateChange(State.SPACE, this.wordSpaceFrames / this.framesPerSecond);
        }

        const newState = targetVolume > this.volumeThreshold ? State.MARK : State.SPACE;

        if (newState === this.state) {
            this.currentStateDuration++;
        } else {
            this._handleStateChange(this.state, this.currentStateDuration);
            this.state = newState;
            this.currentStateDuration = 1;
        }
        
        if (newState === State.MARK) {
            this.lastMarkTime = Date.now();
        }
    }

    /**
     * @private
     * 状態が変化した時に、直前の状態とその持続時間から信号要素を判断します。
     * @param {number} lastState - 直前の状態 (State.MARK or State.SPACE)
     * @param {number} durationFrames - その状態が続いたフレーム数
     */
    _handleStateChange(lastState, durationFrames) {
        if (lastState === State.MARK) {
            // 音あり状態 -> 短点か長点か
            if (durationFrames > 1) { // 1フレームだけのノイズは無視
                const symbol = durationFrames < this.dahTimeFrames ? '.' : '-';
                this.currentSequence.push(symbol);
            }
        } else { // State.SPACE
            // 音なし状態 -> スペースの種類か
            if (durationFrames > this.wordSpaceFrames) {
                this._decodeSequence();
                if (!this.decodedText.endsWith(' ')) {
                    this.decodedText += ' ';
                }
            } else if (durationFrames > this.charSpaceFrames) {
                this._decodeSequence();
            }
        }
    }
    
    /**
     * @private
     * 蓄積されたシーケンスを文字に変換します。
     */
    _decodeSequence() {
        if (this.currentSequence.length === 0) return;

        const sequenceStr = this.currentSequence.join('');
        const character = MORSE_CODE_MAP[sequenceStr];
        
        if (character) {
            this.decodedText += character;
        } else {
            this.decodedText += '?'; // 不明なシーケンス
        }
        
        this.currentSequence = [];
    }

    /**
     * 現在のデコード結果テキストを返します。
     * @returns {string}
     */
    getDecodedText() {
        // 現在入力中のシーケンスもプレビュー表示する
        const preview = this.currentSequence.join('');
        return this.decodedText + preview;
    }
}