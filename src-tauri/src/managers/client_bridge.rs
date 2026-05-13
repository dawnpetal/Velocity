use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use crate::error::{VelocityUIError, VelocityUIResult};
use crate::models::RobloxClient;

pub const CLIENT_BRIDGE_PORT: u16 = 9904;
const MAX_BODY: usize = 64 * 1024 * 1024;

pub struct ClientBridgeManager {
    port: Mutex<Option<u16>>,
    tasks: Arc<Mutex<HashMap<String, VecDeque<Value>>>>,
    clients: Arc<Mutex<HashMap<String, RobloxClient>>>,
}

impl ClientBridgeManager {
    pub fn new() -> Self {
        Self {
            port: Mutex::new(None),
            tasks: Arc::new(Mutex::new(HashMap::new())),
            clients: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn port(&self) -> Option<u16> {
        self.port.lock().ok().and_then(|g| *g)
    }

    pub fn queue_task(&self, client_key: String, task: Value) -> VelocityUIResult<()> {
        let mut guard = self
            .tasks
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?;
        guard.entry(client_key).or_default().push_back(task);
        Ok(())
    }

    pub fn clients(&self) -> VelocityUIResult<Vec<RobloxClient>> {
        let now = now_sec();
        let mut guard = self
            .clients
            .lock()
            .map_err(|_| VelocityUIError::LockPoisoned)?;
        guard.retain(|_, client| now - client.last_heartbeat < 12);
        let mut clients: Vec<_> = guard.values().cloned().collect();
        for client in &mut clients {
            client.active = now - client.last_heartbeat < 12;
        }
        clients.sort_by(|a, b| b.last_heartbeat.cmp(&a.last_heartbeat));
        Ok(clients)
    }

    pub async fn ensure_started(&self, app: AppHandle) -> VelocityUIResult<u16> {
        if let Some(port) = self.port() {
            return Ok(port);
        }

        let std_listener =
            std::net::TcpListener::bind(("127.0.0.1", CLIENT_BRIDGE_PORT)).map_err(|e| {
                if e.kind() == std::io::ErrorKind::AddrInUse {
                    VelocityUIError::Other(format!(
                        "VelocityUI bridge port {CLIENT_BRIDGE_PORT} is already in use"
                    ))
                } else {
                    VelocityUIError::Io(e)
                }
            })?;
        std_listener.set_nonblocking(true)?;
        let port = CLIENT_BRIDGE_PORT;
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

        let tasks = Arc::clone(&self.tasks);
        let clients = Arc::clone(&self.clients);
        tokio::spawn(async move {
            while let Ok((stream, _)) = listener.accept().await {
                let app = app.clone();
                let tasks = Arc::clone(&tasks);
                let clients = Arc::clone(&clients);
                tokio::spawn(async move {
                    let _ = handle_stream(stream, app, port, tasks, clients).await;
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

async fn handle_stream(
    mut stream: TcpStream,
    app: AppHandle,
    port: u16,
    tasks: Arc<Mutex<HashMap<String, VecDeque<Value>>>>,
    clients: Arc<Mutex<HashMap<String, RobloxClient>>>,
) -> VelocityUIResult<()> {
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
            let client_key = client_key_from_body(&parsed);
            if let Some(key) = client_key.as_deref() {
                remember_client(&clients, key, &parsed);
            }
            let pending = client_key
                .as_deref()
                .map(|key| drain_tasks(&tasks, key))
                .unwrap_or_default();
            let payload = json!({
                "bridgePort": port,
                "method": method,
                "path": path,
                "clientKey": client_key,
                "body": parsed,
            });
            let _ = app.emit("client-bridge:event", payload.clone());
            write_response(
                &mut stream,
                200,
                json!({ "ok": true, "clientKey": client_key, "tasks": pending }),
            )
            .await
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

fn remember_client(clients: &Arc<Mutex<HashMap<String, RobloxClient>>>, key: &str, body: &Value) {
    let Ok(mut guard) = clients.lock() else {
        return;
    };
    let username = body
        .get("username")
        .or_else(|| body.get("display_name"))
        .and_then(Value::as_str)
        .unwrap_or("client")
        .to_string();
    let display_name = body
        .get("display_name")
        .and_then(Value::as_str)
        .unwrap_or(&username)
        .to_string();
    let game_id = body
        .get("game_id")
        .or_else(|| body.get("gameId"))
        .and_then(Value::as_i64)
        .unwrap_or_default();
    let job_id = body
        .get("job_id")
        .or_else(|| body.get("jobId"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    guard.insert(
        key.to_string(),
        RobloxClient {
            user_id: key.to_string(),
            username,
            display_name,
            game_id,
            job_id,
            last_heartbeat: now_sec(),
            active: true,
        },
    );
}

fn now_sec() -> i64 {
    chrono::Utc::now().timestamp()
}

fn client_key_from_body(body: &Value) -> Option<String> {
    body.get("client_key")
        .or_else(|| body.get("clientKey"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            let username = body
                .get("username")
                .or_else(|| body.get("display_name"))
                .and_then(Value::as_str)?;
            let user_id = body
                .get("user_id")
                .or_else(|| body.get("userId"))
                .and_then(|value| {
                    value
                        .as_str()
                        .map(ToOwned::to_owned)
                        .or_else(|| value.as_u64().map(|id| id.to_string()))
                })?;
            let place_id = body
                .get("place_id")
                .or_else(|| body.get("placeId"))
                .and_then(|value| {
                    value
                        .as_str()
                        .map(ToOwned::to_owned)
                        .or_else(|| value.as_u64().map(|id| id.to_string()))
                })?;
            Some(format!("{username}-{user_id}-{place_id}"))
        })
}

fn drain_tasks(
    tasks: &Arc<Mutex<HashMap<String, VecDeque<Value>>>>,
    client_key: &str,
) -> Vec<Value> {
    let Ok(mut guard) = tasks.lock() else {
        return Vec::new();
    };
    guard
        .get_mut(client_key)
        .map(|queue| queue.drain(..).collect())
        .unwrap_or_default()
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
    local sent, response = pcall(__bridge_request, {
        Url = __bridge_url,
        Method = "POST",
        Headers = { ["Content-Type"] = "application/json" },
        Body = body,
    })
    if sent and response and response.Body then
        local decodedOk, decoded = pcall(function()
            return __bridge_http:JSONDecode(response.Body)
        end)
        if decodedOk then return decoded end
    end
    return sent
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
    payload.client_key = tostring(payload.username or "client") .. "-" .. tostring(payload.user_id or "0") .. "-" .. tostring(payload.place_id or 0)
    return payload
end

local function __bridge_poll()
    local response = __bridge_post("poll", __bridge_player_payload())
    if type(response) == "table" and type(response.tasks) == "table" then
        return response.tasks
    end
    return {}
end

local bridge = {
    port = __bridge_port,
    endpoint = __bridge_url,
    post = __bridge_post,
    report = __bridge_post,
    poll = __bridge_poll,
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
