# Mestre do Dominó

App para celular que ensina dominó clássico em nível avançado. O professor simula partidas e explica cada jogada: por que aquela pedra, o que ela bloqueia, o que ela revela e quais eram as alternativas.

## Abrir e instalar no celular

**Link do app:** https://henrique-ruher.github.io/mestre-do-domino/

- **Android (Chrome):** abra o link e toque em *Instalar app* (ou menu ⋮ → *Adicionar à tela inicial*).
- **iPhone (Safari):** abra o link, toque em *Compartilhar* → *Adicionar à Tela de Início*.

Depois de instalado, o app abre em tela cheia e funciona sem internet.

**Baixar os arquivos:** [mestre-do-domino.zip](https://github.com/henrique-ruher/mestre-do-domino/archive/refs/heads/main.zip). Para jogar no computador, descompacte e abra o `index.html`.

## Modos

- **Mano a mano (1×1):** 7 peças cada, 14 no dorme. Sem jogada, compra até encaixar.
- **Duplas (2×2):** Sul e Norte contra Leste e Oeste. Todas as peças distribuídas, sem compra. Parceiros não conversam: só a jogada comunica.

Em cada modo você escolhe:

- **Assistir:** o professor joga por todos e explica cada lance.
- **Treinar:** você joga com o Sul e recebe uma nota de 0 a 10 por jogada, comparada com a melhor opção.

## Regras usadas (dominó clássico)

- 28 peças (0|0 a 6|6). Cada número aparece em 7 peças.
- Primeira rodada: abre quem tem a carroça de 6 (no 1×1, a maior carroça na mão; sem carroça, a peça mais pesada). Depois, sai quem venceu a rodada anterior.
- Batida: quem fica sem peças marca a soma das mãos do lado adversário.
- Jogo trancado: vence o lado com menos pontos na mão e marca os pontos do lado perdedor. Empate: ninguém marca.
- Partida até 100 pontos.

## Como o professor decide

Cada jogada é avaliada só com o que aquele jogador poderia saber (a própria mão, a mesa e quem passou ou comprou), pesando:

1. **Bloqueio e contagem:** probabilidade de o próximo adversário não ter as novas pontas, calculada pelas peças que ainda não apareceram.
2. **Leitura:** quem passou ou comprou não tem aqueles números.
3. **Controle:** ficar com peças que encaixam nas pontas que você deixou.
4. **Carroças:** jogar cedo, porque só entram de um jeito.
5. **Peso:** descartar peças pesadas.
6. **Parceria:** não travar o parceiro, devolver os números que ele abre e fechar os que o rival abre.
7. **Tranca:** trancar só quando seu lado tem menos pontos.

## Tecnologia

Um único `index.html` em JavaScript puro, sem dependências, e um PWA (manifesto + service worker) para instalar e jogar offline.
