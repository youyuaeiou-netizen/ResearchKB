using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Windows.Forms;
using System.Web.Script.Serialization;

public static class ObsUiScreenshotProgram
{
    private const int HotkeyMessage = 0x0312;
    private const int ControlModifier = 0x0002;
    private const int AltModifier = 0x0001;
    private const int ShiftModifier = 0x0004;
    private const int WinModifier = 0x0008;
    private const int HotkeyId = 1;

    private static readonly object StatusLock = new object();
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    private static string stateDirectory;
    private static string commandPath;
    private static string statusPath;
    private static Dictionary<string, object> status;
    private static ObsUiScreenshotHotkeyWindow hotkeyWindow;
    private static ObsUiScreenshotRegionOverlay regionOverlay;
    private static Bitmap captureBitmap;
    private static bool hotkeyRegistered;
    private static bool busy;
    private static DateTime lastHeartbeatUtc;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr handle, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr handle, int id);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr handle, out NativeRect rect);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    public static void Run(string statePath)
    {
        stateDirectory = Path.GetFullPath(statePath);
        commandPath = Path.Combine(stateDirectory, "screenshot-command.json");
        statusPath = Path.Combine(stateDirectory, "screenshot-status.json");
        Directory.CreateDirectory(stateDirectory);
        InitializeStatus();

        try
        {
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            hotkeyWindow = new ObsUiScreenshotHotkeyWindow();
            hotkeyWindow.FormBorderStyle = FormBorderStyle.None;
            hotkeyWindow.ShowInTaskbar = false;
            hotkeyWindow.Opacity = 0;
            hotkeyWindow.Size = new Size(1, 1);
            hotkeyWindow.StartPosition = FormStartPosition.Manual;
            hotkeyWindow.Location = new Point(-32000, -32000);
            hotkeyWindow.HotkeyPressed += delegate
            {
                if (!busy) StartCapture("region");
            };
            // Accessing the form handle during registration does not show it.
            RegisterConfiguredHotkey();

            var timer = new Timer();
            timer.Interval = 120;
            timer.Tick += delegate { ReadCommand(); };
            timer.Start();
            Application.Run();
            timer.Stop();
            timer.Dispose();
        }
        catch (Exception exception)
        {
            TryPatchStatus(Pair("running", false), Pair("hotkeyStatus", "unavailable"), Pair("phase", "error"), Pair("lastError", Truncate(exception.Message)));
            throw;
        }
        finally
        {
            if (hotkeyRegistered && hotkeyWindow != null)
            {
                UnregisterHotKey(hotkeyWindow.Handle, HotkeyId);
                hotkeyRegistered = false;
            }
            DisposeCapture();
            if (regionOverlay != null)
            {
                try { regionOverlay.Dispose(); } catch { }
                regionOverlay = null;
            }
            if (hotkeyWindow != null)
            {
                hotkeyWindow.Dispose();
                hotkeyWindow = null;
            }
        }
    }

    private static void InitializeStatus()
    {
        status = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        status["available"] = true;
        status["running"] = true;
        status["enabled"] = true;
        status["hotkey"] = "Ctrl+Alt+A";
        status["hotkeyStatus"] = "starting";
        status["phase"] = "idle";
        status["mode"] = null;
        status["hasCapture"] = false;
        status["saved"] = false;
        status["lastError"] = null;
        WriteStatus();
        lastHeartbeatUtc = DateTime.UtcNow;
    }

    private static KeyValuePair<string, object> Pair(string key, object value)
    {
        return new KeyValuePair<string, object>(key, value);
    }

    private static void TryPatchStatus(params KeyValuePair<string, object>[] patches)
    {
        try { PatchStatus(patches); } catch { }
    }

    private static void PatchStatus(params KeyValuePair<string, object>[] patches)
    {
        lock (StatusLock)
        {
            for (var index = 0; index < patches.Length; index++) status[patches[index].Key] = patches[index].Value;
            status["updatedAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            WriteStatus();
        }
    }

    private static void WriteStatus()
    {
        var temporaryPath = statusPath + "." + Process.GetCurrentProcess().Id + ".tmp";
        var json = Json.Serialize(status);
        File.WriteAllText(temporaryPath, json + Environment.NewLine, new System.Text.UTF8Encoding(false));
        if (File.Exists(statusPath))
        {
            try { File.Replace(temporaryPath, statusPath, null); }
            catch
            {
                File.Delete(statusPath);
                File.Move(temporaryPath, statusPath);
            }
        }
        else File.Move(temporaryPath, statusPath);
    }

    private static string Truncate(string value)
    {
        if (String.IsNullOrEmpty(value)) return "截图辅助进程启动失败。";
        return value.Length <= 300 ? value : value.Substring(0, 300);
    }

    private static bool TryGetHotkey(string value, out uint modifiers, out uint virtualKey)
    {
        modifiers = 0;
        virtualKey = 0;
        if (String.IsNullOrWhiteSpace(value)) return false;
        var rawParts = value.Split('+');
        var parts = new List<string>();
        for (var index = 0; index < rawParts.Length; index++)
        {
            var part = rawParts[index].Trim();
            if (!String.IsNullOrEmpty(part)) parts.Add(part);
        }
        if (parts.Count < 2 || parts.Count > 4) return false;

        for (var index = 0; index < parts.Count - 1; index++)
        {
            switch (parts[index].ToUpperInvariant())
            {
                case "CTRL": modifiers |= ControlModifier; break;
                case "ALT": modifiers |= AltModifier; break;
                case "SHIFT": modifiers |= ShiftModifier; break;
                case "WIN": modifiers |= WinModifier; break;
                default: return false;
            }
        }

        var key = parts[parts.Count - 1];
        if (key.Length == 1 && ((key[0] >= 'A' && key[0] <= 'Z') || (key[0] >= 'a' && key[0] <= 'z')))
        {
            virtualKey = Char.ToUpperInvariant(key[0]);
            return true;
        }
        if (key.StartsWith("F", StringComparison.OrdinalIgnoreCase))
        {
            int functionNumber;
            if (Int32.TryParse(key.Substring(1), out functionNumber) && functionNumber >= 1 && functionNumber <= 12)
            {
                virtualKey = (uint)(0x70 + functionNumber - 1);
                return true;
            }
        }
        if (String.Equals(key, "Space", StringComparison.OrdinalIgnoreCase)) { virtualKey = 0x20; return true; }
        if (String.Equals(key, "PrintScreen", StringComparison.OrdinalIgnoreCase)) { virtualKey = 0x2C; return true; }
        return false;
    }

    private static void RegisterConfiguredHotkey()
    {
        if (hotkeyRegistered && hotkeyWindow != null)
        {
            UnregisterHotKey(hotkeyWindow.Handle, HotkeyId);
            hotkeyRegistered = false;
        }
        if (!GetStatusBool("enabled", true))
        {
            PatchStatus(Pair("hotkeyStatus", "disabled"), Pair("lastError", null));
            return;
        }

        uint modifiers;
        uint virtualKey;
        if (!TryGetHotkey(Convert.ToString(status["hotkey"]), out modifiers, out virtualKey))
        {
            PatchStatus(Pair("hotkeyStatus", "conflict"), Pair("lastError", "快捷键格式无效，请在设置中更换组合。"));
            return;
        }
        hotkeyRegistered = RegisterHotKey(hotkeyWindow.Handle, HotkeyId, modifiers, virtualKey);
        if (hotkeyRegistered) PatchStatus(Pair("hotkeyStatus", "registered"), Pair("lastError", null));
        else PatchStatus(Pair("hotkeyStatus", "conflict"), Pair("lastError", "快捷键已被其他程序占用，请更换组合。"));
    }

    private static bool GetStatusBool(string key, bool fallback)
    {
        object value;
        if (!status.TryGetValue(key, out value) || value == null) return fallback;
        return value is bool ? (bool)value : fallback;
    }

    private static Bitmap CaptureRectangle(Rectangle rectangle)
    {
        if (rectangle.Width <= 0 || rectangle.Height <= 0) throw new InvalidOperationException("截图区域为空。");
        var bitmap = new Bitmap(rectangle.Width, rectangle.Height, PixelFormat.Format32bppPArgb);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(rectangle.Left, rectangle.Top, 0, 0, rectangle.Size, CopyPixelOperation.SourceCopy);
        }
        return bitmap;
    }

    private static void SetCapture(Rectangle rectangle, string mode)
    {
        var bitmap = CaptureRectangle(rectangle);
        DisposeCapture();
        captureBitmap = bitmap;
        string clipboardError = null;
        try { Clipboard.SetImage(bitmap); }
        catch { clipboardError = "截图已生成，但复制到剪贴板失败。"; }
        PatchStatus(Pair("phase", "ready"), Pair("mode", mode), Pair("hasCapture", true), Pair("saved", false), Pair("lastError", clipboardError));
    }

    private static void StartCapture(string mode)
    {
        if (busy || !GetStatusBool("enabled", true)) return;
        busy = true;
        PatchStatus(Pair("phase", "capturing"), Pair("mode", mode), Pair("hasCapture", false), Pair("saved", false), Pair("lastError", null));
        try
        {
            if (String.Equals(mode, "screen", StringComparison.OrdinalIgnoreCase))
            {
                SetCapture(SystemInformation.VirtualScreen, mode);
            }
            else if (String.Equals(mode, "window", StringComparison.OrdinalIgnoreCase))
            {
                var handle = GetForegroundWindow();
                NativeRect nativeRect;
                if (handle == IntPtr.Zero || !GetWindowRect(handle, out nativeRect)) throw new InvalidOperationException("未找到当前窗口。");
                SetCapture(Rectangle.FromLTRB(nativeRect.Left, nativeRect.Top, nativeRect.Right, nativeRect.Bottom), mode);
            }
            else if (String.Equals(mode, "region", StringComparison.OrdinalIgnoreCase))
            {
                var virtualScreen = SystemInformation.VirtualScreen;
                var overlay = new ObsUiScreenshotRegionOverlay(CaptureRectangle(virtualScreen));
                regionOverlay = overlay;
                overlay.Bounds = virtualScreen;
                var result = overlay.ShowDialog();
                var selected = overlay.SelectedRectangle;
                overlay.Hide();
                overlay.Dispose();
                regionOverlay = null;
                if (result != DialogResult.OK)
                {
                    PatchStatus(Pair("phase", "idle"), Pair("mode", mode), Pair("hasCapture", false), Pair("lastError", null));
                    return;
                }
                System.Threading.Thread.Sleep(90);
                SetCapture(new Rectangle(virtualScreen.Left + selected.Left, virtualScreen.Top + selected.Top, selected.Width, selected.Height), mode);
            }
            else throw new InvalidOperationException("截图模式无效。");
        }
        catch (Exception exception)
        {
            PatchStatus(Pair("phase", "error"), Pair("hasCapture", false), Pair("lastError", Truncate(exception.Message)));
        }
        finally { busy = false; }
    }

    private static void SaveCapture()
    {
        if (captureBitmap == null) return;
        using (var dialog = new SaveFileDialog())
        {
            dialog.Title = "保存 ObsUI 截图";
            dialog.Filter = "PNG 图片 (*.png)|*.png";
            dialog.DefaultExt = "png";
            dialog.AddExtension = true;
            dialog.FileName = "ObsUI-Screenshot-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".png";
            try
            {
                if (dialog.ShowDialog(hotkeyWindow) == DialogResult.OK)
                {
                    captureBitmap.Save(dialog.FileName, ImageFormat.Png);
                    PatchStatus(Pair("saved", true), Pair("lastError", null));
                }
            }
            catch { PatchStatus(Pair("lastError", "截图保存失败，请选择其他位置重试。")); }
        }
    }

    private static void CancelCapture()
    {
        if (regionOverlay != null)
        {
            regionOverlay.DialogResult = DialogResult.Cancel;
            regionOverlay.Close();
        }
        DisposeCapture();
        PatchStatus(Pair("phase", "idle"), Pair("mode", null), Pair("hasCapture", false), Pair("saved", false), Pair("lastError", null));
    }

    private static void DisposeCapture()
    {
        if (captureBitmap != null)
        {
            captureBitmap.Dispose();
            captureBitmap = null;
        }
    }

    private static void ReadCommand()
    {
        if ((DateTime.UtcNow - lastHeartbeatUtc).TotalMilliseconds >= 2000)
        {
            lastHeartbeatUtc = DateTime.UtcNow;
            TryPatchStatus();
        }
        if (!File.Exists(commandPath)) return;
        try
        {
            var content = File.ReadAllText(commandPath);
            try { File.Delete(commandPath); } catch { }
            if (String.IsNullOrWhiteSpace(content)) return;
            var command = Json.DeserializeObject(content) as Dictionary<string, object>;
            if (command == null) return;
            var kind = command.ContainsKey("kind") ? Convert.ToString(command["kind"]) : String.Empty;
            if (String.Equals(kind, "config", StringComparison.OrdinalIgnoreCase))
            {
                status["enabled"] = !command.ContainsKey("enabled") || !(command["enabled"] is bool) || (bool)command["enabled"];
                if (command.ContainsKey("hotkey") && command["hotkey"] != null) status["hotkey"] = Convert.ToString(command["hotkey"]);
                RegisterConfiguredHotkey();
            }
            else if (String.Equals(kind, "start", StringComparison.OrdinalIgnoreCase))
            {
                StartCapture(command.ContainsKey("mode") ? Convert.ToString(command["mode"]) : String.Empty);
            }
            else if (String.Equals(kind, "cancel", StringComparison.OrdinalIgnoreCase)) CancelCapture();
            else if (String.Equals(kind, "save", StringComparison.OrdinalIgnoreCase)) SaveCapture();
            else if (String.Equals(kind, "stop", StringComparison.OrdinalIgnoreCase))
            {
                PatchStatus(Pair("running", false), Pair("hotkeyStatus", "unavailable"), Pair("lastError", null));
                Application.ExitThread();
            }
        }
        catch { TryPatchStatus(Pair("phase", "error"), Pair("lastError", "截图命令无法处理。")); }
    }
}

