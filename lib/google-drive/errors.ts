/**
 * Mapeamento dos erros da API/OAuth do Google que a aplicação precisa
 * de distinguir (secção 19: "mapeamento de erros Google").
 */

/**
 * `invalid_grant` é a resposta do Google quando o refresh token deixou
 * de ser aceite. Ao contrário de uma falha de rede ou de quota, isto
 * NUNCA se resolve a repetir o pedido: só uma nova autorização do
 * administrador ("Ligar Google Drive") repõe o acesso.
 *
 * As causas conhecidas são todas do lado da conta Google, não da
 * aplicação: o utilizador revogou o acesso; a palavra-passe mudou; o
 * token esteve seis meses sem ser usado; ou — a mais provável num
 * projeto ainda por publicar — o ecrã de consentimento OAuth está em
 * "Testing", estado em que o Google expira os refresh tokens ao fim de
 * 7 dias.
 *
 * O `google-auth-library` propaga isto de formas diferentes conforme o
 * ponto em que falha (erro do pedido de token ou erro da chamada à API
 * já com o token), por isso a deteção olha para o código, a mensagem e
 * o corpo da resposta em vez de assumir uma forma só.
 */
export function isInvalidGrantError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as {
    message?: unknown;
    response?: { data?: { error?: unknown } };
    // `gaxios` guarda aqui o corpo já desserializado em algumas versões.
    data?: { error?: unknown };
  };

  if (
    typeof candidate.message === "string" &&
    candidate.message.includes("invalid_grant")
  ) {
    return true;
  }

  return (
    candidate.response?.data?.error === "invalid_grant" ||
    candidate.data?.error === "invalid_grant"
  );
}
