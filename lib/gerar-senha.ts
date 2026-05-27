/**
 * Gera uma senha temporária aleatória de 8 caracteres
 * Formato: 2 maiúsculas + 4 dígitos + 2 minúsculas
 * Exemplo: AB1234cd
 */
export function gerarSenhaTemporaria(): string {
  const maiusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sem I, O
  const minusculas = 'abcdefghjkmnpqrstuvwxyz' // sem i, l, o
  const digitos = '23456789' // sem 0, 1

  let senha = ''
  
  // 2 maiúsculas
  for (let i = 0; i < 2; i++) {
    senha += maiusculas.charAt(Math.floor(Math.random() * maiusculas.length))
  }
  
  // 4 dígitos
  for (let i = 0; i < 4; i++) {
    senha += digitos.charAt(Math.floor(Math.random() * digitos.length))
  }
  
  // 2 minúsculas
  for (let i = 0; i < 2; i++) {
    senha += minusculas.charAt(Math.floor(Math.random() * minusculas.length))
  }

  return senha
}
