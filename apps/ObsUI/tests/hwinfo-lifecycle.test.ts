import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("hardware monitor lifecycle launch boundary", () => {
  it("uses the pre-registered monitor tasks and never auto-prompts with RunAs", async () => {
    const [controller, launcher, hiddenLauncher, taskInstaller, viteConfig, workbenchSettingsServer, hddBridge, literatureServer, screenshotServer] = await Promise.all([
      readFile(join(process.cwd(), "scripts", "hwinfo-control.ps1"), "utf8"),
      readFile(join(process.cwd(), "scripts", "start-obsui.ps1"), "utf8"),
      readFile(join(process.cwd(), "scripts", "start-obsui-hidden.vbs"), "utf8"),
      readFile(join(process.cwd(), "scripts", "install-hwinfo-task.ps1"), "utf8"),
      readFile(join(process.cwd(), "vite.config.ts"), "utf8"),
      readFile(join(process.cwd(), "src", "workbench-settings-server.ts"), "utf8"),
      readFile(join(process.cwd(), "src", "hdd-bridge.ts"), "utf8"),
      readFile(join(process.cwd(), "src", "literature-server.ts"), "utf8"),
      readFile(join(process.cwd(), "src", "screenshot-server.ts"), "utf8"),
    ]);

    expect(controller).toContain("Local\\ObsUI.HWiNFO.Control");
    expect(controller).toContain("Start-ScheduledTask -TaskName $taskName");
    expect(controller).toContain("$taskReadyDeadline");
    expect(controller).toContain("AddSeconds(12)");
    expect(controller).toContain("AddSeconds(15)");
    expect(controller).toContain("for ($attempt = 1; $attempt -le 2; $attempt++)");
    expect(controller).toContain("if ($task.State -ne 'Running')");
    expect(controller).toContain("hwinfo-stop.request.json");
    expect(controller).not.toContain("Stop-ScheduledTask -TaskName $taskName");
    expect(controller).toContain("AddSeconds(30)");
    expect(launcher).toContain("Start-ObsUiHardwareMonitor");
    expect(launcher).toContain("Start-ScheduledTask -TaskName 'ObsUI LibreHardwareMonitor'");
    expect(launcher).not.toContain("Start-Process -FilePath $executable");
    expect(launcher).toContain("Never fall back to launching the requireAdministrator executable.");
    expect(launcher).not.toContain("Start-ObsUiHWiNFO");
    expect(launcher).not.toContain("HWiNFO64.exe");
    expect(launcher).not.toContain("& $controllerPath -Action Start");
    expect(launcher).toContain("Resolve-ObsUiNodePath");
    expect(launcher).toContain("Start-Process -FilePath $nodePath");
    expect(launcher).not.toContain("pnpm.cmd");
    expect(launcher).toContain("node_modules\\vite\\bin\\vite.js");
    expect(hiddenLauncher).toContain("shell.Run command, 0, False");
    expect(hiddenLauncher).toContain("start-obsui.ps1");
    expect(hiddenLauncher).toContain("-WindowStyle Hidden");
    expect(hiddenLauncher).toContain("ResolvePowerShellPath");
    expect(hiddenLauncher).toContain("ResolvePortablePowerShell");
    expect(hiddenLauncher).toContain("\\windowsapps\\microsoft.powershell_");
    expect(hiddenLauncher).not.toContain("shell.Exec");
    // Every current PowerShell entry point has two layers of suppression: the
    // PowerShell host gets -WindowStyle Hidden and Node/VBS hides its process.
    // Keep this explicit so a later feature cannot reintroduce a console flash.
    expect(viteConfig).toMatch(/function powerShellCommandArgs[\s\S]*?"-WindowStyle",\s*"Hidden"/);
    expect(viteConfig).toContain("windowsHide: true");
    expect(workbenchSettingsServer).toContain('["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script]');
    expect(workbenchSettingsServer).toContain('windowsHide: true, timeout: 120_000');
    expect(hddBridge).toContain('["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-STA", "-Command", script]');
    expect(literatureServer).toContain('...(process.platform === "win32" ? ["-WindowStyle", "Hidden"] : [])');
    expect(literatureServer).toContain('spawn(executable, args, { windowsHide: true');
    expect(screenshotServer).toContain('["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-STA", "-Command", launcher]');
    expect(screenshotServer).toContain('windowsHide: true');
    expect(workbenchSettingsServer).toContain("start-obsui-hidden.vbs");
    expect(workbenchSettingsServer).toContain("System32\", \"wscript.exe");
    expect(workbenchSettingsServer).toContain('detached: id !== "ollama"');
    expect(hddBridge).not.toContain("keep_alive: -1");
    expect(hddBridge).toContain("bundledPowerShell7");
    expect(literatureServer).toContain('keepAlive: "10m"');
    expect(literatureServer).toContain("bundledPowerShell7");
    expect(viteConfig).toContain("protectExternalConsumers");
    expect(viteConfig).toContain("hasExternalOllamaClient");
    expect(viteConfig).toContain("detached: false");
    expect(viteConfig).toContain("Start-ScheduledTask -TaskName 'ObsUI LibreHardwareMonitor'");
    expect(viteConfig).not.toContain("Start-Process -FilePath $executable -WorkingDirectory (Split-Path -Parent $executable)");
    expect(viteConfig).toContain('"netstat.exe"');
    expect(taskInstaller).toContain("-EncodedCommand");
    expect(taskInstaller).toContain("$encodedCommand");
    expect(taskInstaller).toContain("System32\\wscript.exe");
    expect(taskInstaller).toContain("shell.Run(command, 0, True)");
    expect(taskInstaller).toContain("$stateDirectory = Join-Path $obsUiRoot '.obsui-runtime\\hwinfo'");
    expect(taskInstaller).toContain("__OBSUI_HWINFO_RUNTIME_DIRECTORY__");
    expect(taskInstaller).toContain("New-Item -ItemType Directory -Path $stateDirectory -Force");
    expect(taskInstaller).not.toContain("$stateDirectory = Join-Path $env:TEMP 'ObsUI'");
    expect(taskInstaller).toContain("*S-1-5-32-545:(OI)(CI)RX");
    expect(taskInstaller).toContain("if ([int]$request.pid -eq $process.Id)");
    expect(taskInstaller).toContain("Stop-AllObsUiHWiNFO");
    expect(taskInstaller).toContain("supportsStopAll");
    expect(taskInstaller).toContain("task-capabilities.json");
    expect(taskInstaller).toContain("[bool]$request.all");
    expect(taskInstaller).toContain("if ($stopAllPending)");
    expect(taskInstaller).toContain("$previousTaskStatus.hwinfoPid");
    expect(taskInstaller).toContain("OBSUI_HWINFO_PATH");
    expect(taskInstaller).not.toContain("C:\\WorkSpace");
    expect(viteConfig).toContain("readHWiNFOProcessCreationTime");
    expect(viteConfig).toContain("isViteServeProcess");
    expect(viteConfig).toContain("argument.toLocaleLowerCase() === \"build\"");
    expect(viteConfig).toContain('"schtasks.exe"');
    expect(viteConfig).toContain("hwinfo-stop.request.json");
    expect(viteConfig).toContain("taskkill.exe");
    expect(viteConfig).toContain("closeAllHWiNFO");
    expect(viteConfig).toContain("requestAllHWiNFOStop");
    expect(viteConfig).toContain("runHWiNFOTaskSync");
    expect(viteConfig).toContain("hwinfoTaskCapabilityFile");
    expect(viteConfig).toContain('join(process.cwd(), ".obsui-runtime", "hwinfo")');
    expect(viteConfig).not.toContain('join(tmpdir(), "ObsUI"');
    expect(viteConfig).toContain("telemetryPowerShell");
    expect(viteConfig).toContain("ownerProcessId");
    expect(viteConfig).toContain('process.once("exit"');
    expect(viteConfig).toContain('httpServer?.once("close"');
    expect(viteConfig).toContain("cancelScheduledHWiNFOClose();");
    expect(viteConfig).toContain("scheduleHWiNFORetry");
    expect(taskInstaller).toContain("Test-ObsUiOwnerProcessAlive");
    expect(taskInstaller).toContain("including ones started outside ObsUI");
    expect(taskInstaller).toContain("ownerProcessId");
    expect(taskInstaller).toContain("Remove-Item -LiteralPath $ownerPath");
    expect(`${controller}\n${launcher}\n${hiddenLauncher}\n${taskInstaller}\n${viteConfig}\n${workbenchSettingsServer}`).not.toMatch(/-Verb\s+RunAs/i);
  });
});
