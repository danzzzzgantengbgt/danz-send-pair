import express from 'express'
import bodyParser from 'body-parser'
import { default as makeWaSocket, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import pino from 'pino'
import path from 'path'

const app = express()
app.use(bodyParser.json())

// Serve folder public (frontend HTML)
app.use(express.static('public'))

// Route / untuk buka index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'))
})

// HARD LIMIT
const MAX_COUNT = 100
const MIN_DELAY = 150

let sock
let runningJob = null

async function initWA() {
  const { state } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestBaileysVersion()
  sock = makeWaSocket({
    auth: state,
    version,
    logger: pino({ level: 'silent' })
  })
}
initWA()

// START endpoint
app.post('/start', async (req, res) => {
  if (runningJob) return res.status(409).json({ error: 'Masih berjalan' })

  const { number, count, delay, confirmOwner } = req.body

  if (!confirmOwner) return res.status(400).json({ error: 'Harus konfirmasi nomor sendiri' })
  if (!/^\d{10,14}$/.test(number)) return res.status(400).json({ error: 'Nomor tidak valid' })

  const safeCount = Math.min(Number(count) || 1, MAX_COUNT)
  const safeDelay = Math.max(Number(delay) || MIN_DELAY, MIN_DELAY)

  let stopped = false
  runningJob = { stop: () => (stopped = true) }

  ;(async () => {
    for (let i = 1; i <= safeCount; i++) {
      if (stopped) break
      try {
        await sock.requestPairingCode(number)
        console.log(`Pairing ${i}/${safeCount} ke ${number}`)
      } catch(e){
        console.log('Error pairing:', e.message)
      }
      await new Promise(r => setTimeout(r, safeDelay))
    }
    runningJob = null
  })()

  res.json({ status: 'started', applied: { count: safeCount, delay: safeDelay } })
})

// STOP endpoint
app.post('/stop', (req, res) => {
  if (runningJob) {
    runningJob.stop()
    runningJob = null
    return res.json({ status: 'stopped' })
  }
  res.json({ status: 'idle' })
})

// Railway menggunakan PORT dari environment variable
app.listen(process.env.PORT || 3000, () => console.log('Server jalan'))
