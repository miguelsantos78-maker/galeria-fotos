# 0045 — O otimizador parava em pixels, mas o limite é em bytes

Data: 2026-08-18

## Contexto

Continuação da auditoria (ADRs 0043 e 0044), agora sobre o caminho de
envio no browser.

## O que estava errado

`lib/media/client-image-optimizer.ts` existe por uma razão declarada no
seu próprio cabeçalho: as Serverless Functions da Vercel recusam
pedidos acima de 4 MB (ADR 0009), e sem redimensionar no browser as
fotos de telemóvel "eram sempre rejeitadas com 'Ficheiro demasiado
grande', sem alternativa para o convidado".

Só que o critério de paragem era em **pixels**:

```ts
const target = computeTargetDimensions(bitmap.width, bitmap.height);
if (!target) return file; // já dentro dos 2400px — nada a fazer
```

E o limite do servidor é em **bytes**. Uma imagem já dentro dos 2400px
era devolvida intacta, por maior que fosse o ficheiro, e recusada logo
a seguir com a mensagem que o módulo existe para evitar.

Pior no PNG: é sem perdas, e o `quality` do `canvas.toBlob` é **ignorado**
para `image/png`. Por isso, mesmo quando o redimensionamento acontecia,
o resultado continuava a poder ficar acima de 4 MB — não havia nenhum
caminho pelo qual um PNG grande conseguisse passar.

### Medições

Com `sharp`, conteúdo muito detalhado (ruído puro, o pior caso):

| Ficheiro            | Tamanho | O que acontecia                      |
| ------------------- | ------- | ------------------------------------ |
| PNG 1600x1200       | 5,8 MB  | dentro dos 2400px: devolvido intacto |
| JPEG 2000x1500 q100 | 4,2 MB  | dentro dos 2400px: devolvido intacto |
| PNG 2400x1800       | 13,0 MB | redimensionado, e ainda assim acima  |

Uma fotografia real comprime melhor do que ruído puro, por isso estes
números são o extremo. Mas o PNG não precisa de extremos: é sem perdas,
e qualquer PNG detalhado a partir dos 1600px é multi-MB por
construção. Captura de ecrã, exportação de edição, imagem partilhada
por alguém - todos formatos aceites pela aplicação.

## Decisão

O otimizador passa a ter um **orçamento de bytes**
(`CLIENT_OPTIMIZE_MAX_BYTES = 3 600 000`, abaixo dos 4 MB para deixar
folga ao envelope `multipart/form-data`) além do orçamento de pixels.

1. O caminho comum não muda: já dentro dos 2400px **e** dentro do
   orçamento, o ficheiro é devolvido intacto.
2. Acima dos 2400px, redimensiona no formato original a 0,85 - como
   antes. Se couber, termina aqui.
3. Só se ainda estiver acima do orçamento, recodifica em JPEG com
   qualidade e dimensões decrescentes (2400/0,85 → 2400/0,7 →
   2000/0,7 → 1600/0,7) e para na primeira que caiba.
4. Se nada couber, devolve o original e deixa a validação do chamador
   dar a mensagem - continua a falhar "aberto", como sempre.

### Sobre a qualidade das imagens

O passo 3 só corre quando a alternativa é **o convidado não conseguir
enviar a fotografia de todo**. Não baixa a qualidade de nada que já
funcionava: as fotos de telemóvel do caso comum passam no passo 2, no
formato original e à qualidade de sempre. Uma fotografia recomprimida é
melhor do que uma fotografia que não existe.

A conversão para JPEG perde transparência, quando exista. Para um
álbum de fotografias de evento é um custo aceitável face à alternativa,
e não afeta nenhum formato de câmara.

## Testes

`tests/unit/media/client-image-optimizer.test.ts` corre em jsdom, que
não traz codificadores de imagem - o `toBlob` é um **modelo** deles.
O modelo reproduz a propriedade de que a correção depende (o PNG não
responde ao `quality`, o JPEG responde) e os bytes por pixel foram
calibrados com o `sharp`: ruído puro põe o JPEG a 1,4 B/px, ruído
desfocado a 0,05 B/px, e uma fotografia real fica no meio - o modelo
assume a ponta pessimista desse meio, para não facilitar a vida ao
código testado.

- um ficheiro dentro do orçamento e das dimensões não é tocado;
- um PNG de 5,8 MB já dentro dos 2400px passa a caber (falhava antes);
- um PNG de 20 MB acaba em JPEG, com a extensão do nome trocada
  (falhava antes);
- o caminho comum (4032x3024, 4,5 MB) continua a sair em JPEG no
  formato original e com o nome intacto;
- sem `createImageBitmap`, devolve o original.

Com o modelo calibrado, os dois testes que falham com o código
anterior são exatamente os dois casos que estavam partidos - o caminho
comum passa nos dois, que é o sinal certo: não estava avariado.
