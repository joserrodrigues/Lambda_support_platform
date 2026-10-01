import { z } from 'zod';
import { USER_ROLES } from './user.model';

// Política de senha alinhada a OWASP ASVS v5 (V6): mínimo 12, máximo 128, sem regras de composição.
export const passwordSchema = z.string().min(12).max(128);
export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());
// Login: minúsculo, 3-60 caracteres, apenas letras, números, ponto, hífen e sublinhado.
export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou sublinhado');
const nameSchema = z.string().trim().min(2).max(120);

// `strictObject` rejeita campos desconhecidos (proteção contra mass assignment).
export const createUserBodySchema = z
  .strictObject({
    name: nameSchema,
    email: emailSchema,
    login: loginSchema,
    password: passwordSchema,
    role: z.enum(USER_ROLES).default('requester'),
  })
  .meta({ id: 'CreateUserRequest' });

export const updateUserBodySchema = z
  .strictObject({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    login: loginSchema.optional(),
    password: passwordSchema.optional(),
    currentPassword: z.string().min(1).max(128).optional(),
    role: z.enum(USER_ROLES).optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).some((key) => key !== 'currentPassword'), {
    message: 'Informe ao menos um campo para atualizar',
  })
  .meta({ id: 'UpdateUserRequest' });

export const userIdParamsSchema = z.strictObject({ id: z.uuid() });

export const listUsersQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const publicUserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    login: z.string(),
    role: z.enum(USER_ROLES),
    active: z.boolean(),
    lastLoginAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .meta({ id: 'User' });

export const userListResponseSchema = z
  .object({
    data: z.array(publicUserSchema),
    meta: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .meta({ id: 'UserList' });

export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
