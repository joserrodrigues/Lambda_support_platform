/* eslint-disable no-console */

/**
 * Não insere em `fsfadm_Usuarios`. Essa tabela já existe e é do School Guardian.
 * O administrador entra com um usuário que o outro sistema já cadastrou.
 */
console.error(
  'db:seed:admin não roda neste projeto: fsfadm_Usuarios pertence ao outro sistema e não pode ser alterada.',
);
process.exit(1);