public sealed class ObsUiScreenshotHotkeyWindow : Form
{
    public event EventHandler HotkeyPressed;

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0312 && message.WParam.ToInt32() == 1 && HotkeyPressed != null)
        {
            HotkeyPressed(this, EventArgs.Empty);
        }
        base.WndProc(ref message);
    }
}

public sealed class ObsUiScreenshotRegionOverlay : Form
{
    private const int MinimumSelectionSize = 8;
    private const int HandleHitSize = 14;

    private enum ResizeMode
    {
        None,
        Move,
        Left,
        Right,
        Top,
        Bottom,
        TopLeft,
        TopRight,
        BottomLeft,
        BottomRight,
    }

    private readonly Bitmap backgroundBitmap;
    private Point startPoint;
    private Point dragStartPoint;
    private Rectangle dragRectangle;
    private bool selecting;
    private bool dragging;
    private ResizeMode resizeMode;
    private int activeAction = -1;
    private int hoverAction = -1;
    private Rectangle toolbarBounds;
    private readonly Rectangle[] actionBounds = new Rectangle[2];
    public Rectangle SelectedRectangle { get; private set; }

    public ObsUiScreenshotRegionOverlay(Bitmap background)
    {
        backgroundBitmap = background;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        BackColor = Color.Black;
        Opacity = 1.0;
        Cursor = Cursors.Cross;
        KeyPreview = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
    }

