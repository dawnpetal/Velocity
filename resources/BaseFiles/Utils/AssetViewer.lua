local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local ContentProvider = game:GetService("ContentProvider")
local MarketplaceService = game:GetService("MarketplaceService")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local HttpService = game:GetService("HttpService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local C = {
    BG      = Color3.fromRGB(18, 18, 20),
    SURFACE = Color3.fromRGB(28, 28, 32),
    BORDER  = Color3.fromRGB(50, 50, 58),
    TEXT    = Color3.fromRGB(240, 240, 245),
    MUTED   = Color3.fromRGB(120, 120, 135),
    BLUE    = Color3.fromRGB(80, 160, 255),
    GREEN   = Color3.fromRGB(72, 200, 120),
    RED     = Color3.fromRGB(230, 65, 65),
    YELLOW  = Color3.fromRGB(240, 185, 40),
}

local TI = {
    FAST   = TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
    NORMAL = TweenInfo.new(0.28, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
    POP    = TweenInfo.new(0.32, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
    CLOSE  = TweenInfo.new(0.22, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
}

local ASSET_TYPES = {
    [1] = "Image",
    [2] = "T-Shirt",
    [3] = "Audio",
    [4] = "Mesh",
    [5] = "Lua",
    [8] = "Hat",
    [9] = "Place",
    [10] = "Model",
    [11] = "Shirt",
    [12] = "Pants",
    [13] = "Decal",
    [17] = "Head",
    [18] = "Face",
    [19] = "Gear",
    [21] = "Badge",
    [24] = "Animation",
    [34] = "Game Pass",
    [38] = "Plugin",
    [40] = "MeshPart",
    [41] = "Hair Acc",
    [42] = "Face Acc",
    [43] = "Neck Acc",
    [44] = "Shoulder Acc",
    [45] = "Front Acc",
    [46] = "Back Acc",
    [47] = "Waist Acc",
    [48] = "Climb Anim",
    [49] = "Death Anim",
    [50] = "Fall Anim",
    [51] = "Idle Anim",
    [52] = "Jump Anim",
    [53] = "Run Anim",
    [54] = "Swim Anim",
    [55] = "Walk Anim",
    [60] = "Emote",
    [61] = "Video",
    [63] = "Shirt Acc",
    [64] = "Pants Acc",
    [65] = "Jacket Acc",
    [72] = "Font Family",
    [75] = "Eyebrow Acc",
    [76] = "Eyelash Acc",
    [78] = "Dynamic Head",
}

local W, H = 580, 460

local function tween(obj, props, info)
    local t = TweenService:Create(obj, info or TI.NORMAL, props)
    t:Play()
    return t
end

local function corner(parent, r)
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, r or 8)
    c.Parent = parent
end

local function stroke(parent, color, thickness)
    local s = Instance.new("UIStroke")
    s.Color = color or C.BORDER
    s.Thickness = thickness or 1
    s.Parent = parent
end

local function frame(parent, props)
    local f = Instance.new("Frame")
    f.BackgroundColor3 = props.bg or C.SURFACE
    f.BorderSizePixel = 0
    if props.size then f.Size = props.size end
    if props.pos then f.Position = props.pos end
    if props.clip then f.ClipsDescendants = true end
    if props.zi then f.ZIndex = props.zi end
    f.Parent = parent
    return f
end

local function label(parent, props)
    local l = Instance.new("TextLabel")
    l.BackgroundTransparency = 1
    l.BorderSizePixel = 0
    l.Text = props.text or ""
    l.TextColor3 = props.color or C.TEXT
    l.TextSize = props.size or 12
    l.Font = props.font or Enum.Font.Gotham
    l.TextXAlignment = props.xa or Enum.TextXAlignment.Left
    l.TextYAlignment = props.ya or Enum.TextYAlignment.Center
    l.TextWrapped = props.wrap or false
    if props.sz then l.Size = props.sz end
    if props.pos then l.Position = props.pos end
    if props.zi then l.ZIndex = props.zi end
    l.Parent = parent
    return l
end

local function button(parent, props)
    local b = Instance.new("TextButton")
    b.BackgroundColor3 = props.bg or C.SURFACE
    b.BorderSizePixel = 0
    b.Text = props.text or ""
    b.TextColor3 = props.color or C.TEXT
    b.TextSize = props.size or 12
    b.Font = props.font or Enum.Font.GothamBold
    b.AutoButtonColor = false
    if props.sz then b.Size = props.sz end
    if props.pos then b.Position = props.pos end
    if props.zi then b.ZIndex = props.zi end
    b.Parent = parent
    corner(b, props.r or 6)
    if props.hover then
        b.MouseEnter:Connect(function() tween(b, { BackgroundColor3 = props.hover }, TI.FAST) end)
        b.MouseLeave:Connect(function() tween(b, { BackgroundColor3 = props.bg or C.SURFACE }, TI.FAST) end)
    end
    return b
end

local Viewer = {}
Viewer.__index = Viewer

function Viewer.new()
    local self = setmetatable({}, Viewer)
    self.assetId = nil
    self.loading = false
    self.minimized = false
    self.storedH = H
    self.heartbeat = nil
    self:build()
    return self
end

function Viewer:build()
    self.gui = Instance.new("ScreenGui")
    self.gui.Name = "AV_" .. HttpService:GenerateGUID(false):sub(1, 8)
    self.gui.ResetOnSpawn = false
    self.gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    self.gui.IgnoreGuiInset = true
    self.gui.Parent = playerGui

    self.win = frame(self.gui, {
        bg = C.BG,
        size = UDim2.new(0, W, 0, H),
        pos = UDim2.new(0.5, -W / 2, 0.5, -H / 2),
        clip = true,
    })
    corner(self.win, 10)
    stroke(self.win, C.BORDER, 1)

    self:buildTitleBar()
    self:buildBody()
    self:buildDrag()
end

function Viewer:buildTitleBar()
    local bar = frame(self.win, {
        bg = C.SURFACE,
        size = UDim2.new(1, 0, 0, 40),
        zi = 10,
    })
    corner(bar, 10)
    local cover = frame(bar, {
        bg = C.SURFACE,
        size = UDim2.new(1, 0, 0, 10),
        pos = UDim2.new(0, 0, 1, -10),
        zi = 10,
    })
    cover.ZIndex = 10

    label(bar, {
        text = "Asset Viewer",
        color = C.TEXT,
        size = 13,
        font = Enum.Font.GothamBold,
        sz = UDim2.new(1, -100, 1, 0),
        pos = UDim2.new(0, 14, 0, 0),
        zi = 11,
    })

    self.minBtn = button(bar, {
        text = "−",
        bg = Color3.fromRGB(50, 50, 60),
        hover = Color3.fromRGB(70, 70, 85),
        color = C.TEXT,
        size = 14,
        sz = UDim2.new(0, 28, 0, 28),
        pos = UDim2.new(1, -64, 0, 6),
        zi = 12,
    })
    self.closeBtn = button(bar, {
        text = "×",
        bg = Color3.fromRGB(50, 50, 60),
        hover = Color3.fromRGB(200, 55, 55),
        color = C.TEXT,
        size = 16,
        sz = UDim2.new(0, 28, 0, 28),
        pos = UDim2.new(1, -32, 0, 6),
        zi = 12,
    })

    self.titleBar = bar
    self.closeBtn.MouseButton1Click:Connect(function() self:close() end)
    self.minBtn.MouseButton1Click:Connect(function() self:toggleMin() end)
end

function Viewer:buildBody()
    local body = frame(self.win, {
        bg = Color3.new(0, 0, 0),
        size = UDim2.new(1, -20, 1, -52),
        pos = UDim2.new(0, 10, 0, 44),
    })
    body.BackgroundTransparency = 1

    local inputRow = frame(body, {
        bg = C.SURFACE,
        size = UDim2.new(1, 0, 0, 40),
    })
    corner(inputRow, 7)
    stroke(inputRow, C.BORDER, 1)

    self.input = Instance.new("TextBox")
    self.input.BackgroundTransparency = 1
    self.input.BorderSizePixel = 0
    self.input.Size = UDim2.new(1, -90, 0, 28)
    self.input.Position = UDim2.new(0, 12, 0, 6)
    self.input.Text = ""
    self.input.PlaceholderText = "Asset ID, URL, or rbxassetid://..."
    self.input.TextColor3 = C.TEXT
    self.input.PlaceholderColor3 = C.MUTED
    self.input.TextSize = 12
    self.input.Font = Enum.Font.RobotoMono
    self.input.TextXAlignment = Enum.TextXAlignment.Left
    self.input.ClearTextOnFocus = false
    self.input.Parent = inputRow

    self.loadBtn = button(inputRow, {
        text = "Load",
        bg = C.BLUE,
        hover = Color3.fromRGB(100, 180, 255),
        color = C.TEXT,
        size = 12,
        font = Enum.Font.GothamBold,
        sz = UDim2.new(0, 68, 0, 28),
        pos = UDim2.new(1, -76, 0, 6),
        r = 5,
    })

    self.imgFrame = frame(body, {
        bg = C.SURFACE,
        size = UDim2.new(1, 0, 1, -84),
        pos = UDim2.new(0, 0, 0, 48),
        clip = true,
    })
    corner(self.imgFrame, 7)
    stroke(self.imgFrame, C.BORDER, 1)

    self.placeholder = label(self.imgFrame, {
        text = "Enter an Asset ID to preview",
        color = C.MUTED,
        size = 12,
        sz = UDim2.new(1, 0, 1, 0),
        xa = Enum.TextXAlignment.Center,
    })

    self.imgLabel = Instance.new("ImageButton")
    self.imgLabel.BackgroundTransparency = 1
    self.imgLabel.BorderSizePixel = 0
    self.imgLabel.Size = UDim2.new(1, -12, 1, -12)
    self.imgLabel.Position = UDim2.new(0, 6, 0, 6)
    self.imgLabel.Image = ""
    self.imgLabel.ScaleType = Enum.ScaleType.Fit
    self.imgLabel.AutoButtonColor = false
    self.imgLabel.Visible = false
    self.imgLabel.Parent = self.imgFrame
    corner(self.imgLabel, 5)

    self.spinner = Instance.new("ImageLabel")
    self.spinner.BackgroundTransparency = 1
    self.spinner.Size = UDim2.new(0, 24, 0, 24)
    self.spinner.Position = UDim2.new(0.5, -12, 0.5, -12)
    self.spinner.Image = "rbxasset://textures/ui/Controls/button_pressed.png"
    self.spinner.ImageColor3 = C.BLUE
    self.spinner.Visible = false
    self.spinner.Parent = self.imgFrame

    self.audioFrame = frame(body, {
        bg = C.SURFACE,
        size = UDim2.new(1, 0, 1, -84),
        pos = UDim2.new(0, 0, 0, 48),
    })
    corner(self.audioFrame, 7)
    stroke(self.audioFrame, C.BORDER, 1)
    self.audioFrame.Visible = false

    local audioIcon = label(self.audioFrame, {
        text = "♪",
        color = C.BLUE,
        size = 36,
        sz = UDim2.new(1, 0, 0, 56),
        pos = UDim2.new(0, 0, 0, 40),
        xa = Enum.TextXAlignment.Center,
    })

    self.audioName = label(self.audioFrame, {
        text = "",
        color = C.TEXT,
        size = 13,
        font = Enum.Font.GothamBold,
        sz = UDim2.new(1, -24, 0, 20),
        pos = UDim2.new(0, 12, 0, 104),
        xa = Enum.TextXAlignment.Center,
    })

    self.audioStatus = label(self.audioFrame, {
        text = "Loading...",
        color = C.MUTED,
        size = 11,
        sz = UDim2.new(1, -24, 0, 18),
        pos = UDim2.new(0, 12, 0, 126),
        xa = Enum.TextXAlignment.Center,
    })

    self.playBtn = button(self.audioFrame, {
        text = "▶  Play",
        bg = C.BLUE,
        hover = Color3.fromRGB(100, 180, 255),
        color = C.TEXT,
        size = 12,
        sz = UDim2.new(0, 100, 0, 32),
        pos = UDim2.new(0.5, -50, 0, 160),
        r = 7,
    })

    self.sound = Instance.new("Sound")
    self.sound.Parent = SoundService
    self.isPlaying = false

    self.playBtn.MouseButton1Click:Connect(function()
        if self.sound.SoundId == "" then return end
        if self.isPlaying then
            self.sound:Stop()
            self.isPlaying = false
            self.playBtn.Text = "▶  Play"
        else
            self.sound:Play()
            self.isPlaying = true
            self.playBtn.Text = "■  Stop"
        end
    end)

    self.sound.Ended:Connect(function()
        self.isPlaying = false
        self.playBtn.Text = "▶  Play"
    end)

    self.infoRow = frame(body, {
        bg = Color3.new(0, 0, 0),
        size = UDim2.new(1, 0, 0, 28),
        pos = UDim2.new(0, 0, 1, -28),
    })
    self.infoRow.BackgroundTransparency = 1

    self.statusLbl = label(self.infoRow, {
        text = "Ready",
        color = C.MUTED,
        size = 11,
        sz = UDim2.new(0.6, 0, 1, 0),
    })

    self.metaLbl = label(self.infoRow, {
        text = "",
        color = C.MUTED,
        size = 11,
        sz = UDim2.new(0.4, 0, 1, 0),
        pos = UDim2.new(0.6, 0, 0, 0),
        xa = Enum.TextXAlignment.Right,
    })

    self.loadBtn.MouseButton1Click:Connect(function()
        if not self.loading then self:load() end
    end)
    self.input.FocusLost:Connect(function(enter)
        if enter and not self.loading then self:load() end
    end)

    self.imgLabel.MouseButton1Click:Connect(function()
        if self.imgLabel.Image ~= "" then self:zoom() end
    end)
end

function Viewer:buildDrag()
    local conn
    self.titleBar.InputBegan:Connect(function(input)
        if input.UserInputType ~= Enum.UserInputType.MouseButton1 then return end
        local dragStart = input.Position
        local startPos = self.win.Position
        if conn then conn:Disconnect() end
        conn = UserInputService.InputChanged:Connect(function(m)
            if m.UserInputType ~= Enum.UserInputType.MouseMovement then return end
            local d = m.Position - dragStart
            local vp = workspace.CurrentCamera.ViewportSize
            local x = math.clamp(startPos.X.Offset + d.X, 0, vp.X - self.win.AbsoluteSize.X)
            local y = math.clamp(startPos.Y.Offset + d.Y, 0, vp.Y - self.win.AbsoluteSize.Y)
            self.win.Position = UDim2.new(0, x, 0, y)
        end)
    end)
    UserInputService.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 and conn then
            conn:Disconnect()
            conn = nil
        end
    end)
end

function Viewer:parseId(raw)
    raw = raw:gsub("%s+", "")
    if raw == "" then return nil end
    for _, p in ipairs({
        "rbxassetid://(%d+)", "rbxasset://(%d+)",
        "/catalog/(%d+)/", "/library/(%d+)/",
        "assetId=(%d+)", "^(%d+)$",
    }) do
        local m = raw:match(p)
        if m then
            local n = tonumber(m)
            return (n and n > 0) and n or nil
        end
    end
end

function Viewer:setStatus(msg, color)
    self.statusLbl.Text = msg
    self.statusLbl.TextColor3 = color or C.MUTED
end

function Viewer:setLoading(v)
    self.loading = v
    self.spinner.Visible = v
    self.loadBtn.Text = v and "..." or "Load"
    self.loadBtn.BackgroundColor3 = v and C.MUTED or C.BLUE
    if v then
        if self.heartbeat then self.heartbeat:Disconnect() end
        self.heartbeat = RunService.Heartbeat:Connect(function()
            self.spinner.Rotation = (self.spinner.Rotation + 6) % 360
        end)
    else
        if self.heartbeat then
            self.heartbeat:Disconnect()
            self.heartbeat = nil
        end
    end
end

function Viewer:showImageMode()
    self.imgFrame.Visible = true
    self.audioFrame.Visible = false
    self.imgLabel.Visible = false
    self.placeholder.Visible = true
end

function Viewer:showAudioMode()
    self.imgFrame.Visible = false
    self.audioFrame.Visible = true
end

function Viewer:load()
    local id = self:parseId(self.input.Text)
    if not id then
        self:setStatus("Invalid ID", C.RED)
        return
    end
    if id == self.assetId then
        self:setStatus("Already loaded", C.YELLOW)
        return
    end

    self.assetId = id
    self:setStatus("Loading " .. id .. "...", C.BLUE)
    self:setLoading(true)
    self:showImageMode()
    self.metaLbl.Text = ""

    if self.sound.IsPlaying then
        self.sound:Stop()
        self.isPlaying = false
        self.playBtn.Text = "▶  Play"
    end
    self.sound.SoundId = ""

    task.spawn(function()
        local ok, info = pcall(function()
            return MarketplaceService:GetProductInfo(id, Enum.InfoType.Asset)
        end)

        if not ok or not info then
            self:setStatus("Failed to fetch info", C.RED)
            self:setLoading(false)
            return
        end

        local typeId = info.AssetTypeId
        local typeName = ASSET_TYPES[typeId] or ("Type " .. tostring(typeId))
        local creator = info.Creator and info.Creator.Name or "?"
        self.metaLbl.Text = typeName .. " · " .. creator

        if typeId == 3 then
            self:setLoading(false)
            self:showAudioMode()
            self.audioName.Text = info.Name or ("Audio " .. id)
            self.audioStatus.Text = "Click Play to listen"
            self.sound.SoundId = "rbxassetid://" .. id
            self:setStatus("Audio ready", C.GREEN)
        else
            local url = "rbxassetid://" .. id
            local preloadOk = false
            pcall(function()
                ContentProvider:PreloadAsync({ url }, function(_, status)
                    preloadOk = status == Enum.AssetFetchStatus.Success
                end)
            end)
            task.wait(0.3)
            self:setLoading(false)
            if preloadOk or typeId ~= 1 then
                self.imgLabel.Image = url
                self.imgLabel.Visible = true
                self.placeholder.Visible = false
                self:setStatus("Loaded · " .. info.Name, C.GREEN)
            else
                self:setStatus("Failed to load image", C.RED)
            end
        end
    end)
end

function Viewer:zoom()
    local overlay = frame(self.gui, {
        bg = Color3.new(0, 0, 0),
        size = UDim2.new(1, 0, 1, 0),
        zi = 100,
    })
    overlay.BackgroundTransparency = 0.35

    local dismiss = Instance.new("TextButton")
    dismiss.BackgroundTransparency = 1
    dismiss.BorderSizePixel = 0
    dismiss.Size = UDim2.new(1, 0, 1, 0)
    dismiss.Text = ""
    dismiss.ZIndex = 101
    dismiss.Parent = overlay

    local big = Instance.new("ImageLabel")
    big.BackgroundColor3 = C.BG
    big.BorderSizePixel = 0
    big.Size = UDim2.new(0.72, 0, 0.72, 0)
    big.Position = UDim2.new(0.14, 0, 0.14, 0)
    big.Image = self.imgLabel.Image
    big.ScaleType = Enum.ScaleType.Fit
    big.ZIndex = 102
    big.Parent = overlay
    corner(big, 10)
    stroke(big, C.BORDER, 1)

    overlay.Size = UDim2.new(0, 0, 0, 0)
    overlay.Position = UDim2.new(0.5, 0, 0.5, 0)
    tween(overlay, { Size = UDim2.new(1, 0, 1, 0), Position = UDim2.new(0, 0, 0, 0) }, TI.NORMAL)

    dismiss.MouseButton1Click:Connect(function()
        local t = tween(overlay, { Size = UDim2.new(0, 0, 0, 0), Position = UDim2.new(0.5, 0, 0.5, 0) }, TI.CLOSE)
        t.Completed:Connect(function() overlay:Destroy() end)
    end)
end

function Viewer:toggleMin()
    self.minimized = not self.minimized
    if self.minimized then
        self.storedH = self.win.AbsoluteSize.Y
        tween(self.win, { Size = UDim2.new(0, self.win.AbsoluteSize.X, 0, 40) }, TI.NORMAL)
        self.minBtn.Text = "+"
    else
        tween(self.win, { Size = UDim2.new(0, self.win.AbsoluteSize.X, 0, self.storedH) }, TI.POP)
        self.minBtn.Text = "−"
    end
end

function Viewer:close()
    if self.heartbeat then self.heartbeat:Disconnect() end
    if self.sound then
        self.sound:Stop()
        self.sound:Destroy()
    end
    local t = tween(self.win, {
        Size = UDim2.new(0, 0, 0, 0),
        Position = UDim2.new(0.5, 0, 0.5, 0),
    }, TI.CLOSE)
    t.Completed:Connect(function()
        if self.gui then self.gui:Destroy() end
    end)
end

function Viewer:show()
    self.win.Size = UDim2.new(0, 0, 0, 0)
    self.win.Position = UDim2.new(0.5, 0, 0.5, 0)
    tween(self.win, {
        Size = UDim2.new(0, W, 0, H),
        Position = UDim2.new(0.5, -W / 2, 0.5, -H / 2),
    }, TI.POP)
end

local v = Viewer.new()
v:show()
return v
