# Mapmove Run — regras do projeto

## Geração de personagens 3D (Higgsfield, Meshy ou outro)

Todo pedido de imagem ou modelo de personagem para virar 3D **sempre** inclui estas instruções de pose,
mesmo que o pedido não fale nelas (sem isso o esqueleto gruda o braço no quadril e a animação fica bugada):

Vale para **qualquer personagem** (corredor, corredora, criança, idoso, mascote): o bloco de pose é fixo;
só mudam as características (gênero, corpo, pele, cabelo, rosto) e a roupa.

- Corpo inteiro, da cabeça aos pés, dentro do quadro; fundo liso cinza-claro; luz de estúdio uniforme.
- **Pose A simétrica**: braços a ~45° do corpo, com espaço vazio visível entre braços e tronco/pernas.
- Mãos relaxadas, dedos separados, **sem encostar no quadril ou na coxa**; nada nas mãos.
- Pernas retas, pés na largura dos ombros, **espaço entre as coxas**.
- Vistas: frente (principal), lateral direita a 90° e costas, sempre "same character and outfit";
  gerar a frontal primeiro e usá-la como referência das outras.
- **Sem logotipos ou marcas** em roupa e tênis (o gerador inventa logos de marcas reais se não for proibido);
  sempre incluir "no logos, no brand marks, plain clothing and shoes".
- Sem acessórios que a loja já vende (boné, viseira, bandana, óculos, relógio, pochete), a menos que o pedido diga o contrário.

Trecho para colar no prompt (em inglês):

> Full body, standing in a clean symmetrical A-pose. Arms held away from the body at a 45-degree angle with clear
> visible empty space between arms and torso/legs, hands relaxed and fingers distinct not touching hips. Legs straight
> and feet shoulder-width apart with gap between thighs. Solid neutral clean light gray background, studio lighting,
> sharp focus, full body completely in frame from head to toe, character concept sheet style. No logos, no brand
> marks, plain clothing and shoes.

Depois do 3D: remesh ~10.000 polígonos, textura 1024, rigging humanoide (~1,75 m) e um GLB por animação
(corrida reta tipo Run_02, parado, comemoração). Exemplo completo em `docs/personagens/`.