    protected override void OnShown(EventArgs eventArgs)
    {
        base.OnShown(eventArgs);
        Activate();
        BringToFront();
        Focus();
    }

    protected override bool ProcessCmdKey(ref Message message, Keys keyData)
    {
        var keyCode = keyData & Keys.KeyCode;
        if (keyCode == Keys.Escape)
        {
            CancelSelection();
            return true;
        }
        if (keyCode == Keys.Enter)
        {
            ConfirmSelection();
            return true;
        }
        return base.ProcessCmdKey(ref message, keyData);
    }

    protected override void OnKeyDown(KeyEventArgs eventArgs)
    {
        if (eventArgs.KeyCode == Keys.Escape)
        {
            CancelSelection();
            eventArgs.Handled = true;
            return;
        }
        if (eventArgs.KeyCode == Keys.Enter)
        {
            ConfirmSelection();
            eventArgs.Handled = true;
            return;
        }
        base.OnKeyDown(eventArgs);
    }

    protected override void OnMouseDown(MouseEventArgs eventArgs)
    {
        if (eventArgs.Button != MouseButtons.Left)
        {
            base.OnMouseDown(eventArgs);
            return;
        }

        Focus();
        var action = HitTestAction(eventArgs.Location);
        if (action >= 0)
        {
            activeAction = action;
            Cursor = Cursors.Hand;
            Invalidate();
            return;
        }

        var hitMode = HasSelection() ? GetResizeMode(eventArgs.Location) : ResizeMode.None;
        if (hitMode != ResizeMode.None)
        {
            dragging = true;
            selecting = false;
            resizeMode = hitMode;
            dragStartPoint = eventArgs.Location;
            dragRectangle = SelectedRectangle;
            Capture = true;
            UpdateCursor(eventArgs.Location);
            return;
        }

        startPoint = eventArgs.Location;
        selecting = true;
        dragging = false;
        resizeMode = ResizeMode.None;
        activeAction = -1;
        SelectedRectangle = Rectangle.Empty;
        Capture = true;
        Cursor = Cursors.Cross;
        Invalidate();
    }

