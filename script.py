import os

# 設定
src_directory = './src'
output_filename = './src.txt'

specific_files = [
    'index.html',
    'readme.md',
    'plan.md',
    'LLM.md',
]


# 処理対象のファイルパスを格納するリスト
all_filepaths = []

# 1. srcディレクトリ内のファイルパスを【再帰的に】取得
if os.path.isdir(src_directory):
    # os.walk() を使って、src_directory 内のすべてのディレクトリとファイルを探索
    for dirpath, _, filenames in os.walk(src_directory):
        for filename in filenames:
            # dirpath (現在のディレクトリのパス) と filename (ファイル名) を結合して完全なパスを作成
            filepath = os.path.join(dirpath, filename)
            all_filepaths.append(filepath)
else:
    print(f"警告: ディレクトリ '{src_directory}' が見つかりません。スキップします。")


# 2. 特定のファイルのパスを追加
for filepath in specific_files:
    if os.path.isfile(filepath):
        if filepath not in all_filepaths:  # 重複を避ける
            all_filepaths.append(filepath)
    else:
        print(f"警告: 指定されたファイル '{filepath}' が見つかりません。スキップします。")


# 出力ファイルを開く (UTF-8で書き込み)
with open(output_filename, 'w', encoding='utf-8') as outfile:
    # 統合・ソートされたファイルリストをループ処理
    for filepath in all_filepaths:
        print(f"処理中: {filepath}")
        # ファイルパスを書き込む
        # パスの区切り文字をOSによらず'/'に統一したい場合は .replace(os.sep, '/') を追加
        outfile.write(f"{filepath.replace(os.sep, '/')}\n---\n")

        # ファイルの内容を読み込んで書き込む
        try:
            with open(filepath, 'r', encoding='utf-8') as infile:
                content = infile.read()
                outfile.write(content)
        except Exception as e:
            # エラーが発生した場合も処理を続行
            outfile.write(f"\n--- エラー: ファイル '{filepath}' を読み込めませんでした: {e} ---\n")

        # 内容と区切り線の間に改行を入れ、区切り線を書き込む
        outfile.write("\n---\n")

print(f"全てのファイルを '{output_filename}' にまとめました。")