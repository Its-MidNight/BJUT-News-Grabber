#!/usr/bin/env node
/**
 * 控制后台（隐藏窗口）运行的那个实例，也负责给 .cmd 打印中文提示。
 *
 *   node ctl.mjs status         看看在不在跑、跑多久了
 *   node ctl.mjs open           重新打开界面
 *   node ctl.mjs stop           优雅停止；HTTP 不通就按 PID 强杀
 *   node ctl.mjs check          在跑返回 0（给 start.cmd 判断用）
 *   node ctl.mjs begin          启动前的中文提示
 *   node ctl.mjs autostart      放到「启动」文件夹（开机自动跑）
 *   node ctl.mjs autostart-off  取消开机自动跑
 */
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = process.env.APPDATA ? join(process.env.APPDATA, 'campus-notice') : join(HERE, 'data')
const RUNTIME_PATH = join(APP_ROOT, 'server.json')
const CONFIG_PATH = join(APP_ROOT, 'config.json')
const VBS_PATH = join(HERE, 'start-hidden.vbs')
const DEFAULT_PORT = 8737

function shortcutPath() {
  const base = process.env.APPDATA
  if (!base) return ''
  return join(base, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'campus-notice.lnk')
}

async function readConfigPort() {
  try {
    const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
    return Number(config.port) || DEFAULT_PORT
  } catch {
    return DEFAULT_PORT
  }
}

async function readRuntime() {
  try {
    return JSON.parse(await readFile(RUNTIME_PATH, 'utf8'))
  } catch {
    return null
  }
}

async function health(info) {
  if (!info?.url) return null
  try {
    const response = await fetch(new URL('/api/health', info.url), { signal: AbortSignal.timeout(2500) })
    if (!response.ok) return null
    const json = await response.json()
    return json?.ok ? json : null
  } catch {
    return null
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killByPid(pid) {
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
}

function openUrl(url) {
  spawn('cmd', ['/c', 'start', '', url], { windowsHide: true, stdio: 'ignore', detached: true }).unref()
}

async function waitGone(url, timeoutMs = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    if (!(await health({ url }))) return true
  }
  return false
}

function humanDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 1) return '不到 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分钟`
}

const command = process.argv[2] || 'status'

/* ------------------------------ 启动前提示 ------------------------------ */

if (command === 'begin') {
  const port = await readConfigPort()
  console.log('校园通知 · 日程')
  console.log(`  界面地址：http://127.0.0.1:${port}/  （浏览器会自动打开）`)
  console.log('  停止方式：双击 stop.cmd，或在这个窗口按 Ctrl+C')
  console.log('')
  process.exit(0)
}

if (command === 'bye') {
  console.log('服务已停止。')
  process.exit(0)
}

/* ------------------------------ 开机启动 ------------------------------ */

if (command === 'autostart' || command === 'autostart-off') {
  const link = shortcutPath()
  if (!link) {
    console.log('读不到 APPDATA，无法定位「启动」文件夹。')
    process.exit(1)
  }
  if (command === 'autostart-off') {
    if (!existsSync(link)) {
      console.log('当前没有设置开机启动。')
      process.exit(0)
    }
    await rm(link, { force: true })
    console.log(`已取消开机启动：\n  ${link}`)
    process.exit(0)
  }
  if (!existsSync(VBS_PATH)) {
    console.log('找不到 start-hidden.vbs，请确认它和本文件在同一个文件夹里。')
    process.exit(1)
  }
  const ps =
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:CN_LINK);" +
    '$s.TargetPath = $env:CN_TARGET;' +
    '$s.WorkingDirectory = (Split-Path -LiteralPath $env:CN_TARGET);' +
    "$s.Description = 'campus-notice'; $s.Save()"
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    env: { ...process.env, CN_LINK: link, CN_TARGET: VBS_PATH },
    stdio: 'ignore',
    windowsHide: true,
  })
  if (result.status !== 0 || !existsSync(link)) {
    console.log('创建快捷方式失败。可以手动把 start-hidden.vbs 的快捷方式放进：')
    console.log(`  ${dirname(link)}`)
    process.exit(1)
  }
  console.log('已设为开机启动：')
  console.log(`  ${link}`)
  console.log('')
  console.log('取消：再运行 node ctl.mjs autostart-off（或删掉上面这个快捷方式）')
  console.log('开机后想停止：双击 stop.cmd')
  process.exit(0)
}

/* ------------------------------ 状态类 ------------------------------ */

const info = await readRuntime()
const probe = await health(info)
const running = Boolean(probe)
const pid = probe?.pid || info?.pid

if (command === 'check') {
  process.exit(running ? 0 : 1)
}

if (command === 'open') {
  if (!running) {
    console.log('没有在运行的实例。先双击 start.cmd 或 start-hidden.vbs。')
    process.exit(1)
  }
  openUrl(info.url)
  console.log(`已打开 ${info.url}`)
  process.exit(0)
}

if (command === 'status') {
  if (!running) {
    console.log('没有在跑。')
    if (pid && isAlive(pid)) {
      console.log(`但进程 ${pid} 还活着（可能卡住了），可以执行：node ctl.mjs stop`)
    }
    process.exit(1)
  }
  const started = info?.startedAt ? new Date(info.startedAt).getTime() : null
  console.log('正在运行')
  console.log(`  地址：${info.url}`)
  console.log(`  PID ：${pid}`)
  console.log(`  已运行：${started ? humanDuration(Date.now() - started) : '未知'}`)
  console.log(`  通知：${probe.notices} 条`)
  console.log(`  数据：${probe.dataPath}`)
  console.log('')
  console.log('停止：node ctl.mjs stop（或双击 stop.cmd）')
  process.exit(0)
}

if (command === 'stop') {
  if (!running) {
    if (pid && isAlive(pid)) {
      console.log(`服务没响应，按 PID ${pid} 结束…`)
      killByPid(pid)
      await new Promise((resolve) => setTimeout(resolve, 600))
      const alive = isAlive(pid)
      console.log(alive ? '没能结束，请用任务管理器。' : '已停止。')
      process.exit(alive ? 1 : 0)
    }
    await rm(RUNTIME_PATH, { force: true }).catch(() => {})
    console.log('没有在运行的实例。')
    process.exit(0)
  }

  console.log(`正在停止 ${info.url} …`)
  await fetch(new URL('/api/shutdown', info.url), { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(() => {})
  let gone = await waitGone(info.url)
  if (!gone && pid && isAlive(pid)) {
    console.log('优雅退出超时，按 PID 结束…')
    killByPid(pid)
    await new Promise((resolve) => setTimeout(resolve, 800))
    gone = !isAlive(pid)
  }
  if (gone) {
    await rm(RUNTIME_PATH, { force: true }).catch(() => {})
    console.log('已停止。')
    process.exit(0)
  }
  console.log('没能停掉。请打开任务管理器，结束命令行含 server.mjs 的 node.exe。')
  process.exit(1)
}

console.log('用法：node ctl.mjs [status|open|stop|check|begin|autostart|autostart-off]')
process.exit(1)