    protected override void OnMouseMove(MouseEventArgs eventArgs)
    {
        if (selecting)
        {
            SelectedRectangle = SelectionFromPoints(startPoint, eventArgs.Location);
            Invalidate();
        }
        else if (dragging)
        {
            SelectedRectangle = ResizeSelection(eventArgs.Location);
            UpdateCursor(eventArgs.Location);
            Invalidate();
        }
        else
        {
            var nextHoverAction = HitTestAction(eventArgs.Location);
            if (hoverAction != nextHoverAction)
            {
                hoverAction = nextHoverAction;
                Invalidate(toolbarBounds);
            }
            UpdateCursor(eventArgs.Location);
        }
        base.OnMouseMove(eventArgs);
    }

    protected override void OnMouseLeave(EventArgs eventArgs)
    {
        if (!selecting && !dragging && hoverAction != -1)
        {
            hoverAction = -1;
            Invalidate(toolbarBounds);
        }
        base.OnMouseLeave(eventArgs);
    }

    protected override void OnMouseUp(MouseEventArgs eventArgs)
    {
        if (eventArgs.Button != MouseButtons.Left)
        {
            base.OnMouseUp(eventArgs);
            return;
        }

        if (selecting)
        {
            selecting = false;
            Capture = false;
            if (!HasSelection()) SelectedRectangle = Rectangle.Empty;
            UpdateCursor(eventArgs.Location);
            Invalidate();
            return;
        }

        if (dragging)
        {
            dragging = false;
            resizeMode = ResizeMode.None;
            Capture = false;
            UpdateCursor(eventArgs.Location);
            Invalidate();
            return;
        }

        if (activeAction >= 0)
        {
            var action = activeAction;
            activeAction = -1;
            if (HitTestAction(eventArgs.Location) == action)
            {
                if (action == 0) ConfirmSelection();
                else if (action == 1) CancelSelection();
            }
            Invalidate();
            return;
        }
        base.OnMouseUp(eventArgs);
    }

