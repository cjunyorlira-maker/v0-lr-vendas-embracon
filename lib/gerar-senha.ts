/**
 * Gera uma senha temporária aleatória de 12 caracteres
 * Formato: 3 maiúsculas + 3 dígitos + 3 minúsculas + 1 símbolo
 * Exemplo: ABC123def@
 */
export function gerarSenhaTemporaria(): string {
  const maiusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sem I, O
  const minusculas = 'abcdefghjkmnpqrstuvwxyz' // sem i, l, o
  const digitos = '23456789' // sem 0, 1
  const simbolos = '@#$%&*!?'

  let senha = ''
  
  // 3 maiúsculas
  for (let i = 0; i < 3; i++) {
    senha += maiusculas.charAt(Math.floor(Math.random() * maiusculas.length))
  }
  
  // 3 dígitos
  for (let i = 0; i < 3; i++) {
    senha += digitos.charAt(Math.floor(Math.random() * digitos.length))
  }
  
  // 3 minúsculas
  for (let i = 0; i < 3; i++) {
    senha += minusculas.charAt(Math.floor(Math.random() * minusculas.length))
  }

  // 1 símbolo
  senha += simbolos.charAt(Math.floor(Math.random() * simbolos.length))

  return senha
}
