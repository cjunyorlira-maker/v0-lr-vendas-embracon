import { randomBytes } from 'crypto'

/**
 * Gera uma senha temporária criptograficamente segura.
 * - 12 caracteres
 * - Pelo menos 1 maiúscula, 1 minúscula, 1 número, 1 símbolo
 * - Usa crypto.randomBytes (NÃO Math.random)
 */
export function gerarSenhaTemporaria(): string {
  const maiusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minusculas = 'abcdefghjkmnpqrstuvwxyz'
  const digitos = '23456789'
  const simbolos = '!@#$%&*?'
  const todos = maiusculas + minusculas + digitos + simbolos

  function escolherChar(charset: string): string {
    const idx = randomBytes(1)[0] % charset.length
    return charset[idx]
  }

  const chars: string[] = [
    escolherChar(maiusculas),
    escolherChar(minusculas),
    escolherChar(digitos),
    escolherChar(simbolos),
  ]

  while (chars.length < 12) {
    chars.push(escolherChar(todos))
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}