    protected override void OnPaint(PaintEventArgs paintEventArgs)
    {
        base.OnPaint(paintEventArgs);
        var graphics = paintEventArgs.Graphics;
        if (backgroundBitmap != null) graphics.DrawImageUnscaled(backgroundBitmap, 0, 0);
        else graphics.Clear(Color.FromArgb(255, 7, 12, 17));
        using (var shade = new SolidBrush(Color.FromArgb(158, 2, 7, 12)))
        {
            graphics.FillRectangle(shade, ClientRectangle);
        }
        if (HasSelection())
        {
            if (backgroundBitmap != null)
            {
                graphics.DrawImage(backgroundBitmap, SelectedRectangle, SelectedRectangle, GraphicsUnit.Pixel);
            }
            using (var fill = new SolidBrush(Color.FromArgb(14, 82, 186, 220)))
            using (var pen = new Pen(Color.FromArgb(255, 108, 207, 239), 2))
            {
                graphics.FillRectangle(fill, SelectedRectangle);
                graphics.DrawRectangle(pen, SelectedRectangle);
            }
            DrawHandles(graphics);
            DrawSizePill(graphics);
            DrawToolbar(graphics);
        }
        else
        {
            toolbarBounds = Rectangle.Empty;
            for (var index = 0; index < actionBounds.Length; index++) actionBounds[index] = Rectangle.Empty;
            using (var font = new Font("Segoe UI", 10, FontStyle.Regular))
            {
                TextRenderer.DrawText(graphics, "拖动选择截图区域  ·  Enter 确认  ·  Esc 取消", font, new Rectangle(18, 18, Math.Max(260, ClientSize.Width - 36), 28), Color.FromArgb(238, 244, 246), Color.FromArgb(170, 15, 24, 31), TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix);
            }
        }
    }

