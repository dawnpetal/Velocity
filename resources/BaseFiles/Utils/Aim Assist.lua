-- Compatible with R6/R15 rigs, Hitbox folders, and non-player models.
-- Tested in Rivals and BadBusiness.
-- Does not function correctly in Hypershot.

local Players          = game:GetService("Players")
local RunService       = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Teams            = game:GetService("Teams")
local LP               = Players.LocalPlayer
local Camera           = workspace.CurrentCamera

pcall(function() RunService:UnbindFromRenderStep("AA") end)

local TEAM_CHECKERS                                = {
    [2788229376] = function(lp, tp)
        local function team(p)
            local c = p.Character; if not c then return nil end
            local v = c:FindFirstChild("Team") or c:FindFirstChild("TeamName")
            if v and (v:IsA("StringValue") or v:IsA("IntValue")) then return v.Value end
            local ok, t = pcall(function() return c:GetAttribute("Team") or c:GetAttribute("TeamName") end)
            if ok and t then return t end
        end
        local a, b = team(lp), team(tp)
        return (a == nil or b == nil) or a ~= b
    end,
}

local CFG                                          = {
    enabled     = false,
    fovRadius   = 180,
    maxDist     = 500,
    teamCheck   = true,
    snapHead    = true,
    keybind     = Enum.KeyCode.Q,
    prediction  = 0.0,
    humanError  = 0.0,
    reactionMax = 0.0,
    driftAmount = 0.0,
    missChance  = 0.0,
}

local locked                                       = nil
local listening                                    = false
local lastTarget                                   = nil
local selfModels                                   = {}

local noiseT, noiseX, noiseY                       = 0, math.random() * 6.28, math.random() * 6.28
local driftT, driftX, driftY, driftN               = 0, 0, 0, math.random() * 4 + 2
local missOn, missT, missD, missX, missY, missChkT = false, 0, 0, 0, 0, 0
local reactT, reactD, waiting                      = 0, 0, false
local pvPos, pvVel                                 = {}, {}

UserInputService.InputBegan:Connect(function(i, gpe)
    if gpe then return end
    if listening then
        if i.UserInputType == Enum.UserInputType.Keyboard then
            CFG.keybind = i.KeyCode; listening = false
        end
        return
    end
    if i.UserInputType == Enum.UserInputType.Keyboard and i.KeyCode == CFG.keybind then
        CFG.enabled = not CFG.enabled
        if not CFG.enabled then locked = nil end
    end
end)

local rp              = RaycastParams.new()
rp.FilterType         = Enum.RaycastFilterType.Exclude

local m2p, p2m, known = {}, {}, {}

local function uid(model)
    local u
    pcall(function() u = model:GetAttribute("UserId") or model:GetAttribute("PlayerId") end)
    if u then return u end
    for _, v in ipairs(model:GetChildren()) do
        if (v:IsA("IntValue") or v:IsA("NumberValue")) and (v.Name == "UserId" or v.Name == "PlayerId") then return v
            .Value end
        if v:IsA("ObjectValue") and (v.Name == "Player" or v.Name == "Owner") and v.Value and v.Value:IsA("Player") then return
            v.Value.UserId end
    end
end

local function match(model)
    if m2p[model] or not model.Parent then return end
    local pl = Players:GetPlayers()
    local id = uid(model)
    if id then
        for _, p in ipairs(pl) do
            if p.UserId == id then
                m2p[model] = p; if not p2m[p] then p2m[p] = model end; return
            end
        end
    end
    for _, p in ipairs(pl) do
        if p.Character == model then
            m2p[model] = p; if not p2m[p] then p2m[p] = model end; return
        end
    end
    local n = model.Name
    for _, p in ipairs(pl) do
        if p.Name == n or p.DisplayName == n then
            m2p[model] = p; if not p2m[p] then p2m[p] = model end; return
        end
    end
end

local function isChar(model)
    if not model:IsA("Model") then return false end
    if model:FindFirstChildOfClass("Humanoid") or model:FindFirstChild("HumanoidRootPart") or model:FindFirstChild("Root") then return true end
    local hb = model:FindFirstChild("Hitbox")
    return hb ~= nil and
    (hb:FindFirstChildOfClass("Humanoid") or hb:FindFirstChild("HumanoidRootPart") or hb:FindFirstChild("Root")) ~= nil
