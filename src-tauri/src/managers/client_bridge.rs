use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use crate::error::{VelocityUIError, VelocityUIResult};

const MAX_BODY: usize = 256 * 1024;

pub struct ClientBridgeManager {
    port: Mutex<Option<u16>>,
}

impl ClientBridgeManager {
    pub fn new() -> Self {
        Self {
            port: Mutex::new(None),
        }
    }

    pub fn port(&self) -> Option<u16> {
        self.port.lock().ok().and_then(|g| *g)
    }

    pub async fn ensure_started(&self, app: AppHandle) -> VelocityUIResult<u16> {
        if let Some(port) = self.port() {
            return Ok(port);
        }

        let std_listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
        std_listener.set_nonblocking(true)?;
        let port = std_listener.local_addr()?.port();
        let listener = TcpListener::from_std(std_listener)?;

        {
            let mut guard = self
                .port
                .lock()
                .map_err(|_| VelocityUIError::LockPoisoned)?;
            if let Some(existing) = *guard {
                return Ok(existing);
            }
            *guard = Some(port);
        }

        tokio::spawn(async move {
            while let Ok((stream, _)) = listener.accept().await {
                let app = app.clone();
                tokio::spawn(async move {
                    let _ = handle_stream(stream, app, port).await;
                });
            }
        });

        Ok(port)
    }

    pub async fn wrap_script(&self, app: AppHandle, code: &str) -> VelocityUIResult<String> {
        let port = self.ensure_started(app).await?;
        Ok(lua_bridge_template()
            .replace("__VELOCITYUI_BRIDGE_PORT__", &port.to_string())
            .replace("__VELOCITYUI_USER_CODE__", code))
    }
}

async fn handle_stream(mut stream: TcpStream, app: AppHandle, port: u16) -> VelocityUIResult<()> {
    let mut data = Vec::new();
    let mut buf = [0_u8; 4096];
    let mut header_end = None;

    while header_end.is_none() && data.len() <= MAX_BODY {
        let n = stream.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buf[..n]);
        header_end = find_header_end(&data);
    }

    let Some(header_end) = header_end else {
        return write_response(
            &mut stream,
            400,
            json!({ "ok": false, "error": "bad request" }),
        )
        .await;
    };

    let header = String::from_utf8_lossy(&data[..header_end]).to_string();
    let mut lines = header.lines();
    let request_line = lines.next().unwrap_or_default();
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default();
    let path = request_parts.next().unwrap_or("/");
    let content_length = parse_content_length(&header).unwrap_or(0);

    if content_length > MAX_BODY {
        return write_response(
            &mut stream,
            413,
            json!({ "ok": false, "error": "payload too large" }),
        )
        .await;
    }

    let body_start = header_end + 4;
    while data.len().saturating_sub(body_start) < content_length {
        let n = stream.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buf[..n]);
    }

    match (method, path) {
        ("OPTIONS", _) => write_empty(&mut stream, 204).await,
        ("GET", "/health") => {
            write_response(&mut stream, 200, json!({ "ok": true, "port": port })).await
        }
        ("POST", "/client") | ("POST", "/") => {
            let body_end = body_start + content_length.min(data.len().saturating_sub(body_start));
            let raw = String::from_utf8_lossy(&data[body_start..body_end]).to_string();
            let parsed =
                serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({ "raw": raw }));
            let payload = json!({
                "bridgePort": port,
                "method": method,
                "path": path,
                "body": parsed,
            });
            let _ = app.emit("client-bridge:event", payload.clone());
            write_response(&mut stream, 200, json!({ "ok": true, "received": payload })).await
        }
        _ => {
            write_response(
                &mut stream,
                404,
                json!({ "ok": false, "error": "not found" }),
            )
            .await
        }
    }
}

fn find_header_end(data: &[u8]) -> Option<usize> {
    data.windows(4).position(|w| w == b"\r\n\r\n")
}

fn parse_content_length(header: &str) -> Option<usize> {
    header.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        if key.trim().eq_ignore_ascii_case("content-length") {
            value.trim().parse().ok()
        } else {
            None
        }
    })
}

async fn write_empty(stream: &mut TcpStream, status: u16) -> VelocityUIResult<()> {
    let reason = reason_phrase(status);
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(response.as_bytes()).await?;
    Ok(())
}

async fn write_response(stream: &mut TcpStream, status: u16, body: Value) -> VelocityUIResult<()> {
    let reason = reason_phrase(status);
    let body = serde_json::to_string(&body)?;
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream.write_all(response.as_bytes()).await?;
    Ok(())
}

fn reason_phrase(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        413 => "Payload Too Large",
        _ => "OK",
    }
}

fn lua_bridge_template() -> &'static str {
    r#"local __bridge_port = __VELOCITYUI_BRIDGE_PORT__
local __bridge_http = game:GetService("HttpService")
local __bridge_request = request or http_request or (syn and syn.request) or (http and http.request)
local __bridge_url = "http://127.0.0.1:" .. tostring(__bridge_port) .. "/client"

local function __bridge_post(kind, data)
    if type(__bridge_request) ~= "function" then return false end
    data = type(data) == "table" and data or {}
    data.kind = kind
    data.sent_at = os.time()
    local ok, body = pcall(function()
        return __bridge_http:JSONEncode(data)
    end)
    if not ok then return false end
    pcall(__bridge_request, {
        Url = __bridge_url,
        Method = "POST",
        Headers = { ["Content-Type"] = "application/json" },
        Body = body,
    })
    return true
end

local function __bridge_player_payload()
    local payload = {
        game_id = game.GameId,
        place_id = game.PlaceId,
        job_id = game.JobId,
    }
    local ok, players = pcall(function()
        return game:GetService("Players")
    end)
    if ok and players and players.LocalPlayer then
        payload.user_id = tostring(players.LocalPlayer.UserId)
        payload.username = players.LocalPlayer.Name
        payload.display_name = players.LocalPlayer.DisplayName
    end
    return payload
end

local bridge = {
    port = __bridge_port,
    endpoint = __bridge_url,
    post = __bridge_post,
    report = __bridge_post,
}

__bridge_post("hello", __bridge_player_payload())

local __bridge_ok, __bridge_err = xpcall(function()
__VELOCITYUI_USER_CODE__
end, function(err)
    if debug and type(debug.traceback) == "function" then
        return debug.traceback(err)
    end
    return tostring(err)
end)

if __bridge_ok then
    __bridge_post("executed", __bridge_player_payload())
else
    local payload = __bridge_player_payload()
    payload.message = tostring(__bridge_err)
    __bridge_post("error", payload)
    error(__bridge_err, 0)
end
"#
}