    private bool HasSelection()
    {
        return SelectedRectangle.Width > 3 && SelectedRectangle.Height > 3;
    }

    private int HitTestAction(Point location)
    {
        if (!HasSelection()) return -1;
        for (var index = 0; index < actionBounds.Length; index++)
        {
            if (actionBounds[index].Contains(location)) return index;
        }
        return -1;
    }

    private ResizeMode GetResizeMode(Point location)
    {
        if (!HasSelection()) return ResizeMode.None;
        var rectangle = SelectedRectangle;
        var nearLeft = Math.Abs(location.X - rectangle.Left) <= HandleHitSize;
        var nearRight = Math.Abs(location.X - rectangle.Right) <= HandleHitSize;
        var nearTop = Math.Abs(location.Y - rectangle.Top) <= HandleHitSize;
        var nearBottom = Math.Abs(location.Y - rectangle.Bottom) <= HandleHitSize;
        if (nearLeft && nearTop) return ResizeMode.TopLeft;
        if (nearRight && nearTop) return ResizeMode.TopRight;
        if (nearLeft && nearBottom) return ResizeMode.BottomLeft;
        if (nearRight && nearBottom) return ResizeMode.BottomRight;
        if (nearLeft && location.Y >= rectangle.Top - HandleHitSize && location.Y <= rectangle.Bottom + HandleHitSize) return ResizeMode.Left;
        if (nearRight && location.Y >= rectangle.Top - HandleHitSize && location.Y <= rectangle.Bottom + HandleHitSize) return ResizeMode.Right;
        if (nearTop && location.X >= rectangle.Left - HandleHitSize && location.X <= rectangle.Right + HandleHitSize) return ResizeMode.Top;
        if (nearBottom && location.X >= rectangle.Left - HandleHitSize && location.X <= rectangle.Right + HandleHitSize) return ResizeMode.Bottom;
        if (rectangle.Contains(location)) return ResizeMode.Move;
        return ResizeMode.None;
    }

    private void UpdateCursor(Point location)
    {
        if (HitTestAction(location) >= 0)
        {
            Cursor = Cursors.Hand;
            return;
        }
        Cursor = CursorForResizeMode(GetResizeMode(location));
    }

    private static Cursor CursorForResizeMode(ResizeMode mode)
    {
        switch (mode)
        {
            case ResizeMode.TopLeft:
            case ResizeMode.BottomRight: return Cursors.SizeNWSE;
            case ResizeMode.TopRight:
            case ResizeMode.BottomLeft: return Cursors.SizeNESW;
            case ResizeMode.Left:
            case ResizeMode.Right: return Cursors.SizeWE;
            case ResizeMode.Top:
            case ResizeMode.Bottom: return Cursors.SizeNS;
            case ResizeMode.Move: return Cursors.SizeAll;
            default: return Cursors.Cross;
        }
    }

    private Rectangle SelectionFromPoints(Point first, Point second)
    {
        var left = Math.Max(0, Math.Min(first.X, second.X));
        var top = Math.Max(0, Math.Min(first.Y, second.Y));
        var right = Math.Min(ClientSize.Width, Math.Max(first.X, second.X));
        var bottom = Math.Min(ClientSize.Height, Math.Max(first.Y, second.Y));
        return Rectangle.FromLTRB(left, top, Math.Max(left, right), Math.Max(top, bottom));
    }

