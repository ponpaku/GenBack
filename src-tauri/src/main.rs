// リリースビルドでコンソールウィンドウを非表示にする
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.iter().any(|a| a == "--headless") {
        // headless モード: コンソールアプリとして動作
        genback_lib::run_headless(args);
    } else {
        // GUI モード: Windows ではコンソールウィンドウを非表示にする
        // （release ビルドでは tauri.conf.json の windows_subsystem 設定に従う）
        genback_lib::run();
    }
}
