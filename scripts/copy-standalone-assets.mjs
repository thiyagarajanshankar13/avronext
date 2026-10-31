// `output: 'standalone'` leaves static assets out of the server bundle; copy them in.
import { cpSync, existsSync } from 'node:fs'

if (existsSync('.next/standalone')) {
  cpSync('.next/static', '.next/standalone/.next/static', { recursive: true })
  if (existsSync('public')) cpSync('public', '.next/standalone/public', { recursive: true })
}