    private Rectangle ResizeSelection(Point current)
    {
        var left = dragRectangle.Left;
        var top = dragRectangle.Top;
        var right = dragRectangle.Right;
        var bottom = dragRectangle.Bottom;
        var deltaX = current.X - dragStartPoint.X;
        var deltaY = current.Y - dragStartPoint.Y;

        if (resizeMode == ResizeMode.Move)
        {
            var maxLeft = Math.Max(0, ClientSize.Width - dragRectangle.Width);
            var maxTop = Math.Max(0, ClientSize.Height - dragRectangle.Height);
            left = Clamp(dragRectangle.Left + deltaX, 0, maxLeft);
            top = Clamp(dragRectangle.Top + deltaY, 0, maxTop);
            return new Rectangle(left, top, dragRectangle.Width, dragRectangle.Height);
        }

        if (resizeMode == ResizeMode.Left || resizeMode == ResizeMode.TopLeft || resizeMode == ResizeMode.BottomLeft)
            left = Clamp(dragRectangle.Left + deltaX, 0, dragRectangle.Right - MinimumSelectionSize);
        if (resizeMode == ResizeMode.Right || resizeMode == ResizeMode.TopRight || resizeMode == ResizeMode.BottomRight)
            right = Clamp(dragRectangle.Right + deltaX, dragRectangle.Left + MinimumSelectionSize, ClientSize.Width);
        if (resizeMode == ResizeMode.Top || resizeMode == ResizeMode.TopLeft || resizeMode == ResizeMode.TopRight)
            top = Clamp(dragRectangle.Top + deltaY, 0, dragRectangle.Bottom - MinimumSelectionSize);
        if (resizeMode == ResizeMode.Bottom || resizeMode == ResizeMode.BottomLeft || resizeMode == ResizeMode.BottomRight)
            bottom = Clamp(dragRectangle.Bottom + deltaY, dragRectangle.Top + MinimumSelectionSize, ClientSize.Height);

        return Rectangle.FromLTRB(left, top, Math.Max(left + MinimumSelectionSize, right), Math.Max(top + MinimumSelectionSize, bottom));
    }

    private static int Clamp(int value, int minimum, int maximum)
    {
        return Math.Max(minimum, Math.Min(maximum, value));
    }

    private void ConfirmSelection()
    {
        if (!HasSelection()) return;
        DialogResult = DialogResult.OK;
        Close();
    }

    private void CancelSelection()
    {
        DialogResult = DialogResult.Cancel;
        Close();
    }

    private Rectangle SizeBounds()
    {
        const int height = 28;
        const int width = 112;
        var x = Math.Min(Math.Max(8, SelectedRectangle.Left), Math.Max(8, ClientSize.Width - width - 8));
        var y = SelectedRectangle.Top - height - 10;
        if (y < 8) y = Math.Min(Math.Max(8, ClientSize.Height - height - 8), SelectedRectangle.Top + 10);
        return new Rectangle(x, y, width, height);
    }

    private void DrawSizePill(Graphics graphics)
    {
        var bounds = SizeBounds();
        using (var fill = new SolidBrush(Color.FromArgb(235, 12, 20, 26)))
        using (var pen = new Pen(Color.FromArgb(230, 107, 201, 230), 1))
        using (var font = new Font("Segoe UI Semibold", 10, FontStyle.Bold))
        using (var shape = RoundedRectangle(bounds, 7))
        {
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.FillPath(fill, shape);
            graphics.DrawPath(pen, shape);
            TextRenderer.DrawText(graphics, String.Format("{0} × {1}", SelectedRectangle.Width, SelectedRectangle.Height), font, bounds, Color.FromArgb(255, 255, 220, 112), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix);
        }
    }

    private void DrawHandles(Graphics graphics)
    {
        const int size = 7;
        var points = new[]
        {
            new Point(SelectedRectangle.Left, SelectedRectangle.Top),
            new Point(SelectedRectangle.Left + SelectedRectangle.Width / 2, SelectedRectangle.Top),
            new Point(SelectedRectangle.Right - 1, SelectedRectangle.Top),
            new Point(SelectedRectangle.Right - 1, SelectedRectangle.Top + SelectedRectangle.Height / 2),
            new Point(SelectedRectangle.Right - 1, SelectedRectangle.Bottom - 1),
            new Point(SelectedRectangle.Left + SelectedRectangle.Width / 2, SelectedRectangle.Bottom - 1),
            new Point(SelectedRectangle.Left, SelectedRectangle.Bottom - 1),
            new Point(SelectedRectangle.Left, SelectedRectangle.Top + SelectedRectangle.Height / 2),
        };
        using (var fill = new SolidBrush(Color.FromArgb(255, 236, 249, 252)))
        using (var pen = new Pen(Color.FromArgb(255, 54, 154, 198), 1))
        {
            for (var index = 0; index < points.Length; index++)
            {
                var bounds = new Rectangle(points[index].X - size / 2, points[index].Y - size / 2, size, size);
                graphics.FillRectangle(fill, bounds);
                graphics.DrawRectangle(pen, bounds);
            }
        }
    }

