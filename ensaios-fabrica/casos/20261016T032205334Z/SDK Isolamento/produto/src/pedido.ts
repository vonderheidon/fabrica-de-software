export function calcularTotal(valor: number, quantidade: number): number {
  return valor * quantidade;
}
export function confirmarPedido(valor: number, quantidade: number): string {
  return `Total: ${calcularTotal(valor, quantidade)}`;
}
export function executarEnsaio(): string {
  return confirmarPedido(12, 3);
}
console.log(executarEnsaio());
