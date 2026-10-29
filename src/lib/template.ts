import type { Unit } from './types'

/** Catálogo-modelo de hortifruti. Espelha o que o banco copia em create_store(). */
export interface TemplateProduct {
  key: string
  category: string
  name: string
  emoji: string
  unit: Unit
}

export interface TemplateCategory {
  name: string
  emoji: string
  products: TemplateProduct[]
}

const raw: [string, string, [string, string, Unit][]][] = [
  [
    'Frutas',
    '🍎',
    [
      ['Banana Prata', '🍌', 'dz'], ['Banana Nanica', '🍌', 'dz'], ['Maçã Fuji', '🍎', 'kg'], ['Maçã Gala', '🍎', 'kg'],
      ['Laranja Pera', '🍊', 'kg'], ['Laranja Lima', '🍊', 'kg'], ['Limão Taiti', '🍋', 'kg'], ['Mamão Papaia', '🥭', 'un'],
      ['Mamão Formosa', '🥭', 'kg'], ['Melancia', '🍉', 'kg'], ['Melão', '🍈', 'un'], ['Abacaxi', '🍍', 'un'],
      ['Manga Palmer', '🥭', 'kg'], ['Uva Verde', '🍇', 'kg'], ['Uva Roxa', '🍇', 'kg'], ['Pera', '🍐', 'kg'],
      ['Abacate', '🥑', 'un'], ['Morango', '🍓', 'bd'], ['Kiwi', '🥝', 'kg'], ['Goiaba', '🍈', 'kg'],
      ['Maracujá', '🍈', 'kg'], ['Coco Verde', '🥥', 'un'],
    ],
  ],
  [
    'Verduras',
    '🥬',
    [
      ['Alface Crespa', '🥬', 'un'], ['Alface Americana', '🥬', 'un'], ['Alface Roxa', '🥬', 'un'], ['Couve', '🥬', 'mc'],
      ['Espinafre', '🥬', 'mc'], ['Rúcula', '🥬', 'mc'], ['Agrião', '🥬', 'mc'], ['Brócolis', '🥦', 'un'],
      ['Couve-flor', '🥦', 'un'], ['Repolho Verde', '🥬', 'kg'], ['Acelga', '🥬', 'mc'], ['Chicória', '🥬', 'mc'],
    ],
  ],
  [
    'Legumes',
    '🥕',
    [
      ['Tomate Italiano', '🍅', 'kg'], ['Tomate Salada', '🍅', 'kg'], ['Tomate Cereja', '🍅', 'bd'], ['Cebola', '🧅', 'kg'],
      ['Cebola Roxa', '🧅', 'kg'], ['Batata Inglesa', '🥔', 'kg'], ['Batata Doce', '🍠', 'kg'], ['Cenoura', '🥕', 'kg'],
      ['Beterraba', '🍠', 'kg'], ['Abobrinha', '🥒', 'kg'], ['Pepino', '🥒', 'kg'], ['Pimentão Verde', '🫑', 'kg'],
      ['Pimentão Vermelho', '🫑', 'kg'], ['Berinjela', '🍆', 'kg'], ['Chuchu', '🥒', 'kg'], ['Abóbora Cabotiá', '🎃', 'kg'],
      ['Mandioca', '🥔', 'kg'], ['Inhame', '🥔', 'kg'], ['Milho Verde', '🌽', 'un'], ['Vagem', '🫛', 'kg'],
    ],
  ],
  [
    'Temperos',
    '🌿',
    [
      ['Alho', '🧄', 'kg'], ['Cheiro-verde', '🌿', 'mc'], ['Salsinha', '🌿', 'mc'], ['Cebolinha', '🌿', 'mc'],
      ['Coentro', '🌿', 'mc'], ['Hortelã', '🌿', 'mc'], ['Manjericão', '🌿', 'mc'], ['Gengibre', '🫚', 'kg'],
      ['Pimenta Dedo-de-moça', '🌶️', 'kg'],
    ],
  ],
  [
    'Ovos e Outros',
    '🥚',
    [['Ovos Brancos (dúzia)', '🥚', 'dz'], ['Ovos Vermelhos (dúzia)', '🥚', 'dz'], ['Ovos de Codorna', '🥚', 'bd'], ['Cogumelo Champignon', '🍄', 'bd']],
  ],
]

export const TEMPLATE: TemplateCategory[] = raw.map(([name, emoji, items]) => ({
  name,
  emoji,
  products: items.map(([n, e, unit]) => ({ key: `${name}:${n}`, category: name, name: n, emoji: e, unit })),
}))

export const TEMPLATE_COUNT = TEMPLATE.reduce((a, c) => a + c.products.length, 0)

/** Preços de EXEMPLO, só para a pessoa ver a prévia funcionando. Nunca são publicados sem aviso. */
export const SAMPLE_PRICES: Record<string, number> = {
  'Banana Prata': 7.99,
  'Maçã Fuji': 9.9,
  'Laranja Pera': 4.5,
  'Mamão Papaia': 5.5,
  Melancia: 3.99,
  Abacate: 8.99,
  Morango: 11.9,
  'Alface Crespa': 2.99,
  Couve: 3.5,
  Brócolis: 6.9,
  'Tomate Italiano': 6.99,
  Cebola: 4.99,
  'Batata Inglesa': 5.49,
  Cenoura: 4.2,
  Abobrinha: 5.9,
  'Cheiro-verde': 2.5,
}