    private void DrawToolbar(Graphics graphics)
    {
        const int toolbarWidth = 92;
        const int toolbarHeight = 44;
        var x = SelectedRectangle.Right - toolbarWidth;
        x = Math.Min(Math.Max(8, x), Math.Max(8, ClientSize.Width - toolbarWidth - 8));
        var y = SelectedRectangle.Bottom + 10;
        if (y + toolbarHeight > ClientSize.Height - 8) y = SelectedRectangle.Top - toolbarHeight - 10;
        y = Math.Min(Math.Max(8, y), Math.Max(8, ClientSize.Height - toolbarHeight - 8));
        toolbarBounds = new Rectangle(x, y, toolbarWidth, toolbarHeight);
        using (var fill = new SolidBrush(Color.FromArgb(244, 12, 20, 27)))
        using (var pen = new Pen(Color.FromArgb(150, 82, 170, 202), 1))
        using (var shape = RoundedRectangle(toolbarBounds, 12))
        {
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.FillPath(fill, shape);
            graphics.DrawPath(pen, shape);
        }
        var labels = new[] { "\uE73E", "\uE711" };
        var left = toolbarBounds.Left + 8;
        using (var font = new Font("Segoe Fluent Icons", 14, FontStyle.Regular))
        {
            for (var index = 0; index < labels.Length; index++)
            {
                var bounds = new Rectangle(left, toolbarBounds.Top + 6, 32, 32);
                actionBounds[index] = bounds;
                var pressed = activeAction == index;
                var hovered = hoverAction == index;
                var fillColor = index == 0
                    ? pressed ? Color.FromArgb(255, 42, 142, 125) : hovered ? Color.FromArgb(255, 52, 174, 151) : Color.FromArgb(245, 39, 153, 133)
                    : pressed ? Color.FromArgb(238, 105, 43, 48) : hovered ? Color.FromArgb(225, 92, 48, 53) : Color.FromArgb(178, 45, 55, 62);
                var borderColor = index == 0 ? Color.FromArgb(245, 139, 255, 226) : Color.FromArgb(225, 239, 132, 126);
                using (var buttonFill = new SolidBrush(fillColor))
                using (var buttonPen = new Pen(borderColor, 1))
                {
                    graphics.FillEllipse(buttonFill, bounds);
                    graphics.DrawEllipse(buttonPen, bounds);
                }
                var textColor = index == 0 ? Color.FromArgb(255, 237, 255, 250) : Color.FromArgb(255, 255, 201, 196);
                DrawCenteredGlyph(graphics, labels[index], font, bounds, textColor);
                left += 44;
            }
        }
    }

    private static void DrawCenteredGlyph(Graphics graphics, string glyph, Font font, Rectangle bounds, Color color)
    {
        using (var path = new GraphicsPath())
        using (var format = (StringFormat)StringFormat.GenericTypographic.Clone())
        using (var brush = new SolidBrush(color))
        {
            path.AddString(glyph, font.FontFamily, (int)font.Style, font.SizeInPoints * graphics.DpiY / 72f, PointF.Empty, format);
            var glyphBounds = path.GetBounds();
            using (var transform = new Matrix())
            {
                transform.Translate(
                    bounds.Left + bounds.Width / 2f - (glyphBounds.Left + glyphBounds.Width / 2f),
                    bounds.Top + bounds.Height / 2f - (glyphBounds.Top + glyphBounds.Height / 2f));
                path.Transform(transform);
            }
            graphics.FillPath(brush, path);
        }
    }

    private static GraphicsPath RoundedRectangle(Rectangle bounds, int radius)
    {
        var diameter = Math.Max(2, radius * 2);
        var path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && backgroundBitmap != null) backgroundBitmap.Dispose();
        base.Dispose(disposing);
    }
}