end

local function scan()
    for _, p in ipairs(Players:GetPlayers()) do
        if p.Character and not m2p[p.Character] then
            m2p[p.Character] = p; p2m[p] = p.Character; known[p.Character] = true
        end
    end
    local function walk(f)
        for _, c in ipairs(f:GetChildren()) do
            if c:IsA("Model") and not known[c] and isChar(c) then
                known[c] = true; match(c)
            end
            if c:IsA("Folder") or c:IsA("Model") then walk(c) end
        end
    end
    walk(workspace)
    for m in pairs(pvPos) do if not m.Parent then
            pvPos[m] = nil; pvVel[m] = nil
        end end
end

local function rebuildSelf()
    selfModels = {}
    if LP.Character then selfModels[LP.Character] = true end
    local alt = p2m[LP]; if alt then selfModels[alt] = true end
    for m in pairs(known) do if m2p[m] == LP then selfModels[m] = true end end
end

Players.PlayerAdded:Connect(function(p)
    p.CharacterAdded:Connect(function(c)
        m2p[c] = p; p2m[p] = c; known[c] = true; rebuildSelf()
    end)
end)
Players.PlayerRemoving:Connect(function(p)
    local m = p2m[p]; if m then
        m2p[m] = nil; known[m] = nil
    end; p2m[p] = nil
end)
LP.CharacterAdded:Connect(function() task.defer(rebuildSelf) end)

local scanT = 0
RunService.Heartbeat:Connect(function(dt)
    scanT = scanT + dt
    if scanT >= 2 then
        scanT = 0; scan(); rebuildSelf()
    end
end)
scan(); rebuildSelf()

local function root(model)
    if not model then return nil end
    local function find(m)
        local r = m:FindFirstChild("Root") or m:FindFirstChild("HumanoidRootPart")
        return (r and r:IsA("BasePart")) and r or nil
    end
    local r = find(model); if r then return r end
    local hb = model:FindFirstChild("Hitbox"); if hb then
        r = find(hb); if r then return r end
    end
    return model:FindFirstChildWhichIsA("MeshPart") or model:FindFirstChildWhichIsA("BasePart")
end

local function lockPos(model)
    if CFG.snapHead then
        local hb = model:FindFirstChild("Hitbox")
        local h  = (hb and hb:FindFirstChild("Head")) or model:FindFirstChild("Head")
        if h and h:IsA("BasePart") then return h.Position end
    end
    local r = root(model)
    return r and r.Position + Vector3.new(0, 0.5, 0)
end

local function alive(model)
    if not model or not model.Parent then return false end
    local h = model:FindFirstChild("Health")
    if h and (h:IsA("NumberValue") or h:IsA("IntValue")) then return h.Value > 0 end
    local hb  = model:FindFirstChild("Hitbox")
    local hum = (hb and hb:FindFirstChildOfClass("Humanoid")) or model:FindFirstChildOfClass("Humanoid")
    return hum and hum.Health > 0 or root(model) ~= nil
end

local function enemy(model)
    if not CFG.teamCheck then return true end
    local tp = m2p[model]
    if not tp then return true end
    if tp == LP then return false end
    local chk = TEAM_CHECKERS[game.PlaceId]
    if chk then
        local ok, r = pcall(chk, LP, tp); if ok and r ~= nil then return r end
    end
    local ok, r = pcall(function()
        local a, b = Teams:GetPlayerTeam(LP), Teams:GetPlayerTeam(tp)
        if not a and not b then return true end
        return (a and b) and a ~= b or true
    end)
    if ok and r ~= nil then return r end
    local a, b = LP.Team, tp.Team
    if not a and not b then return true end
    return (a and b) and a ~= b or true
end

