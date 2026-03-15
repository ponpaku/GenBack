use crate::config::DiscordConfig;

/// Discord Webhook にメッセージを送信する（非同期）
pub async fn send_discord(config: &DiscordConfig, message: &str) {
    if !config.enabled {
        return;
    }
    if config.webhook_url.is_empty() || config.webhook_url.contains("YOUR_DISCORD") {
        return;
    }
    let client = reqwest::Client::new();
    let payload = serde_json::json!({ "content": message });
    let result = client
        .post(&config.webhook_url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "Mozilla/5.0")
        .json(&payload)
        .send()
        .await;
    if let Err(e) = result {
        eprintln!("[warn] Discord 通知失敗: {}", e);
    }
}

pub async fn send_discord_start(config: &DiscordConfig, dests: &[String]) {
    if !config.notify_start { return; }
    send_discord(config, &format!("{} dest={:?}", config.start_message, dests)).await;
}

pub async fn send_discord_end(config: &DiscordConfig) {
    if !config.notify_end { return; }
    send_discord(config, &config.end_message.clone()).await;
}

pub async fn send_discord_error(config: &DiscordConfig, detail: &str) {
    if !config.notify_error { return; }
    let msg = if detail.is_empty() {
        config.error_message.clone()
    } else {
        format!("{} — {}", config.error_message, detail)
    };
    send_discord(config, &msg).await;
}
