/**
 * 桌面提醒：Windows 走系统通知（Toast），其它平台先只记日志。
 * 用 PowerShell 直接调 WinRT，不装任何模块；失败不抛错，主流程不受影响。
 */
import { spawn } from 'node:child_process'

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const PS_SCRIPT = `$ErrorActionPreference = 'Stop'
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $title = $env:CN_TOAST_TITLE
  $body = $env:CN_TOAST_BODY
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml("<toast duration='long'><visual><binding template='ToastGeneric'><text>$title</text><text>$body</text></binding></visual><audio src='ms-winsoundevent:Notification.Default'/></toast>")
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('校园通知')
  $notifier.Show($toast)
} catch {
  Write-Error $_
  exit 1
}
`

/**
 * 弹一条桌面通知。返回是否成功「发起」（不代表用户看到了）。
 * @param {string} title
 * @param {string} body
 */
export function toast(title, body) {
  if (process.platform !== 'win32') {
    console.log(`[提醒] ${title} —— ${body}`)
    return false
  }
  try {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
      {
        windowsHide: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          CN_TOAST_TITLE: escapeXml(title).slice(0, 80),
          CN_TOAST_BODY: escapeXml(body).slice(0, 200),
        },
      },
    )
    child.on('error', () => {})
    child.unref()
    return true
  } catch (error) {
    console.error(`[提醒] 桌面通知失败：${error?.message || error}`)
    return false
  }
}