local function visible(from, to, model)
    local dir = to - from
    if dir.Magnitude < 0.01 then return true end
    local filter = {}
    for m in pairs(selfModels) do filter[#filter + 1] = m end
    if model then
        filter[#filter + 1] = model
        local hb = model:FindFirstChild("Hitbox"); if hb then filter[#filter + 1] = hb end
        local bd = model:FindFirstChild("Body"); if bd then filter[#filter + 1] = bd end
    end
    rp.FilterDescendantsInstances = filter
    local ok, hit = pcall(workspace.Raycast, workspace, from, dir.Unit * dir.Magnitude, rp)
    if not ok or not hit then return true end
    return not hit.Instance or (model and hit.Instance:IsDescendantOf(model))
end

local function getVel(model, dt)
    local r = root(model)
    if not r then
        pvPos[model] = nil; return Vector3.new()
    end
    local pos    = r.Position
    local prev   = pvPos[model]; pvPos[model] = pos
    if not prev or dt <= 0 then return Vector3.new() end
    local raw    = (pos - prev) / dt
    local sm     = pvVel[model]
    raw          = sm and sm + (raw - sm) * 0.35 or raw
    pvVel[model] = raw
    return raw
end

local function nearest()
    local myR
    for m in pairs(selfModels) do
        myR = root(m); if myR then break end
    end

    local camPos      = Camera.CFrame.p
    local maxDSq      = CFG.maxDist ^ 2
    local mouse       = UserInputService:GetMouseLocation()
    local best, bestD = nil, math.huge

    local candidates  = {}
    for m in pairs(known) do candidates[#candidates + 1] = m end
    for _, p in ipairs(Players:GetPlayers()) do
        if p.Character and not known[p.Character] then candidates[#candidates + 1] = p.Character end
    end

    for _, model in ipairs(candidates) do
        if selfModels[model] or m2p[model] == LP then continue end
        if not alive(model) or not enemy(model) then continue end

        local tp = lockPos(model)
        if not tp then continue end

        if myR then
            local d = myR.Position - tp
            local wdSq = d.X ^ 2 + d.Y ^ 2 + d.Z ^ 2
            if wdSq < 9 or wdSq > maxDSq then continue end
        end

        local vp, on = Camera:WorldToViewportPoint(tp)
        if not on then continue end

        local vs = Camera.ViewportSize
        local sx, sy = vs.X * 0.5, vs.Y * 0.5
        local dx, dy = vp.X - sx, vp.Y - sy
        if dx ^ 2 + dy ^ 2 > CFG.fovRadius ^ 2 then continue end

        local mdSq = (vp.X - mouse.X) ^ 2 + (vp.Y - mouse.Y) ^ 2
        if mdSq >= bestD then continue end

        if visible(camPos, tp, model) then
            best = model; bestD = mdSq
        end
    end
    return best
end

local function noise(dt)
    if CFG.humanError <= 0 then return 0, 0 end
    noiseT = noiseT + dt; local a = CFG.humanError ^ 2 * 0.003
    return math.sin(noiseT * 1.7 + noiseX) * math.sin(noiseT * 0.43 + 1.1) * a,
        math.sin(noiseT * 2.3 + noiseY) * math.sin(noiseT * 0.61 + 2.7) * a
end

local function drift(dt)
    if CFG.driftAmount <= 0 then return 0, 0 end
    driftT = driftT + dt
    if driftT >= driftN then
        driftT = 0; driftN = math.random() * 5 + 2
        local a = CFG.driftAmount ^ 2 * 0.006
        driftX = (math.random() - 0.5) * a; driftY = (math.random() - 0.5) * a * 0.6
    end
    local f = math.sin(driftT / driftN * math.pi)
    return driftX * f, driftY * f
end

local function miss(dt)
    if CFG.missChance <= 0 then return 0, 0 end
    missChkT = missChkT + dt
    if missChkT > 3.5 + math.random() * 4 then
        missChkT = 0
        if not missOn and math.random() < CFG.missChance then
            missOn = true; missT = 0; missD = 0.12 + math.random() * 0.18
            local a = math.max(CFG.humanError, 0.15) * 0.014
            missX = (math.random() - 0.5) * a; missY = (math.random() - 0.5) * a
        end
    end
    if missOn then
        missT = missT + dt; local p = missT / missD
        if p >= 1 then
            missOn = false; return 0, 0
        end
        return missX * math.sin(p * math.pi), missY * math.sin(p * math.pi)
    end
    return 0, 0
end

local nd     = Drawing.new
local CFOV   = Color3.fromRGB(66, 133, 244)
local CLOCK  = Color3.fromRGB(251, 188, 5)
local DASH_N = 24
local dashes = {}
for i = 1, DASH_N do
    local d = nd("Line"); d.Thickness = 1.2; d.Transparency = 0.65; d.Visible = false; dashes[i] = d
end
local ring        = nd("Circle"); ring.Filled = false; ring.Radius = 14; ring.Thickness = 1.5; ring.Color = CLOCK; ring.Transparency = 1; ring.Visible = false
local dot         = nd("Circle"); dot.Filled = true; dot.Radius = 2.5; dot.Color = CLOCK; dot.Transparency = 1; dot.Visible = false
local lh          = nd("Line"); lh.Thickness = 1; lh.Color = CLOCK; lh.Transparency = 1; lh.Visible = false
local lv          = nd("Line"); lv.Thickness = 1; lv.Color = CLOCK; lv.Transparency = 1; lv.Visible = false
local tick_       = 0

local function drawFov(cx, cy, col, a)
    local step, arc = math.pi * 2 / DASH_N, math.pi / DASH_N
    local r = CFG.fovRadius
    for i = 1, DASH_N do
        local b                = (i - 1) * step
        dashes[i].From         = Vector2.new(cx + r * math.cos(b), cy + r * math.sin(b))
        dashes[i].To           = Vector2.new(cx + r * math.cos(b + arc), cy + r * math.sin(b + arc))
        dashes[i].Color        = col; dashes[i].Transparency = a; dashes[i].Visible = true
    end
end
local function hideFov() for i = 1, DASH_N do dashes[i].Visible = false end end
local function hideAll()
    hideFov(); ring.Visible = false; dot.Visible = false; lh.Visible = false; lv.Visible = false
end

RunService:BindToRenderStep("AA", Enum.RenderPriority.Camera.Value, function(dt)
    local vs     = Camera.ViewportSize
    local cx, cy = vs.X * 0.5, vs.Y * 0.5

    if not CFG.enabled then
        hideAll(); locked = nil; lastTarget = nil; waiting = false; return
    end

    if locked and (not locked.Parent or not alive(locked)) then locked = nil end
    local t = locked or nearest()

    if t ~= lastTarget then
        lastTarget = t; waiting = t ~= nil; reactT = 0
        reactD = math.random() * math.max(CFG.reactionMax, 0)
        noiseX = math.random() * 6.28; noiseY = math.random() * 6.28
        driftX = 0; driftY = 0; driftT = 0; missOn = false; missChkT = 0
        if t then
            pvPos[t] = nil; pvVel[t] = nil
        end
    end
    locked = t

    if not t then
        drawFov(cx, cy, CFOV, 0.6); ring.Visible = false; dot.Visible = false; lh.Visible = false; lv.Visible = false
        return
    end

    local tp = lockPos(t)
    if not tp then
        locked = nil; return
    end

    if waiting then
        reactT = reactT + dt
        if reactT < reactD then
            drawFov(cx, cy, CLOCK, 0.45); return
        end
        waiting = false
    end

    if CFG.prediction > 0 then
        local vel  = getVel(t, dt)
        local dist = (tp - Camera.CFrame.p).Magnitude
        tp         = tp + vel * (dist / 300) * CFG.prediction
    end

    local camCF = Camera.CFrame
    local dir   = tp - camCF.p
    if dir.Magnitude < 0.001 then return end
    local aim = dir.Unit

    local nx, ny = noise(dt)
    local dx, dy = drift(dt)
    local mx, my = miss(dt)
    local ox, oy = nx + dx + mx, ny + dy + my
    if ox ~= 0 or oy ~= 0 then
        local sc = 2 * math.tan(math.rad(Camera.FieldOfView) * 0.5)
        aim = (aim + camCF.RightVector * ox * sc - camCF.UpVector * oy * sc).Unit
    end

    Camera.CFrame = CFrame.new(camCF.p, camCF.p + aim)
    drawFov(cx, cy, CLOCK, 0.45)

    local vp, on = Camera:WorldToViewportPoint(tp)
    local wx = on and vp.X or cx
    local wy = on and vp.Y or cy

    ring.Position = Vector2.new(wx, wy); dot.Position = Vector2.new(wx, wy)
    ring.Visible = true; dot.Visible = true
    local g = ring.Radius + 5
    lh.From = Vector2.new(wx - g, wy); lh.To = Vector2.new(wx + g, wy); lh.Visible = true
    lv.From = Vector2.new(wx, wy - g); lv.To = Vector2.new(wx, wy + g); lv.Visible = true
    tick_ = tick_ + 1
    if tick_ % 2 == 0 then ring.Transparency = 0.2 + math.abs(math.sin(tick_ * 0.06)) * 0.7 end
end)

local gui = Instance.new("ScreenGui")
gui.Name = "AA"; gui.ResetOnSpawn = false; gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
if syn and syn.protect_gui then
    syn.protect_gui(gui); gui.Parent = game:GetService("CoreGui")
elseif protect_gui then
    protect_gui(gui); gui.Parent = game:GetService("CoreGui")
elseif gethui then
    gui.Parent = gethui()
else
    gui.Parent = game:GetService("CoreGui")
end
if getgenv then getgenv().__aimGui = gui end

local K = {
    bg     = Color3.fromRGB(8, 9, 12),
    surf   = Color3.fromRGB(14, 15, 20),
    line   = Color3.fromRGB(30, 32, 42),
    lineHi = Color3.fromRGB(55, 58, 78),
    txt    = Color3.fromRGB(218, 220, 228),
    dim    = Color3.fromRGB(88, 92, 110),
    mute   = Color3.fromRGB(38, 40, 52),
    gold   = Color3.fromRGB(220, 162, 48),
    goldB  = Color3.fromRGB(38, 28, 8),
    grn    = Color3.fromRGB(56, 178, 84),
    grnB   = Color3.fromRGB(6, 26, 14),
    red    = Color3.fromRGB(188, 52, 52),
    redB   = Color3.fromRGB(30, 6, 6),
    trk    = Color3.fromRGB(24, 26, 34),
}

local function el(cls, p, par)
    local o = Instance.new(cls); o.BorderSizePixel = 0
    for k, v in pairs(p) do o[k] = v end
    if par then o.Parent = par end; return o
end
local function rnd(p, r)
    local c = Instance.new("UICorner"); c.CornerRadius = UDim.new(0, r or 4); c.Parent = p
end
local function str(p, col, t)
    local s = Instance.new("UIStroke"); s.Color = col or K.line; s.Thickness = t or 1; s.ApplyStrokeMode = Enum
    .ApplyStrokeMode.Border; s.Parent = p
end
local function row(p, g)
    local l = Instance.new("UIListLayout"); l.FillDirection = Enum.FillDirection.Horizontal; l.VerticalAlignment = Enum
    .VerticalAlignment.Center; l.SortOrder = Enum.SortOrder.LayoutOrder; l.Padding = UDim.new(0, g or 0); l.Parent = p
end
local function col(p, g)
    local l = Instance.new("UIListLayout"); l.SortOrder = Enum.SortOrder.LayoutOrder; l.Padding = UDim.new(0, g or 0); l.Parent =
    p
end
local function pad(p, x, y)
    local u = Instance.new("UIPadding"); u.PaddingLeft = UDim.new(0, x); u.PaddingRight = UDim.new(0, x); u.PaddingTop =
    UDim.new(0, y or x); u.PaddingBottom = UDim.new(0, y or x); u.Parent = p
end

local sdrag, sset, strk_, sfmt, svl, smn, smx = false, nil, nil, nil, nil, 0, 1
UserInputService.InputEnded:Connect(function(i) if i.UserInputType == Enum.UserInputType.MouseButton1 then sdrag = false end end)
UserInputService.InputChanged:Connect(function(i)
    if not sdrag or i.UserInputType ~= Enum.UserInputType.MouseMovement then return end
    local r = math.clamp((i.Position.X - strk_.AbsolutePosition.X) / strk_.AbsoluteSize.X, 0, 1)
    local v = smn + r * (smx - smn); sset(v)
    strk_.Fill.Size = UDim2.new(r, 0, 1, 0); strk_.Knob.Position = UDim2.new(r, 0, 0.5, 0)
    if svl then svl.Text = sfmt(v) end
end)

local function track(parent, ir, h)
    local trk = el("Frame", { Name = "Track", Size = UDim2.new(1, 0, 0, h or 2), BackgroundColor3 = K.trk }, parent); rnd(
    trk, 2)
    local fill = el("Frame", { Name = "Fill", Size = UDim2.new(ir, 0, 1, 0), BackgroundColor3 = K.gold }, trk); rnd(fill,
        2)
    local knob = el("Frame",
        { Name = "Knob", Size = UDim2.new(0, 6, 0, 6), BackgroundColor3 = K.txt, AnchorPoint = Vector2.new(0.5, 0.5), Position =
        UDim2.new(ir, 0, 0.5, 0), ZIndex = 3 }, trk); rnd(knob, 3)
    return trk
end

local function bslide(parent, label, lo, ir, mn, mx, onSet)
    el("TextLabel", {
        Size = UDim2.new(0, 0, 1, 0),
        AutomaticSize = Enum.AutomaticSize.X,
        BackgroundTransparency = 1,
        Text = label,
        TextColor3 = K.dim,
        Font = Enum.Font.GothamBold,
        TextSize = 8,
        LayoutOrder = lo
    }, parent)
    local wrap = el("Frame", { Size = UDim2.new(0, 52, 0, 2), BackgroundTransparency = 1, LayoutOrder = lo + 1 }, parent)
    local trk = track(wrap, ir)
    wrap.InputBegan:Connect(function(i)
        if i.UserInputType == Enum.UserInputType.MouseButton1 then
            sdrag = true; strk_ = trk; smn = mn; smx = mx; svl = nil; sfmt = function() return "" end; sset = onSet
        end
    end)
    return trk
end

local function vsep(parent, lo)
    el("Frame", { Size = UDim2.new(0, 1, 0, 14), BackgroundColor3 = K.line, LayoutOrder = lo }, parent)
end

local BY = 10
local bar = el("Frame", {
    Name = "Bar",
    Size = UDim2.new(0, 0, 0, 32),
    Position = UDim2.new(0.5, 0, 0, BY),
    AnchorPoint = Vector2.new(0.5, 0),
    AutomaticSize = Enum.AutomaticSize.X,
    BackgroundColor3 = K.bg,
    ClipsDescendants = false
}, gui)
rnd(bar, 7); str(bar, K.line); pad(bar, 10, 0); row(bar, 8)

local pill = el("TextButton", { Size = UDim2.new(0, 28, 0, 15), BackgroundColor3 = K.mute, Text = "", LayoutOrder = 1 },
    bar); rnd(pill, 8)
local knob = el("Frame",
    { Size = UDim2.new(0, 9, 0, 9), BackgroundColor3 = K.txt, Position = UDim2.new(0, 2, 0.5, 0), AnchorPoint = Vector2
    .new(0, 0.5) }, pill); rnd(knob, 5)

vsep(bar, 2)

local sdot = el("Frame", { Size = UDim2.new(0, 6, 0, 6), BackgroundColor3 = K.dim, LayoutOrder = 3 }, bar); rnd(sdot, 3)
local slbl = el("TextLabel", {
    Size = UDim2.new(0, 26, 1, 0),
    BackgroundTransparency = 1,
    Text = "OFF",
    TextColor3 = K.dim,
    Font = Enum.Font.GothamBold,
    TextSize = 9,
    TextXAlignment = Enum.TextXAlignment.Left,
    LayoutOrder = 4
}, bar)

vsep(bar, 5)

local fovTrk = bslide(bar, "FOV", 6, (CFG.fovRadius - 30) / 470, 30, 500, function(v)
    CFG.fovRadius = math.floor(v + 0.5)
    local r = (CFG.fovRadius - 30) / 470
    fovTrk.Fill.Size = UDim2.new(r, 0, 1, 0); fovTrk.Knob.Position = UDim2.new(r, 0, 0.5, 0)
end)

vsep(bar, 8)

local leadTrk = bslide(bar, "LEAD", 9, CFG.prediction, 0, 1, function(v)
    CFG.prediction = math.floor(v * 100 + 0.5) / 100
    leadTrk.Fill.Size = UDim2.new(CFG.prediction, 0, 1, 0); leadTrk.Knob.Position = UDim2.new(CFG.prediction, 0, 0.5, 0)
end)

vsep(bar, 11)

local kbf = el("Frame", {
    Size = UDim2.new(0, 0, 0, 20),
    AutomaticSize = Enum.AutomaticSize.X,
    BackgroundColor3 = K.surf,
    LayoutOrder = 12
}, bar); rnd(kbf, 4); str(kbf, K.line); pad(kbf, 6, 0)
local kbl = el("TextLabel", {
    Size = UDim2.new(0, 0, 1, 0),
    AutomaticSize = Enum.AutomaticSize.X,
    BackgroundTransparency = 1,
    Text = "Q",
    TextColor3 = K.gold,
    Font = Enum.Font.GothamBold,
    TextSize = 9
}, kbf)
el("TextButton", { Size = UDim2.new(1, 0, 1, 0), BackgroundTransparency = 1, Text = "" }, kbf).MouseButton1Click:Connect(function() listening = true end)

local exBtn = el("TextButton", {
    Size = UDim2.new(0, 20, 0, 20),
    BackgroundColor3 = K.surf,
    Text = "↓",
    TextColor3 = K.dim,
    Font = Enum.Font.GothamBold,
    TextSize = 10,
    LayoutOrder = 13
}, bar); rnd(exBtn, 4); str(exBtn, K.line)

local dd = el("Frame", {
    Name = "DD",
    Size = UDim2.new(0, 244, 0, 0),
    Position = UDim2.new(0.5, 0, 0, BY + 38),
    AnchorPoint = Vector2.new(0.5, 0),
    AutomaticSize = Enum.AutomaticSize.Y,
    BackgroundColor3 = K.bg,
    Visible = false,
    ZIndex = 20
}, gui)
rnd(dd, 7); str(dd, K.line); pad(dd, 10, 8); col(dd, 0)

local dri = 0
local function drow(h)
    dri = dri + 1; return el("Frame", { Size = UDim2.new(1, 0, 0, h or 24), BackgroundTransparency = 1, LayoutOrder = dri },
        dd)
end
local function ddiv()
    dri = dri + 1; el("Frame", { Size = UDim2.new(1, 0, 0, 1), BackgroundColor3 = K.line, LayoutOrder = dri }, dd)
end

local function dtog(label, get, set)
    local r = drow(24); row(r, 0)
    el("TextLabel", {
        Size = UDim2.new(1, -30, 1, 0),
        BackgroundTransparency = 1,
        Text = label,
        TextColor3 = K.dim,
        Font = Enum.Font.GothamMedium,
        TextSize = 9,
        TextXAlignment = Enum.TextXAlignment.Left
    }, r)
    local p = el("TextButton", { Size = UDim2.new(0, 26, 0, 13), BackgroundColor3 = get() and K.grn or K.mute, Text = "" },
        r); rnd(p, 7)
    local k = el("Frame", {
        Size = UDim2.new(0, 8, 0, 8),
        BackgroundColor3 = K.txt,
        AnchorPoint = Vector2.new(0, 0.5),
        Position = get() and UDim2.new(1, -10, 0.5, 0) or UDim2.new(0, 2, 0.5, 0)
    }, p); rnd(k, 4)
    p.MouseButton1Click:Connect(function()
        set(not get()); p.BackgroundColor3 = get() and K.grn or K.mute
        k.Position = get() and UDim2.new(1, -10, 0.5, 0) or UDim2.new(0, 2, 0.5, 0)
    end)
end

local function dsld(label, get, set, mn, mx, fmt)
    local r = drow(24); row(r, 0)
    el("TextLabel", {
        Size = UDim2.new(0, 70, 1, 0),
        BackgroundTransparency = 1,
        Text = label,
        TextColor3 = K.dim,
        Font = Enum.Font.GothamMedium,
        TextSize = 9,
        TextXAlignment = Enum.TextXAlignment.Left
    }, r)
    local vl = el("TextLabel", {
        Size = UDim2.new(0, 34, 1, 0),
        BackgroundTransparency = 1,
        Text = fmt(get()),
        TextColor3 = K.gold,
        Font = Enum.Font.GothamBold,
        TextSize = 9,
        TextXAlignment = Enum.TextXAlignment.Right
    }, r)
    local wrap = el("Frame", { Size = UDim2.new(1, -104, 0, 2), BackgroundTransparency = 1 }, r)
    local trk = track(wrap, (get() - mn) / (mx - mn))
    r.InputBegan:Connect(function(i)
        if i.UserInputType == Enum.UserInputType.MouseButton1 then
            sdrag = true; sset = set; strk_ = trk; sfmt = fmt; svl = vl; smn = mn; smx = mx
        end
    end)
end

dtog("Team check", function() return CFG.teamCheck end, function(v) CFG.teamCheck = v end)
dtog("Snap to head", function() return CFG.snapHead end, function(v) CFG.snapHead = v end)
ddiv()
dsld("Distance", function() return CFG.maxDist end, function(v) CFG.maxDist = math.floor(v + .5) end, 50, 2000,
    function(v) return math.floor(v + .5) .. "m" end)
dsld("Human err", function() return CFG.humanError end, function(v) CFG.humanError = math.floor(v * 100 + .5) / 100 end,
    0, 1, function(v) return math.floor(v * 100 + .5) .. "%" end)
dsld("Drift", function() return CFG.driftAmount end, function(v) CFG.driftAmount = math.floor(v * 100 + .5) / 100 end, 0,
    1, function(v) return math.floor(v * 100 + .5) .. "%" end)
dsld("Miss", function() return CFG.missChance end, function(v) CFG.missChance = math.floor(v * 100 + .5) / 100 end, 0,
    0.5, function(v) return math.floor(v * 100 + .5) .. "%" end)
dsld("Reaction", function() return CFG.reactionMax end, function(v) CFG.reactionMax = math.floor(v * 1000 + .5) / 1000 end,
    0, 0.3, function(v) return math.floor(v * 1000) .. "ms" end)

pill.MouseButton1Click:Connect(function()
    CFG.enabled = not CFG.enabled
    if not CFG.enabled then locked = nil end
    pill.BackgroundColor3 = CFG.enabled and K.grn or K.mute
    knob.Position = CFG.enabled and UDim2.new(1, -11, 0.5, 0) or UDim2.new(0, 2, 0.5, 0)
end)

local open = false
exBtn.MouseButton1Click:Connect(function()
    open = not open; dd.Visible = open
    exBtn.Text = open and "↑" or "↓"
    str(exBtn, open and K.lineHi or K.line)
end)

local drag, ds, bs = false, nil, nil
bar.InputBegan:Connect(function(i)
    if i.UserInputType ~= Enum.UserInputType.MouseButton1 then return end
    drag = true; ds = i.Position; bs = bar.Position
    i.Changed:Connect(function() if i.UserInputState == Enum.UserInputState.End then drag = false end end)
end)
UserInputService.InputChanged:Connect(function(i)
    if not drag or i.UserInputType ~= Enum.UserInputType.MouseMovement then return end
    local ny = bs.Y.Offset + (i.Position.Y - ds.Y)
    bar.Position = UDim2.new(0.5, 0, 0, ny); dd.Position = UDim2.new(0.5, 0, 0, ny + 38)
end)

local prevLocked
RunService.Heartbeat:Connect(function()
    local name = listening and "···" or CFG.keybind.Name:sub(1, 6)
    kbl.Text = name; kbl.TextColor3 = listening and K.red or K.gold
    kbf.BackgroundColor3 = listening and K.redB or K.surf; str(kbf, listening and K.red or K.line)

    if locked == prevLocked then return end
    prevLocked = locked
    if locked and CFG.enabled then
        slbl.Text = "LCK"; slbl.TextColor3 = K.gold; sdot.BackgroundColor3 = K.gold
    elseif CFG.enabled then
        slbl.Text = "ON"; slbl.TextColor3 = K.grn; sdot.BackgroundColor3 = K.grn
    else
        slbl.Text = "OFF"; slbl.TextColor3 = K.dim; sdot.BackgroundColor3 = K.dim
    end
end)