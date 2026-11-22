// Caminho até um tile clicado, desviando das paredes (busca em largura, 8 direções sem cortar quina).

export type Tile = { x: number; y: number };

export function caminho(livre: (x: number, y: number) => boolean, de: Tile, para: Tile, limite = 4000): Tile[] {
  // Clicou numa parede ou móvel: vai até o tile livre mais próximo do clique.
  const alvo = livre(para.x, para.y) ? para : vizinhoLivre(livre, para);
  if (!alvo) return [];
  const chave = (t: Tile) => `${t.x},${t.y}`;
  const veioDe = new Map<string, Tile | null>([[chave(de), null]]);
  const fila: Tile[] = [de];
  const passos = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ] as const;
  while (fila.length && veioDe.size < limite) {
    const atual = fila.shift()!;
    if (atual.x === alvo.x && atual.y === alvo.y) {
      const rota: Tile[] = [];
      for (let t: Tile | null | undefined = atual; t; t = veioDe.get(chave(t))) rota.unshift(t);
      return rota.slice(1);
    }
    for (const [dx, dy] of passos) {
      const prox = { x: atual.x + dx, y: atual.y + dy };
      if (veioDe.has(chave(prox)) || !livre(prox.x, prox.y)) continue;
      // Na diagonal, os dois lados precisam estar livres para não atravessar a quina.
      if (dx && dy && (!livre(atual.x + dx, atual.y) || !livre(atual.x, atual.y + dy))) continue;
      veioDe.set(chave(prox), atual);
      fila.push(prox);
    }
  }
  return [];
}

function vizinhoLivre(livre: (x: number, y: number) => boolean, t: Tile): Tile | undefined {
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (livre(t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy };
      }
    }
  }
  return undefined;
}
