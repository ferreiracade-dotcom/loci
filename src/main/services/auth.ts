import bcrypt from 'bcryptjs'
import { getDb } from '../db/connection'

interface AuthRow {
  password_hash: string | null
}

function row(): AuthRow {
  return getDb().prepare('SELECT password_hash FROM auth WHERE id = 1').get() as AuthRow
}

export function hasPassword(): boolean {
  return !!row().password_hash
}

export function setPassword(password: string): void {
  const hash = bcrypt.hashSync(password, 12)
  getDb().prepare('UPDATE auth SET password_hash = ? WHERE id = 1').run(hash)
}

export function verifyPassword(password: string): boolean {
  const hash = row().password_hash
  if (!hash) return false
  return bcrypt.compareSync(password, hash)
}
